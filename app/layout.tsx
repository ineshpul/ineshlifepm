import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

// Every screen reads live from Firestore (single-user, no static content
// to prerender), so force dynamic rendering across the whole app — this
// also keeps the production build from touching Firestore at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Personal PM",
  description: "The PM tool for one person's life.",
};

const NAV = [
  { href: "/today", label: "Today" },
  { href: "/goals", label: "Goals" },
  { href: "/vision", label: "Vision" },
  { href: "/calendar", label: "Calendar" },
  { href: "/metrics", label: "Metrics" },
  { href: "/triage", label: "Triage" },
  { href: "/learning", label: "Learning" },
  { href: "/delegated", label: "Delegated" },
  { href: "/knowledge", label: "Knowledge base" },
  { href: "/initiatives", label: "Initiatives" },
  { href: "/reviews/weekly", label: "Weekly review" },
  { href: "/reviews/monthly", label: "Monthly review" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="flex min-h-screen">
          <nav className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r hairline p-4">
            <div className="mb-4 px-2 text-sm font-semibold tracking-tight">Personal PM</div>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1.5 text-sm muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
