import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Entrar · Minhas Finanças" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Entrar"
      description="Use o e-mail e a senha da sua conta."
      footer={
        <p>
          Não tem conta?{" "}
          <Link href="/cadastro" className="text-foreground font-medium underline-offset-4 hover:underline">
            Criar conta
          </Link>
        </p>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
