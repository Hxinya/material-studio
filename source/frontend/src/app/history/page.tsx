import { TaskHistory } from "@/components/task-history";

export const metadata = { title: "我的制作记录 · 素材工坊" };
export default function HistoryPage() {
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14"><p className="text-xs tracking-[0.18em] text-[#d4ed69]">YOUR CREATIONS</p><h1 className="mt-4 text-3xl font-semibold">我的制作记录</h1><p className="mb-8 mt-4 text-sm leading-7 text-[#a1ab97]">找回每次灵感，继续查看制作进度、结果与失败原因。</p><TaskHistory /></main>;
}
