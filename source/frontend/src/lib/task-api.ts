import { request } from "./api-client";

export type TaskStageName = "MATERIAL_CHECK" | "SIMULATE_GENERATION" | "FINALIZE_RESULT";
export type TaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type TaskInput = { slot: number; materialId: string; revision: number };
export type Task = {
  id: string; templateId: string; templateTitle: string; status: TaskStatus; currentStage: TaskStageName | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null; errorCode: string | null; errorMessage: string | null;
  resultUrl: string | null; resultKind: "SIMULATED_PRESET" | null;
  stages: { index: number; name: TaskStageName; label: string; status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED"; startedAt: string | null; finishedAt: string | null; errorMessage: string | null }[];
  inputs: (TaskInput & { originalName: string; mimeType: string; sizeBytes: number; width: number; height: number; contentUrl: string })[];
};

export async function submitTask(templateId: string, inputs: TaskInput[], signal: AbortSignal): Promise<Task> {
  const csrf: { token: string; headerName: string } = await (await request("/api/auth/csrf", { signal })).json();
  signal.throwIfAborted();
  // 不自动重放 POST：超时后任务可能已经受理。
  return (await request("/api/tasks", { method: "POST", signal,
    headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
    body: JSON.stringify({ templateId, inputs }) })).json();
}

export async function getTask(id: string, signal?: AbortSignal): Promise<Task> {
  return (await request(`/api/tasks/${encodeURIComponent(id)}`, { signal })).json();
}

export const taskStatusLabels: Record<TaskStatus, string> = { QUEUED: "等待处理", RUNNING: "处理中", SUCCEEDED: "制作成功", FAILED: "制作失败" };

export type TaskHistory = { items: Task[] };
export async function getTaskHistory(templateId?: string, signal?: AbortSignal): Promise<TaskHistory> {
  const query = templateId ? `?${new URLSearchParams({ templateId })}` : "";
  return (await request(`/api/tasks${query}`, { signal })).json();
}
