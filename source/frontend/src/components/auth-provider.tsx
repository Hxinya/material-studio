"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getCurrentUser, signOut, type SessionUser } from "@/lib/auth-api";
import { AUTH_QUERY_KEY, replaceSessionUser } from "@/lib/session-cache";

type AuthContextValue = {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "guest" | "error";
  actionError: string | null;
  refresh: () => void;
  acceptUser: (user: SessionUser) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const query = useQuery({ queryKey: AUTH_QUERY_KEY, queryFn: ({ signal }) => getCurrentUser(signal), retry: false });

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const connection = new BroadcastChannel("material-studio-auth");
    channel.current = connection;
    connection.onmessage = async () => {
      setBusy(true);
      try {
        await replaceSessionUser(client, null);
        await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      } finally { setBusy(false); }
    };
    return () => { connection.close(); channel.current = null; };
  }, [client]);

  async function acceptUser(user: SessionUser) {
    setBusy(true);
    try {
      await replaceSessionUser(client, user);
      setActionError(null);
      channel.current?.postMessage("changed");
    } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    setActionError(null);
    await client.cancelQueries({ predicate: (query) => query.queryKey[0] !== "catalog" });
    try {
      await signOut();
      await replaceSessionUser(client, null);
      channel.current?.postMessage("changed");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "退出失败，请重试");
      await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    } finally { setBusy(false); }
  }

  const status = busy || query.isPending ? "loading" : query.isError ? "error" : query.data ? "authenticated" : "guest";

  return <AuthContext.Provider value={{ user: query.data ?? null, status, actionError, refresh: () => { void query.refetch(); }, acceptUser, logout }}>{children}</AuthContext.Provider>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth requires AppProviders");
  return auth;
}
