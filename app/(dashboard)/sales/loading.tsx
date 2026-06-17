export default function SalesLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
      <div className="h-28 bg-muted animate-pulse rounded-xl" />
      <div className="h-48 bg-muted animate-pulse rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  );
}
