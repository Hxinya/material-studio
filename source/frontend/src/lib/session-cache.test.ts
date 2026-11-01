import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it } from "vitest";
import { AUTH_QUERY_KEY, replaceSessionUser } from "./session-cache";

const alice = { id: 1, email: "alice@example.com", createdAt: "2026-10-30T00:00:00Z" };
const bob = { ...alice, id: 2, email: "bob@example.com" };
const clients: QueryClient[] = [];
function client() { const instance = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(instance); return instance; }
afterEach(() => clients.splice(0).forEach((instance) => instance.clear()));

it("clears the previous user's personal cache before installing the new identity", async () => {
  const cache = client();
  cache.setQueryData(AUTH_QUERY_KEY, alice);
  cache.setQueryData(["tasks", alice.id], ["alice-private-record"]);
  await replaceSessionUser(cache, bob);
  expect(cache.getQueryData(AUTH_QUERY_KEY)).toEqual(bob);
  expect(cache.getQueryData(["tasks", alice.id])).toBeUndefined();
});

it("clears personal data on logout", async () => {
  const cache = client();
  cache.setQueryData(AUTH_QUERY_KEY, alice);
  cache.setQueryData(["assets", alice.id], ["private-image"]);
  await replaceSessionUser(cache, null);
  expect(cache.getQueryData(AUTH_QUERY_KEY)).toBeNull();
  expect(cache.getQueryData(["assets", alice.id])).toBeUndefined();
});

it("keeps a public catalog request alive while replacing private identity data", async () => {
  const cache = client();
  let finishCatalog!: (value: string[]) => void;
  const pending = cache.fetchQuery({ queryKey: ["catalog", "templates", "duo"], queryFn: () => new Promise<string[]>((resolve) => { finishCatalog = resolve; }) });
  cache.setQueryData(["tasks", alice.id], ["private-task"]);
  await replaceSessionUser(cache, bob);
  finishCatalog(["shared-template"]);
  await expect(pending).resolves.toEqual(["shared-template"]);
  expect(cache.getQueryData(["tasks", alice.id])).toBeUndefined();
  expect(cache.getQueryData(["catalog", "templates", "duo"])).toEqual(["shared-template"]);
});

it("prevents an old slow identity response from overriding a new login", async () => {
  const cache = client();
  let finishOldRequest!: (value: typeof alice) => void;
  const pending = cache.fetchQuery({ queryKey: AUTH_QUERY_KEY, queryFn: () => new Promise<typeof alice>((resolve) => { finishOldRequest = resolve; }) }).catch(() => null);
  await replaceSessionUser(cache, bob);
  finishOldRequest(alice);
  await pending;
  expect(cache.getQueryData(AUTH_QUERY_KEY)).toEqual(bob);
});
