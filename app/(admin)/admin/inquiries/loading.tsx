export default function AdminInquiriesLoading() {
  return (
    <div className="space-y-6 animate-pulse p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-28 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="h-7 w-20 bg-muted rounded-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-muted rounded-full" />
        ))}
      </div>
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="h-11 bg-muted/60 border-b border-sidebar-border/40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[68px] border-b border-sidebar-border/40 last:border-0 bg-muted/30" />
        ))}
      </div>
    </div>
  );
}
