import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RubinotData — XP diária do Rubinot",
  description:
    "Quanto de XP cada jogador do Rubinot fez por dia (server save), por mundo e vocação.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
