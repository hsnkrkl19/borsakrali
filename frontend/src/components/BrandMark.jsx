const SIZE_MAP = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
}

export default function BrandMark({ size = 'md', className = '', imageClassName = '' }) {
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md

  return (
    <div className={`relative inline-flex items-center justify-center ${sizeClass} ${className}`.trim()}>
      <img
        src="/icon-512.png"
        alt="Borsa Krali"
        className={`w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] ${imageClassName}`.trim()}
        loading="eager"
        decoding="async"
      />
    </div>
  )
}
