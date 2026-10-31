import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CurrentUser } from "@/lib/auth";
import { maybeAutoRefresh } from "@/lib/belvo/mcp-sync";

import {
  BelvoError,
  belvoConfig,
  listAccounts,
  listLinks,
  listTransactions,
} from "@/lib/belvo/client";
import { demoAccounts, demoTransactions } from "@/lib/belvo/demo";
import { hasMcpSession } from "@/lib/belvo/mcp-auth";
import {
  McpAuthError,
  fetchCardInstallmentsFromMcp,
  fetchFromMcp,
  friendlyMcpError,
} from "@/lib/belvo/mcp-client";
import { normalizeAccount, normalizeTransaction } from "@/lib/belvo/normalize";
import {
  clearPluggyCache,
  fetchFromPluggy,
  hasPluggyItems,
  type PluggyRaw,
} from "@/lib/pluggy/data";
import {
  normalizePluggyAccount,
  alignWithBills,
  normalizePluggyTransaction,
  projectFutureInstallments,
} from "@/lib/pluggy/normalize";
import { deleteDoc } from "@/lib/user-documents";
import { readDoc, writeDoc } from "@/lib/user-documents";
import { MAX_RANGE_DAYS, resolvePeriod, resolveRange } from "@/lib/finance/period";
import { linkCardPayments, linkOwnTransfers } from "@/lib/finance/classify";
import { detectRecurring } from "@/lib/finance/recurring";
import type {
  Account,
  CardInstallmentsResponse,
  DataSource,
  FinanceSnapshot,
  Period,
  RecurringResponse,
  SnapshotResponse,
  Transaction,
} from "@/lib/finance/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const EXPORT_FILE = path.join(process.cwd(), "data", "belvo-export.json");

async function readExportFile(): Promise<{
  accounts: Raw[];
  transactions: Raw[];
} | null> {
  try {
    const raw = JSON.parse(await readFile(EXPORT_FILE, "utf8"));
    return {
      accounts: raw.accounts ?? raw.items ?? [],
      transactions: raw.transactions ?? [],
    };
  } catch {
    return null;
  }
}

function pickSource(mcpConnected: boolean, pluggyConnected = false): DataSource {
  const forced = process.env.DATA_SOURCE as DataSource | undefined;
  // "belvo" (chaves no .env) e "file" (data/belvo-export.json) são de uma conta
  // só e apareceriam para todos os usuários: só valem em desenvolvimento.
  if (
    process.env.NODE_ENV === "development" &&
    (forced === "belvo" || forced === "file")
  )
    return forced;
  if (forced === "demo") return "demo";
  if (pluggyConnected) return "pluggy";
  return mcpConnected ? "mcp" : "demo";
}

/** Fonte do usuário (consulta as conexões salvas de Pluggy e Belvo). */
async function sourceFor(user: CurrentUser) {
  const [mcpConnected, pluggyConnected] = await Promise.all([
    hasMcpSession(user),
    hasPluggyItems(user),
  ]);
  return { source: pickSource(mcpConnected, pluggyConnected), mcpConnected, pluggyConnected };
}

/** Fontes que vão ao banco a cada busca e por isso guardam caches no banco de dados. */
const isLive = (source: DataSource) => source === "pluggy" || source === "mcp";

function fromBelvo(rawAccounts: Raw[], rawTransactions: Raw[], periodEnd: string) {
  const accounts = rawAccounts.map(normalizeAccount);
  const byId = new Map<string, Account>(accounts.map((a) => [a.id, a]));
  return {
    accounts,
    transactions: rawTransactions.map((t) => normalizeTransaction(t, byId, periodEnd)),
  };
}

function fromPluggy(
  data: PluggyRaw,
  periodEnd: string,
  /** Cria as parcelas que ainda vão entrar nas próximas faturas. */
  projectInstallments = true,
) {
  const accounts = data.accounts.map((a) => normalizePluggyAccount(a, a.institution));
  const byId = new Map<string, Account>(accounts.map((a) => [a.id, a]));
  const bills = new Map<string, Raw>(data.bills.map((b) => [b.id, b]));
  const aligned = alignWithBills(data.transactions, data.bills);
  const raw = projectInstallments
    ? [
        ...aligned,
        ...projectFutureInstallments(aligned, new Date().toISOString().slice(0, 7)),
      ]
    : aligned;
  return {
    accounts,
    transactions: raw.map((t) =>
      normalizePluggyTransaction(t, byId, bills, data.categories, periodEnd),
    ),
  };
}

/**
 * Esquece os dados derivados da Pluggy (cache em memória e parcelas antigas).
 * Chamado ao conectar, desconectar e atualizar.
 */
