"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LandmarkIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  WalletIcon,
} from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Painel" },
  { href: "/transacoes", label: "Transações" },
  { href: "/faturas", label: "Faturas" },
  { href: "/planejamento", label: "Planejamento" },
  { href: "/contas", label: "Contas e dívidas" },
];

export function AppHeader({
  banks = [],
  email,
  loading = false,
}: {
  banks?: string[];
  email?: string | null;
  /** Dados da página sendo buscados (troca de período ou banco). */
  loading?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [navigating, startTransition] = useTransition();
  const pending = navigating || loading;
  // Intervalo personalizado (só a página de transações usa ?de=…&ate=…)
  const customRange =
    pathname.startsWith("/transacoes") && params.has("de") && params.has("ate");
  const days = customRange ? "personalizado" : (params.get("dias") ?? "30");
  const bankParam = params.get("banco");
  const bank = bankParam && banks.includes(bankParam) ? bankParam : "todos";
  const query = params.toString() ? `?${params.toString()}` : "";

  function setParam(key: string, value: string | null, drop: string[] = []) {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    for (const k of drop) next.delete(k);
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  // Escolher 30/60/90 dias desfaz o intervalo personalizado
  const setDays = (value: string) => setParam("dias", value, ["de", "ate"]);
  const setBank = (value: string) =>
    setParam("banco", value === "todos" ? null : value);

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {
      /* armazenamento indisponível */
    }
  }

  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0">
        <Link
          href={`/${query}`}
          className="flex items-center gap-2 font-semibold"
        >
          <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg">
            <WalletIcon className="size-4" />
          </span>
          <span>Minhas Finanças</span>
        </Link>

        <nav className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={`${item.href}${query}`}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {banks.length > 1 && !pathname.startsWith("/planejamento") && (
            <Select value={bank} onValueChange={setBank}>
              <SelectTrigger
                aria-label="Filtrar por banco"
                className={cn(
                  "h-8 w-[160px] sm:w-[200px]",
                  pending && "opacity-60",
                )}
              >
                <LandmarkIcon className="text-muted-foreground hidden size-4 sm:block" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="todos">Todos os bancos</SelectItem>
                {banks.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!pathname.startsWith("/faturas") &&
            !pathname.startsWith("/planejamento") && (
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger
                  className={cn(
                    "h-8 w-[110px] sm:w-[150px]",
                    pending && "opacity-60",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {customRange && (
                    <SelectItem value="personalizado" disabled>
                      Personalizado
                    </SelectItem>
                  )}
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="60">60 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Alternar tema"
          >
            <SunIcon className="hidden size-4 dark:block" />
            <MoonIcon className="size-4 dark:hidden" />
          </Button>
          <form action="/auth/signout" method="post">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={email ? `Sair (${email})` : "Sair"}
              title={email ? `Sair (${email})` : "Sair"}
            >
              <LogOutIcon className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
