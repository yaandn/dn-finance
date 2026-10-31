// Categorias para dividir a sobra do mês (tela Projeções). Sem "server-only":
// usado também no navegador.

export const AREA_ICONS = ["shield", "coins", "trending", "party", "target", "plane", "home", "heart"] as const;
export type AreaIcon = (typeof AREA_ICONS)[number];

/** Área para onde vai uma parte fixa da sobra de todo mês. */
export type AllocationArea = {
  id: string;
  name: string;
  /** Percentual da sobra (0–100), o mesmo em todos os meses. */
  pct: number;
  icon: AreaIcon;
};

/** Sugestão inicial; soma 100%. */
export const DEFAULT_AREAS: AllocationArea[] = [
  { id: "reserva", name: "Reserva de emergência", pct: 30, icon: "shield" },
  { id: "dividas", name: "Quitar dívidas", pct: 25, icon: "coins" },
  { id: "investimentos", name: "Investimentos", pct: 20, icon: "trending" },
  { id: "lazer", name: "Lazer", pct: 15, icon: "party" },
  { id: "objetivos", name: "Objetivos", pct: 10, icon: "target" },
];
