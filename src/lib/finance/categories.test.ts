import { describe, expect, it } from "vitest";

import { OTHER_BANK_BILLS, categorize } from "@/lib/finance/categories";

const base = { rawCategory: "Transfers", subcategory: null, operationType: "PIX", type: "OUTFLOW" as const };

describe("categorize", () => {
  it("não confunde 'pelo Pix' com a bandeira Elo", () => {
    const category = categorize({ ...base, description: "Transferência enviada pelo Pix|Raquel" });
    expect(category).not.toBe(OTHER_BANK_BILLS);
  });

  it("reconhece boleto de fatura de outro cartão", () => {
    const category = categorize({ ...base, operationType: "BOLETO", description: "Pagamento fatura cartão Itaú" });
    expect(category).toBe(OTHER_BANK_BILLS);
  });
});
