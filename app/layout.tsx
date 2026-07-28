import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { NeshShell } from "@/components/nesh/NeshShell";
import { listAreas } from "@/lib/repo";
import "./globals.css";

export const dynamic = "force-dynamic";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: "nesh — Personal PM",
  description: "The PM tool for one person's life.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const areas = await listAreas();

  return (
    <html lang="en" className={`${figtree.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <NeshShell areas={areas}>{children}</NeshShell>
      </body>
    </html>
  );
}
