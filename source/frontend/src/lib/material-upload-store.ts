import { ApiError } from "./api-client";
import type { MaterialTemplate } from "./catalog-api";
import { getMaterialSlots, removeMaterial, uploadMaterial, type MaterialSlot } from "./material-api";

export type UploadSlot = MaterialSlot & {
  status: "empty" | "ready" | "uploading" | "removing" | "error";
  file?: File; preview?: string; error?: string; operation?: "upload" | "remove";
};
type Snapshot = { status: "loading" | "ready" | "error"; error?: string; slots: UploadSlot[] };
type Transport = { list: typeof getMaterialSlots; upload: typeof uploadMaterial; remove: typeof removeMaterial };

export function validateSelection(files: File[], template: MaterialTemplate): string | undefined {
  if (files.length !== 1) return "每个上传位请选择一张图片";
  const file = files[0];
  if (!template.acceptedMimeTypes.includes(file.type)) return "仅支持 JPEG 或 PNG 图片";
  if (file.size === 0) return "请选择非空图片";
  if (file.size > template.maxFileSizeBytes) return "每张图片不能超过 5 MiB";
}

// 独立控制每个上传位。取消请求后仍检查序号，忽略已经到达服务器、无法撤回的旧响应。
export class MaterialUploadStore {
  private state: Snapshot;
  private listeners = new Set<() => void>();
  private requests = new Map<number, AbortController>();
  private generations = new Map<number, number>();
  private loadRequest?: AbortController;
  private disposed = false;

  constructor(private template: MaterialTemplate, private api: Transport = { list: getMaterialSlots, upload: uploadMaterial, remove: removeMaterial }) {
    this.state = { status: "loading", slots: Array.from({ length: template.requiredImageCount }, (_, i) => ({ slot: i + 1, revision: 0, material: null, status: "empty" })) };
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private publish(state: Snapshot) { this.state = state; this.listeners.forEach((listener) => listener()); }
  private patch(slot: number, patch: Partial<UploadSlot>) {
    this.publish({ ...this.state, slots: this.state.slots.map((item) => item.slot === slot ? { ...item, ...patch } : item) });
  }
  private current(slot: number) { return this.state.slots.find((item) => item.slot === slot)!; }
  private revoke(slot: number) { const url = this.current(slot).preview; if (url) URL.revokeObjectURL(url); }
  private begin(slot: number) {
    this.requests.get(slot)?.abort();
    const controller = new AbortController();
    const generation = (this.generations.get(slot) ?? 0) + 1;
    this.requests.set(slot, controller);
    this.generations.set(slot, generation);
    return { signal: controller.signal, active: () => !this.disposed && this.generations.get(slot) === generation && !controller.signal.aborted };
  }

  async load() {
    this.disposed = false;
    this.loadRequest?.abort();
    const controller = new AbortController(); this.loadRequest = controller;
    this.publish({ ...this.state, status: "loading", error: undefined });
    try {
      const items = await this.api.list(this.template.id, controller.signal);
      if (controller.signal.aborted || this.disposed) return;
      this.publish({ status: "ready", slots: items.map((item) => ({ ...item, status: item.material ? "ready" : "empty" })) });
    } catch (error) {
      if (!controller.signal.aborted && !this.disposed) this.publish({ ...this.state, status: "error", error: this.message(error) });
    }
  }

  async select(slot: number, files: File[]) {
    if (this.state.status !== "ready" || !this.state.slots.some((item) => item.slot === slot)) return;
    const error = validateSelection(files, this.template);
    if (error) { this.patch(slot, { error }); return; }
    const guard = this.begin(slot);
    this.revoke(slot);
    const file = files[0];
    this.patch(slot, { file, preview: URL.createObjectURL(file), status: "uploading", operation: "upload", error: undefined });
    try {
      const result = await this.change(slot, guard.signal, (revision) => this.api.upload(this.template.id, slot, revision, file, guard.signal));
      if (!guard.active()) return;
      this.revoke(slot);
      this.patch(slot, { ...result, file: undefined, preview: undefined, status: "ready", error: undefined, operation: undefined });
    } catch (error) {
      if (guard.active()) this.patch(slot, { status: "error", error: this.message(error) });
    }
  }

  async remove(slot: number) {
    const guard = this.begin(slot);
    // 保留当前预览直到服务端确认移除；失败可重试，不能把失败显示成已清空。
    this.patch(slot, { status: "removing", operation: "remove", error: undefined });
    try {
      const result = await this.change(slot, guard.signal, (revision) => this.api.remove(this.template.id, slot, revision, guard.signal));
      if (!guard.active()) return;
      this.revoke(slot);
      this.patch(slot, { ...result, file: undefined, preview: undefined, status: "empty", error: undefined, operation: undefined });
    } catch (error) {
      if (guard.active()) this.patch(slot, { status: "error", error: this.message(error) });
    }
  }

  retry(slot: number) {
    const item = this.current(slot);
    if (item.operation === "remove") return this.remove(slot);
    if (item.file) return this.select(slot, [item.file]);
  }

  private async change(slot: number, signal: AbortSignal, mutate: (revision: number) => Promise<MaterialSlot>): Promise<MaterialSlot> {
    // 读取最新版本；只对明确的 409 重试一次，不重放超时/网络失败的上传。
    for (let attempt = 0; attempt < 2; attempt++) {
      const items = await this.api.list(this.template.id, signal);
      signal.throwIfAborted();
      const revision = items.find((item) => item.slot === slot)!.revision;
      try { return await mutate(revision); }
      catch (error) { if (!(error instanceof ApiError && error.code === "MATERIAL_CHANGED" && attempt === 0)) throw error; }
    }
    throw new Error("素材已发生变化，请重试");
  }

  private message(error: unknown) {
    if (error instanceof ApiError && error.status === 401) return "登录已失效，请重新登录后再上传";
    return error instanceof Error ? error.message : "操作失败，请重试";
  }

  dispose() {
    this.disposed = true;
    this.loadRequest?.abort();
    this.requests.forEach((request) => request.abort());
    this.state.slots.forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview); });
  }
}
