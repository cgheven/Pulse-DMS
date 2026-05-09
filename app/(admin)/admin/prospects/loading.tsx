export default function AdminProspectsLoading() {
  return (
    <div className="space-y-6 animate-pulse p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-36 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-9 w-32 bg-muted rounded" />
      </div>

      {/* Optional filter row */}
      <div className="flex gap-3">
        <div className="h-9 flex-1 max-w-sm bg-muted rounded" />
        <div className="h-9 w-32 bg-muted rounded" />
      </div>

      {/* Prospect rows */}
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="h-12 bg-muted/60 border-b border-sidebar-border/40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-sidebar-border/40 last:border-0 bg-muted/40"
          />
        ))}
      </div>
    </div>
  );
}