export async function clearPluggyData(user: CurrentUser) {
  clearPluggyCache(user.id);
  await deleteDoc(user, "card_history").catch(() => {});
}

function build(
  source: DataSource,
  { accounts, transactions: all }: { accounts: Account[]; transactions: Transaction[] },
  period: Period,
  extras: Partial<FinanceSnapshot> = {},
): FinanceSnapshot {
  // Antes do recorte: o pagamento no cartão e a saída da conta podem cair em dias diferentes
  const transactions = linkOwnTransfers(linkCardPayments(all))
    .filter((t) => t.date >= period.from && t.date <= period.to)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    source,
    environment: null,
    institutions: [...new Set(accounts.map((a) => a.institution))],
    accounts,
    transactions,
    fetchedAt: new Date().toISOString(),
    warnings: [],
    mcpConnected: false,
    pluggyConnected: false,
    ...extras,
  };
}

/** Dados do usuário no período; servido ao navegador por /api/snapshot. */
export async function getSnapshot(
  user: CurrentUser,
  period: Period,
): Promise<SnapshotResponse> {
  return { ...(await load(user, period)), period };
}

/** Quantos meses antes da janela de 90 dias procurar compras parceladas. */
const INSTALLMENT_HISTORY_MONTHS = 13;
/**
 * Validade do cache das parcelas antigas. Fica no banco (user_documents,
 * tipo card_history) e não só na memória: na Vercel cada execução pode cair
 * em outra instância. A sincronização e o desconectar apagam o cache.
 */
const INSTALLMENT_CACHE_MS = 12 * 60 * 60 * 1000;
type CardHistoryDoc = CardInstallmentsResponse & { fetchedAt: string };

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const shiftMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/**
 * Parcelas de cartão de compras anteriores à janela de 90 dias que ainda caem
 * nas faturas dessa janela. Ficam fora de /api/snapshot porque a busca é longa
 * e só as telas de faturas precisam delas (servidas por /api/installments).
 */
export async function getCardInstallments(
  user: CurrentUser,
): Promise<CardInstallmentsResponse> {
  const window = resolvePeriod(90);
  const before = shiftDays(window.from, -1);
  const since = shiftMonths(window.from, -INSTALLMENT_HISTORY_MONTHS);
  const empty = { since, before, transactions: [] };
  // As outras fontes não têm histórico além do período carregado
  const { source } = await sourceFor(user);
  if (!isLive(source)) return empty;

  const saved = await readDoc<CardHistoryDoc>(user, "card_history").catch(
    () => null,
  );
  if (saved && Date.now() - Date.parse(saved.fetchedAt) < INSTALLMENT_CACHE_MS) {
    return {
      since: saved.since,
      before: saved.before,
      transactions: saved.transactions,
    };
  }

  const fromMonth = window.from.slice(0, 7);
  let transactions: Transaction[];
  if (source === "pluggy") {
    const data = await fetchFromPluggy(user, since, before, true);
    // Uma conexão que falhou deixaria parcelas de fora: melhor não guardar
    if (data.warnings.length) throw new Error(data.warnings.join(" "));
    // Sem projeção: as parcelas seguintes destas compras já estão no período
    transactions = fromPluggy(data, window.to, false).transactions.filter(
      (t) =>
        t.type === "OUTFLOW" &&
        t.installment &&
        (t.bill?.forecast ?? t.accountingDate ?? "").slice(0, 7) >= fromMonth,
    );
  } else {
    const data = await fetchCardInstallmentsFromMcp(user, since, before, fromMonth);
    transactions = fromBelvo(data.accounts, data.transactions, window.to).transactions;
  }
  const result: CardInstallmentsResponse = { since, before, transactions };
  // Sem a migration do card_history o cache fica só na memória do servidor
  await writeDoc(user, "card_history", {
    ...result,
    fetchedAt: new Date().toISOString(),
  } satisfies CardHistoryDoc).catch(() => {});
  return result;
}

/** Estabelecimentos marcados como recorrentes (merchantKey) e o nome mostrado. */
export type RecurringMarks = { marks: { key: string; name: string; addedAt: string }[] };

export async function readRecurringMarks(user: CurrentUser) {
  return (await readDoc<RecurringMarks>(user, "recurring_marks").catch(() => null))?.marks ?? [];
}

/** Marca (ou desmarca) um estabelecimento como recorrente. */
export async function setRecurringMark(
  user: CurrentUser,
  key: string,
  name: string | null,
) {
  const marks = (await readRecurringMarks(user)).filter((m) => m.key !== key);
  if (name !== null) marks.push({ key, name, addedAt: new Date().toISOString() });
  await writeDoc(user, "recurring_marks", { marks } satisfies RecurringMarks);
}

