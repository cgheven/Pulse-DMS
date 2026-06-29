export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-7 w-48 rounded-lg bg-sidebar-border" />
      <div className="h-4 w-72 rounded bg-sidebar-border/60" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-sidebar-border bg-sidebar h-40" />
        ))}
      </div>
    </div>
  );
}
