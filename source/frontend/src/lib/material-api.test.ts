import { afterEach, expect, it, vi } from "vitest";
import { uploadMaterial, removeMaterial } from "./material-api";

afterEach(() => vi.unstubAllGlobals());

it("sends a real FormData upload with a fresh CSRF header and no manually set multipart boundary", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ token: "fresh", headerName: "X-CSRF-TOKEN" }))
    .mockResolvedValueOnce(Response.json({ slot: 1, revision: 1, material: null }));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  await uploadMaterial("travel-duo", 1, 0, new File(["x"], "photo.png", { type: "image/png" }), controller.signal);
  const [url, init] = fetcher.mock.calls[1];
  expect(url).toBe("/api/templates/travel-duo/materials/1");
  expect(init.method).toBe("PUT"); expect(init.headers).toEqual({ "X-CSRF-TOKEN": "fresh" });
  expect(init.body).toBeInstanceOf(FormData); expect(init.body.get("expectedRevision")).toBe("0");
  expect(init.body.get("file").name).toBe("photo.png"); expect(init.credentials).toBe("same-origin");
});

it("sends the expected revision when deleting, so a stale removal cannot delete a newer image", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ token: "fresh", headerName: "X-CSRF-TOKEN" }))
    .mockResolvedValueOnce(Response.json({ slot: 2, revision: 8, material: null }));
  vi.stubGlobal("fetch", fetcher);
  await removeMaterial("travel-duo", 2, 7, new AbortController().signal);
  expect(fetcher.mock.calls[1][0]).toBe("/api/templates/travel-duo/materials/2?expectedRevision=7");
  expect(fetcher.mock.calls[1][1].method).toBe("DELETE");
});
