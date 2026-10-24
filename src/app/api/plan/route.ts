import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { readPlan, sanitizePlan, writePlan } from "@/lib/finance/plan-store";

const unauthorized = () =>
  NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  return NextResponse.json(await readPlan(user));
}

export async function PUT(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const plan = sanitizePlan(await request.json().catch(() => null));
  await writePlan(user, plan);
  return NextResponse.json(plan);
}
