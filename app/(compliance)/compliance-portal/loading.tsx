export default function CompliancePortalLoading() {
  return (
    <div className="space-y-6 animate-pulse p-6 max-w-6xl mx-auto">
      {/* Gym name hero */}
      <div className="space-y-2">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-4 w-80 bg-muted rounded" />
      </div>

      {/* 3 stat boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-2xl" />
        ))}
      </div>

      {/* Member table */}
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
