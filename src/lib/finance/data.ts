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
} from "@/lib/belvo/mcp-client";
import { normalizeAccount, normalizeTransaction } from "@/lib/belvo/normalize";
import { resolvePeriod } from "@/lib/finance/period";
import type {
  Account,
  CardInstallmentsResponse,
  DataSource,
  FinanceSnapshot,
  Period,
  SnapshotResponse,
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

function pickSource(mcpConnected: boolean): DataSource {
  const forced = process.env.DATA_SOURCE as DataSource | undefined;
  // "belvo" (chaves no .env) e "file" (data/belvo-export.json) são de uma conta
  // só e apareceriam para todos os usuários: só valem em desenvolvimento.
  if (
    process.env.NODE_ENV === "development" &&
    (forced === "belvo" || forced === "file")
  )
    return forced;
  if (forced === "demo") return "demo";
  return mcpConnected ? "mcp" : "demo";
}

function build(
  source: DataSource,
  rawAccounts: Raw[],
  rawTransactions: Raw[],
  period: Period,
  extras: Partial<FinanceSnapshot> = {},
): FinanceSnapshot {
  const accounts = rawAccounts.map(normalizeAccount);
  const byId = new Map<string, Account>(accounts.map((a) => [a.id, a]));
  const transactions = rawTransactions
    .map((t) => normalizeTransaction(t, byId, period.to))
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
  if (pickSource(await hasMcpSession(user)) !== "mcp") return empty;

  const data = await fetchCardInstallmentsFromMcp(
    user,
    since,
    before,
    window.from.slice(0, 7),
  );
  const accounts = data.accounts.map(normalizeAccount);
  const byId = new Map<string, Account>(accounts.map((a) => [a.id, a]));
  return {
    since,
    before,
    transactions: data.transactions.map((t) =>
      normalizeTransaction(t, byId, window.to),
    ),
  };
}

async function load(
  user: CurrentUser,
  period: Period,
): Promise<FinanceSnapshot> {
  const mcpConnected = await hasMcpSession(user);
  const source = pickSource(mcpConnected);

  if (source === "mcp") {
    try {
      const data = await fetchFromMcp(user, period.from, period.to);
      // Atualização diária automática quando os dados passam de 24 h
      await maybeAutoRefresh(user, data.connections).catch(() => {});
      return build("mcp", data.accounts, data.transactions, period, {
        mcpConnected: true,
        connections: data.connections,
        warnings: data.institutions.length
          ? []
          : [
              "Nenhuma instituição conectada no Belvo Panorama. Conecte um banco em panorama.belvo.com.",
            ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return build("demo", demoAccounts(), demoTransactions(), period, {
        mcpConnected: !(err instanceof McpAuthError),
        warnings: [
          `Belvo Panorama (MCP): ${msg} Mostrando dados de demonstração.`,
        ],
      });
    }
  }

  if (source === "demo") {
    return build("demo", demoAccounts(), demoTransactions(), period);
  }

  if (source === "file") {
    const file = await readExportFile();
    if (!file) {
      return build("demo", demoAccounts(), demoTransactions(), period, {
        warnings: [
          "DATA_SOURCE=file, mas data/belvo-export.json não foi encontrado.",
        ],
      });
    }
    return build("file", file.accounts, file.transactions, period);
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

    return build("belvo", accounts, transactions, period, {
      environment: cfg.env,
      warnings,
    });
  } catch (err) {
    const e = err as BelvoError;
    return build("demo", demoAccounts(), demoTransactions(), period, {
      warnings: [
        `Não foi possível falar com a Belvo (${e.status ?? "erro"}: ${e.message}). Mostrando dados de demonstração.`,
      ],
    });
  }
}
