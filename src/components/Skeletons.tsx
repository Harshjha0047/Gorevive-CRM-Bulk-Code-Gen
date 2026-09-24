// Lightweight skeleton placeholders shown while heavier content is loading —
// the lazy-loaded DataTable chunk, or an in-cell option picker's network
// fetch. Pure presentational components, no logic.

function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

/** Shown via <Suspense> while the DataTable chunk is being fetched/parsed. */
export function TableSkeleton() {
  return (
    <div className="w-full max-w-7xl mx-auto mt-8 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex gap-4">
          <Bar className="h-9 w-24" />
          <Bar className="h-9 w-24" />
          <Bar className="h-9 w-24" />
        </div>
        <div className="flex gap-3">
          <Bar className="h-9 w-28" />
          <Bar className="h-9 w-40" />
        </div>
      </div>

      <div className="p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Bar className="h-8 w-8 rounded-full" />
            <Bar className="h-8 flex-1" />
            <Bar className="h-8 flex-1" />
            <Bar className="h-8 flex-1" />
            <Bar className="h-8 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shown inline in a FieldCell's "Pick from list" dropdown while options load. */
export function OptionListSkeleton() {
  return (
    <div className="px-3 py-2 space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Bar key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
