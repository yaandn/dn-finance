"use server";

import type { AuthError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error: string | null;
  /** Mensagem de sucesso que substitui o formulário (ex.: "verifique seu e-mail"). */
  done: string | null;
  email: string;
};

const MIN_PASSWORD = 8;

/** Endereço público do app para os links dos e-mails. */
async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

function describe(error: AuthError) {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Confirme o seu e-mail antes de entrar. Procure o link na sua caixa de entrada (e no spam).";
    case "weak_password":
      return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    case "email_address_invalid":
      return "E-mail inválido.";
    case "signup_disabled":
      return "O cadastro está fechado no momento.";
    case "same_password":
      return "A nova senha precisa ser diferente da atual.";
    case "email_address_not_authorized":
      return "Não foi possível enviar e-mail para este endereço agora. Tente mais tarde.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas. Espere alguns minutos e tente de novo.";
    default:
      return "Não foi possível concluir. Tente de novo em instantes.";
  }
}

function read(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  };
}

const fail = (error: string, email = ""): AuthFormState => ({
  error,
  done: null,
  email,
});

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password } = read(formData);
  if (!email || !password) return fail("Informe e-mail e senha.", email);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail(describe(error), email);
  redirect("/");
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password, confirm } = read(formData);
  if (!email || !password) return fail("Informe e-mail e senha.", email);
  if (password.length < MIN_PASSWORD)
    return fail(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`, email);
  if (password !== confirm) return fail("As senhas não conferem.", email);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await appOrigin()}/auth/confirm?next=/` },
  });
  if (error) return fail(describe(error), email);
  // Sem confirmação de e-mail ativa, o Supabase já devolve a sessão
  if (data.session) redirect("/");
  // A mesma mensagem para e-mail novo ou já cadastrado: não revela quem tem conta
  return {
    error: null,
    done: `Enviamos um link de confirmação para ${email}. Abra o e-mail para ativar a conta.`,
    email,
  };
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email } = read(formData);
  if (!email) return fail("Informe o seu e-mail.");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await appOrigin()}/auth/confirm?next=/redefinir-senha`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit")
    return fail(describe(error), email);
  return {
    error: null,
    done: `Se existir uma conta com ${email}, você vai receber um link para criar uma senha nova.`,
    email,
  };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { password, confirm } = read(formData);
  if (password.length < MIN_PASSWORD)
    return fail(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  if (password !== confirm) return fail("As senhas não conferem.");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub)
    return fail("O link expirou. Peça um novo em \"Esqueci minha senha\".");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(describe(error));
  redirect("/");
}
