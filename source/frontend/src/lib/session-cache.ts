import type { QueryClient } from "@tanstack/react-query";
import type { SessionUser } from "./auth-api";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export async function replaceSessionUser(client: QueryClient, user: SessionUser | null) {
  // catalog 仅存公共模板，不含用户数据；保留它以免跨标签页登录打断模板加载。
  // 其余未知查询仍按个人数据处理，先取消，再清除。
  await client.cancelQueries({ predicate: (query) => query.queryKey[0] !== "catalog" });
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== "catalog" && (query.queryKey[0] !== "auth" || query.queryKey[1] !== "me") });
  client.setQueryData(AUTH_QUERY_KEY, user);
}
