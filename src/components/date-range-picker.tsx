"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, XIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type IsoRange = { from: string; to: string };

/** "YYYY-MM-DD" → Date no fuso local (sem deslocar o dia). */
const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toIso = (date: Date) => format(date, "yyyy-MM-dd");
const label = (date: Date) => format(date, "dd/MM/yyyy");

/**
 * Seletor de intervalo de datas (shadcn: Popover + Calendar). A escolha só é
 * aplicada no botão "Aplicar", para não disparar uma busca a cada clique.
 */
export function DateRangePicker({
  value,
  custom,
  maxDays,
  onChange,
  className,
}: {
  /** Intervalo exibido no botão (o período carregado). */
  value: IsoRange;
  /** true quando o intervalo foi escolhido aqui (mostra o botão de limpar). */
  custom: boolean;
  /** Maior intervalo aceito, em dias. */
  maxDays?: number;
  /** null volta ao período padrão. */
  onChange: (range: IsoRange | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const today = new Date();
  // A Belvo guarda cerca de um ano; dois anos de navegação dão folga
  const startMonth = new Date(today.getFullYear() - 2, today.getMonth(), 1);

  function openChange(next: boolean) {
    if (next) setDraft({ from: toDate(value.from), to: toDate(value.to) });
    setOpen(next);
  }

  function apply() {
    if (!draft?.from) return;
    onChange({ from: toIso(draft.from), to: toIso(draft.to ?? draft.from) });
    setOpen(false);
  }

  return (
    <div className={cn("flex flex-1 items-center sm:flex-none", className)}>
      <Popover open={open} onOpenChange={openChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "flex-1 justify-start font-normal tabular-nums",
              custom && "rounded-r-none border-r-0",
            )}
          >
            <CalendarIcon />
            {label(toDate(value.from))} – {label(toDate(value.to))}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            locale={ptBR}
            numberOfMonths={2}
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={today}
            defaultMonth={draft?.from}
            selected={draft}
            onSelect={setDraft}
            resetOnSelect
            max={maxDays ? maxDays - 1 : undefined}
            disabled={{ after: today }}
          />
          <div className="flex items-center justify-between gap-2 border-t p-3">
            <span className="text-muted-foreground text-xs tabular-nums">
              {draft?.from
                ? `${label(draft.from)} – ${label(draft.to ?? draft.from)}`
                : "Escolha o início e o fim"}
            </span>
            <Button size="sm" disabled={!draft?.from} onClick={apply}>
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {custom && (
        <Button
          variant="outline"
          className="rounded-l-none px-2.5"
          aria-label="Voltar ao período padrão"
          title="Voltar ao período padrão"
          onClick={() => onChange(null)}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
