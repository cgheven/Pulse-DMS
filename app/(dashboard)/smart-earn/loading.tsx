export default function SmartEarnLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Title */}
      <div className="space-y-2">
        <div className="h-9 w-48 bg-white/5 rounded-lg" />
        <div className="h-4 w-72 bg-white/5 rounded" />
      </div>

      {/* Simulator card */}
      <div className="h-32 bg-white/5 rounded-2xl" />

      {/* Winner card */}
      <div className="h-40 bg-white/5 rounded-2xl" />

      {/* Trainer ranking grid (2x2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-white/5 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
