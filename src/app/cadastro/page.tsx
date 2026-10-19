import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Criar conta · Minhas Finanças" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Criar conta"
      description="Crie sua conta com e-mail e senha. Você entra na hora."
      footer={
        <>
          <p>
            Já tem conta?{" "}
            <Link href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
          <p className="text-xs">
            Seus dados ficam na sua conta e só você vê. A conexão com o banco é
            feita pelo Belvo Panorama, com a sua autorização.
          </p>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
