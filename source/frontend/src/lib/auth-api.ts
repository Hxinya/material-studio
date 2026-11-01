import { ApiError, request } from "./api-client";
export { ApiError } from "./api-client";

export type SessionUser = { id: number; email: string; createdAt: string };
export type Credentials = { email: string; password: string };

export async function getCurrentUser(signal?: AbortSignal): Promise<SessionUser | null> {
  try {
    return await (await request("/api/auth/me", { signal })).json();
  } catch (error) {
    // 只有服务端确认 401 才视为访客；连接异常保留为可恢复的查询错误。
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

async function post(action: string, body?: Credentials) {
  // 登录、退出会轮换 CSRF Token；每次提交都获取当前会话的令牌，不自动重放 POST。
  const csrf: { token: string; headerName: string } = await (await request("/api/auth/csrf")).json();
  return request(`/api/auth/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
    body: JSON.stringify(body ?? {}),
  });
}

export async function signIn(mode: "login" | "register", credentials: Credentials): Promise<SessionUser> {
  return (await post(mode, credentials)).json();
}

export async function signOut(): Promise<void> { await post("logout"); }
