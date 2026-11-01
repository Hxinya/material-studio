import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Task } from "./task-api";

// TanStack Query 在 Node 默认关闭浏览器轮询，先声明浏览器环境再加载真实 QueryObserver。
vi.stubGlobal("window", {});
const { QueryClient, QueryObserver } = await import("@tanstack/react-query");
const { historyTaskQuery, reconcileTask, recordAcceptedTask, taskKeys, taskQueries } = await import("./task-queries");
const { replaceSessionUser } = await import("./session-cache");
const clients: InstanceType<typeof QueryClient>[] = [];
function client() { const value = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(value); return value; }
function task(id: string, status: Task["status"] = "QUEUED"): Task {
  return { id, templateId: "paper-postcard", templateTitle: id, status, currentStage: status === "QUEUED" ? null : "MATERIAL_CHECK",
    createdAt: "2026-10-30T12:00:00Z", startedAt: null, finishedAt: null, errorCode: null, errorMessage: null, resultUrl: null, resultKind: null, inputs: [],
    stages: [{ index: 1, name: "MATERIAL_CHECK", label: "素材检查", status: status === "RUNNING" ? "RUNNING" : "PENDING", startedAt: null, finishedAt: null, errorMessage: null },
      { index: 2, name: "SIMULATE_GENERATION", label: "模拟生成", status: "PENDING", startedAt: null, finishedAt: null, errorMessage: null },
      { index: 3, name: "FINALIZE_RESULT", label: "结果整理", status: "PENDING", startedAt: null, finishedAt: null, errorMessage: null }] };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; }
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", {}); });
afterEach(() => { clients.splice(0).forEach(value => value.clear()); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("tracks multiple pending tasks independently and stops each terminal task without polling the others to completion", async () => {
  const cache = client(); let a = 0, b = 0;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path.endsWith("/a")) { a++; return Response.json(task("a", "SUCCEEDED")); }
    b++; return Response.json(task("b", b === 1 ? "RUNNING" : "FAILED"));
  }));
  const first = new QueryObserver(cache, historyTaskQuery(1, task("a")));
  const second = new QueryObserver(cache, historyTaskQuery(1, task("b")));
  const offA = first.subscribe(() => {}), offB = second.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(1000);
  expect(first.getCurrentResult().data?.status).toBe("SUCCEEDED");
  expect(second.getCurrentResult().data?.status).toBe("RUNNING"); expect([a, b]).toEqual([1, 1]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(second.getCurrentResult().data?.status).toBe("FAILED"); expect([a, b]).toEqual([1, 2]);
  await vi.advanceTimersByTimeAsync(5000); expect([a, b]).toEqual([1, 2]); offA(); offB();
});

it("keeps the previous task status after HTTP failure, pauses only that task, and resumes on explicit recovery", async () => {
  const cache = client(); let a = 0, b = 0;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path.endsWith("/a")) {
      a++;
      return a === 1 ? Response.json({ code: "SERVICE_UNAVAILABLE", message: "offline" }, { status: 503 }) : Response.json(task("a", a === 2 ? "RUNNING" : "SUCCEEDED"));
    }
    b++; return Response.json(task("b", "RUNNING"));
  }));
  const first = new QueryObserver(cache, historyTaskQuery(1, task("a", "RUNNING")));
  const second = new QueryObserver(cache, historyTaskQuery(1, task("b")));
  const offA = first.subscribe(() => {}), offB = second.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(2000);
  expect(first.getCurrentResult()).toMatchObject({ isError: true, data: { status: "RUNNING" } });
  expect([a, b]).toEqual([1, 2]);
  await first.refetch(); expect(first.getCurrentResult().isError).toBe(false);
  await vi.advanceTimersByTimeAsync(1000); expect(first.getCurrentResult().data?.status).toBe("SUCCEEDED");
  await vi.advanceTimersByTimeAsync(2000); expect(a).toBe(3); expect(b).toBeGreaterThan(2); offA(); offB();
});

