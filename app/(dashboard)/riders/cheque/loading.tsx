export default function Loading() {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4 animate-pulse">
      <div className="h-6 w-48 rounded bg-card border border-sidebar-border" />
      <div className="h-9 w-full max-w-md rounded-lg bg-card border border-sidebar-border" />
      <div className="h-16 w-full rounded-xl bg-card border border-sidebar-border" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-20 rounded-xl border border-sidebar-border bg-card" />
      ))}
    </div>
  );
}
