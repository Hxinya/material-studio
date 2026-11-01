import { request } from "./api-client";

export type Material = { id: string; originalName: string; mimeType: string; sizeBytes: number; width: number; height: number; contentUrl: string; updatedAt: string };
export type MaterialSlot = { slot: number; revision: number; material: Material | null };

function path(template: string) { return `/api/templates/${encodeURIComponent(template)}/materials`; }

export async function getMaterialSlots(template: string, signal?: AbortSignal): Promise<MaterialSlot[]> {
  return (await (await request(path(template), { signal })).json()).items;
}

async function csrfHeaders(signal: AbortSignal) {
  const csrf: { token: string; headerName: string } = await (await request("/api/auth/csrf", { signal })).json();
  signal.throwIfAborted();
  return { [csrf.headerName]: csrf.token };
}

export async function uploadMaterial(template: string, slot: number, revision: number, file: File, signal: AbortSignal): Promise<MaterialSlot> {
  const headers = await csrfHeaders(signal);
  const body = new FormData();
  body.append("expectedRevision", String(revision));
  body.append("file", file);
  return (await request(`${path(template)}/${slot}`, { method: "PUT", headers, body, signal })).json();
}

export async function removeMaterial(template: string, slot: number, revision: number, signal: AbortSignal): Promise<MaterialSlot> {
  const headers = await csrfHeaders(signal);
  return (await request(`${path(template)}/${slot}?expectedRevision=${revision}`, { method: "DELETE", headers, signal })).json();
}
