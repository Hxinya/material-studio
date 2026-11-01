import Link from "next/link";
import { AuthForm } from "./auth-form";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-20 lg:py-20">
      <section className="lg:pt-10">
        <Link href="/" className="text-sm text-[#a7b39b] hover:text-[#d4ed69]">← 返回模板库</Link>
        <p className="mb-5 mt-10 text-xs tracking-[0.18em] text-[#d4ed69]">YOUR CREATIVE SPACE</p>
        <h1 className="text-3xl font-semibold leading-snug sm:text-5xl">{register ? "留一个位置，" : "欢迎回来，"}<br /><span className="text-[#d4ed69]">给你的每次灵感。</span></h1>
        <p className="mt-6 max-w-sm text-sm leading-7 text-[#9daa8f]">{register ? "创建自己的账号。后续上传的素材和制作记录，都将归属于当前登录用户。" : "登录你的账号，回到自己的创作空间。"}</p>
        <div className="mt-8 max-w-sm rounded-2xl border border-white/10 p-5 text-xs leading-6 text-[#849477]">浏览模板，上传图片并提交后台模拟制作，在任务详情查看阶段与演示结果。</div>
      </section>
      <section aria-label={register ? "注册表单" : "登录表单"} className="rounded-3xl border border-white/10 bg-[#141714] p-6 sm:p-9">
        <h2 className="mb-2 text-2xl font-semibold">{register ? "创建账号" : "登录账号"}</h2>
        <p className="mb-8 text-sm text-[#93a184]">{register ? "使用邮箱和密码开始。" : "请输入注册时使用的邮箱与密码。"}</p>
        <AuthForm mode={mode} />
      </section>
    </main>
  );
}
