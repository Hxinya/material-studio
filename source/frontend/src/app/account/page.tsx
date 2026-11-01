import type { Metadata } from "next";
import { AccountPanel } from "@/components/account-panel";

export const metadata: Metadata = { title: "我的账号 · 素材工坊" };
export default function AccountPage() {
  return <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16"><p className="text-xs tracking-[0.18em] text-[#d4ed69]">YOUR ACCOUNT</p><h1 className="mb-8 mt-4 text-3xl font-semibold">我的账号</h1><section className="rounded-3xl border border-white/10 bg-[#141714] p-6 sm:p-9"><AccountPanel /></section></main>;
}
