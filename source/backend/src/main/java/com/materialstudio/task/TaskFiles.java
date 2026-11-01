package com.materialstudio.task;

import com.materialstudio.common.ApiException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class TaskFiles {
    private static final Logger log = LoggerFactory.getLogger(TaskFiles.class);
    private final Path root;
    public TaskFiles(@Value("${app.material-directory}") String directory) { root = Path.of(directory).toAbsolutePath().normalize().resolve("tasks"); }

    public void prepare(String id, String coverUrl) {
        if (!coverUrl.matches("/api/catalog-assets/[a-z0-9-]+\\.svg")) throw unavailable();
        try {
            Files.createDirectories(directory(id));
            try (var source = new ClassPathResource("static" + coverUrl).getInputStream()) {
                Files.copy(source, directory(id).resolve("preset.svg"));
            }
        } catch (IOException exception) { throw unavailable(); }
    }

    public void saveInput(String id, TaskInputRecord input, byte[] bytes) {
        try { Files.write(directory(id).resolve(inputName(input)), bytes); }
        catch (IOException exception) { throw unavailable(); }
    }

    public byte[] readInput(String id, TaskInputRecord input) { return read(id, inputName(input)); }

    public String finalizeResult(String id) {
        String preset = new String(read(id, "preset.svg"), StandardCharsets.UTF_8);
        String banner = """
                <g><rect x="16" y="804" width="688" height="80" rx="12" fill="#0b0d0c" opacity="0.94"/>
                <text x="36" y="837" font-family="sans-serif" font-size="19" fill="#d4ed69">DEMO · SIMULATED RESULT</text>
                <text x="36" y="863" font-family="sans-serif" font-size="15" fill="#ffffff">预置演示结果 · 未合成上传图片</text></g>
                """;
        int end = preset.lastIndexOf("</svg>");
        if (end < 0) throw unavailable();
        try {
            Path temporary = directory(id).resolve("result.tmp");
            Files.writeString(temporary, preset.substring(0, end) + banner + preset.substring(end), StandardCharsets.UTF_8);
            Files.move(temporary, directory(id).resolve("result.svg"), java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            return "result.svg";
        } catch (IOException exception) { throw unavailable(); }
    }

    public byte[] readResult(String id) { return read(id, "result.svg"); }

    public void deleteTask(String id) {
        Path directory = directory(id);
        if (!Files.exists(directory)) return;
        try (var paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        } catch (IOException exception) { log.warn("Cannot clean task files {}", id, exception); }
    }

    private byte[] read(String id, String name) {
        try { return Files.readAllBytes(directory(id).resolve(name)); }
        catch (IOException exception) { throw unavailable(); }
    }
    private String inputName(TaskInputRecord input) { return "input-" + input.slotIndex() + (input.mimeType().equals("image/png") ? ".png" : ".jpg"); }
    private Path directory(String id) {
        if (!id.matches("[a-f0-9-]{36}")) throw unavailable();
        return root.resolve(id);
    }
    private static ApiException unavailable() { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "TASK_STORAGE_UNAVAILABLE", "任务文件暂不可用，请稍后重试"); }
}
