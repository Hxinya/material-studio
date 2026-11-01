"use client";

import Image from "next/image";
import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { taskStatusLabels, type Task } from "@/lib/task-api";
import { historyTaskQuery, reconcileTask, taskIsPending, taskQueries } from "@/lib/task-queries";
import { useAuth } from "./auth-provider";

export function TaskHistory({ templateId, compact = false }: { templateId?: string; compact?: boolean }) {
  const auth = useAuth();
  if (auth.status === "loading") return <p role="status" className="text-sm text-[#a1ab97]">正在确认账号…</p>;
  if (auth.status === "error") return <div role="alert" className="text-sm"><p>暂时无法确认账号，请恢复连接后重试。</p><button onClick={auth.refresh} className="mt-3 text-[#d4ed69]">重新确认账号</button></div>;
  if (!auth.user) return <div className="text-sm leading-7 text-[#a1ab97]">登录后查看自己的制作记录。<Link href="/login" className="ml-2 text-[#d4ed69]">去登录 →</Link></div>;
  return <OwnedHistory key={`${auth.user.id}:${templateId ?? "all"}`} owner={auth.user.id} templateId={templateId} compact={compact} />;
}

function OwnedHistory({ owner, templateId, compact }: { owner: number; templateId?: string; compact: boolean }) {
  const history = useQuery(taskQueries.history(owner, templateId));
  const snapshots = history.data?.items ?? [];
  const tracked = useQueries({ queries: snapshots.map(task => historyTaskQuery(owner, task)) });
  const tasks = snapshots.map((snapshot, index) => reconcileTask(tracked[index].data, snapshot));
  function refresh() {
    void history.refetch();
    tracked.forEach((query, index) => { if (query.isError && taskIsPending(tasks[index])) void query.refetch(); });
  }
  if (!history.data) {
    if (history.isPending) return <p role="status" className="rounded-xl border border-white/10 p-5 text-sm text-[#a1ab97]">正在恢复制作记录…</p>;
    return <div role="alert" className="rounded-xl border border-[#f0b7a2]/25 p-5 text-sm"><p>记录读取失败：{history.error?.message}</p><button onClick={refresh} className="mt-4 text-[#d4ed69]">重试读取记录</button></div>;
  }
  const pending = tasks.filter(taskIsPending).length;
  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p aria-live="polite" className="text-xs leading-6 text-[#a1ab97]">共 {tasks.length} 条记录 · {pending ? `${pending} 个未完成任务自动更新` : tasks.length ? "全部任务已结束，自动更新已停止" : "开始一次新的制作吧"}</p><button onClick={refresh} disabled={history.isFetching} className="rounded-full border border-white/15 px-4 py-2 text-xs text-[#d4ed69] disabled:opacity-50">{history.isFetching ? "正在读取…" : "刷新记录"}</button></div>
    {history.isError && <p role="alert" className="mb-5 rounded-xl border border-[#f0b7a2]/25 p-4 text-sm leading-7 text-[#f0b7a2]">记录查询暂时失败：{history.error.message}。已保留上次的记录，可点击“刷新记录”恢复。</p>}
    {!tasks.length ? <div className="rounded-2xl border border-dashed border-white/15 bg-[#111710] p-8 text-center"><p className="text-sm text-[#c1cbb6]">{templateId ? "这个模板还没有制作记录" : "还没有制作记录"}</p><p className="mt-3 text-xs leading-6 text-[#929e85]">上传图片并提交后，任务进度与结果会保存在这里。</p>{!templateId && <Link href="/" className="mt-5 inline-flex text-sm text-[#d4ed69]">去选一个模板 →</Link>}</div> : <div className={`grid gap-4 ${compact ? "" : "lg:grid-cols-2"}`}>{tasks.map((task, index) => <TaskHistoryCard key={task.id} task={task} queryError={taskIsPending(task) && tracked[index].isError ? tracked[index].error?.message : undefined} retry={() => { void tracked[index].refetch(); }} fetching={tracked[index].isFetching} />)}</div>}
  </div>;
}

function TaskHistoryCard({ task, queryError, retry, fetching }: { task: Task; queryError?: string; retry: () => void; fetching: boolean }) {
  const pending = taskIsPending(task);
  return <article aria-label={`制作任务 ${task.id}`} className={`min-w-0 rounded-2xl border bg-[#121811] p-5 ${pending ? "border-[#d4ed69]/25" : "border-white/10"}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/tasks/${task.id}`} className="text-base font-medium hover:text-[#d4ed69]">{task.templateTitle}</Link><p className="mt-2 break-all font-mono text-[10px] leading-5 text-[#849477]">{task.id}</p></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${task.status === "FAILED" ? "border-[#f0b7a2]/30 text-[#f0b7a2]" : "border-[#d4ed69]/20 text-[#c3d5a5]"}`}>{taskStatusLabels[task.status]}</span></div>
    <p className="mt-4 text-xs leading-6 text-[#929e85]">提交：{time(task.createdAt)}{task.finishedAt && <> · 完成：{time(task.finishedAt)}</>}</p>
    <ol className="mt-4 grid grid-cols-3 gap-2">{task.stages.map(stage => <li key={stage.name} className={`rounded-lg p-2.5 ${stage.status === "RUNNING" ? "bg-[#d4ed69]/10" : "bg-white/[0.03]"}`}><p className="text-xs leading-6 text-[#b7c3aa]">{stage.label}</p><p className={`mt-1 text-xs ${stage.status === "FAILED" ? "text-[#f0b7a2]" : "text-[#8d9d7f]"}`}>{({ PENDING: "待执行", RUNNING: "执行中", SUCCEEDED: "已完成", FAILED: "已失败", SKIPPED: "未执行" })[stage.status]}</p></li>)}</ol>
    {task.status === "FAILED" && <p className="mt-4 text-sm leading-7 text-[#f0b7a2]">{task.errorMessage}</p>}
    {queryError && <div role="alert" className="mt-4 rounded-lg border border-[#f0b7a2]/25 p-3 text-xs leading-6 text-[#f0b7a2]"><p>进度查询暂时失败：{queryError}。保留上次状态，自动更新已暂停。</p><button disabled={fetching} onClick={retry} className="mt-2 text-[#d4ed69] disabled:opacity-50">{fetching ? "正在恢复…" : "恢复查询"}</button></div>}
    {task.resultUrl && <HistoryResult task={task} />}
    <Link href={`/tasks/${task.id}`} className="mt-4 inline-flex text-xs text-[#d4ed69]">查看任务详情 →</Link>
  </article>;
}

function HistoryResult({ task }: { task: Task }) {
  const [failed, setFailed] = useState(false);
  return <div className="mt-4 flex items-center gap-4 rounded-xl bg-[#0b110a] p-3"><a aria-label={`预览${task.templateTitle}的演示结果`} href={task.resultUrl!} target="_blank" rel="noreferrer" className="relative block aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-lg bg-white/5">{failed ? <span className="block p-2 text-xs text-[#a1ab97]">打开预览 ↗</span> : <Image src={task.resultUrl!} alt={`${task.templateTitle}预置演示结果`} fill unoptimized sizes="80px" className="object-contain" onError={() => setFailed(true)} />}</a><div><p className="text-sm text-[#c4d4aa]">演示结果已保存</p><p className="mt-2 text-xs leading-6 text-[#929e85]">预置模板示例，未合成上传图片。</p><a href={task.resultUrl!} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-[#d4ed69]">打开完整预览 ↗</a></div></div>;
}

function time(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
