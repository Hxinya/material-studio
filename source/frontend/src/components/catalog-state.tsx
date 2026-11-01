import Link from "next/link";

export function CatalogState({ title, description, retry, back }: { title: string; description: string; retry?: () => void; back?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#111610] px-6 py-16 text-center" role={retry ? "alert" : "status"}>
      <span aria-hidden="true" className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#d4ed69]/25 font-mono text-lg text-[#d4ed69]">{retry ? "!" : "◇"}</span>
      <h2 className="text-xl font-medium">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#a1ab97]">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-4">
        {retry && <button onClick={retry} className="rounded-full bg-[#d4ed69] px-6 py-2.5 text-sm font-medium text-[#17200e] hover:bg-[#e0f58d]">重新加载</button>}
        {back && <Link href="/" className="rounded-full border border-white/20 px-6 py-2.5 text-sm hover:bg-white/5">浏览全部模板</Link>}
      </div>
    </div>
  );
}

export function CatalogSkeleton() {
  return <div role="status" aria-label="正在加载模板" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true" className="overflow-hidden rounded-2xl border border-white/10"><div className="aspect-[4/3] bg-[#1b2219] motion-safe:animate-pulse" /><div className="space-y-3 p-5"><div className="h-5 w-1/2 rounded bg-white/10" /><div className="h-3 w-4/5 rounded bg-white/5" /></div></div>)}</div>;
}
