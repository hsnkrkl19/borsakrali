/**
 * X (Twitter) logosu — lucide-react'te yok, brand SVG inline.
 *
 * fill="currentColor" olduğu için renk style.color veya parent'ın
 * currentColor'ı ile gelir; lucide ikonlarıyla aynı API üzerinden
 * (className / style / size) render edilebilir.
 *
 * strokeWidth gibi lucide-only prop'lar sessizce yok sayılır; bu sayede
 * "icon component" yerine geçtiği render yerlerinde özel kod gerekmez.
 */
export default function XLogo({ className, style, size }) {
  const sizeStyle = size != null ? { width: size, height: size, ...style } : style
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={sizeStyle}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
