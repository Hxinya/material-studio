package com.materialstudio.material;

import com.materialstudio.common.ApiException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class MaterialStorage {
    public static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final Logger log = LoggerFactory.getLogger(MaterialStorage.class);
    private final Path root;

    public MaterialStorage(@Value("${app.material-directory}") String directory) throws IOException {
        root = Path.of(directory).toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    public CheckedImage check(List<MultipartFile> files) {
        if (files.size() != 1) throw bad("INVALID_FILE_COUNT", "每个上传位一次只能上传一张图片");
        MultipartFile file = files.getFirst();
        if (file.isEmpty()) throw bad("EMPTY_FILE", "请选择非空图片");
        if (file.getSize() > MAX_BYTES) throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "每张图片不能超过 5 MiB");
        if (!List.of("image/jpeg", "image/png").contains(file.getContentType() == null ? "" : file.getContentType())) {
            throw bad("INVALID_IMAGE_TYPE", "仅支持 JPEG 或 PNG 图片");
        }
        try {
            byte[] bytes = file.getBytes();
            try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(input);
                if (!readers.hasNext()) throw bad("INVALID_IMAGE", "无法读取图片，请选择有效的 JPEG 或 PNG 文件");
                var reader = readers.next();
                try {
                    reader.setInput(input, true, true);
                    String format = reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
                    String mime = switch (format) { case "jpeg", "jpg" -> "image/jpeg"; case "png" -> "image/png"; default -> ""; };
                    if (!mime.equals(file.getContentType())) throw bad("INVALID_IMAGE_TYPE", "图片真实格式与声明不一致，请上传 JPEG 或 PNG 图片");
                    int width = reader.getWidth(0), height = reader.getHeight(0);
                    if (width <= 0 || height <= 0 || width > 12000 || height > 12000 || (long) width * height > 25_000_000) {
                        throw bad("IMAGE_DIMENSIONS_EXCEEDED", "图片最长边不能超过 12000 像素，且总像素不能超过 2500 万");
                    }
                    // 完整解码，拒绝只有文件头但缺少像素数据的损坏图片；不做合成或修改原图。
                    if (reader.read(0) == null) throw bad("INVALID_IMAGE", "图片内容已损坏，请重新选择");
                    String name = file.getOriginalFilename() == null ? "图片" : file.getOriginalFilename();
                    name = name.replace('\\', '/');
                    name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "");
                    if (name.isBlank()) name = "图片";
                    int end = name.offsetByCodePoints(0, Math.min(name.codePointCount(0, name.length()), 150));
                    return new CheckedImage(bytes, mime, width, height, name.substring(0, end));
                } finally { reader.dispose(); }
            }
        } catch (IOException | IllegalArgumentException exception) {
            throw bad("INVALID_IMAGE", "图片内容已损坏，请重新选择有效图片");
        }
    }

    public String write(String id, CheckedImage image) {
        String name = id + (image.mime().equals("image/png") ? ".png" : ".jpg");
        Path temporary = root.resolve(UUID.randomUUID() + ".tmp");
        try {
            Files.write(temporary, image.bytes());
            Files.move(temporary, resolve(name), java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            return name;
        } catch (IOException exception) {
            deleteQuietly(temporary.getFileName().toString());
            throw unavailable();
        }
    }

    public byte[] read(String name) {
        try { return Files.readAllBytes(resolve(name)); }
        catch (IOException exception) { throw unavailable(); }
    }

    public void deleteQuietly(String name) {
        if (name == null) return;
        try { Files.deleteIfExists(resolve(name)); }
        catch (IOException exception) { log.warn("Cannot clean unused material file {}", name, exception); }
    }

    private Path resolve(String name) {
        Path path = root.resolve(name).normalize();
        if (!path.getParent().equals(root)) throw unavailable();
        return path;
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE", "素材存储暂不可用，请稍后重试");
    }
    private static ApiException bad(String code, String message) { return new ApiException(HttpStatus.BAD_REQUEST, code, message); }
    public record CheckedImage(byte[] bytes, String mime, int width, int height, String originalName) {}
}
