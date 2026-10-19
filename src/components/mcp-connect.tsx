"use client";

import { useSearchParams } from "next/navigation";
import { CheckCircle2Icon, LinkIcon, LogOutIcon, XCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Mensagens que voltam do fluxo de login (?conectado=1 ou ?erro_mcp=…). */
export function McpStatusMessage() {
  const params = useSearchParams();
  const error = params.get("erro_mcp");
  const connected = params.get("conectado");

  if (error) {
    return (
      <div className="border-negative/40 bg-negative/10 flex gap-3 rounded-lg border p-3 text-sm">
        <XCircleIcon className="text-negative mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Não foi possível conectar ao Belvo Panorama</p>
          <p className="text-muted-foreground break-all">{error}</p>
        </div>
      </div>
    );
  }
  if (connected) {
    return (
      <div className="border-positive/40 bg-positive/10 flex items-center gap-3 rounded-lg border p-3 text-sm">
        <CheckCircle2Icon className="text-positive size-4 shrink-0" />
        Belvo Panorama conectado. Os dados abaixo vêm das suas contas reais.
      </div>
    );
  }
  return null;
}

export function McpConnectCard() {
  return (
    <div className="bg-accent/60 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Veja suas contas reais</p>
        <p className="text-muted-foreground text-sm">
          Entre com a sua conta do Belvo Panorama para trazer os dados de Open Finance dos bancos
          que você já conectou lá.
        </p>
      </div>
      <Button asChild>
        {/* Rota de API: precisa ser navegação completa, não <Link> */}
        <a href="/api/belvo-mcp/connect">
          <LinkIcon /> Conectar Belvo Panorama
        </a>
      </Button>
    </div>
  );
}

export function McpDisconnectButton() {
  return (
    <form action="/api/belvo-mcp/disconnect" method="post">
      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground h-7 px-2">
        <LogOutIcon /> Desconectar
      </Button>
    </form>
  );
}
