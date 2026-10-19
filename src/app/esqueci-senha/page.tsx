import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth-card";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Esqueci minha senha · Minhas Finanças" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Esqueci minha senha"
      description="Informe o e-mail da conta. Enviamos um link para você criar uma senha nova."
      footer={
        <p>
          Lembrou?{" "}
          <Link href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">
            Voltar para o login
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
