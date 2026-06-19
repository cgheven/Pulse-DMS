export default function AdminDashboardLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="h-6 w-32 bg-muted rounded" />
        <div className="h-4 w-52 bg-muted rounded" />
      </div>

      {/* Stat cards: 2-col mobile, 4-col desktop */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-4 w-4 bg-muted rounded" />
            </div>
            <div className="h-9 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* Bottom row: Recent Clients + Lead Pipeline */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Recent Clients card */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col gap-4">
          <div className="h-4 w-32 bg-muted rounded" />
          <ul className="divide-y divide-sidebar-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="py-3 flex items-center justify-between gap-3">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
                <div className="h-5 w-16 bg-muted rounded-full shrink-0" />
              </li>
            ))}
          </ul>
        </div>

        {/* Lead Pipeline card */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col gap-4">
          <div className="h-4 w-28 bg-muted rounded" />
          <ul className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <div className="h-5 w-24 bg-muted rounded-full" />
                <div className="h-4 w-6 bg-muted rounded" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
