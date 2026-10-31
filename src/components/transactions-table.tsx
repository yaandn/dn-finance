"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FilterXIcon,
  RepeatIcon,
  SearchIcon,
  TagIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRecurringMarks, useToggleRecurringMark } from "@/lib/api/queries";
import { money, shortDate, weekday } from "@/lib/format";
import { merchantKey } from "@/lib/finance/recurring";
import type { Transaction } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type Kind = "todas" | "saidas" | "entradas";

export function TransactionsTable({
  transactions,
  initialCategory = "todas",
  dateFilter,
}: {
  transactions: Transaction[];
  initialCategory?: string;
  /** Controle de período mostrado junto dos filtros. */
  dateFilter?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("todas");
  const [category, setCategory] = useState(initialCategory);
  const [showInternal, setShowInternal] = useState(false);
  const { data: marks } = useRecurringMarks();
  const toggleMark = useToggleRecurringMark();
  const markedKeys = useMemo(() => new Set(marks?.map((m) => m.key)), [marks]);

  const categories = useMemo(
    () => [...new Set(transactions.map((t) => t.category))].sort((a, b) => a.localeCompare(b)),
    [transactions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (!showInternal && t.internal) return false;
      if (kind === "saidas" && t.type !== "OUTFLOW") return false;
      if (kind === "entradas" && t.type !== "INFLOW") return false;
      if (category !== "todas" && t.category !== category) return false;
      if (!q) return true;
      return `${t.counterpart} ${t.description} ${t.category} ${t.institution}`
        .toLowerCase()
        .includes(q);
    });
  }, [transactions, query, kind, category, showInternal]);

  // Quantas movimentações internas do período estão escondidas
  const internalCount = useMemo(
    () =>
      showInternal ? 0 : transactions.filter((t) => t.internal).length,
    [transactions, showInternal],
  );
  const filtersActive =
    query.trim() !== "" || kind !== "todas" || category !== "todas" || showInternal;
  function clearFilters() {
    setQuery("");
    setKind("todas");
    setCategory("todas");
    setShowInternal(false);
  }

  const totals = useMemo(() => {
    const real = filtered.filter((t) => !t.internal);
    const inn = real.filter((t) => t.type === "INFLOW").reduce((s, t) => s + t.amount, 0);
    const out = real.filter((t) => t.type === "OUTFLOW").reduce((s, t) => s + t.amount, 0);
    return { inn, out };
  }, [filtered]);

  function exportCsv() {
    const header = ["data", "descricao", "categoria", "tipo", "valor", "instituicao", "interna"];
    const rows = filtered.map((t) => [
      t.date,
      `"${t.counterpart.replace(/"/g, '""')}"`,
      `"${t.category}"`,
      t.type === "INFLOW" ? "entrada" : "saida",
      (t.type === "INFLOW" ? t.amount : -t.amount).toFixed(2).replace(".", ","),
      t.institution,
      t.internal ? "sim" : "nao",
    ]);
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transacoes.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por estabelecimento, pessoa ou categoria…"
                aria-label="Buscar transações"
                className="pr-9 pl-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpar busca"
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm p-0.5"
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {dateFilter}
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={!filtered.length}
                title="Exportar as transações filtradas"
              >
                <DownloadIcon />
                <span className="hidden sm:inline">CSV</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="todas" className="flex-1 sm:flex-none">
                  Todas
                </TabsTrigger>
                <TabsTrigger value="saidas" className="flex-1 sm:flex-none">
                  <ArrowUpRightIcon className="text-negative" /> Saídas
                </TabsTrigger>
                <TabsTrigger value="entradas" className="flex-1 sm:flex-none">
                  <ArrowDownRightIcon className="text-positive" /> Entradas
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger
                aria-label="Categoria"
                className={cn(
                  "w-full sm:w-[220px]",
                  category !== "todas" && "border-primary/60 bg-primary/5",
                )}
              >
                <TagIcon className="text-muted-foreground" />
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={showInternal ? "secondary" : "outline"}
              aria-pressed={showInternal}
              onClick={() => setShowInternal((v) => !v)}
              title="Pagamento da própria fatura, Pix no crédito e parcelas futuras"
              className="justify-start sm:justify-center"
            >
              {showInternal ? <EyeIcon /> : <EyeOffIcon />}
              {showInternal ? "Mostrando internas" : "Internas ocultas"}
              {internalCount > 0 && (
                <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">
                  {internalCount}
                </span>
              )}
            </Button>
            {filtersActive && (
              <Button
                variant="ghost"
                onClick={clearFilters}
                className="text-muted-foreground sm:ml-auto"
              >
                <FilterXIcon /> Limpar filtros
              </Button>
            )}
          </div>
        </div>

        <dl className="bg-muted/30 grid grid-cols-2 border-t text-sm sm:grid-cols-4 sm:divide-x">
          <Stat label="Transações" value={String(filtered.length)} />
          <Stat label="Entradas" value={money(totals.inn)} tone="positive" />
          <Stat label="Saídas" value={money(totals.out)} tone="negative" />
          <Stat
            label="Saldo"
            value={money(totals.inn - totals.out)}
            tone={totals.inn - totals.out >= 0 ? "positive" : "negative"}
          />
        </dl>
      </Card>

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px] pl-4">Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead className="hidden lg:table-cell">Conta</TableHead>
                <TableHead className="pr-4 text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className={cn("group", t.internal && "opacity-50")}>
                  <TableCell className="pl-4">
                    <div className="tabular-nums">{shortDate(t.date)}</div>
                    <div className="text-muted-foreground text-xs capitalize">{weekday(t.date)}</div>
                  </TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal">
                    <div className="flex items-start gap-2">
                      {t.type === "INFLOW" ? (
                        <ArrowDownRightIcon className="text-positive mt-0.5 size-4 shrink-0" />
                      ) : (
                        <ArrowUpRightIcon className="text-negative mt-0.5 size-4 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.counterpart}</div>
                        <div className="text-muted-foreground flex flex-wrap gap-1.5 text-xs">
                          {t.installment && (
                            <span>
                              parcela {t.installment.number}/{t.installment.total}
                            </span>
                          )}
                          {t.internal && <span>· {t.internalReason}</span>}
                          <span className="md:hidden">{t.category}</span>
                          {t.type === "OUTFLOW" && !t.internal && !t.installment && (() => {
                            const key = merchantKey(t);
                            const marked = markedKeys.has(key);
                            return (
                              <button
                                type="button"
                                disabled={toggleMark.isPending}
                                onClick={() =>
                                  toggleMark.mutate({ key, name: marked ? null : t.counterpart })
                                }
                                className={cn(
                                  "inline-flex items-center gap-1 hover:underline",
                                  marked
                                    ? "text-primary"
                                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                                )}
                                title={
                                  marked
                                    ? "Desmarcar: volta a depender da detecção automática"
                                    : "Conta nos recorrentes desde esta cobrança"
                                }
                              >
                                <RepeatIcon className="size-3" />
                                {marked ? "recorrente" : "marcar como recorrente"}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="secondary">{t.category}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                    {t.institution} ·{" "}
                    {t.accountCategory === "CREDIT_CARD"
                      ? `cartão ${t.cardNumber ?? ""}`
                      : t.accountCategory === "LOAN_ACCOUNT"
                        ? "empréstimo"
                        : "conta"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "pr-4 text-right font-medium tabular-nums",
                      t.type === "INFLOW" ? "text-positive" : "text-foreground",
                    )}
                  >
                    {t.type === "INFLOW" ? "+" : "−"} {money(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
                    <p>Nenhuma transação encontrada com esses filtros.</p>
                    {filtersActive && (
                      <Button variant="link" onClick={clearFilters} className="mt-1">
                        Limpar filtros
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="px-4 py-2.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "font-semibold tabular-nums",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
