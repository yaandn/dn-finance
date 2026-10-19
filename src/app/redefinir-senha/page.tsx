import type { Metadata } from "next";

import { AuthCard } from "@/components/auth-card";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Nova senha · Minhas Finanças" };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Nova senha" description="Escolha a nova senha da sua conta.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
