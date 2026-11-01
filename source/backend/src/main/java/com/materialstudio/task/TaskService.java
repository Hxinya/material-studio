package com.materialstudio.task;

import com.materialstudio.catalog.CatalogService;
import com.materialstudio.common.ApiException;
import com.materialstudio.material.MaterialMapper;
import com.materialstudio.material.MaterialStorage;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class TaskService {
    private final TaskMapper tasks;
    private final MaterialMapper materials;
    private final MaterialStorage materialFiles;
    private final TaskFiles files;
    private final CatalogService catalog;
    private final TaskSettings settings;
    public TaskService(TaskMapper tasks, MaterialMapper materials, MaterialStorage materialFiles,
            TaskFiles files, CatalogService catalog, TaskSettings settings) {
        this.tasks = tasks; this.materials = materials; this.materialFiles = materialFiles;
        this.files = files; this.catalog = catalog; this.settings = settings;
    }

    @Transactional
    public TaskView submit(long owner, TaskRequest request) {
        var template = catalog.template(request.templateId());
        var simulation = request.simulation();
        if (simulation != null && !settings.simulationControlsEnabled()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SIMULATION_CONTROLS_DISABLED", "当前环境未开放按任务指定模拟参数");
        }
        if (request.inputs().size() != template.requiredImageCount()
                || request.inputs().stream().map(TaskRequest.Input::slot).distinct().count() != template.requiredImageCount()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INPUT_COUNT", "请按模板要求准备全部图片，每个上传位一张");
        }
        materials.lockAccount(owner);
        String id = UUID.randomUUID().toString();
        // 在准备目录之前注册回滚清理，包括输入复制或数据库写入中途失败。
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) { if (status != STATUS_COMMITTED) files.deleteTask(id); }
        });
        files.prepare(id, template.coverUrl());
        tasks.insert(new TaskRecord(0, id, owner, template.id(), template.title(), "QUEUED", null,
                simulation == null ? null : simulation.failStage(),
                value(simulation == null ? null : simulation.checkDelayMs(), settings.checkDelayMs()),
                value(simulation == null ? null : simulation.generateDelayMs(), settings.generateDelayMs()),
                value(simulation == null ? null : simulation.finalizeDelayMs(), settings.finalizeDelayMs()),
                null, null, null, null, null, null));
        for (var input : request.inputs()) {
            if (input.slot() < 1 || input.slot() > template.requiredImageCount()) throw invalidMaterial();
            var source = materials.findSlot(owner, template.id(), input.slot());
            if (source == null || source.materialId() == null || !source.materialId().equals(input.materialId()) || source.revision() != input.revision()) {
                throw invalidMaterial();
            }
            var snapshot = new TaskInputRecord(id, input.slot(), source.materialId(), source.revision(), source.originalName(),
                    source.mimeType(), source.sizeBytes(), source.width(), source.height());
            byte[] bytes = materialFiles.read(source.storageName());
            if (bytes.length != source.sizeBytes()) throw new ApiException(HttpStatus.CONFLICT, "MATERIAL_UNAVAILABLE", "素材文件已变化，请重新上传");
            files.saveInput(id, snapshot, bytes);
            tasks.insertInput(snapshot);
        }
        for (var stage : TaskStage.values()) tasks.insertStage(id, stage);
        return view(requireOwned(owner, id));
    }

    @Transactional(readOnly = true)
    public TaskView get(long owner, String id) { return view(requireOwned(owner, id)); }

    @Transactional(readOnly = true)
    public java.util.List<TaskView> history(long owner, String templateId) {
        String filter = templateId == null || templateId.isBlank() ? null : templateId.strip();
        if (filter != null) {
            if (!filter.matches("[a-z0-9-]{1,64}")) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TEMPLATE_FILTER", "模板筛选参数不正确");
            catalog.template(filter);
        }
        return tasks.history(owner, filter).stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public byte[] result(long owner, String id) {
        var task = requireOwned(owner, id);
        if (!task.status().equals("SUCCEEDED")) throw new ApiException(HttpStatus.CONFLICT, "RESULT_NOT_READY", "任务尚无成功结果");
        return files.readResult(id);
    }

    @Transactional(readOnly = true)
    public InputContent input(long owner, String id, int slot) {
        requireOwned(owner, id);
        var input = tasks.inputs(id).stream().filter(item -> item.slotIndex() == slot).findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TASK_INPUT_NOT_FOUND", "任务素材不存在或无权访问"));
        return new InputContent(files.readInput(id, input), input.mimeType());
    }

    @Transactional
    public TaskRecord claim() {
        var task = tasks.lockNext();
        if (task == null) return null;
        tasks.claim(task.id());
        return tasks.lock(task.id());
    }

    @Transactional
    public void begin(String id, TaskStage stage) {
        var task = tasks.lock(id);
        var stages = tasks.stages(id);
        if (task == null || !task.status().equals("RUNNING") || !stages.get(stage.ordinal()).status().equals("PENDING")
                || stages.stream().filter(s -> s.stageIndex() < stage.index()).anyMatch(s -> !s.status().equals("SUCCEEDED"))) {
            throw new IllegalStateException("Invalid task stage transition");
        }
        tasks.currentStage(id, stage); tasks.beginStage(id, stage);
    }

    @Transactional
    public void complete(String id, TaskStage stage, String resultName) {
        var task = tasks.lock(id);
        if (task == null || !task.status().equals("RUNNING") || task.currentStage() != stage
                || !tasks.stages(id).get(stage.ordinal()).status().equals("RUNNING")) throw new IllegalStateException("Invalid task completion");
        if (stage == TaskStage.FINALIZE_RESULT && !"result.svg".equals(resultName)) throw new IllegalStateException("Missing task result");
        tasks.completeStage(id, stage);
        if (stage == TaskStage.FINALIZE_RESULT) tasks.succeed(id, resultName);
    }

    @Transactional
    public void fail(String id, String code, String message) {
        var task = tasks.lock(id);
        if (task == null || task.terminal()) return;
        tasks.failStages(id, message); tasks.fail(id, code, message);
    }

    @Transactional
    public void interruptUnfinished() { tasks.interruptStages(); tasks.interruptJobs(); }

    private TaskView view(TaskRecord task) { return TaskView.from(task, tasks.stages(task.id()), tasks.inputs(task.id())); }
    private TaskRecord requireOwned(long owner, String id) {
        var task = id.matches("[a-f0-9-]{36}") ? tasks.findOwned(owner, id) : null;
        if (task == null) throw new ApiException(HttpStatus.NOT_FOUND, "TASK_NOT_FOUND", "任务不存在或无权访问");
        return task;
    }
    private static ApiException invalidMaterial() { return new ApiException(HttpStatus.CONFLICT, "MATERIAL_CHANGED", "素材已变化或不属于当前模板，请刷新素材后重新提交"); }
    private static int value(Integer requested, int fallback) { return requested == null ? fallback : requested; }
    public record InputContent(byte[] bytes, String mime) {}
}
