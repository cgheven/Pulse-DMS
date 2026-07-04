export default function Loading() {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6 animate-pulse max-w-2xl">
      <div className="h-6 w-48 rounded bg-card border border-sidebar-border" />
      <div className="h-40 rounded-xl border border-sidebar-border bg-card" />
      <div className="h-20 rounded-xl border border-sidebar-border bg-card" />
    </div>
  );
}
