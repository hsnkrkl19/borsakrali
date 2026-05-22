import clsx from 'clsx'

/**
 * Skeleton — shimmer placeholder for loading states.
 *
 *   <Skeleton w={120} h={32} />
 *   <Skeleton count={3} />            // 3 stacked lines, last one shorter
 */
export default function Skeleton({ w = '100%', h = '1rem', rounded = 8, count = 1, className, style }) {
  if (count > 1) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className={clsx('skeleton block', className)}
            style={{
              width: i === count - 1 ? '62%' : w,
              height: h,
              borderRadius: rounded,
              ...style,
            }}
          />
        ))}
      </div>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={clsx('skeleton block', className)}
      style={{ width: w, height: h, borderRadius: rounded, ...style }}
    />
  )
}
