package com.materialstudio.material;

import com.materialstudio.catalog.CatalogService;
import com.materialstudio.common.ApiException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MaterialService {
    private final MaterialMapper mapper;
    private final MaterialStorage storage;
    private final CatalogService catalog;

    public MaterialService(MaterialMapper mapper, MaterialStorage storage, CatalogService catalog) {
        this.mapper = mapper; this.storage = storage; this.catalog = catalog;
    }

    @Transactional(readOnly = true)
    public List<MaterialSlotView> slots(long owner, String template) {
        int count = catalog.template(template).requiredImageCount();
        var records = mapper.findSlots(owner, template);
        return IntStream.rangeClosed(1, count).mapToObj(slot -> MaterialSlotView.from(slot,
                records.stream().filter(record -> record.slotIndex() == slot).findFirst().orElse(null))).toList();
    }

    @Transactional
    public MaterialSlotView upload(long owner, String template, int slot, long expectedRevision, List<MultipartFile> files) {
        checkSlot(template, slot);
        var image = storage.check(files);
        var old = lockedSlot(owner, template, slot, expectedRevision);
        String id = UUID.randomUUID().toString();
        String name = storage.write(id, image);
        cleanupAfterTransaction(name, old.storageName());
        mapper.replace(new MaterialRecord(owner, template, slot, old.revision() + 1, id, name,
                image.originalName(), image.mime(), (long) image.bytes().length, image.width(), image.height(), Instant.now()));
        return MaterialSlotView.from(slot, mapper.findSlot(owner, template, slot));
    }

    @Transactional
    public MaterialSlotView remove(long owner, String template, int slot, long expectedRevision) {
        checkSlot(template, slot);
        var old = lockedSlot(owner, template, slot, expectedRevision);
        cleanupAfterTransaction(null, old.storageName());
        mapper.replace(new MaterialRecord(owner, template, slot, old.revision() + 1, null, null, null, null, null, null, null, Instant.now()));
        return MaterialSlotView.from(slot, mapper.findSlot(owner, template, slot));
    }

    @Transactional
    public Content content(long owner, String id) {
        var record = id.matches("[a-f0-9-]{36}") ? mapper.findOwned(owner, id) : null;
        if (record == null) throw new ApiException(HttpStatus.NOT_FOUND, "MATERIAL_NOT_FOUND", "素材不存在或无权访问");
        // FOR SHARE 在文件读完前阻止替换事务删除旧文件。
        return new Content(storage.read(record.storageName()), record.mimeType(), record.storageName());
    }

    private void checkSlot(String template, int slot) {
        if (slot < 1 || slot > catalog.template(template).requiredImageCount()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SLOT", "上传位超出模板要求的图片数量");
        }
    }

    private MaterialRecord lockedSlot(long owner, String template, int slot, long expectedRevision) {
        mapper.lockAccount(owner);
        mapper.ensureSlot(owner, template, slot);
        var old = mapper.findSlot(owner, template, slot);
        if (expectedRevision < 0 || old.revision() != expectedRevision) {
            throw new ApiException(HttpStatus.CONFLICT, "MATERIAL_CHANGED", "素材已发生变化，请重新读取后再操作");
        }
        return old;
    }

    private void cleanupAfterTransaction(String added, String removed) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                storage.deleteQuietly(status == STATUS_COMMITTED ? removed : added);
            }
        });
    }

    public record Content(byte[] bytes, String mime, String name) {}
}
