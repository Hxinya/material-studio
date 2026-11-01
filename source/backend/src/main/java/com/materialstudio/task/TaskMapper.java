package com.materialstudio.task;

import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface TaskMapper {
    @Insert("""
            INSERT INTO task_jobs(id, account_id, template_id, template_title, status, fail_stage,
              check_delay_ms, generate_delay_ms, finalize_delay_ms)
            VALUES(#{id}, #{accountId}, #{templateId}, #{templateTitle}, 'QUEUED', #{failStage},
              #{checkDelayMs}, #{generateDelayMs}, #{finalizeDelayMs})
            """)
    void insert(TaskRecord task);

    @Insert("INSERT INTO task_stages(task_id, stage_index, name, status) VALUES(#{id}, #{stage.index}, #{stage}, 'PENDING')")
    void insertStage(String id, TaskStage stage);

    @Insert("""
            INSERT INTO task_inputs VALUES(#{taskId}, #{slotIndex}, #{materialId}, #{revision},
              #{originalName}, #{mimeType}, #{sizeBytes}, #{width}, #{height})
            """)
    void insertInput(TaskInputRecord input);

    @Select("SELECT * FROM task_jobs WHERE id = #{id} AND account_id = #{owner}")
    TaskRecord findOwned(long owner, String id);
    @Select("""
            SELECT * FROM task_jobs WHERE account_id = #{owner}
              AND (#{templateId} IS NULL OR template_id = #{templateId}) ORDER BY sequence DESC
            """)
    List<TaskRecord> history(long owner, String templateId);
    @Select("SELECT * FROM task_jobs WHERE id = #{id} FOR UPDATE")
    TaskRecord lock(String id);
    @Select("SELECT * FROM task_jobs WHERE status = 'QUEUED' ORDER BY sequence LIMIT 1 FOR UPDATE SKIP LOCKED")
    TaskRecord lockNext();
    @Select("SELECT * FROM task_stages WHERE task_id = #{id} ORDER BY stage_index")
    List<TaskStageRecord> stages(String id);
    @Select("SELECT * FROM task_inputs WHERE task_id = #{id} ORDER BY slot_index")
    List<TaskInputRecord> inputs(String id);

    @Update("UPDATE task_jobs SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP(6) WHERE id = #{id} AND status = 'QUEUED'")
    void claim(String id);
    @Update("UPDATE task_jobs SET current_stage = #{stage} WHERE id = #{id} AND status = 'RUNNING'")
    void currentStage(String id, TaskStage stage);
    @Update("UPDATE task_stages SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP(6) WHERE task_id = #{id} AND stage_index = #{stage.index} AND status = 'PENDING'")
    void beginStage(String id, TaskStage stage);
    @Update("UPDATE task_stages SET status = 'SUCCEEDED', finished_at = CURRENT_TIMESTAMP(6) WHERE task_id = #{id} AND stage_index = #{stage.index} AND status = 'RUNNING'")
    void completeStage(String id, TaskStage stage);
    @Update("UPDATE task_jobs SET status = 'SUCCEEDED', result_name = #{result}, finished_at = CURRENT_TIMESTAMP(6) WHERE id = #{id} AND status = 'RUNNING'")
    void succeed(String id, String result);
    @Update("""
            UPDATE task_stages SET finished_at = IF(status = 'RUNNING', CURRENT_TIMESTAMP(6), NULL),
              error_message = IF(status = 'RUNNING', #{message}, NULL),
              status = IF(status = 'RUNNING', 'FAILED', 'SKIPPED')
            WHERE task_id = #{id} AND status IN ('RUNNING', 'PENDING')
            """)
    void failStages(String id, String message);
    @Update("UPDATE task_jobs SET status = 'FAILED', error_code = #{code}, error_message = #{message}, finished_at = CURRENT_TIMESTAMP(6) WHERE id = #{id} AND status IN ('RUNNING', 'QUEUED')")
    void fail(String id, String code, String message);

    @Update("""
            UPDATE task_stages s JOIN task_jobs j ON j.id = s.task_id
            SET s.finished_at = IF(s.status = 'RUNNING', CURRENT_TIMESTAMP(6), NULL),
              s.error_message = IF(s.status = 'RUNNING', '服务重启，制作已中断', NULL),
              s.status = IF(s.status = 'RUNNING', 'FAILED', 'SKIPPED')
            WHERE j.status IN ('QUEUED', 'RUNNING') AND s.status IN ('PENDING', 'RUNNING')
            """)
    void interruptStages();
    @Update("UPDATE task_jobs SET status = 'FAILED', error_code = 'WORKER_INTERRUPTED', error_message = '服务重启，未完成任务已中断，请重新提交', finished_at = CURRENT_TIMESTAMP(6) WHERE status IN ('QUEUED', 'RUNNING')")
    void interruptJobs();
}
