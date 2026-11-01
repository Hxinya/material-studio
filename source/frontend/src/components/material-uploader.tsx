"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MaterialTemplate } from "@/lib/catalog-api";
import { MaterialUploadStore } from "@/lib/material-upload-store";
import { useAuth } from "./auth-provider";
import { TaskSubmitButton } from "./task-submit-button";

export function MaterialUploader({ template }: { template: MaterialTemplate }) {
  const auth = useAuth();
  if (auth.status === "loading") return <p role="status" className="rounded-xl border border-white/10 p-5 text-sm text-[#a1ab97]">正在确认登录状态…</p>;
  if (auth.status === "error") return <div role="alert" className="rounded-xl border border-white/10 p-5 text-sm"><p>暂时无法确认账号，请恢复连接后重试。</p><button onClick={auth.refresh} className="mt-3 text-[#d4ed69]">重新确认账号</button></div>;
  if (auth.status === "guest" || !auth.user) return <div className="rounded-xl border border-dashed border-white/20 bg-[#131a12] p-6"><p className="text-sm text-[#c1cbb6]">登录后上传并保存你的图片</p><p className="mt-2 text-xs leading-6 text-[#929e85]">每个账号的素材独立保存，可在这里预览、替换或移除。</p><Link href="/login" className="mt-4 inline-flex rounded-full bg-[#d4ed69] px-5 py-2 text-sm font-medium text-[#18200b]">去登录 ↗</Link></div>;
  return <UploadSlots key={`${auth.user.id}:${template.id}`} template={template} owner={auth.user.id} />;
}

function UploadSlots({ template, owner }: { template: MaterialTemplate; owner: number }) {
  const [store] = useState(() => new MaterialUploadStore(template));
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.load(); return () => store.dispose(); }, [store]);
  if (state.status === "loading") return <p role="status" className="rounded-xl border border-white/10 p-5 text-sm text-[#a1ab97]">正在读取已保存的素材…</p>;
  if (state.status === "error") return <div role="alert" className="rounded-xl border border-red-300/20 p-5 text-sm"><p>{state.error}</p><button onClick={() => { void store.load(); }} className="mt-3 text-[#d4ed69]">重试读取素材</button></div>;
  const ready = state.slots.filter((slot) => slot.status === "ready" && !slot.error).length;
  return <div>
    <div className={`grid gap-3 ${template.requiredImageCount > 1 ? "sm:grid-cols-2" : ""}`}>
      {state.slots.map((slot) => {
        const preview = slot.preview ?? slot.material?.contentUrl;
        const busy = slot.status === "uploading" || slot.status === "removing";
        const name = slot.file?.name ?? slot.material?.originalName;
        return <section key={slot.slot} aria-label={`素材 ${slot.slot}`} className="min-w-0 overflow-hidden rounded-xl border border-white/15 bg-[#131a12] p-3">
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/15 bg-[#0e140d]">
            {preview ? <MaterialPreview key={preview} src={preview} slot={slot.slot} /> : <button type="button" aria-label={`上传素材 ${slot.slot}`} onClick={() => fileInputs.current[slot.slot]?.click()} className="absolute inset-0 flex w-full flex-col items-center justify-center px-3 text-center hover:bg-white/5"><span aria-hidden="true" className="text-2xl text-[#a2b78a]">＋</span><span className="mt-2 text-xs text-[#929e85]">选择一张 JPEG / PNG 图片</span></button>}
            {busy && <p role="status" className="absolute inset-x-0 bottom-0 bg-black/80 px-2 py-2 text-center text-xs text-[#d4ed69]">{slot.status === "removing" ? "正在移除…" : "正在上传并检查…"}</p>}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="text-[#c1cbb6]">素材 {slot.slot}</span><span className="text-[#a6ba85]">{slot.status === "ready" ? "已保存" : slot.status === "error" ? "操作失败" : slot.status === "empty" ? "待上传" : "处理中"}</span></div>
          {name && <p title={name} className="mt-2 truncate text-xs text-[#929e85]">{name}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="relative inline-flex cursor-pointer rounded-full border border-[#d4ed69]/30 px-3 py-2 text-xs text-[#d4ed69] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#d4ed69]">
              <input ref={(input) => { fileInputs.current[slot.slot] = input; }} aria-label={`${preview ? "替换" : "选择"}素材 ${slot.slot}`} type="file" accept={template.acceptedMimeTypes.join(",")} className="absolute inset-0 w-full cursor-pointer opacity-0" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (files.length) void store.select(slot.slot, files); }} />
              {preview ? "替换图片" : "选择图片"}
            </label>
            {(preview || busy || slot.status === "error") && <button onClick={() => { void store.remove(slot.slot); }} disabled={slot.status === "removing"} className="rounded-full border border-white/15 px-3 py-2 text-xs text-[#bdc7b4] disabled:opacity-50">移除</button>}
            {slot.status === "error" && <button onClick={() => { void store.retry(slot.slot); }} className="rounded-full border border-[#d4ed69]/30 px-3 py-2 text-xs text-[#d4ed69]">{slot.operation === "remove" ? "重试移除" : "重试上传"}</button>}
          </div>
          {slot.error && <p role="alert" className="mt-3 text-xs leading-6 text-[#f0b7a2]">{slot.error}</p>}
        </section>;
      })}
    </div>
    <p aria-live="polite" className="mt-3 text-xs leading-6 text-[#a1ab97]">已准备 {ready} / {template.requiredImageCount} 张素材 · 上传成功后可刷新页面继续查看。</p>
    <TaskSubmitButton owner={owner} templateId={template.id} disabled={ready !== template.requiredImageCount} inputs={state.slots.filter(slot => slot.status === "ready" && slot.material && !slot.error).map(slot => ({ slot: slot.slot, materialId: slot.material!.id, revision: slot.revision }))} />
  </div>;
}

function MaterialPreview({ src, slot }: { src: string; slot: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="px-4 text-center text-xs leading-6 text-[#b9c6aa]">这张图片暂时无法预览，请替换图片或刷新后重试。</p>;
  return <Image src={src} alt={`素材 ${slot} 预览`} fill unoptimized className="object-contain" sizes="(max-width: 767px) 100vw, 25vw" onError={() => setFailed(true)} />;
}
