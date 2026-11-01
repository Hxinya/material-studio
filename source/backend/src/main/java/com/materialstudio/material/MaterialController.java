package com.materialstudio.material;

import com.materialstudio.auth.CurrentUser;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class MaterialController {
    private final MaterialService materials;
    private final CurrentUser user;
    public MaterialController(MaterialService materials, CurrentUser user) { this.materials = materials; this.user = user; }

    @GetMapping("/api/templates/{template}/materials")
    public Slots list(@PathVariable String template) { return new Slots(materials.slots(user.requireId(), template)); }

    @PutMapping(value = "/api/templates/{template}/materials/{slot}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public MaterialSlotView upload(@PathVariable String template, @PathVariable int slot,
            @RequestParam long expectedRevision, @RequestParam("file") List<MultipartFile> files) {
        return materials.upload(user.requireId(), template, slot, expectedRevision, files);
    }

    @DeleteMapping("/api/templates/{template}/materials/{slot}")
    public MaterialSlotView remove(@PathVariable String template, @PathVariable int slot, @RequestParam long expectedRevision) {
        return materials.remove(user.requireId(), template, slot, expectedRevision);
    }

    @GetMapping("/api/materials/{id}/content")
    public ResponseEntity<byte[]> content(@PathVariable String id) {
        var content = materials.content(user.requireId(), id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(content.mime()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + content.name() + "\"").body(content.bytes());
    }
    public record Slots(List<MaterialSlotView> items) {}
}
