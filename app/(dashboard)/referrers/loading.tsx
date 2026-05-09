export default function ReferrersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-9 w-40 bg-white/5 rounded-lg" />
        <div className="h-9 w-32 bg-white/5 rounded-lg" />
      </div>

      {/* 2 tabs (Referrers / Referrals) */}
      <div className="flex gap-2 border-b border-sidebar-border/40 pb-2">
        <div className="h-9 w-28 bg-white/5 rounded-lg" />
        <div className="h-9 w-28 bg-white/5 rounded-lg" />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-white/5 rounded-2xl" />
        ))}
      </div>

      {/* Table rows */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-white/5 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
