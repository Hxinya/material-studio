"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, signIn } from "@/lib/auth-api";
import { useAuth } from "./auth-provider";

const inputClass = "mt-2 w-full rounded-xl border border-white/15 bg-[#0c100b] px-4 py-3 text-base text-[#eef1e9] placeholder:text-[#63705b] focus:border-[#d4ed69] disabled:opacity-50";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const auth = useAuth();
  const router = useRouter();
  const register = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setFields({});
    if (register && password !== confirm) { setFields({ confirm: "两次输入的密码不一致" }); return; }
    if (new TextEncoder().encode(password).length > 72) { setFields({ password: "密码的 UTF-8 长度不能超过 72 字节" }); return; }
    setPending(true);
    try {
      const user = await signIn(mode, { email: email.trim(), password });
      setPassword("");
      setConfirm("");
      await auth.acceptUser(user);
      router.replace("/account");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "提交失败，请重试");
      if (error instanceof ApiError) {
        setFields(error.fields);
        if (error.code === "ALREADY_AUTHENTICATED") auth.refresh();
      }
    } finally { setPending(false); }
  }

  if (auth.status === "loading") return <p role="status" className="text-[#b4bea9]">正在确认登录状态…</p>;
  if (auth.status === "error") return <div role="alert"><p className="text-[#f2b7a4]">暂时无法确认身份，请恢复查询后再继续。</p><button onClick={auth.refresh} className="mt-5 rounded-xl border border-white/20 px-4 py-2">重新查询</button></div>;
  if (auth.user) return <div><p className="break-all text-[#c2cdb5]">你已登录：{auth.user.email}</p><Link href="/account" className="mt-6 inline-block rounded-xl bg-[#d4ed69] px-5 py-3 text-[#18200f]">进入我的账号 →</Link></div>;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="email" className="text-sm text-[#c9d2bf]">邮箱</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} className={inputClass} placeholder="you@example.com" aria-invalid={!!fields.email} aria-describedby={fields.email ? "email-error" : undefined} />
        {fields.email && <p id="email-error" className="mt-2 text-sm text-[#f2b7a4]">{fields.email}</p>}
      </div>
      <div>
        <label htmlFor="password" className="text-sm text-[#c9d2bf]">密码</label>
        <input id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} className={inputClass} aria-invalid={!!fields.password} aria-describedby="password-help password-error" />
        <p id="password-help" className="mt-2 text-xs leading-5 text-[#909f82]">至少 8 个字符，UTF-8 长度不超过 72 字节。</p>
        <p id="password-error" className="mt-1 text-sm text-[#f2b7a4]">{fields.password}</p>
      </div>
      {register && <div>
        <label htmlFor="confirm" className="text-sm text-[#c9d2bf]">确认密码</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={pending} className={inputClass} aria-invalid={!!fields.confirm} aria-describedby={fields.confirm ? "confirm-error" : undefined} />
        {fields.confirm && <p id="confirm-error" className="mt-2 text-sm text-[#f2b7a4]">{fields.confirm}</p>}
      </div>}
      {error && <p role="alert" className="rounded-xl border border-[#f2b7a4]/20 bg-[#f2b7a4]/5 p-3 text-sm leading-6 text-[#f2b7a4]">{error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#d4ed69] px-5 py-3.5 font-semibold text-[#18200f] transition hover:bg-[#e0f58d] disabled:opacity-50">{pending ? "正在提交…" : register ? "注册并登录 →" : "登录 →"}</button>
      <p className="text-center text-sm text-[#9daa8f]">{register ? "已经有账号？" : "还没有账号？"}<Link href={register ? "/login" : "/register"} className="ml-2 text-[#d4ed69] underline-offset-4 hover:underline">{register ? "去登录" : "创建账号"}</Link></p>
    </form>
  );
}