it("cancels an in-flight task query when the page leaves and discards a response that ignores cancellation", async () => {
  const cache = client(), pending = deferred<Response>(); let signal!: AbortSignal;
  const fetcher = vi.fn((_path, init) => { signal = init.signal; return pending.promise; }); vi.stubGlobal("fetch", fetcher);
  const observer = new QueryObserver(cache, historyTaskQuery(1, task("a"))); const off = observer.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(1000); expect(fetcher).toHaveBeenCalledTimes(1);
  off(); expect(signal.aborted).toBe(true);
  pending.resolve(Response.json(task("a", "SUCCEEDED"))); await vi.advanceTimersByTimeAsync(5000);
  expect(cache.getQueryData<Task>(taskKeys.detail(1, "a"))?.status).toBe("QUEUED"); expect(fetcher).toHaveBeenCalledTimes(1);
});

it("clears the old account's task requests and cannot populate the new account with a late private response", async () => {
  const cache = client(), pending = deferred<Response>(); let oldSignal!: AbortSignal;
  const fetcher = vi.fn().mockImplementationOnce((_path, init) => { oldSignal = init.signal; return pending.promise; })
    .mockResolvedValueOnce(Response.json({ ...task("same", "SUCCEEDED"), templateTitle: "Bob's own task" }));
  vi.stubGlobal("fetch", fetcher);
  const old = new QueryObserver(cache, historyTaskQuery(1, task("same"))); const offOld = old.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(1000);
  await replaceSessionUser(cache, { id: 2, email: "bob@example.com", createdAt: "2026-10-30T00:00:00Z" }); offOld();
  expect(oldSignal.aborted).toBe(true);
  const next = new QueryObserver(cache, taskQueries.detail(2, "same")); const offNext = next.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(0); pending.resolve(Response.json({ ...task("same", "FAILED"), templateTitle: "Alice private" }));
  await vi.advanceTimersByTimeAsync(0);
  expect(cache.getQueryData(taskKeys.detail(1, "same"))).toBeUndefined();
  expect(next.getCurrentResult().data?.templateTitle).toBe("Bob's own task"); offNext();
});

it("does not regress a terminal task when an older history snapshot arrives after its detail query", async () => {
  const cache = client(), oldHistory = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn((path: string) => path === "/api/tasks" ? oldHistory.promise : Promise.resolve(Response.json(task("a", "SUCCEEDED")))));
  const history = new QueryObserver(cache, taskQueries.history(1)); const offHistory = history.subscribe(() => {});
  const detail = new QueryObserver(cache, historyTaskQuery(1, task("a"))); const offDetail = detail.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(1000); oldHistory.resolve(Response.json({ items: [task("a")] }));
  await vi.advanceTimersByTimeAsync(0);
  expect(reconcileTask(detail.getCurrentResult().data, history.getCurrentResult().data!.items[0]).status).toBe("SUCCEEDED");
  offHistory(); offDetail();
});

it("does no periodic requests for empty histories or histories containing only terminal tasks", async () => {
  const cache = client(); const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ items: [] })).mockResolvedValueOnce(Response.json({ items: [task("done", "SUCCEEDED")] }));
  vi.stubGlobal("fetch", fetcher);
  const empty = new QueryObserver(cache, taskQueries.history(1)); const offEmpty = empty.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(5000); expect(fetcher).toHaveBeenCalledTimes(1);
  const full = new QueryObserver(cache, taskQueries.history(2)); const offFull = full.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(0);
  const terminal = new QueryObserver(cache, historyTaskQuery(2, full.getCurrentResult().data!.items[0])); const offTerminal = terminal.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(5000); expect(fetcher).toHaveBeenCalledTimes(2);
  offEmpty(); offFull(); offTerminal();
});

