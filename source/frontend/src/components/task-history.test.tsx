// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { AppProviders } from "./auth-provider";
import { TaskHistory } from "./task-history";
import type { Task } from "@/lib/task-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
const server = setupServer();
const origin = "http://localhost";
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  const intercepted = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => intercepted(
    typeof input === "string" ? new URL(input, origin) : input, init));
  // The component uses the real auth provider; broadcasting to unrelated tests is unnecessary.
  vi.stubGlobal("BroadcastChannel", undefined);
});
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); vi.unstubAllGlobals(); });
function auth() { server.use(http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ id: 7, email: "ui@example.test", createdAt: "2026-11-01T00:00:00Z" }))); }
function task(id: string, status: Task["status"]): Task {
  return { id, status, templateId: "paper-postcard", templateTitle: `模板 ${id}`, currentStage: status === "RUNNING" ? "MATERIAL_CHECK" : null,
    createdAt: "2026-11-01T00:00:00Z", startedAt: null, finishedAt: null, errorCode: null, errorMessage: null,
    resultUrl: null, resultKind: null, inputs: [], stages: [{ index: 1, name: "MATERIAL_CHECK", label: "素材检查", status: status === "RUNNING" ? "RUNNING" : "SUCCEEDED", startedAt: null, finishedAt: null, errorMessage: null }] };
}
function show() { return render(<AppProviders><TaskHistory /></AppProviders>); }

describe("history UI with real auth/query/request layers", () => {
  it("keeps a running card on HTTP failure and recovers it independently through the visible button", async () => {
    auth();
    let recover = false;
    let finishedReads = 0;
    server.use(
      http.get(`${origin}/api/tasks`, () => HttpResponse.json({ items: [task("pending", "RUNNING"), task("done", "SUCCEEDED")] })),
      http.get(`${origin}/api/tasks/pending`, () => recover ? HttpResponse.json(task("pending", "SUCCEEDED")) : HttpResponse.json({ code: "UNAVAILABLE", message: "服务暂不可用" }, { status: 503 })),
      http.get(`${origin}/api/tasks/done`, () => { finishedReads++; return HttpResponse.json(task("done", "SUCCEEDED")); }),
    );
    show();
    const pending = await screen.findByRole("article", { name: "制作任务 pending" });
    expect(within(pending).getByText("处理中")).toBeTruthy();
    const retry = await within(pending).findByRole("button", { name: "恢复查询" }, { timeout: 4000 });
    expect(within(pending).getByRole("alert").textContent).toContain("保留上次状态");
    expect(within(pending).queryByText("制作失败")).toBeNull();
    expect(within(screen.getByRole("article", { name: "制作任务 done" })).getByText("制作成功")).toBeTruthy();
    recover = true;
    fireEvent.click(retry);
    await within(pending).findByText("制作成功");
    expect(within(pending).queryByRole("alert")).toBeNull();
    expect(finishedReads).toBe(0);
  });

  it("shows a list request error separately from empty records and retries from the UI", async () => {
    auth(); let available = false;
    server.use(http.get(`${origin}/api/tasks`, () => available ? HttpResponse.json({ items: [] }) : HttpResponse.json({ message: "记录连接失败" }, { status: 503 })));
    show();
    await screen.findByRole("alert");
    expect(screen.queryByText("还没有制作记录")).toBeNull();
    available = true;
    fireEvent.click(screen.getByRole("button", { name: "重试读取记录" }));
    await screen.findByText("还没有制作记录");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not request personal histories for a guest", async () => {
    let reads = 0;
    server.use(http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ message: "请先登录" }, { status: 401 })),
      http.get(`${origin}/api/tasks`, () => { reads++; return HttpResponse.json({ items: [] }); }));
    show();
    await screen.findByRole("link", { name: "去登录 →" });
    expect(reads).toBe(0);
  });
});
