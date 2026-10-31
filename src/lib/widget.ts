import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { after } from "next/server";

import type { CurrentUser } from "@/lib/auth";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { buildBills } from "@/lib/finance/bills";
import { getCardInstallments, getRecurring, getSnapshot } from "@/lib/finance/data";
import { resolvePeriod } from "@/lib/finance/period";
import { applySettings, computePlanBase } from "@/lib/finance/plan";
import { readPlan } from "@/lib/finance/plan-store";
import type { Transaction } from "@/lib/finance/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteDoc, readDoc, writeDoc } from "@/lib/user-documents";

// Widget do Mac: o app gera um token (criptografado com TOKEN_ENCRYPTION_KEY)
// com o id do usuário e um nonce. O nonce fica em user_documents (tipo widget);
// gerar outro token ou revogar troca/apaga o nonce e invalida o anterior.

type WidgetDoc = { nonce: string; createdAt: string };
type TokenPayload = { uid: string; nonce: string };

/** Tempo máximo esperando as parcelas antigas antes de responder sem elas. */
const INSTALLMENTS_WAIT_MS = 15_000;

export async function issueWidgetToken(user: CurrentUser) {
  const nonce = randomBytes(16).toString("base64url");
  await writeDoc(user, "widget", {
    nonce,
    createdAt: new Date().toISOString(),
  } satisfies WidgetDoc);
  return encryptJson({ uid: user.id, nonce } satisfies TokenPayload);
}

export async function revokeWidgetToken(user: CurrentUser) {
  await deleteDoc(user, "widget");
}

export async function hasWidgetToken(user: CurrentUser) {
  return Boolean(await readDoc<WidgetDoc>(user, "widget"));
}

/** Usuário dono do token, ou null se o token for inválido ou revogado. */
export async function userFromWidgetToken(
  token: string,
): Promise<CurrentUser | null> {
  let payload: TokenPayload;
  try {
    payload = decryptJson<TokenPayload>(token);
  } catch {
    return null;
  }
  if (!payload?.uid || !payload.nonce) return null;
  const user: CurrentUser = {
    id: payload.uid,
    email: null,
    supabase: createAdminClient(),
  };
  const doc = await readDoc<WidgetDoc>(user, "widget");
  if (!doc) return null;
  const a = Buffer.from(doc.nonce);
  const b = Buffer.from(payload.nonce);
  return a.length === b.length && timingSafeEqual(a, b) ? user : null;
}

export type WidgetPlanSummary = {
  updatedAt: string;
  /** Planejamento salvo no app (sem ele, salário e contas fixas são zero). */
  configured: boolean;
  source: string;
  /** false: as parcelas de compras antigas ainda não entraram na conta. */
  complete: boolean;
  salary: number;
  otherIncome: number;
  income: number;
  fixedTotal: number;
  billsTotal: number;
  loansTotal: number;
  savingsPct: number;
  savingsTarget: number;
  free: number;
  perDay: number;
  nextSalary: string;
  daysToSalary: number;
};

/** Os mesmos números do card "Sobra do mês" da página Planejamento. */
export async function widgetPlanSummary(
  user: CurrentUser,
): Promise<WidgetPlanSummary> {
  const period = resolvePeriod(90);
  // As parcelas antigas podem demorar (um ano de lançamentos) na primeira vez:
  // a busca continua em segundo plano e fica no cache para a próxima atualização.
  const installments = getCardInstallments(user).catch(() => null);
  // Na Vercel, sem isso a busca seria interrompida assim que a resposta sai
  after(() => installments);
  const [snapshot, { plan: settings, configured }, recurring, older] = await Promise.all([
    getSnapshot(user, period),
    readPlan(user),
    // Recorrentes marcados: sem eles o widget mostraria mais sobra que a página
    getRecurring(user).catch(() => null),
    Promise.race([
      installments,
      new Promise<null>((r) => setTimeout(() => r(null), INSTALLMENTS_WAIT_MS)),
    ]),
  ]);
  const olderTransactions: Transaction[] = older?.transactions ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const base = computePlanBase(
    snapshot,
    buildBills(snapshot, today, period.from, olderTransactions),
    today,
    recurring?.items,
  );
  const p = applySettings(base, settings);

  return {
    updatedAt: new Date().toISOString(),
    configured,
    source: snapshot.source,
    complete: (snapshot.source !== "mcp" && snapshot.source !== "pluggy") || older != null,
    salary: settings.salary,
    otherIncome: settings.otherIncome,
    income: p.income,
    fixedTotal: p.fixedTotal,
    billsTotal: p.billsTotal,
    loansTotal: p.loansTotal,
    savingsPct: settings.savingsPct,
    savingsTarget: p.savingsTarget,
    free: p.free,
    perDay: p.perDay,
    nextSalary: p.nextSalary,
    daysToSalary: p.daysToSalary,
  };
}
