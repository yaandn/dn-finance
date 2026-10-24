"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DateRangePicker, type IsoRange } from "@/components/date-range-picker";
import { PageShell } from "@/components/page-shell";
import { TransactionsTable } from "@/components/transactions-table";
import { MAX_RANGE_DAYS } from "@/lib/finance/period";
import type { Period, Transaction } from "@/lib/finance/types";

export default function TransactionsPage() {
  return (
    <PageShell title="Transações" allowRange>
      {(snapshot, period) => (
        <Transactions transactions={snapshot.transactions} period={period} />
      )}
    </PageShell>
  );
}

function Transactions({
  transactions,
  period,
}: {
  transactions: Transaction[];
  period: Period;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialCategory = params.get("categoria") ?? "todas";
  const custom = params.has("de") && params.has("ate");

  // O intervalo fica na URL (?de=…&ate=…): o PageShell busca esse período na Belvo
  function setRange(range: IsoRange | null) {
    const next = new URLSearchParams(params.toString());
    if (range) {
      next.set("de", range.from);
      next.set("ate", range.to);
      next.delete("dias");
    } else {
      next.delete("de");
      next.delete("ate");
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <TransactionsTable
      transactions={transactions}
      initialCategory={initialCategory}
      dateFilter={
        <DateRangePicker
          value={{ from: period.from, to: period.to }}
          custom={custom}
          maxDays={MAX_RANGE_DAYS}
          onChange={setRange}
        />
      }
    />
  );
}
