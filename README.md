# Minhas Finanças

Painel financeiro pessoal em **Next.js 16 + Tailwind 4 + shadcn/ui + Recharts**, consumindo dados de Open Finance Brasil pela **API da Belvo**.

- **Painel:** saldo em conta, entradas, saídas, resultado do período, alertas (limite do cartão, juros de empréstimo, fatura possivelmente em aberto, apostas, faturas de outros bancos), fluxo de caixa diário com saldo acumulado, gastos por categoria, onde mais gastou, de onde veio o dinheiro, assinaturas e resumo de dívidas.
- **Transações:** busca, filtro por entradas/saídas e categoria, opção de mostrar movimentações internas e exportação em CSV.
- **Contas e dívidas:** saldos, cartões (limite usado, mínimo, fechamento) e empréstimos (saldo devedor, parcelas, CET e juros ao mês).
- Períodos de 30, 60 ou 90 dias, tema claro/escuro e layout responsivo.

O app ignora nos totais o que não é gasto nem renda de verdade: o pagamento da própria fatura, o crédito usado para Pix no cartão, o espelho da parcela do empréstimo e as parcelas futuras de compras parceladas.

## Rodando

```bash
npm install
cp .env.example .env.local   # opcional
npm run dev                  # http://localhost:3000
```

Sem nenhuma configuração, o app abre em **modo demonstração**, com dados fictícios.

## Fontes de dados

| Fonte | Quando é usada | Como ativar |
|---|---|---|
| **API Belvo** | Chaves preenchidas no `.env.local` | `BELVO_SECRET_ID`, `BELVO_SECRET_PASSWORD`, `BELVO_ENV` |
| **Arquivo exportado** | Existe `data/belvo-export.json` | Veja `data/belvo-export.example.json` |
| **Demonstração** | Nenhuma das anteriores | Automático |

Para forçar uma fonte, use `DATA_SOURCE=belvo|file|demo`.

### Sobre as chaves da Belvo

- As chaves são da **conta de desenvolvedor** (dashboard da Belvo → Developers → API Keys). Elas ficam só no servidor e nunca vão para o navegador.
- O **sandbox** tem bancos e dados de teste e serve para desenvolver.
- Dados reais em **produção** no Open Finance Brasil exigem que a sua conta Belvo esteja habilitada para produção. As conexões feitas no **Belvo Panorama** (o app de consumidor) pertencem àquela conta e **não aparecem automaticamente** na sua conta de desenvolvedor. Nesse caso, use o modo arquivo.
- O app lê os links válidos da conta (`/api/links/`) ou os IDs informados em `BELVO_LINK_IDS`. Depois busca `/api/accounts/` e `/api/transactions/` de cada link, com cache de 5 minutos.

## Estrutura

```
src/
  app/                    páginas (painel, transações, contas)
  components/ui/          componentes shadcn/ui
  components/             cabeçalho, gráficos, tabela
  lib/belvo/client.ts     cliente da API (server-only, Basic Auth, paginação)
  lib/belvo/normalize.ts  converte o formato da Belvo para o modelo do app
  lib/belvo/demo.ts       dados fictícios
  lib/finance/            categorias em PT, análise, carregamento dos dados
```

Para adicionar mais componentes shadcn: `npx shadcn@latest add <componente>`.

## Segurança

Este painel mostra dados financeiros pessoais e **não tem login**. Rode localmente. Antes de publicar em qualquer servidor, coloque autenticação na frente. `.env*` e `data/*.json` já estão no `.gitignore`.
