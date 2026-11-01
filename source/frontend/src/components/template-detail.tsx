"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import { catalogQueries, imageRequirements } from "@/lib/catalog-api";
import { CatalogState } from "./catalog-state";
import { TemplateCover } from "./template-cover";
import { MaterialUploader } from "./material-uploader";
import { TaskHistory } from "./task-history";

export function TemplateDetail({ id }: { id: string }) {
  const query = useQuery(catalogQueries.template(id));
  if (query.isPending) return <div role="status" aria-label="正在加载模板详情" className="grid gap-8 md:grid-cols-2"><div aria-hidden="true" className="aspect-[4/5] rounded-2xl bg-[#1b2219] motion-safe:animate-pulse" /><div className="space-y-5 pt-8"><p className="text-sm text-[#a1ab97]">正在加载模板详情…</p><div aria-hidden="true" className="h-8 w-2/3 rounded bg-white/10" /><div aria-hidden="true" className="h-28 rounded bg-white/5" /></div></div>;
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return <CatalogState title={missing ? "这个模板不存在或已下架" : "模板详情加载失败"} description={missing ? "这个链接可能已经失效，回到模板库寻找其他灵感吧。" : query.error.message} retry={missing ? undefined : () => { void query.refetch(); }} back />;
  }
  const template = query.data;
  return (
    <div className="grid items-start gap-7 md:grid-cols-[1fr_1.05fr] lg:gap-12">
      <section aria-label="模板效果示例" className="overflow-hidden rounded-2xl border border-white/10 bg-[#111610]">
        <div className="aspect-[4/5] overflow-hidden"><TemplateCover src={template.coverUrl} title={template.title} priority sizes="(max-width: 767px) 100vw, 50vw" /></div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-[#a1ab97]"><span>原创示例插画 · 效果参考</span><a href={template.coverUrl} target="_blank" rel="noreferrer" className="text-[#d4ed69] hover:underline">查看完整示例 ↗</a></div>
      </section>
      <div className="py-1">
        <Link href={`/?category=${template.categoryId}`} className="inline-flex rounded-full border border-[#d4ed69]/25 bg-[#d4ed69]/5 px-3 py-1.5 text-xs text-[#d4ed69]">{template.categoryName} ↗</Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">{template.title}</h1>
        <p className="mt-5 text-sm leading-7 text-[#a9b39e]">{template.description}</p>
        <section aria-labelledby="material-requirements" className="mt-7 border-t border-white/10 pt-6">
          <h2 id="material-requirements" className="text-base font-medium">准备你的素材</h2>
          <p className="mb-5 mt-2 text-xs leading-6 text-[#a1ab97]">需要 {template.requiredImageCount} 张图片 · {imageRequirements(template)}</p>
          <MaterialUploader template={template} />
        </section>
        <section aria-labelledby="history-title" className="mt-7 border-t border-white/10 pt-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 id="history-title" className="text-sm font-medium">这个模板的制作记录</h2><Link href="/history" className="text-xs text-[#d4ed69]">全部记录 ↗</Link></div><TaskHistory templateId={template.id} compact /></section>
      </div>
    </div>
  );
}
