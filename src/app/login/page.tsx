import type { Metadata } from "next";
import { WalletIcon } from "lucide-react";

import { LoginForm } from "@/components/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Entrar · Minhas Finanças" };

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WalletIcon className="size-5" /> Minhas Finanças
          </CardTitle>
          <CardDescription>
            Entre com o e-mail e a senha que você recebeu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
