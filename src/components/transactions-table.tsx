"use client";

import { useMemo, useState } from "react";
import { ArrowDownRightIcon, ArrowUpRightIcon, DownloadIcon, SearchIcon } from "lucide-react";

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
import { money, shortDate, weekday } from "@/lib/format";
import type { Transaction } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type Kind = "todas" | "saidas" | "entradas";

export function TransactionsTable({
  transactions,
  initialCategory = "todas",
}: {
  transactions: Transaction[];
  initialCategory?: string;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("todas");
  const [category, setCategory] = useState(initialCategory);
  const [showInternal, setShowInternal] = useState(false);

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por estabelecimento, pessoa ou categoria…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <TabsList>
              <TabsTrigger value="todas">Todas</TabsTrigger>
              <TabsTrigger value="saidas">Saídas</TabsTrigger>
              <TabsTrigger value="entradas">Entradas</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[200px]">
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
            size="sm"
            onClick={() => setShowInternal((v) => !v)}
            title="Pagamento da própria fatura, Pix no crédito e parcelas futuras"
          >
            {showInternal ? "Ocultar internas" : "Mostrar internas"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <DownloadIcon /> CSV
          </Button>
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>{filtered.length} transações</span>
        <span>
          Entradas: <strong className="text-positive tabular-nums">{money(totals.inn)}</strong>
        </span>
        <span>
          Saídas: <strong className="text-negative tabular-nums">{money(totals.out)}</strong>
        </span>
      </div>

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
                <TableRow key={t.id} className={cn(t.internal && "opacity-50")}>
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
                    Nenhuma transação encontrada com esses filtros.
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
