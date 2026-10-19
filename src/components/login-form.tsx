"use client";

import { useActionState } from "react";
import { LogInIcon } from "lucide-react";

import { signIn } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const field = "text-muted-foreground text-xs font-medium";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, {
    error: null,
    email: "",
  });

  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <span className={field}>E-mail</span>
        <Input
          key={state.email}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
        />
      </label>
      <label className="block space-y-1.5">
        <span className={field}>Senha</span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state.error && <p className="text-negative text-sm">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        <LogInIcon /> {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
