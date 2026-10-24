"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, MonitorIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/http";
import {
  useCreateWidgetToken,
  useRevokeWidgetToken,
  useWidgetTokenStatus,
} from "@/lib/api/queries";

/** Gera o token que o widget do Mac usa para ler o card "Sobra do mês". */
export function WidgetTokenCard() {
  const status = useWidgetTokenStatus();
  const create = useCreateWidgetToken();
  const revoke = useRevokeWidgetToken();
  const [copied, setCopied] = useState(false);
  const token = create.data;
  const active = status.data?.active ?? false;
  const error = create.error ?? revoke.error;

  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorIcon className="size-4" /> Widget do Mac
        </CardTitle>
        <CardDescription>
          {active
            ? "Há um token ativo. Gerar outro desativa o anterior."
            : "Gere um token e cole na configuração do widget (botão direito → Editar widget)."}
        </CardDescription>
        <CardAction className="flex gap-2">
          {active && (
            <Button
              variant="ghost"
              size="sm"
              disabled={revoke.isPending}
              onClick={() => {
                create.reset();
                revoke.mutate();
              }}
            >
              Revogar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            <KeyRoundIcon /> {active ? "Gerar novo token" : "Gerar token"}
          </Button>
        </CardAction>
      </CardHeader>
      {(token || error) && (
        <CardContent className="space-y-2">
          {token && (
            <>
              <div className="flex gap-2">
                <Input readOnly value={token} className="font-mono text-xs" />
                <Button variant="outline" size="sm" className="h-9" onClick={copy}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                O token só aparece agora. Ele dá acesso de leitura ao seu
                planejamento: não compartilhe.
              </p>
            </>
          )}
          {error && <p className="text-negative text-xs">{errorMessage(error)}</p>}
        </CardContent>
      )}
    </Card>
  );
}
