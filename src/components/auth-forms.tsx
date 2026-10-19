"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";

import {
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
  type AuthFormState,
} from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INITIAL: AuthFormState = { error: null, done: null, email: "" };
const field = "text-muted-foreground text-xs font-medium";

function EmailField({ value }: { value: string }) {
  return (
    <label className="block space-y-1.5">
      <span className={field}>E-mail</span>
      <Input
        key={value}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={value}
        required
      />
    </label>
  );
}

function PasswordField({
  name = "password",
  label = "Senha",
  autoComplete,
  hint,
  value,
  onChange,
  invalid,
}: {
  name?: string;
  label?: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  value?: string;
  onChange?: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className={field}>{label}</span>
      <Input
        name={name}
        type="password"
        autoComplete={autoComplete}
        minLength={autoComplete === "new-password" ? 8 : undefined}
        required
        value={value}
        onChange={onChange && ((e) => onChange(e.target.value))}
        aria-invalid={invalid || undefined}
      />
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </label>
  );
}

/**
 * Senha + confirmação controladas: o React limpa campos não controlados após
 * cada envio, e o usuário acabava redigitando só um deles depois de um erro.
 */
function NewPasswordFields({ label = "Senha" }: { label?: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <>
      <PasswordField
        label={label}
        autoComplete="new-password"
        hint="Pelo menos 8 caracteres."
        value={password}
        onChange={setPassword}
      />
      <div className="space-y-1.5">
        <PasswordField
          name="confirm"
          label={`Repita a ${label.toLowerCase()}`}
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          invalid={mismatch}
        />
        {mismatch && <p className="text-negative text-xs">As senhas não conferem.</p>}
      </div>
    </>
  );
}

function Feedback({ state }: { state: AuthFormState }) {
  return state.error ? (
    <p role="alert" className="text-negative text-sm">
      {state.error}
    </p>
  ) : null;
}

function Done({ message }: { message: string }) {
  return (
    <div className="border-positive/40 bg-positive/10 flex gap-3 rounded-lg border p-3 text-sm">
      <CheckCircle2Icon className="text-positive mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, INITIAL);
  // Mensagem vinda de /auth/confirm quando um link expira
  const linkError = useSearchParams().get("erro");

  return (
    <form action={action} className="space-y-4">
      {linkError && !state.error && (
        <p role="alert" className="text-negative text-sm">
          {linkError}
        </p>
      )}
      <EmailField value={state.email} />
      <PasswordField autoComplete="current-password" />
      <div className="-mt-2 text-right">
        <Link
          href="/esqueci-senha"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Esqueci minha senha
        </Link>
      </div>
      <Feedback state={state} />
      <Submit pending={pending} idle="Entrar" busy="Entrando…" />
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, INITIAL);
  if (state.done) return <Done message={state.done} />;

  return (
    <form action={action} className="space-y-4">
      <EmailField value={state.email} />
      <NewPasswordFields />
      <Feedback state={state} />
      <Submit pending={pending} idle="Criar conta" busy="Criando…" />
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, INITIAL);
  if (state.done) return <Done message={state.done} />;

  return (
    <form action={action} className="space-y-4">
      <EmailField value={state.email} />
      <Feedback state={state} />
      <Submit pending={pending} idle="Enviar link" busy="Enviando…" />
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <NewPasswordFields label="Nova senha" />
      <Feedback state={state} />
      <Submit pending={pending} idle="Salvar senha" busy="Salvando…" />
    </form>
  );
}
