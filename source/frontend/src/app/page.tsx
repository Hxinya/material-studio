import type { Metadata } from "next";
import { Suspense } from "react";
import { TemplateCatalog } from "@/components/template-catalog";
import { CatalogSkeleton } from "@/components/catalog-state";

export const metadata: Metadata = { title: "发现模板 · 素材工坊", description: "浏览创意图片、人像写真与双人记忆模板，选择你的下一份灵感。" };

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
      <div className="mb-12">
        <div><p className="mb-4 flex items-center gap-2 text-xs tracking-[0.2em] text-[#d4ed69]"><span className="h-px w-7 bg-[#d4ed69]" />MAKE ROOM FOR IDEAS</p><h1 className="text-3xl font-semibold leading-[1.35] tracking-tight sm:text-4xl">给每一个灵感，<br /><span className="text-[#d4ed69]">一个开始的画面。</span></h1><p className="mt-4 max-w-lg text-sm leading-7 text-[#a1ab97]">从山海到街头，从一个人到两个人。找到适合你的模板，看看下一份创意会是什么模样。</p></div>
      </div>
      <Suspense fallback={<CatalogSkeleton />}><TemplateCatalog /></Suspense>
      <footer className="mt-12 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-6 text-xs text-[#929e85]"><span>素材工坊 · 让灵感有迹可循</span><span>示例为原创插画，仅作模板效果参考</span></footer>
    </main>
  );
}
