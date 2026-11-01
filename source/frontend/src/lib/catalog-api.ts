import { queryOptions } from "@tanstack/react-query";
import { request } from "./api-client";

export type TemplateCategory = { id: string; name: string; description: string; templateCount: number };
export type MaterialTemplate = {
  id: string;
  categoryId: string;
  categoryName: string;
  title: string;
  description: string;
  coverUrl: string;
  requiredImageCount: number;
  acceptedMimeTypes: string[];
  maxFileSizeBytes: number;
};
type Items<T> = { items: T[] };

export async function getCategories(signal?: AbortSignal): Promise<Items<TemplateCategory>> {
  return (await request("/api/template-categories", { signal })).json();
}

export async function getTemplates(category: string, signal?: AbortSignal): Promise<Items<MaterialTemplate>> {
  const query = category ? `?${new URLSearchParams({ category })}` : "";
  return (await request(`/api/templates${query}`, { signal })).json();
}

export async function getTemplate(id: string, signal?: AbortSignal): Promise<MaterialTemplate> {
  return (await request(`/api/templates/${encodeURIComponent(id)}`, { signal })).json();
}

// 查询键包含分类/模板 ID，消费 signal 以取消旧请求；不沿用前一分类的数据。
export const catalogQueries = {
  categories: () => queryOptions({ queryKey: ["catalog", "categories"], queryFn: ({ signal }) => getCategories(signal), staleTime: 60000, retry: false }),
  templates: (category: string) => queryOptions({ queryKey: ["catalog", "templates", category], queryFn: ({ signal }) => getTemplates(category, signal), staleTime: 60000, retry: false }),
  template: (id: string) => queryOptions({ queryKey: ["catalog", "template", id], queryFn: ({ signal }) => getTemplate(id, signal), staleTime: 60000, retry: false }),
};

export function imageRequirements(template: MaterialTemplate) {
  const formats = template.acceptedMimeTypes.map((mime) => ({ "image/jpeg": "JPEG", "image/png": "PNG" })[mime] ?? mime).join(" / ");
  return `${formats} · 每张不超过 ${template.maxFileSizeBytes / (1024 * 1024)} MiB`;
}
