"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { taskStatusLabels, type Task } from "@/lib/task-api";
import { taskQueries } from "@/lib/task-queries";
import { useAuth } from "./auth-provider";

export function TaskDetail({ id }: { id: string }) {
  const auth = useAuth();
  if (auth.status === "loading") return <p role="status" className="text-sm text-[#a1ab97]">正在确认账号…</p>;
  if (auth.status === "error") return <div role="alert"><p>暂时无法确认账号。</p><button onClick={auth.refresh} className="mt-4 text-[#d4ed69]">重新确认</button></div>;
  if (!auth.user) return <div><p className="text-sm text-[#a1ab97]">请登录提交任务时使用的账号后查看。</p><Link href="/login" className="mt-5 inline-flex text-[#d4ed69]">去登录 →</Link></div>;
  return <OwnedTask key={`${auth.user.id}:${id}`} owner={auth.user.id} id={id} />;
}

function OwnedTask({ owner, id }: { owner: number; id: string }) {
  const query = useQuery(taskQueries.detail(owner, id));
  if (!query.data) {
    if (query.isPending) return <p role="status" className="text-sm text-[#a1ab97]">正在读取任务…</p>;
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return <div role="alert"><p>{missing ? "任务不存在或不属于当前账号。" : query.error?.message ?? "读取任务失败"}</p>{!missing && <button onClick={() => { void query.refetch(); }} className="mt-5 text-[#d4ed69]">重试查询</button>}</div>;
  }
  const task = query.data;
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/templates/${task.templateId}`} className="text-xs text-[#d4ed69]">← 返回 {task.templateTitle}</Link><h1 className="mt-5 text-3xl font-semibold">{taskStatusLabels[task.status]}</h1><p className="mt-3 break-all font-mono text-xs leading-6 text-[#95a488]">任务 {task.id}</p></div><button disabled={query.isFetching} onClick={() => { void query.refetch(); }} className="rounded-full border border-[#d4ed69]/30 px-5 py-2.5 text-sm text-[#d4ed69] disabled:opacity-50">{query.isFetching ? "正在查询…" : "刷新状态"}</button></div>
    {query.isError && <p role="alert" className="mt-5 rounded-xl border border-[#f0b7a2]/30 p-4 text-sm leading-7 text-[#f0b7a2]">查询暂时失败：{query.error.message}。下面保留上次读取的任务状态，可点击“刷新状态”恢复查询。</p>}
    <Link href="/history" className="mt-4 inline-flex text-xs text-[#d4ed69]">查看全部制作记录 ↗</Link>
    <p className="mt-5 text-sm leading-7 text-[#a1ab97]">{task.status === "QUEUED" ? "任务已受理，正在等待后台执行，状态会自动更新。" : task.status === "RUNNING" ? "后台正在处理，状态会自动更新，离开页面不会中断任务。" : "任务已结束，自动更新已停止，以下是服务端保存的阶段与结果。"}</p>
    <ol className="mt-7 grid gap-3 sm:grid-cols-3">{task.stages.map((stage) => <li key={stage.name} className={`rounded-xl border p-5 ${stage.status === "RUNNING" ? "border-[#d4ed69]/50 bg-[#d4ed69]/5" : "border-white/10 bg-[#121811]"}`}><p className="text-xs text-[#929e85]">步骤 {stage.index}</p><h2 className="mt-3 font-medium">{stage.label}</h2><p className={`mt-3 text-sm ${stage.status === "FAILED" ? "text-[#f0b7a2]" : "text-[#bdcf9d]"}`}>{({ PENDING: "等待执行", RUNNING: "执行中", SUCCEEDED: "已完成", FAILED: "已失败", SKIPPED: "未执行" })[stage.status]}</p><p className="mt-4 text-xs leading-6 text-[#929e85]">开始：{time(stage.startedAt)}<br />结束：{time(stage.finishedAt)}</p>{stage.errorMessage && <p className="mt-3 text-xs leading-6 text-[#f0b7a2]">{stage.errorMessage}</p>}</li>)}</ol>
    {task.status === "FAILED" && <div role="alert" className="mt-6 rounded-xl border border-[#f0b7a2]/30 p-5"><h2 className="font-medium text-[#f0b7a2]">制作未完成</h2><p className="mt-3 text-sm leading-7 text-[#c8b4aa]">{task.errorMessage}</p></div>}
    {task.resultUrl && <ResultPreview task={task} />}
    <section className="mt-7 rounded-xl border border-white/10 p-5"><h2 className="text-sm font-medium">任务素材</h2><p className="mt-3 text-xs leading-6 text-[#929e85]">已为本次任务保存独立副本，之后替换或移除草稿不会改变这些输入。</p><ul className="mt-3 space-y-2">{task.inputs.map(input => <li key={input.slot} className="break-all text-sm text-[#bdc7b4]"><a href={input.contentUrl} target="_blank" rel="noreferrer" className="hover:text-[#d4ed69]">素材 {input.slot} · {input.originalName} ↗</a></li>)}</ul></section>
    <p className="mt-6 text-xs leading-6 text-[#929e85]">提交：{time(task.createdAt)} · 完成：{time(task.finishedAt)}</p>
  </div>;
}

function time(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—"; }

function ResultPreview({ task }: { task: Task }) {
  const [failed, setFailed] = useState(false);
  return <section className="mt-7 rounded-2xl border border-[#d4ed69]/20 bg-[#131a12] p-5"><h2 className="font-medium">模拟制作结果</h2><p className="mt-3 text-sm leading-7 text-[#a1ab97]">这是预置模板演示图，未合成上传图片。</p><div className="relative mt-5 aspect-[4/5] max-w-sm overflow-hidden rounded-xl bg-[#0b0d0c]">{failed ? <p role="alert" className="p-5 text-sm text-[#f0b7a2]">预览暂不可用，可通过下方链接重新打开。</p> : <Image src={task.resultUrl!} alt={`${task.templateTitle}的预置演示结果`} fill unoptimized sizes="384px" className="object-contain" onError={() => setFailed(true)} />}</div><a href={task.resultUrl!} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm text-[#d4ed69]">打开完整演示图 ↗</a></section>;
}
