import type { Metadata } from "next";

import "./global.css";

export const metadata: Metadata = {
  title: "Fluxo · Dashboard financeiro",
  description: "Sua saúde financeira em um só lugar — saldo, fluxo de caixa, gastos por categoria, orçamentos e cartões.",
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
