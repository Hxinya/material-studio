import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-client";
import type { MaterialTemplate } from "./catalog-api";
import type { MaterialSlot } from "./material-api";
import { MaterialUploadStore, validateSelection } from "./material-upload-store";

const template: MaterialTemplate = { id: "travel-duo", title: "旅行", description: "", categoryId: "duo", categoryName: "双人", coverUrl: "", requiredImageCount: 2, acceptedMimeTypes: ["image/jpeg", "image/png"], maxFileSizeBytes: 5242880 };
const empty: MaterialSlot[] = [{ slot: 1, revision: 0, material: null }, { slot: 2, revision: 0, material: null }];
function saved(slot: number, id: string): MaterialSlot { return { slot, revision: 1, material: { id, originalName: `${id}.png`, mimeType: "image/png", sizeBytes: 10, width: 4, height: 3, contentUrl: `/api/materials/${id}/content`, updatedAt: "2026-10-30T00:00:00Z" } }; }
function file(name = "new.png") { return new File(["png"], name, { type: "image/png" }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
function setup() {
  const api = { list: vi.fn().mockResolvedValue(empty), upload: vi.fn().mockResolvedValue(saved(1, "uploaded")), remove: vi.fn().mockResolvedValue({ slot: 1, revision: 2, material: null }) };
  return { api, store: new MaterialUploadStore(template, api) };
}

beforeEach(() => { vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => `blob:${(blob as File).name}`); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("material upload boundaries", () => {
  it("checks count, real browser MIME, empty files and the exact five MiB limit", () => {
    expect(validateSelection([], template)).toContain("一张");
    expect(validateSelection([file(), file()], template)).toContain("一张");
    expect(validateSelection([new File(["x"], "fake.png", { type: "text/plain" })], template)).toContain("JPEG");
    expect(validateSelection([new File([], "empty.png", { type: "image/png" })], template)).toContain("非空");
    expect(validateSelection([new File([new Uint8Array(5242880)], "exact.png", { type: "image/png" })], template)).toBeUndefined();
    expect(validateSelection([new File([new Uint8Array(5242881)], "large.png", { type: "image/png" })], template)).toContain("5 MiB");
  });

  it("restores each server slot and keeps an invalid new selection from replacing saved material", async () => {
    const { store, api } = setup(); api.list.mockResolvedValue([saved(1, "existing"), empty[1]]);
    await store.load();
    await store.select(1, [new File(["x"], "fake.png", { type: "text/plain" })]);
    expect(store.getSnapshot().slots[0].material?.id).toBe("existing");
    expect(store.getSnapshot().slots[0].error).toContain("JPEG");
    expect(api.upload).not.toHaveBeenCalled(); store.dispose();
  });

  it("aborts a replaced upload and ignores its response even when the transport ignores cancellation", async () => {
    const { store, api } = setup(); await store.load();
    const old = deferred<MaterialSlot>(); api.upload.mockReturnValueOnce(old.promise).mockResolvedValueOnce(saved(1, "latest"));
    const first = store.select(1, [file("first.png")]);
    await vi.waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    const signal = api.upload.mock.calls[0][4] as AbortSignal;
    await store.select(1, [file("latest.png")]);
    expect(signal.aborted).toBe(true);
    old.resolve(saved(1, "stale")); await first;
    expect(store.getSnapshot().slots[0].material?.id).toBe("latest");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first.png"); store.dispose();
  });

  it("removes during upload without allowing the late upload to revive the preview", async () => {
    const { store, api } = setup(); await store.load();
    const old = deferred<MaterialSlot>(); api.upload.mockReturnValueOnce(old.promise);
    const uploading = store.select(1, [file()]);
    await vi.waitFor(() => expect(api.upload).toHaveBeenCalled());
    await store.remove(1); old.resolve(saved(1, "stale")); await uploading;
    expect(store.getSnapshot().slots[0]).toMatchObject({ status: "empty", material: null, preview: undefined }); store.dispose();
  });

  it("keeps two uploads independent and retries only the failed slot", async () => {
    const { store, api } = setup(); await store.load();
    api.upload.mockRejectedValueOnce(new ApiError(503, "STORAGE_UNAVAILABLE", "存储不可用")).mockResolvedValueOnce(saved(2, "second"));
    await store.select(1, [file("first.png")]); await store.select(2, [file("second.png")]);
    expect(store.getSnapshot().slots[0]).toMatchObject({ status: "error", preview: "blob:first.png", error: "存储不可用" });
    expect(store.getSnapshot().slots[1].material?.id).toBe("second");
    api.upload.mockResolvedValueOnce(saved(1, "retried")); await store.retry(1);
    expect(store.getSnapshot().slots[0].material?.id).toBe("retried");
    expect(store.getSnapshot().slots[1].material?.id).toBe("second"); store.dispose();
  });

  it("retains the saved preview after a failed removal and lets removal be retried", async () => {
    const { store, api } = setup(); api.list.mockResolvedValue([saved(1, "existing"), empty[1]]); await store.load();
    api.remove.mockRejectedValueOnce(new Error("offline")); await store.remove(1);
    expect(store.getSnapshot().slots[0]).toMatchObject({ status: "error", operation: "remove", material: { id: "existing" } });
    await store.retry(1); expect(store.getSnapshot().slots[0].status).toBe("empty"); store.dispose();
  });

  it("re-reads the server revision after an explicit conflict, without automatically retrying network failure", async () => {
    const { store, api } = setup(); await store.load();
    api.list.mockResolvedValueOnce(empty).mockResolvedValueOnce([{ ...empty[0], revision: 3 }, empty[1]]);
    api.upload.mockRejectedValueOnce(new ApiError(409, "MATERIAL_CHANGED", "changed")).mockResolvedValueOnce(saved(1, "latest"));
    await store.select(1, [file()]); expect(api.upload.mock.calls.map((call) => call[2])).toEqual([0, 3]);
    api.upload.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "offline"));
    await store.select(1, [file()]); expect(api.upload).toHaveBeenCalledTimes(3); store.dispose();
  });

  it("cancels and ignores requests when leaving the page or changing account, and releases blob URLs", async () => {
    const { store, api } = setup(); await store.load();
    const pending = deferred<MaterialSlot>(); api.upload.mockReturnValueOnce(pending.promise);
    const upload = store.select(1, [file()]); await vi.waitFor(() => expect(api.upload).toHaveBeenCalled());
    const before = store.getSnapshot(); store.dispose(); pending.resolve(saved(1, "old-account")); await upload;
    expect((api.upload.mock.calls[0][4] as AbortSignal).aborted).toBe(true);
    expect(store.getSnapshot()).toBe(before); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:new.png");
  });
});
