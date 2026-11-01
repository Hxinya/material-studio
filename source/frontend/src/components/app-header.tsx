import Link from "next/link";
import { UserMenu } from "./user-menu";

export function AppHeader() {
  return (
    <header className="border-b border-white/[0.08]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href="/" aria-label="素材工坊首页" className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d4ed69] text-lg font-black text-[#141a0d]">M</span>
          <span className="text-base font-semibold tracking-wide">素材工坊<span className="ml-3 hidden text-xs font-normal tracking-[0.16em] text-[#838c7c] sm:inline">MATERIAL STUDIO</span></span>
        </Link>
        <div className="flex flex-wrap items-center gap-5"><nav aria-label="主导航" className="flex flex-wrap gap-4"><Link href="/" className="text-sm text-[#bec8b4] hover:text-[#d4ed69]">模板库</Link><Link href="/history" className="text-sm text-[#bec8b4] hover:text-[#d4ed69]">制作记录</Link></nav><UserMenu /></div>
      </div>
    </header>
  );
}
