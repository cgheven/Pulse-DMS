export default function ComplianceReportLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 bg-white/5 rounded-lg" />
          <div className="h-4 w-72 bg-white/5 rounded" />
        </div>
        <div className="h-9 w-32 bg-white/5 rounded-lg" />
      </div>

      {/* Filter row: date range + field toggles */}
      <div className="flex flex-wrap gap-3">
        <div className="h-9 w-48 bg-white/5 rounded-lg" />
        <div className="h-9 w-48 bg-white/5 rounded-lg" />
        <div className="h-9 w-32 bg-white/5 rounded-lg" />
        <div className="h-9 w-32 bg-white/5 rounded-lg" />
      </div>

      {/* Compliance table */}
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="h-12 bg-white/5 border-b border-sidebar-border/40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-sidebar-border/40 last:border-0 bg-white/[0.03]"
          />
        ))}
      </div>
    </div>
  );
}
