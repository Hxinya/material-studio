package com.materialstudio.task;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** 一次只执行数据库里排在最前的任务；等待在事务外，不占用数据库连接。 */
@Component
public class TaskProcessor {
    private static final Logger log = LoggerFactory.getLogger(TaskProcessor.class);
    private final TaskService service;
    private final TaskMapper mapper;
    private final TaskFiles files;
    public TaskProcessor(TaskService service, TaskMapper mapper, TaskFiles files) { this.service = service; this.mapper = mapper; this.files = files; }

    public boolean processNext() {
        var task = service.claim();
        if (task == null) return false;
        try {
            for (var stage : TaskStage.values()) {
                service.begin(task.id(), stage);
                Thread.sleep(task.delay(stage));
                if (task.failStage() == stage) {
                    service.fail(task.id(), "SIMULATED_FAILURE", stage.label() + "阶段按模拟配置失败");
                    return true;
                }
                String result = null;
                if (stage == TaskStage.MATERIAL_CHECK) {
                    for (var input : mapper.inputs(task.id())) {
                        if (files.readInput(task.id(), input).length != input.sizeBytes()) throw new IllegalStateException("Snapshot size mismatch");
                    }
                }
                if (stage == TaskStage.FINALIZE_RESULT) result = files.finalizeResult(task.id());
                service.complete(task.id(), stage, result);
            }
        } catch (InterruptedException exception) {
            service.fail(task.id(), "WORKER_INTERRUPTED", "制作服务停止，任务已中断，请重新提交");
            Thread.currentThread().interrupt();
        } catch (RuntimeException exception) {
            log.error("Task processing failed: {}", task.id(), exception);
            service.fail(task.id(), "PROCESSING_FAILED", "处理任务文件或保存阶段时发生异常，请重新提交");
        }
        return true;
    }
}
