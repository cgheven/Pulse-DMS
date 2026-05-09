export default function AdminUsersLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Page header */}
      <div className="border-b border-sidebar-border px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted" />
            <div className="space-y-1.5">
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-3 w-56 bg-muted rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-24 bg-muted rounded" />
            <div className="h-9 w-24 bg-muted rounded" />
            <div className="h-9 w-32 bg-muted rounded" />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-7xl space-y-6 animate-pulse">
        {/* 3 stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-2xl" />
          ))}
        </div>

        {/* Search */}
        <div className="h-9 w-full max-w-sm bg-muted rounded" />

        {/* Users table */}
        <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
          <div className="h-12 bg-muted/60 border-b border-sidebar-border/40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 border-b border-sidebar-border/40 last:border-0 bg-muted/40"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
