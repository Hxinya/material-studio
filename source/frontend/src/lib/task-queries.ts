import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { getTask, getTaskHistory, type Task, type TaskHistory } from "./task-api";

export const taskKeys = {
  detail: (owner: number, id: string) => ["tasks", owner, "detail", id] as const,
  histories: (owner: number) => ["tasks", owner, "history"] as const,
  history: (owner: number, templateId?: string) => ["tasks", owner, "history", templateId ?? null] as const,
};
export function taskIsPending(task?: Task) { return task?.status === "QUEUED" || task?.status === "RUNNING"; }

// 列表与单任务请求可能交错到达，同一任务的旧快照不能让终态或阶段倒退。
function progress(task: Task) {
  if (!taskIsPending(task)) return 100;
  if (task.status === "QUEUED") return 0;
  return 1 + task.stages.reduce((value, stage) => Math.max(value,
    stage.status === "SUCCEEDED" ? stage.index * 2 : stage.status === "RUNNING" ? stage.index * 2 - 1 : 0), 0);
}
export function reconcileTask(cached: Task | undefined, snapshot: Task): Task {
  if (!cached || cached.id !== snapshot.id) return snapshot;
  return progress(cached) >= progress(snapshot) ? cached : snapshot;
}

export const taskQueries = {
  detail: (owner: number, id: string) => queryOptions({
    queryKey: taskKeys.detail(owner, id), queryFn: async ({ signal, client }) => {
      const task = await getTask(id, signal);
      signal.throwIfAborted();
      return reconcileTask(client.getQueryData<Task>(taskKeys.detail(owner, id)), task);
    },
    retry: false, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    refetchInterval: (query) => !query.state.error && taskIsPending(query.state.data) ? 1000 : false,
  }),
  history: (owner: number, templateId?: string) => queryOptions({
    queryKey: taskKeys.history(owner, templateId), queryFn: async ({ signal, client }) => {
      const history = await getTaskHistory(templateId, signal);
      signal.throwIfAborted();
      // 同步共享详情缓存：从列表进入详情也不能短暂退回旧阶段。
      history.items.forEach(task => client.setQueryData<Task>(taskKeys.detail(owner, task.id), cached => reconcileTask(cached, task)));
      return history;
    },
    retry: false, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  }),
};

export function historyTaskQuery(owner: number, snapshot: Task) {
  return { ...taskQueries.detail(owner, snapshot.id), initialData: snapshot,
    // 列表已提供初始状态；终态不额外 GET。只对未完成任务创建自动查询。
    staleTime: Infinity, enabled: taskIsPending(snapshot) };
}

export async function recordAcceptedTask(client: QueryClient, owner: number, task: Task) {
  client.setQueryData(taskKeys.detail(owner, task.id), task);
  // 先取消可能早于本次受理的列表请求，避免新记录被旧列表覆盖。
  await client.cancelQueries({ queryKey: taskKeys.histories(owner) });
  client.setQueriesData<TaskHistory>({ queryKey: taskKeys.histories(owner), predicate: query =>
    query.queryKey[3] === null || query.queryKey[3] === task.templateId }, previous =>
    previous ? { items: [task, ...previous.items.filter(item => item.id !== task.id)] } : previous);
  // 不等待列表网络请求，受理状态立即结束；列表故障独立显示，不改写成提交失败。
  void client.invalidateQueries({ queryKey: taskKeys.histories(owner) });
}
