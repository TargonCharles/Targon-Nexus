// =============================================================================
// Skeleton — 加载占位组件
// =============================================================================

export function SkeletonLine({ width = '100%', className = '' }: { width?: string; className?: string }) {
  return (
    <div
      className={`h-4 bg-gray-200 rounded animate-pulse ${className}`}
      style={{ width }}
    />
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border bg-white p-5 space-y-3 ${className}`}>
      <SkeletonLine width="60%" className="h-5" />
      <SkeletonLine width="80%" />
      <SkeletonLine width="40%" />
    </div>
  );
}

export function SkeletonDetail() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <SkeletonLine width="100px" className="h-3" />
      <div className="flex gap-6">
        <div className="w-28 h-28 rounded-xl bg-gray-200 animate-pulse" />
        <div className="flex-1 space-y-3">
          <SkeletonLine width="50%" className="h-7" />
          <SkeletonLine width="30%" className="h-4" />
          <SkeletonLine width="60%" className="h-4" />
        </div>
      </div>
      <SkeletonLine width="100%" className="h-[300px]" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
