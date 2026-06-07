import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { resolveSeo } from '../config/seo'

/**
 * Rota bazlı <head> SEO yöneticisi.
 *
 * Her rota değişiminde document.title, meta description ve EN ÖNEMLİSİ
 * <link rel="canonical"> değerini o sayfaya özgü hale getirir. Böylece
 * prerender edilen her sayfa kendi benzersiz başlığı + canonical'ı ile
 * yazılır ve Google onları "ana sayfanın kopyası" sanmaz.
 *
 * react-helmet gibi ek bağımlılık yok — doğrudan DOM güncellenir (hafif).
 * Prerender (Playwright) DOM'u JS çalıştıktan sonra yakaladığı için bu
 * güncellemeler üretilen statik HTML'lere de yansır.
 */

function setMeta(attr, key, value) {
  if (!value) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export default function RouteSeo() {
  const { pathname } = useLocation()

  useEffect(() => {
    const { title, description, canonical } = resolveSeo(pathname)

    if (title) document.title = title
    setCanonical(canonical)
    setMeta('name', 'description', description)

    // Open Graph + Twitter — paylaşım kartları da sayfaya özgü olsun.
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', canonical)
    setMeta('name', 'twitter:title', title)
    setMeta('name', 'twitter:description', description)
  }, [pathname])

  return null
}
