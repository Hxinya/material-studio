import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { catalogQueries, getTemplate, getTemplates } from "./catalog-api";

afterEach(() => vi.unstubAllGlobals());

describe("catalog requests", () => {
  it("distinguishes an empty category from an unavailable catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ code: "SERVICE_UNAVAILABLE", message: "服务暂不可用" }, { status: 503 })));
    await expect(getTemplates("not-present")).resolves.toEqual({ items: [] });
    await expect(getTemplates("creative")).rejects.toMatchObject({ status: 503 });
  });

  it("distinguishes a missing template from a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ code: "TEMPLATE_NOT_FOUND" }, { status: 404 }))
      .mockRejectedValueOnce(new TypeError("offline")));
    await expect(getTemplate("missing")).rejects.toMatchObject({ status: 404, code: "TEMPLATE_NOT_FOUND" });
    await expect(getTemplate("paper-postcard")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("keeps request cancellation distinct from a service failure", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(controller.signal.reason));
    await expect(getTemplates("duo", controller.signal)).rejects.toBe(controller.signal.reason);
  });

  it("cancels a previous category and never lets its late response replace the selected one", async () => {
    let finishOld!: (response: Response) => void;
    let oldSignal!: AbortSignal;
    const client = new QueryClient();
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce((_url, init) => {
      oldSignal = init.signal;
      return new Promise<Response>((resolve) => { finishOld = resolve; });
    }).mockResolvedValueOnce(Response.json({ items: [{ id: "new-duo" }] })));
    const observer = new QueryObserver(client, catalogQueries.templates("creative"));
    const unsubscribe = observer.subscribe(() => {});
    try {
      observer.setOptions(catalogQueries.templates("duo"));
      await vi.waitFor(() => expect(observer.getCurrentResult().data?.items[0].id).toBe("new-duo"));
      expect(oldSignal.aborted).toBe(true);
      finishOld(Response.json({ items: [{ id: "old-creative" }] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(observer.getCurrentResult().data?.items[0].id).toBe("new-duo");
      expect(client.getQueryData(["catalog", "templates", "creative"])).toBeUndefined();
    } finally { unsubscribe(); client.clear(); }
  });
});
