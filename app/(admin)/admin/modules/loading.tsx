export default function AdminModulesLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted" />
        <div className="space-y-1.5">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-3 w-64 bg-muted rounded" />
        </div>
      </div>

      <div className="h-9 w-full max-w-sm bg-muted rounded" />

      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
        <div className="h-12 bg-muted/60 border-b border-sidebar-border/40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-sidebar-border/40 last:border-0 bg-muted/40"
          />
        ))}
      </div>
    </div>
  );
}
