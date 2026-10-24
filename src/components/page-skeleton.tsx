export function PageSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:py-8">
      <div className="bg-muted h-14 animate-pulse rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted h-28 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-muted h-80 animate-pulse rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="bg-muted h-72 animate-pulse rounded-xl lg:col-span-3" />
        <div className="bg-muted h-72 animate-pulse rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
