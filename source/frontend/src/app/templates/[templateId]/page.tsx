import type { Metadata } from "next";
import Link from "next/link";
import { TemplateDetail } from "@/components/template-detail";

export const metadata: Metadata = { title: "模板详情 · 素材工坊", description: "查看模板效果与素材要求，为下一次创作做好准备。" };

export default async function TemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  return <main className="mx-auto max-w-6xl px-5 pb-14 pt-7 sm:px-8"><nav aria-label="返回模板列表" className="mb-7"><Link href="/" className="text-sm text-[#a9b69b] hover:text-[#d4ed69]">← 返回模板库</Link></nav><TemplateDetail id={templateId} /></main>;
}
