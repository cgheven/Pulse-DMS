export default function AdminGymsLoading() {
  return (
    <div className="space-y-6 animate-pulse p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-9 w-28 bg-muted rounded" />
      </div>

      {/* Search */}
      <div className="h-9 w-full max-w-sm bg-muted rounded" />

      {/* Gym table */}
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="h-12 bg-muted/60 border-b border-sidebar-border/40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[60px] border-b border-sidebar-border/40 last:border-0 bg-muted/40"
          />
        ))}
      </div>
    </div>
  );
}
