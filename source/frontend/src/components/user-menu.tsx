"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";

export function UserMenu() {
  const auth = useAuth();
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
      {auth.status === "loading" ? <span className="text-[#a1ab97]">正在确认身份…</span>
        : auth.status === "error" ? <button onClick={auth.refresh} className="text-[#f2b7a4]">身份查询失败 · 重试</button>
          : auth.user ? <><Link className="max-w-44 truncate text-[#dce2d4] hover:text-[#d4ed69]" href="/account" title={auth.user.email}>{auth.user.email}</Link><button onClick={() => { void auth.logout(); }} className="rounded-full border border-white/15 px-4 py-2 hover:bg-white/5">退出</button></>
            : <><Link href="/login" className="px-2 py-2 text-[#bec8b4] hover:text-white">登录</Link><Link href="/register" className="rounded-full bg-[#d4ed69] px-4 py-2 font-medium text-[#17200e] hover:bg-[#e0f58d]">创建账号</Link></>}
      {auth.actionError && <span role="alert" className="w-full text-xs text-[#f2b7a4]">{auth.actionError}</span>}
    </div>
  );
}
