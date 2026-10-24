import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { http } from "@/lib/api/http";
import type { SyncState } from "@/lib/belvo/mcp-sync";
import type { PlanSettings } from "@/lib/finance/plan-store";
import type {
  CardInstallmentsResponse,
  RecurringResponse,
  SnapshotResponse,
} from "@/lib/finance/types";

// Chaves e hooks de todas as requisições do app. As chaves ficam juntas para
// que mutations invalidem exatamente o que mudou.
export const queryKeys = {
  me: ["me"] as const,
  snapshots: ["snapshot"] as const,
  snapshot: (days: number) => ["snapshot", days] as const,
  snapshotRange: (from: string, to: string) =>
    ["snapshot", "range", from, to] as const,
  installments: ["snapshot", "installments"] as const,
  recurring: ["snapshot", "recurring"] as const,
  recurringCached: ["snapshot", "recurring", "cached"] as const,
  sync: ["sync"] as const,
  plan: ["plan"] as const,
  widgetToken: ["widget-token"] as const,
};

/** Intervalo do acompanhamento enquanto a Belvo atualiza os bancos. */
const SYNC_POLL_MS = 4000;

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () =>
      (await http.get<{ id: string; email: string | null }>("/me")).data,
    staleTime: Infinity,
  });
}

/** Período fixo (dias) ou intervalo personalizado (de/até, YYYY-MM-DD). */
export type SnapshotRange = { from: string; to: string };

export function useSnapshot(days: number, range?: SnapshotRange | null) {
  return useQuery({
    queryKey: range
      ? queryKeys.snapshotRange(range.from, range.to)
      : queryKeys.snapshot(days),
    queryFn: async ({ signal }) =>
      (
        await http.get<SnapshotResponse>("/snapshot", {
          params: range ? { de: range.from, ate: range.to } : { dias: days },
          signal,
        })
      ).data,
    // Mantém a tela atual enquanto outro período carrega
    placeholderData: keepPreviousData,
  });
}

/**
 * Parcelas de compras anteriores aos 90 dias que ainda caem nas faturas.
 * Fica sob a chave "snapshot" para ser refeita junto com os dados.
 */
export function useCardInstallments(enabled = true) {
  return useQuery({
    queryKey: queryKeys.installments,
    queryFn: async ({ signal }) =>
      (await http.get<CardInstallmentsResponse>("/installments", { signal }))
        .data,
    enabled,
    // A busca é longa (um ano de lançamentos) e compras antigas não mudam
    staleTime: 60 * 60 * 1000,
  });
}

export function useRecurring() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.recurring,
    queryFn: async ({ signal }) => {
      const data = (await http.get<RecurringResponse>("/recorrentes", { signal })).data;
      // O card do Painel passa a mostrar o mesmo resultado
      queryClient.setQueryData(queryKeys.recurringCached, data);
      return data;
    },
    // Um ano de lançamentos: a busca é longa e muda pouco
    staleTime: 60 * 60 * 1000,
    // Repetir sozinho dobra as ~100 chamadas à Belvo e piora o limite
    retry: false,
  });
}

/** Só o resultado já calculado (null se ainda não houver); não vai à Belvo. */
export function useCachedRecurring() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.recurringCached,
    queryFn: async ({ signal }) =>
      // Se a página Recorrentes já carregou nesta sessão, usa o mesmo resultado
      queryClient.getQueryData<RecurringResponse>(queryKeys.recurring) ??
      (await http.get<RecurringResponse | null>("/recorrentes", { params: { cache: 1 }, signal }))
        .data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSyncState() {
  return useQuery({
    queryKey: queryKeys.sync,
    queryFn: async () => (await http.get<SyncState>("/belvo-mcp/sync")).data,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.running ? SYNC_POLL_MS : false,
  });
}

/** Pede à Belvo para buscar dados novos nos bancos (roda em segundo plano). */
export function useStartSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await http.post<SyncState>("/belvo-mcp/sync")).data,
    onSuccess: (state) => queryClient.setQueryData(queryKeys.sync, state),
  });
}

export function useDisconnectMcp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await http.post("/belvo-mcp/disconnect");
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.sync });
      return queryClient.invalidateQueries({ queryKey: queryKeys.snapshots });
    },
  });
}

export function usePlan() {
  return useQuery({
    queryKey: queryKeys.plan,
    queryFn: async () =>
      (
        await http.get<{ plan: PlanSettings; configured: boolean }>("/plan")
      ).data,
  });
}

export function useSavePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: PlanSettings) =>
      (await http.put<PlanSettings>("/plan", plan)).data,
    onSuccess: (plan) =>
      queryClient.setQueryData(queryKeys.plan, { plan, configured: true }),
  });
}

/** Se existe um token do widget do Mac ativo. */
export function useWidgetTokenStatus() {
  return useQuery({
    queryKey: queryKeys.widgetToken,
    queryFn: async () =>
      (await http.get<{ active: boolean }>("/widget/token")).data,
  });
}

/** Gera um token novo (o anterior para de funcionar). */
export function useCreateWidgetToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await http.post<{ token: string }>("/widget/token")).data.token,
    onSuccess: () =>
      queryClient.setQueryData(queryKeys.widgetToken, { active: true }),
  });
}

export function useRevokeWidgetToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await http.delete("/widget/token");
    },
    onSuccess: () =>
      queryClient.setQueryData(queryKeys.widgetToken, { active: false }),
  });
}