it("shares a terminal history snapshot with the detail cache and rejects a late pre-terminal detail response", async () => {
  const cache = client(), lateDetail = deferred<Response>(); let detailCalls = 0;
  vi.stubGlobal("fetch", vi.fn((path: string) => {
    if (path === "/api/tasks") return Promise.resolve(Response.json({ items: [task("a", "SUCCEEDED")] }));
    detailCalls++; return detailCalls === 1 ? lateDetail.promise : Promise.resolve(Response.json(task("a", "SUCCEEDED")));
  }));
  const detail = new QueryObserver(cache, historyTaskQuery(1, task("a", "RUNNING"))); const offDetail = detail.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(1000);
  const history = new QueryObserver(cache, taskQueries.history(1)); const offHistory = history.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(0);
  expect(cache.getQueryData<Task>(taskKeys.detail(1, "a"))?.status).toBe("SUCCEEDED");
  lateDetail.resolve(Response.json(task("a", "RUNNING"))); await vi.advanceTimersByTimeAsync(0);
  expect(detail.getCurrentResult().data?.status).toBe("SUCCEEDED");
  const reopened = new QueryObserver(cache, taskQueries.detail(1, "a")); const offReopened = reopened.subscribe(() => {});
  expect(reopened.getCurrentResult().data?.status).toBe("SUCCEEDED");
  await vi.advanceTimersByTimeAsync(5000); expect(detailCalls).toBe(2);
  offDetail(); offHistory(); offReopened();
});

it("records an accepted task in matching histories and cancels old list requests without touching another owner", async () => {
  const cache = client(), late = deferred<Response>(); let signal!: AbortSignal;
  const old = task("old", "SUCCEEDED"), accepted = task("new");
  cache.setQueryData(taskKeys.history(1), { items: [old] });
  cache.setQueryData(taskKeys.history(1, "paper-postcard"), { items: [old] });
  cache.setQueryData(taskKeys.history(1, "travel-duo"), { items: [] });
  cache.setQueryData(taskKeys.history(2), { items: [task("bob", "SUCCEEDED")] });
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce((_path, init) => { signal = init.signal; return late.promise; })
    .mockResolvedValueOnce(Response.json({ items: [accepted, old] })));
  const observer = new QueryObserver(cache, taskQueries.history(1)); const off = observer.subscribe(() => {});
  await recordAcceptedTask(cache, 1, accepted); expect(signal.aborted).toBe(true);
  late.resolve(Response.json({ items: [old] })); await vi.advanceTimersByTimeAsync(0);
  expect(observer.getCurrentResult().data?.items.map(item => item.id)).toEqual(["new", "old"]);
  expect(cache.getQueryData(taskKeys.history(1, "paper-postcard"))).toMatchObject({ items: [{ id: "new" }, { id: "old" }] });
  expect(cache.getQueryData(taskKeys.history(1, "travel-duo"))).toEqual({ items: [] });
  expect(cache.getQueryState(taskKeys.history(2))?.isInvalidated).toBe(false); off();
});

it("cancels an old template history when the filter changes and never shows it in the new filter", async () => {
  const cache = client(), old = deferred<Response>(); let signal!: AbortSignal;
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce((_path, init) => { signal = init.signal; return old.promise; })
    .mockResolvedValueOnce(Response.json({ items: [{ ...task("duo", "SUCCEEDED"), templateId: "travel-duo" }] })));
  const observer = new QueryObserver(cache, taskQueries.history(1, "paper-postcard")); const off = observer.subscribe(() => {});
  observer.setOptions(taskQueries.history(1, "travel-duo")); await vi.advanceTimersByTimeAsync(0);
  expect(signal.aborted).toBe(true); old.resolve(Response.json({ items: [task("old")] })); await vi.advanceTimersByTimeAsync(0);
  expect(observer.getCurrentResult().data?.items[0].id).toBe("duo");
  expect(cache.getQueryData(taskKeys.history(1, "paper-postcard"))).toBeUndefined(); off();
});
