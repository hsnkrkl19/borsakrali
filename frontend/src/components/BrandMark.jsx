const SIZE_MAP = {
  sm: 'w-8 h-8 p-1',
  md: 'w-10 h-10 p-1.5',
  lg: 'w-12 h-12 p-1.5',
}

export default function BrandMark({ size = 'md', className = '', imageClassName = '' }) {
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md

  return (
    <div
      className={`rounded-2xl border border-gold-500/25 bg-white shadow-sm shadow-amber-500/10 ${sizeClass} ${className}`.trim()}
    >
      <img
        src="/logo-borsakrali.svg"
        alt="Borsa Krali"
        className={`w-full h-full object-cover rounded-xl ${imageClassName}`.trim()}
      />
    </div>
  )
}
