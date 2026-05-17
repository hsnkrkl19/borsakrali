import Egitim from './Egitim'

// Parça 1 wrapper: /ogren → /egitim alias. Egitim sayfası kendi içinde
// ?tab kullanmıyor, wrapper sadece yeni URL'i destekler.
export default function Ogren() {
  return <Egitim />
}
