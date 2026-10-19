import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { hasMcpSession } from "@/lib/belvo/mcp-auth";
import { getSyncState, startRefresh } from "@/lib/belvo/mcp-sync";

const unauthorized = () =>
  NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  return NextResponse.json(await getSyncState(user));
}

export async function POST() {
  const user = await getUser();
  if (!user) return unauthorized();
  if (!(await hasMcpSession(user))) {
    return NextResponse.json({ error: "Belvo Panorama não conectado." }, { status: 400 });
  }
  return NextResponse.json(await startRefresh(user, "manual"));
}
