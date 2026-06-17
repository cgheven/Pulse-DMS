export default function SupplierLedgerLoading() {
  return (
    <div className="flex gap-4 h-full">
      <div className="w-72 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="flex-1 h-64 bg-muted animate-pulse rounded-xl" />
    </div>
  );
}
