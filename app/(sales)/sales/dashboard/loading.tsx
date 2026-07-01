export default function Loading() {
  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-sidebar-border bg-card" />
        ))}
      </div>
      <div className="h-24 rounded-xl border border-sidebar-border bg-card" />
      <div className="h-40 rounded-xl border border-sidebar-border bg-card" />
    </div>
  );
}
