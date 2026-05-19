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
        src="/logos/app-icon-mark.png?v=7.1"
        alt="Borsa Krali"
        className={`w-full h-full object-contain drop-shadow-[0_2px_10px_rgba(124,58,237,0.3)] ${imageClassName}`.trim()}
        loading="eager"
        decoding="async"
      />
    </div>
  )
}
