export default function Loading() {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4 animate-pulse max-w-2xl">
      <div className="h-6 w-40 rounded bg-card border border-sidebar-border" />
      <div className="h-16 rounded-xl border border-sidebar-border bg-card" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-20 rounded-xl border border-sidebar-border bg-card" />
      ))}
    </div>
  );
}
