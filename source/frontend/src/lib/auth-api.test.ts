import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getCurrentUser, signIn, signOut } from "./auth-api";

const user = { id: 7, email: "alice@example.com", createdAt: "2026-10-30T00:00:00Z" };
const json = (body: unknown, status = 200) => Response.json(body, { status });

afterEach(() => vi.unstubAllGlobals());

describe("identity API", () => {
  it("treats only an HTTP 401 as a guest", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ code: "UNAUTHENTICATED" }, 401)));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("does not misreport a network failure as logout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("keeps a server failure recoverable instead of returning a guest", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ code: "SERVICE_UNAVAILABLE", message: "稍后重试" }, 503)));
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 503, message: "稍后重试" });
  });

  it("gets a fresh CSRF token for login and logout and uses same-origin cookies", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ token: "first-token", headerName: "X-CSRF-TOKEN" }))
      .mockResolvedValueOnce(json(user))
      .mockResolvedValueOnce(json({ token: "new-token", headerName: "X-CSRF-TOKEN" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(signIn("login", { email: user.email, password: "password-test" })).resolves.toEqual(user);
    await signOut();
    expect(fetch.mock.calls.map(([path]) => path)).toEqual(["/api/auth/csrf", "/api/auth/login", "/api/auth/csrf", "/api/auth/logout"]);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", headers: { "X-CSRF-TOKEN": "first-token" } });
    expect(fetch.mock.calls[3][1]).toMatchObject({ headers: { "X-CSRF-TOKEN": "new-token" } });
  });

  it("does not replay a rejected POST automatically", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ token: "token", headerName: "X-CSRF-TOKEN" }))
      .mockResolvedValueOnce(json({ code: "CSRF_INVALID", message: "重新提交" }, 403));
    vi.stubGlobal("fetch", fetch);
    await expect(signIn("register", { email: user.email, password: "password-test" })).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not submit credentials when CSRF acquisition fails", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ message: "暂不可用" }, 503));
    vi.stubGlobal("fetch", fetch);
    await expect(signIn("login", { email: user.email, password: "password-test" })).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
