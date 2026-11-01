"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { submitTask, type TaskInput } from "@/lib/task-api";
import { recordAcceptedTask } from "@/lib/task-queries";

export function TaskSubmitButton({ owner, templateId, inputs, disabled }: { owner: number; templateId: string; inputs: TaskInput[]; disabled: boolean }) {
  const client = useQueryClient();
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  async function submit() {
    if (disabled || (request.current && !request.current.signal.aborted)) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null); setSubmitted(null);
    try {
      const task = await submitTask(templateId, inputs, controller.signal);
      if (!controller.signal.aborted) {
        await recordAcceptedTask(client, owner, task);
        if (!controller.signal.aborted) setSubmitted(task.id);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "提交失败，请重试");
    } finally {
      if (!controller.signal.aborted) { setBusy(false); request.current = null; }
    }
  }
  return <div className="mt-5">
    <button type="button" disabled={disabled || busy} onClick={() => { void submit(); }} className="w-full rounded-full bg-[#d4ed69] px-6 py-3.5 text-sm font-semibold text-[#18200b] hover:bg-[#e3f69c] disabled:cursor-not-allowed! disabled:opacity-40">{busy ? "正在提交…" : submitted ? "再制作一次 →" : "开始模拟制作 →"}</button>
    {submitted && <p role="status" className="mt-3 text-sm leading-7 text-[#c4d4aa]">任务已受理，下方记录会自动更新。<Link href={`/tasks/${submitted}`} className="ml-2 text-[#d4ed69]">查看详情 ↗</Link></p>}
    <p className="mt-3 text-xs leading-6 text-[#929e85]">{busy ? "正在保存任务与素材，受理后即可继续制作。" : disabled ? "全部图片上传并保存成功后即可提交。" : "可连续提交多个任务，进度和结果分别保存；离开页面不影响后台处理。"}</p>
    {error && <p role="alert" className="mt-3 text-sm leading-6 text-[#f0b7a2]">{error}</p>}
  </div>;
}
