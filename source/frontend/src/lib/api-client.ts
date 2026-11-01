export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(12000);
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(0, "NETWORK_ERROR", "暂时无法连接服务，请检查网络后重试");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(response.status, error?.code ?? "REQUEST_FAILED", error?.message ?? "请求失败，请稍后重试", error?.fields ?? {});
  }
  return response;
}
