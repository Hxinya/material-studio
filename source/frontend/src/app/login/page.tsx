import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = { title: "登录 · 素材工坊" };
export default function LoginPage() { return <AuthPage mode="login" />; }
