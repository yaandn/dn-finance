import { WalletIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 py-10">
      <p className="flex items-center gap-2 font-semibold">
        <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg">
          <WalletIcon className="size-4" />
        </span>
        Minhas Finanças
      </p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && (
        <div className="text-muted-foreground space-y-1 text-center text-sm">
          {footer}
        </div>
      )}
    </main>
  );
}
