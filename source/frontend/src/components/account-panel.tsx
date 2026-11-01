"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";

export function AccountPanel() {
  const auth = useAuth();
  if (auth.status === "loading") return <p role="status" className="text-[#a9b69c]">正在恢复登录状态…</p>;
  if (auth.status === "error") return <div role="alert"><p className="text-[#f2b7a4]">身份查询暂不可用，请重新查询。</p><button onClick={auth.refresh} className="mt-5 rounded-xl border border-white/20 px-4 py-2">重新查询</button></div>;
  if (!auth.user) return <div><p className="text-[#b9c5ac]">登录后才能查看个人账号信息。</p><Link href="/login" className="mt-6 inline-block rounded-xl bg-[#d4ed69] px-5 py-3 text-[#18200f]">去登录 →</Link></div>;
  return (
    <div>
      <div className="mb-8 flex items-center gap-4"><span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#d4ed69]/10 text-xl font-semibold text-[#d4ed69]">{auth.user.email[0].toUpperCase()}</span><div><p className="text-xs text-[#94a485]">当前登录用户</p><p className="mt-2 break-all text-lg font-medium">{auth.user.email}</p></div></div>
      <dl className="space-y-5 rounded-2xl border border-white/10 bg-[#0d110b] p-5">
        <div><dt className="text-xs text-[#8b9c7c]">用户编号</dt><dd className="mt-2 font-mono text-sm">#{auth.user.id}</dd></div>
        <div><dt className="text-xs text-[#8b9c7c]">注册时间</dt><dd className="mt-2 text-sm">{new Date(auth.user.createdAt).toLocaleString("zh-CN")}</dd></div>
      </dl>
      <p className="mt-6 text-sm leading-7 text-[#9aa98c]">你的素材和制作任务按账号独立保存，可在制作记录中找回进度与结果。</p>
      <Link href="/history" className="mt-4 inline-flex text-sm text-[#d4ed69]">查看我的制作记录 →</Link>
      <div className="mt-8 flex flex-wrap gap-3"><Link href="/" className="rounded-xl bg-[#d4ed69] px-5 py-3 text-sm font-semibold text-[#18200f]">浏览模板 →</Link><button onClick={() => { void auth.logout(); }} className="rounded-xl border border-white/15 px-5 py-3 text-sm text-[#c4cfb9] hover:bg-white/5">退出当前账号</button></div>
    </div>
  );
}
