export default function StaffLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-16 bg-muted rounded" />
          <div className="h-4 w-56 bg-muted rounded" />
        </div>
        <div className="h-9 w-28 bg-muted rounded-md" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
        {/* Table header */}
        <div className="border-b border-sidebar-border bg-muted/30 px-4 py-3 flex gap-8">
          <div className="h-3 w-16 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded" />
          <div className="h-3 w-14 bg-muted rounded" />
          <div className="h-3 w-14 bg-muted rounded" />
        </div>

        {/* Table rows */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="px-4 py-3 flex items-center gap-8 border-b border-sidebar-border last:border-0"
          >
            <div className="h-4 w-36 bg-muted rounded" />
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-5 w-16 bg-muted rounded-full" />
            <div className="h-5 w-20 bg-muted rounded-full" />
            <div className="ml-auto h-8 w-8 bg-muted rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
