"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { catalogQueries } from "@/lib/catalog-api";
import { CatalogSkeleton, CatalogState } from "./catalog-state";
import { TemplateCover } from "./template-cover";

export function TemplateCatalog() {
  const category = useSearchParams().get("category") ?? "";
  const categories = useQuery(catalogQueries.categories());
  const templates = useQuery(catalogQueries.templates(category));
  const selected = categories.data?.items.find((item) => item.id === category);
  const chip = "inline-flex shrink-0 items-center gap-2 rounded-full border px-5 py-2.5 text-sm transition-colors";

  return (
    <section aria-labelledby="templates-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-5">
        <div><p className="mb-2 text-xs tracking-[0.18em] text-[#a3b18e]">THE TEMPLATE LIBRARY</p><h2 id="templates-title" className="text-2xl font-medium">{category ? selected?.name ?? "分类模板" : "发现模板"}</h2></div>
        <p className="text-sm text-[#9aa58c]" role="status">{templates.isPending ? "正在寻找灵感…" : templates.isError ? "暂时无法获取模板" : `${templates.data.items.length} 个模板 · 选择你的下一份灵感`}</p>
      </div>
      <nav aria-label="模板分类" className="mb-7 flex flex-wrap gap-2.5">
        <Link href="/" scroll={false} aria-current={!category ? "page" : undefined} className={`${chip} ${!category ? "border-[#d4ed69] bg-[#d4ed69] font-medium text-[#17200e]" : "border-white/10 text-[#b9c2af] hover:border-[#d4ed69]/50 hover:text-white"}`}>全部模板</Link>
        {categories.data?.items.map((item) => <Link key={item.id} href={`/?category=${encodeURIComponent(item.id)}`} scroll={false} aria-current={category === item.id ? "page" : undefined} className={`${chip} ${category === item.id ? "border-[#d4ed69] bg-[#d4ed69] font-medium text-[#17200e]" : "border-white/10 text-[#b9c2af] hover:border-[#d4ed69]/50 hover:text-white"}`}>{item.name}<span className="text-xs opacity-65">{item.templateCount}</span></Link>)}
        {categories.isPending && <span role="status" className="px-3 py-2.5 text-sm text-[#9aa58c]">分类加载中…</span>}
      </nav>
      {categories.isError && <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#f2b7a4]/25 p-4 text-sm text-[#f2b7a4]">分类加载失败，你仍可浏览全部模板。<button onClick={() => { void categories.refetch(); }} className="underline underline-offset-4">重试分类</button></div>}
      {selected && <p className="mb-6 text-sm text-[#a1ab97]">{selected.description}</p>}
      {templates.isPending ? <CatalogSkeleton /> : templates.isError ? <CatalogState title="模板暂时加载失败" description={templates.error.message} retry={() => { void templates.refetch(); }} /> : templates.data.items.length === 0 ? <CatalogState title="这个分类还没有模板" description="试着浏览全部模板，看看有没有让你心动的画面。" back /> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {templates.data.items.map((template, index) => <Link key={template.id} href={`/templates/${template.id}`} className="group overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111610] transition-colors hover:border-[#d4ed69]/45">
            <div className="relative aspect-[4/3] overflow-hidden bg-[#202b20]">
              <TemplateCover src={template.coverUrl} title={template.title} priority={index < 3} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" />
              <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-[#0b0d0c]/75 px-3 py-1.5 text-xs text-white backdrop-blur-sm">{template.categoryName}</span>
              <span aria-hidden="true" className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f5e9] text-lg text-[#16200f] transition-colors group-hover:bg-[#d4ed69]">↗</span>
            </div>
            <div className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-medium group-hover:text-[#d4ed69]">{template.title}</h3><span className="text-xs text-[#c5d4b5]">{template.requiredImageCount} 张素材</span></div><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#99a38d]">{template.description}</p></div>
          </Link>)}
        </div>
      )}
    </section>
  );
}