/** Gastos recorrentes de cerca de um ano, calculados a cada pedido. */
export async function getRecurring(user: CurrentUser): Promise<RecurringResponse> {
  const today = new Date().toISOString().slice(0, 10);
  const period = resolveRange(shiftDays(today, -(MAX_RANGE_DAYS - 1)), today)!;
  const [{ source }, marks] = await Promise.all([sourceFor(user), readRecurringMarks(user)]);
  const live = isLive(source);
  const snapshot = await load(user, period);
  // Se a fonte falhou, o load devolve a demonstração: aqui isso viraria uma
  // lista de assinaturas inventada, então é melhor mostrar o erro
  if (live && snapshot.source !== source) {
    throw new Error(
      snapshot.warnings[0]?.replace(/ Mostrando dados de demonstração\.$/, "") ??
        "Não foi possível ler os lançamentos.",
    );
  }
  return {
    from: period.from,
    to: period.to,
    source: snapshot.source,
    fetchedAt: new Date().toISOString(),
    // Só os que o usuário marcou; a detecção calcula frequência, valor e aumentos
    items: detectRecurring(
      snapshot.transactions,
      today,
      marks.map((m) => m.key),
    ).filter((r) => r.marked),
  };
}

async function load(
  user: CurrentUser,
  period: Period,
): Promise<FinanceSnapshot> {
  const { source, mcpConnected } = await sourceFor(user);

  if (source === "pluggy") {
    try {
      const data = await fetchFromPluggy(user, period.from, period.to);
      return build("pluggy", fromPluggy(data, period.to), period, {
        mcpConnected,
        pluggyConnected: true,
        connections: data.connections,
        warnings: data.warnings,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return build("demo", fromBelvo(demoAccounts(), demoTransactions(), period.to), period, {
        mcpConnected,
        pluggyConnected: true,
        warnings: [`Pluggy: ${msg} Mostrando dados de demonstração.`],
      });
    }
  }

  if (source === "mcp") {
    try {
      const data = await fetchFromMcp(user, period.from, period.to);
      // Atualização diária automática quando os dados passam de 24 h
      await maybeAutoRefresh(user, data.connections).catch(() => {});
      return build("mcp", fromBelvo(data.accounts, data.transactions, period.to), period, {
        mcpConnected: true,
        connections: data.connections,
        warnings: data.institutions.length
          ? []
          : [
              "Nenhuma instituição conectada no Belvo Panorama. Conecte um banco em panorama.belvo.com.",
            ],
      });
    } catch (err) {
      const msg = friendlyMcpError(err);
      return build("demo", fromBelvo(demoAccounts(), demoTransactions(), period.to), period, {
        mcpConnected: !(err instanceof McpAuthError),
        warnings: [
          `Belvo Panorama (MCP): ${msg} Mostrando dados de demonstração.`,
        ],
      });
    }
  }

  if (source === "demo") {
    return build("demo", fromBelvo(demoAccounts(), demoTransactions(), period.to), period);
  }

  if (source === "file") {
    const file = await readExportFile();
    if (!file) {
      return build("demo", fromBelvo(demoAccounts(), demoTransactions(), period.to), period, {
        warnings: [
          "DATA_SOURCE=file, mas data/belvo-export.json não foi encontrado.",
        ],
      });
    }
    return build("file", fromBelvo(file.accounts, file.transactions, period.to), period);
  }

  // Fonte: API Belvo
  const cfg = belvoConfig();
  const warnings: string[] = [];
  try {
    const links = await listLinks();
    if (!links.length) {
      warnings.push(
        "Nenhum link válido encontrado na sua conta Belvo. Crie um link pelo widget ou informe BELVO_LINK_IDS.",
      );
    }
    const results = await Promise.allSettled(
      links.map(async (link) => {
        const [accounts, transactions] = await Promise.all([
          listAccounts(link.id),
          listTransactions(link.id, period.from, period.to),
        ]);
        return { accounts, transactions };
      }),
    );

    const accounts: Raw[] = [];
    const transactions: Raw[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        accounts.push(...r.value.accounts);
        transactions.push(...r.value.transactions);
      } else {
        const e = r.reason as BelvoError;
        warnings.push(`Link ${links[i].id.slice(0, 8)}…: ${e.message}`);
      }
    });

    return build("belvo", fromBelvo(accounts, transactions, period.to), period, {
      environment: cfg.env,
      warnings,
    });
  } catch (err) {
    const e = err as BelvoError;
    return build("demo", fromBelvo(demoAccounts(), demoTransactions(), period.to), period, {
      warnings: [
        `Não foi possível falar com a Belvo (${e.status ?? "erro"}: ${e.message}). Mostrando dados de demonstração.`,
      ],
    });
  }
}
