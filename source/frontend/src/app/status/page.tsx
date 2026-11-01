import type { Metadata } from "next";
import Link from "next/link";
import { ServiceHealth } from "@/components/service-health";

export const metadata: Metadata = { title: "服务状态 · 素材工坊" };

export default function StatusPage() {
  return <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8"><h1 className="mb-6 text-2xl font-semibold">服务连接检查</h1><ServiceHealth /><Link href="/" className="mt-8 inline-block text-sm text-[#d4ed69]">← 返回模板库</Link></main>;
}
