import { connection } from "next/server";
import { PageShell } from "@/components/page-shell";
import { TransactionsTable } from "@/components/transactions-table";
import { getSnapshot, resolvePeriod } from "@/lib/finance/data";
import { filterByBank } from "@/lib/finance/filter";

// Painel pessoal: sempre busca dados na hora (sem pré-renderização).
export const instant = false;

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  await connection();
  const sp = await searchParams;
  const period = resolvePeriod(Number(sp.dias ?? 30));
  const snapshot = filterByBank(await getSnapshot(period.days), sp.banco);
  const initialCategory = typeof sp.categoria === "string" ? sp.categoria : "todas";

  return (
    <PageShell snapshot={snapshot} period={period} title="Transações">
      <TransactionsTable
        transactions={snapshot.transactions}
        initialCategory={initialCategory}
      />
    </PageShell>
  );
}
