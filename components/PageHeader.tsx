export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-6 py-5 backdrop-blur-sm md:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)] md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}
