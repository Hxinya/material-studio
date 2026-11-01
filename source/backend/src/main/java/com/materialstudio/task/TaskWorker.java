package com.materialstudio.task;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/** 单实例、单后台线程；持久化队列不依赖页面访问。重启明确失败遗留任务，不续跑。 */
@Component
public class TaskWorker implements SmartLifecycle {
    private static final Logger log = LoggerFactory.getLogger(TaskWorker.class);
    private final TaskService service;
    private final TaskProcessor processor;
    private final TaskSettings settings;
    private volatile boolean running;
    private Thread thread;
    public TaskWorker(TaskService service, TaskProcessor processor, TaskSettings settings) { this.service = service; this.processor = processor; this.settings = settings; }
    @Override public boolean isAutoStartup() { return settings.workerEnabled(); }
    @Override public boolean isRunning() { return running; }
    @Override public int getPhase() { return 0; }
    @Override public synchronized void start() {
        if (running) return;
        service.interruptUnfinished();
        running = true;
        thread = new Thread(this::loop, "material-task-worker");
        thread.setDaemon(true); thread.start();
    }
    private void loop() {
        while (running && !Thread.currentThread().isInterrupted()) {
            try {
                if (!processor.processNext()) Thread.sleep(settings.pollIntervalMs());
            } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
            catch (RuntimeException exception) {
                log.error("Task worker could not update the database", exception);
                try { Thread.sleep(settings.pollIntervalMs()); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            }
        }
    }
    @Override public synchronized void stop() {
        running = false;
        if (thread == null) return;
        thread.interrupt();
        try { thread.join(5000); } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
    }
}
