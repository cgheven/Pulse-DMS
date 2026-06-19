export default function AdminLeadsLoading() {
  return (
    <div className="space-y-6 animate-pulse p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-24 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
        <div className="h-9 w-28 bg-muted rounded" />
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-muted rounded-full" />
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="h-11 bg-muted/60 border-b border-sidebar-border/40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[60px] border-b border-sidebar-border/40 last:border-0 bg-muted/30"
          />
        ))}
      </div>
    </div>
  );
}
