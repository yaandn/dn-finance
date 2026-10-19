"use server";

import { requireUserOrThrow } from "@/lib/auth";
import {
  sanitizePlan,
  writePlan,
  type PlanSettings,
} from "@/lib/finance/plan-store";

export async function savePlan(input: unknown): Promise<PlanSettings> {
  const user = await requireUserOrThrow();
  const plan = sanitizePlan(input);
  await writePlan(user, plan);
  return plan;
}
