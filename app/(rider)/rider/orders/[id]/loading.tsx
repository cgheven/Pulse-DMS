export default function Loading() {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-5 max-w-lg animate-pulse">
      <div className="h-4 w-28 rounded bg-card border border-sidebar-border" />
      <div className="h-8 w-48 rounded bg-card border border-sidebar-border" />
      <div className="h-40 rounded-xl border border-sidebar-border bg-card" />
      <div className="h-12 rounded-xl border border-sidebar-border bg-card" />
      <div className="h-24 rounded-xl border border-sidebar-border bg-card" />
    </div>
  );
}
