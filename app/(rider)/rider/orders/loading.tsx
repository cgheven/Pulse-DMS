export default function Loading() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      <div className="shrink-0 p-4 pb-2 space-y-3">
        <div className="h-6 w-32 rounded bg-card border border-sidebar-border" />
        <div className="h-8 w-full rounded-full bg-card border border-sidebar-border" />
      </div>
      <div className="flex-1 p-4 pt-2 space-y-2.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-sidebar-border bg-card" />
        ))}
      </div>
    </div>
  );
}
