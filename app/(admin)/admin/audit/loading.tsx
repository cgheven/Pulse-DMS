export default function AuditLoading() {
  return (
    <div className="p-6">
      <div className="space-y-6 animate-pulse">
        {/* Header: title + filter chips */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-40 bg-muted rounded" />
            <div className="h-4 w-56 bg-muted rounded" />
          </div>
          <div className="hidden sm:flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-7 w-20 bg-muted rounded-full" />
            ))}
          </div>
        </div>

        {/* 2-tab strip */}
        <div className="flex gap-2 border-b border-sidebar-border/40 pb-2">
          <div className="h-9 w-32 bg-muted rounded-lg" />
          <div className="h-9 w-32 bg-muted rounded-lg" />
        </div>

        {/* Search input */}
        <div className="h-9 w-full max-w-sm bg-muted rounded" />

        {/* Audit log rows */}
        <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 border-b border-sidebar-border/40 last:border-0 bg-muted/40"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
