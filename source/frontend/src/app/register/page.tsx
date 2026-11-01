import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = { title: "注册 · 素材工坊" };
export default function RegisterPage() { return <AuthPage mode="register" />; }
