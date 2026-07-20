export default function Loading() {
  return (
    <div className="h-full overflow-y-auto p-6 space-y-3 animate-pulse">
      <div className="h-9 w-40 rounded-lg bg-card border border-sidebar-border" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl border border-sidebar-border bg-card" />
      ))}
    </div>
  );
}
