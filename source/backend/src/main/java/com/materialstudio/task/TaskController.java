package com.materialstudio.task;

import com.materialstudio.auth.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    public record History(java.util.List<TaskView> items) {}
    private final TaskService tasks;
    private final CurrentUser user;
    public TaskController(TaskService tasks, CurrentUser user) { this.tasks = tasks; this.user = user; }
    @GetMapping
    public History history(@RequestParam(required = false) String templateId) { return new History(tasks.history(user.requireId(), templateId)); }
    @PostMapping
    public ResponseEntity<TaskView> submit(@Valid @RequestBody TaskRequest request) {
        var task = tasks.submit(user.requireId(), request);
        return ResponseEntity.accepted().header("Location", "/api/tasks/" + task.id()).body(task);
    }
    @GetMapping("/{id}") public TaskView get(@PathVariable String id) { return tasks.get(user.requireId(), id); }
    @GetMapping("/{id}/result") public ResponseEntity<byte[]> result(@PathVariable String id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType("image/svg+xml"))
                .body(tasks.result(user.requireId(), id));
    }
    @GetMapping("/{id}/inputs/{slot}") public ResponseEntity<byte[]> input(@PathVariable String id, @PathVariable int slot) {
        var input = tasks.input(user.requireId(), id, slot);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(input.mime())).body(input.bytes());
    }
}
