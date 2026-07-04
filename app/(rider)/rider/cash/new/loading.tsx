export default function Loading() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="h-6 w-56 rounded bg-card border border-sidebar-border" />
        <div className="h-12 rounded-xl border border-sidebar-border bg-card" />
        <div className="h-12 rounded-xl border border-sidebar-border bg-card" />
        <div className="h-20 rounded-xl border border-sidebar-border bg-card" />
      </div>
      <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
        <div className="h-12 rounded-md bg-card border border-sidebar-border" />
      </div>
    </div>
  );
}
