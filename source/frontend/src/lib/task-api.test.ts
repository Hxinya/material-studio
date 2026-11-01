import { afterEach, expect, it, vi } from "vitest";
import { getTask, getTaskHistory, submitTask } from "./task-api";

afterEach(() => vi.unstubAllGlobals());

it("reads all or template-specific history and never treats a service failure as an empty history", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ items: [] }))
    .mockResolvedValueOnce(Response.json({ items: [{ id: "duo-task" }] }))
    .mockResolvedValueOnce(Response.json({ code: "SERVICE_UNAVAILABLE", message: "offline" }, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(getTaskHistory()).resolves.toEqual({ items: [] });
  await expect(getTaskHistory("travel-duo")).resolves.toMatchObject({ items: [{ id: "duo-task" }] });
  expect(fetcher.mock.calls[1][0]).toBe("/api/tasks?templateId=travel-duo");
  await expect(getTaskHistory()).rejects.toMatchObject({ status: 503 });
});
const inputs = [{ slot: 1, materialId: "original-image-id", revision: 3 }];

it("submits exact material IDs and revisions with fresh CSRF, and accepts queued HTTP 202 without waiting", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ token: "fresh", headerName: "X-CSRF-TOKEN" }))
    .mockResolvedValueOnce(Response.json({ id: "task-1", status: "QUEUED" }, { status: 202 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(submitTask("paper-postcard", inputs, new AbortController().signal)).resolves.toMatchObject({ id: "task-1", status: "QUEUED" });
  const [path, init] = fetcher.mock.calls[1];
  expect(path).toBe("/api/tasks"); expect(init.method).toBe("POST");
  expect(init.headers["X-CSRF-TOKEN"]).toBe("fresh");
  expect(JSON.parse(init.body)).toEqual({ templateId: "paper-postcard", inputs });
});

it("does not replay a task submission after conflict or uncertain network failure", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ token: "x", headerName: "X-CSRF-TOKEN" }))
    .mockRejectedValueOnce(new TypeError("connection lost"));
  vi.stubGlobal("fetch", fetcher);
  await expect(submitTask("paper-postcard", inputs, new AbortController().signal)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("keeps a persisted task failure distinct from a query failure, and only uses GET for queries", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: "task-1", status: "FAILED", errorCode: "SIMULATED_FAILURE" }))
    .mockResolvedValueOnce(Response.json({ code: "SERVICE_UNAVAILABLE", message: "暂不可用" }, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(getTask("task-1")).resolves.toMatchObject({ status: "FAILED" });
  await expect(getTask("task-1")).rejects.toMatchObject({ status: 503 });
  expect(fetcher.mock.calls.every(call => call[1].method === undefined)).toBe(true);
});

it("does not send POST if leaving the page cancels the request while obtaining CSRF", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn().mockImplementation(async () => { controller.abort(); return Response.json({ token: "x", headerName: "X-CSRF-TOKEN" }); });
  vi.stubGlobal("fetch", fetcher);
  await expect(submitTask("paper-postcard", inputs, controller.signal)).rejects.toBe(controller.signal.reason);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
