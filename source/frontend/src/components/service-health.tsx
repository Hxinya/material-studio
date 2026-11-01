"use client";

import { useEffect, useState } from "react";

type Health = {
  status: "UP" | "DOWN";
  application: string;
  database: "UP" | "DOWN";
  schemaVersion: string | null;
  timestamp: string;
};

type CheckState =
  | { kind: "loading" }
  | { kind: "ready"; data: Health }
  | { kind: "error"; message: string };

export function ServiceHealth() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CheckState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    async function check() {
      try {
        const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Java 服务或数据库暂不可用，请查看容器日志后重新检查。");
        const data: Health = await response.json();
        if (data.status !== "UP" || data.database !== "UP") {
          throw new Error("服务尚未就绪，请稍后重新检查。");
        }
        if (active) setState({ kind: "ready", data });
      } catch (error) {
        if (active) setState({ kind: "error", message: controller.signal.aborted ? "检查超时，请确认 Java 服务已经启动。" : error instanceof Error ? error.message : "连接检查失败，请稍后重试。" });
      } finally {
        clearTimeout(timeout);
      }
    }

    void check();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const ready = state.kind === "ready";

  return (
    <section aria-labelledby="health-title" className="rounded-3xl border border-white/10 bg-[#141714] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs tracking-[0.18em] text-[#9ca497]">SERVICE CONNECTION</p>
          <h2 id="health-title" className="text-xl font-semibold">服务连接检查</h2>
        </div>
        <button
          type="button"
          disabled={state.kind === "loading"}
          onClick={() => { setState({ kind: "loading" }); setAttempt((value) => value + 1); }}
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-[#dce2d4] transition hover:bg-white/5 disabled:opacity-40"
        >
          {state.kind === "loading" ? "检查中…" : "重新检查 ↗"}
        </button>
      </div>

      <div role="status" aria-live="polite" className="mt-7">
        <div className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${ready ? "bg-[#d4ed69]" : state.kind === "error" ? "bg-[#f2a58e]" : "animate-pulse bg-[#a0a797]"}`} />
          {ready ? "前后端与数据库已连通" : state.kind === "loading" ? "正在检查 Java 与 MySQL…" : "连接需要检查"}
        </div>
        {state.kind === "error" && <p className="mt-3 text-sm leading-6 text-[#f2b7a4]">{state.message}</p>}
        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["前端", "Next.js", "页面已加载"],
            ["后端", "Spring Boot", ready ? "Java 服务正常" : "等待连接确认"],
            ["数据库", "MySQL", ready ? `初始化记录 ${state.data.schemaVersion}` : "等待连接确认"],
          ].map(([label, title, detail]) => (
            <div key={label} className="rounded-2xl border border-white/[0.06] bg-[#0f120f] p-5">
              <dt className="text-xs text-[#929b8c]">{label}</dt>
              <dd className="mt-2 text-lg font-medium">{title}</dd>
              <dd className="mt-2 text-xs text-[#aab2a2]">{detail}</dd>
            </div>
          ))}
        </dl>
        {ready && <p className="mt-5 text-xs leading-5 text-[#8d9785]">最近检查：{new Date(state.data.timestamp).toLocaleString("zh-CN")} · 数据来自 Java 健康接口</p>}
      </div>
    </section>
  );
}
