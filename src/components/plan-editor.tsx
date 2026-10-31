"use client";

import { useState } from "react";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSavePlan } from "@/lib/api/queries";
import type { FixedCost, PlanSettings, TemporaryDebt } from "@/lib/finance/plan-store";

const field = "text-muted-foreground text-xs font-medium";

export function PlanEditor({
  plan,
  onChange,
  onSaved,
  dirty,
}: {
  plan: PlanSettings;
  onChange: (update: (p: PlanSettings) => PlanSettings) => void;
  onSaved: (plan: PlanSettings) => void;
  dirty: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const savePlan = useSavePlan();
  const pending = savePlan.isPending;

  const update = (fn: (p: PlanSettings) => PlanSettings) => {
    onChange(fn);
    setStatus("idle");
  };
  const set = <K extends keyof PlanSettings>(
    key: K,
    value: PlanSettings[K],
  ) => update((p) => ({ ...p, [key]: value }));
  const setFixed = (id: string, patch: Partial<FixedCost>) =>
    update((p) => ({
      ...p,
      fixed: p.fixed.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));

  const setDebt = (id: string, patch: Partial<TemporaryDebt>) =>
    update((p) => ({
      ...p,
      debts: p.debts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));

  function save() {
    savePlan.mutate(plan, {
      onSuccess: (saved) => {
        onSaved(saved);
        setStatus("saved");
      },
      onError: () => setStatus("error"),
    });
  }

  const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="space-y-1.5">
          <span className={field}>Salário líquido (R$)</span>
          <Input
            inputMode="decimal"
            value={plan.salary || ""}
            onChange={(e) => set("salary", num(e.target.value))}
          />
        </label>
        <label className="space-y-1.5">
          <span className={field}>Dia do salário</span>
          <Input
            type="number"
            min={1}
            max={31}
            value={plan.salaryDay}
            onChange={(e) => set("salaryDay", num(e.target.value))}
          />
        </label>
        <label className="space-y-1.5">
          <span className={field}>Outras rendas (R$)</span>
          <Input
            inputMode="decimal"
            value={plan.otherIncome || ""}
            placeholder="0"
            onChange={(e) => set("otherIncome", num(e.target.value))}
          />
        </label>
        <label className="space-y-1.5">
          <span className={field}>Guardar por mês (% do salário)</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={plan.savingsPct}
            onChange={(e) => set("savingsPct", num(e.target.value))}
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Contas fixas</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              update((p) => ({
                ...p,
                fixed: [
                  ...p.fixed,
                  {
                    id: `f${Date.now()}`,
                    name: "",
                    amount: 0,
                    day: 10,
                    onCard: false,
                  },
                ],
              }))
            }
          >
            <PlusIcon /> Adicionar
          </Button>
        </div>
        <div className="text-muted-foreground hidden grid-cols-[1fr_120px_80px_110px_36px] gap-2 px-1 text-xs sm:grid">
          <span>Nome</span>
          <span>Valor</span>
          <span>Dia</span>
          <span>No cartão?</span>
          <span />
        </div>
        {plan.fixed.length === 0 && (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            Nenhuma conta fixa. Adicione aluguel, condomínio, internet,
            parcelas…
          </p>
        )}
        {plan.fixed.map((f) => (
          <div
            key={f.id}
            className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-2 sm:grid-cols-[1fr_120px_80px_110px_36px] sm:border-0 sm:p-0"
          >
            <Input
              aria-label="Nome"
              placeholder="Ex.: Condomínio"
              value={f.name}
              onChange={(e) => setFixed(f.id, { name: e.target.value })}
              className="col-span-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remover ${f.name}`}
              className="sm:order-last"
              onClick={() =>
                update((p) => ({
                  ...p,
                  fixed: p.fixed.filter((x) => x.id !== f.id),
                }))
              }
            >
              <Trash2Icon />
            </Button>
            <div className="col-span-2 grid grid-cols-[1fr_80px_auto] gap-2 sm:contents">
              <Input
                aria-label="Valor"
                inputMode="decimal"
                value={f.amount || ""}
                placeholder="0,00"
                onChange={(e) =>
                  setFixed(f.id, { amount: num(e.target.value) })
                }
              />
              <Input
                aria-label="Dia do vencimento"
                type="number"
                min={1}
                max={31}
                value={f.day}
                onChange={(e) => setFixed(f.id, { day: num(e.target.value) })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={f.onCard}
                  onChange={(e) => setFixed(f.id, { onCard: e.target.checked })}
                />
                <span className="sm:hidden">No cartão</span>
                <span className="hidden sm:inline">Sim</span>
              </label>
            </div>
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          Marque &quot;no cartão&quot; quando a conta é cobrada no cartão de
          crédito: ela já está dentro da fatura e não é somada de novo.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Dívidas temporárias (fora do cartão)</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              update((p) => ({
                ...p,
                debts: [
                  ...p.debts,
                  {
                    id: `d${Date.now()}`,
                    name: "",
                    amount: 0,
                    day: 10,
                    endMonth: new Date().toISOString().slice(0, 7),
                    single: false,
                  },
                ],
              }))
            }
          >
            <PlusIcon /> Adicionar
          </Button>
        </div>
        <div className="text-muted-foreground hidden grid-cols-[1fr_120px_90px_80px_150px_36px] gap-2 px-1 text-xs sm:grid">
          <span>Nome</span>
          <span>Valor</span>
          <span>Pagamento</span>
          <span>Dia</span>
          <span>Última parcela / data</span>
          <span />
        </div>
        {plan.debts.length === 0 && (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            Nenhuma dívida. Adicione um empréstimo de alguém, um acordo, um carnê…
          </p>
        )}
        {plan.debts.map((d) => (
          <div
            key={d.id}
            className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-2 sm:grid-cols-[1fr_120px_90px_80px_150px_36px] sm:border-0 sm:p-0"
          >
            <Input
              aria-label="Nome"
              placeholder="Ex.: Empréstimo do João"
              value={d.name}
              onChange={(e) => setDebt(d.id, { name: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remover ${d.name}`}
              className="sm:order-last"
              onClick={() =>
                update((p) => ({
                  ...p,
                  debts: p.debts.filter((x) => x.id !== d.id),
                }))
              }
            >
              <Trash2Icon />
            </Button>
            <div className="col-span-2 grid grid-cols-[1fr_90px] gap-2 sm:contents">
              <Input
                aria-label={d.single ? "Valor" : "Valor da parcela"}
                inputMode="decimal"
                value={d.amount || ""}
                placeholder="0,00"
                onChange={(e) => setDebt(d.id, { amount: num(e.target.value) })}
              />
              <select
                aria-label="Forma de pagamento"
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                value={d.single ? "unico" : "parcelas"}
                onChange={(e) => setDebt(d.id, { single: e.target.value === "unico" })}
              >
                <option value="parcelas">Parcelado</option>
                <option value="unico">Único</option>
              </select>
              {d.single ? (
                <Input
                  aria-label="Data do pagamento"
                  type="date"
                  className="col-span-2 sm:col-span-2"
                  value={`${d.endMonth}-${String(d.day).padStart(2, "0")}`}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setDebt(d.id, { endMonth: v.slice(0, 7), day: Number(v.slice(8, 10)) });
                  }}
                />
              ) : (
                <>
                  <Input
                    aria-label="Dia do pagamento"
                    type="number"
                    min={1}
                    max={31}
                    value={d.day}
                    onChange={(e) => setDebt(d.id, { day: num(e.target.value) })}
                  />
                  <Input
                    aria-label="Mês da última parcela"
                    type="month"
                    value={d.endMonth}
                    onChange={(e) =>
                      e.target.value && setDebt(d.id, { endMonth: e.target.value })
                    }
                  />
                </>
              )}
            </div>
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          Parceladas entram todo mês até a última parcela; as de pagamento único, só no mês
          da data. Depois saem sozinhas.
          Para dívidas no cartão, não precisa: as parcelas já estão nas faturas.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !dirty}>
          <SaveIcon /> {pending ? "Salvando…" : "Salvar planejamento"}
        </Button>
        {dirty && status !== "error" && (
          <span className="text-muted-foreground text-sm">
            Alterações não salvas.
          </span>
        )}
        {!dirty && status === "saved" && (
          <span className="text-positive text-sm">Salvo.</span>
        )}
        {status === "error" && (
          <span className="text-negative text-sm">
            Não foi possível salvar.
          </span>
        )}
      </div>
    </form>
  );
}
