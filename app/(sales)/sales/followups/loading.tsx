export default function Loading() {
  return (
    <div className="h-full overflow-y-auto p-6 space-y-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl border border-sidebar-border bg-card" />
      ))}
    </div>
  );
}
