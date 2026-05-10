/**
 * Economic Calendar Service
 * Static TR + US event data, with helpers for cron warnings and date-based lookup.
 *
 * Event shape: { id, country: 'TR'|'US', flag, date: 'YYYY-MM-DD', time: 'HH:mm',
 *                importance: 'high'|'medium'|'low', title, category,
 *                previous, forecast, actual, note }
 */

const ECONOMIC_CALENDAR_2026 = [
  // ─────────────────── OCAK 2026 ───────────────────
  { id:'2601',  country:'US', flag:'🇺🇸', date:'2026-01-07', time:'15:30', importance:'high',   title:'NFP – Aralık 2025',                    category:'İstihdam',       previous:'227K',     forecast:'200K',     actual:'256K',  note:null },
  { id:'2602',  country:'US', flag:'🇺🇸', date:'2026-01-07', time:'15:30', importance:'medium', title:'İşsizlik Oranı – Aralık 2025',         category:'İstihdam',       previous:'%4.2',     forecast:'%4.2',     actual:'%4.1',  note:null },
  { id:'2603',  country:'US', flag:'🇺🇸', date:'2026-01-14', time:'15:30', importance:'high',   title:'CPI – Aralık 2025',                    category:'Enflasyon',      previous:'%2.7',     forecast:'%2.8',     actual:'%2.9',  note:null },
  { id:'2604',  country:'TR', flag:'🇹🇷', date:'2026-01-03', time:'10:00', importance:'high',   title:'TÜFE – Aralık 2025',                   category:'Enflasyon',      previous:'%47.09',   forecast:'%45.0',    actual:'%44.38',note:'Yıllık enflasyon gerilemesi sürüyor.' },
  { id:'2605',  country:'TR', flag:'🇹🇷', date:'2026-01-23', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%47.50',   forecast:'%45.00',   actual:'%45.00',note:null },
  { id:'2606',  country:'US', flag:'🇺🇸', date:'2026-01-29', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%4.50',    forecast:'%4.50',    actual:'%4.50', note:'Sabit tutuldu.' },
  { id:'2607',  country:'US', flag:'🇺🇸', date:'2026-01-30', time:'15:30', importance:'high',   title:'GDP Q3 2025 (İlk Tahmin)',              category:'Büyüme',         previous:'%2.3',     forecast:'%2.5',     actual:'%2.6',  note:null },
  { id:'2608',  country:'US', flag:'🇺🇸', date:'2026-01-16', time:'15:30', importance:'medium', title:'Perakende Satışlar – Aralık 2025',     category:'Tüketim',        previous:'%0.7',     forecast:'%0.5',     actual:'%0.4',  note:null },

  // ─────────────────── ŞUBAT 2026 ───────────────────
  { id:'2609',  country:'US', flag:'🇺🇸', date:'2026-02-06', time:'15:30', importance:'high',   title:'NFP – Ocak 2026',                      category:'İstihdam',       previous:'256K',     forecast:'175K',     actual:'143K',  note:'Beklentinin altında geldi.' },
  { id:'2610',  country:'US', flag:'🇺🇸', date:'2026-02-06', time:'15:30', importance:'medium', title:'İşsizlik Oranı – Ocak 2026',           category:'İstihdam',       previous:'%4.1',     forecast:'%4.1',     actual:'%4.0',  note:null },
  { id:'2611',  country:'TR', flag:'🇹🇷', date:'2026-02-03', time:'10:00', importance:'high',   title:'TÜFE – Ocak 2026',                     category:'Enflasyon',      previous:'%44.38',   forecast:'%42.5',    actual:'%42.12',note:null },
  { id:'2612',  country:'US', flag:'🇺🇸', date:'2026-02-12', time:'15:30', importance:'high',   title:'CPI – Ocak 2026',                      category:'Enflasyon',      previous:'%2.9',     forecast:'%2.8',     actual:'%3.0',  note:'Beklenti üzerinde geldi.' },
  { id:'2613',  country:'TR', flag:'🇹🇷', date:'2026-02-27', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%45.00',   forecast:'%42.50',   actual:'%42.50',note:null },
  { id:'2614',  country:'US', flag:'🇺🇸', date:'2026-02-27', time:'15:30', importance:'high',   title:'PCE Fiyat Endeksi – Ocak 2026',        category:'Enflasyon',      previous:'%2.6',     forecast:'%2.5',     actual:'%2.5',  note:null },

  // ─────────────────── MART 2026 ───────────────────
  { id:'2615',  country:'TR', flag:'🇹🇷', date:'2026-03-03', time:'10:00', importance:'high',   title:'TR İşsizlik Oranı – Ocak 2026',        category:'İstihdam',       previous:'%8.8',     forecast:'%8.5',     actual:'%8.3',  note:'İşsizlik beklentinin altında geldi.' },
  { id:'2616',  country:'TR', flag:'🇹🇷', date:'2026-03-04', time:'10:00', importance:'medium', title:'ÜFE – Şubat 2026',                     category:'Enflasyon',      previous:'%22.41',   forecast:'%21.0',    actual:'%19.87',note:null },
  { id:'2617',  country:'US', flag:'🇺🇸', date:'2026-03-06', time:'15:30', importance:'high',   title:'NFP – Şubat 2026',                     category:'İstihdam',       previous:'256K',     forecast:'165K',     actual:null,    note:null },
  { id:'2618',  country:'US', flag:'🇺🇸', date:'2026-03-06', time:'15:30', importance:'medium', title:'İşsizlik Oranı – Şubat 2026',          category:'İstihdam',       previous:'%4.0',     forecast:'%4.1',     actual:null,    note:null },
  { id:'2619',  country:'US', flag:'🇺🇸', date:'2026-03-10', time:'15:30', importance:'high',   title:'CPI – Şubat 2026',                     category:'Enflasyon',      previous:'%3.0',     forecast:'%2.9',     actual:'%2.8',  note:'Fed için olumlu sinyal.' },
  { id:'2620',  country:'US', flag:'🇺🇸', date:'2026-03-10', time:'15:30', importance:'medium', title:'Çekirdek CPI – Şubat 2026',            category:'Enflasyon',      previous:'%3.3',     forecast:'%3.1',     actual:'%3.1',  note:null },
  { id:'2621',  country:'US', flag:'🇺🇸', date:'2026-03-18', time:'15:30', importance:'high',   title:'PPI – Şubat 2026 (Yıllık)',            category:'Enflasyon',      previous:'%2.9',     forecast:'%2.9',     actual:'%3.4',  note:'Beklentinin üzerinde; enerji fiyatları belirleyici.' },
  { id:'2621b', country:'US', flag:'🇺🇸', date:'2026-03-18', time:'15:30', importance:'medium', title:'PPI – Şubat 2026 (Aylık)',              category:'Enflasyon',      previous:'%0.5',     forecast:'%0.3',     actual:'%0.7',  note:null },
  { id:'2621c', country:'US', flag:'🇺🇸', date:'2026-03-18', time:'15:30', importance:'medium', title:'Çekirdek PPI – Şubat 2026 (Yıllık)',   category:'Enflasyon',      previous:'%3.5',     forecast:'%3.7',     actual:'%3.9',  note:'Beklentinin üzerinde; enflasyon direnci sürüyor.' },
  { id:'2622',  country:'TR', flag:'🇹🇷', date:'2026-03-12', time:'10:00', importance:'medium', title:'Cari Hesap Dengesi – Ocak 2026',       category:'Dış Ticaret',    previous:'-5.4 Mlr $',forecast:'-3.8 Mlr $',actual:'-4.1 Mlr $',note:null },
  { id:'2623',  country:'US', flag:'🇺🇸', date:'2026-03-13', time:'15:30', importance:'medium', title:'Perakende Satışlar – Şubat 2026',      category:'Tüketim',        previous:'+0.7%',    forecast:'+0.6%',    actual:'-0.9%', note:'Beklentilerin oldukça altında.' },
  { id:'2624',  country:'TR', flag:'🇹🇷', date:'2026-03-14', time:'10:00', importance:'high',   title:'TÜFE – Şubat 2026',                    category:'Enflasyon',      previous:'%44.38',   forecast:'%42.5',    actual:'%39.05',note:'Yıllık enflasyon beklentinin altında geldi.' },
  { id:'2625',  country:'TR', flag:'🇹🇷', date:'2026-03-17', time:'10:00', importance:'medium', title:'Cari Hesap Dengesi – Şubat 2026',      category:'Dış Ticaret',    previous:'-4.1 Mlr $',forecast:'-3.5 Mlr $',actual:null,  note:null },
  { id:'2626',  country:'US', flag:'🇺🇸', date:'2026-03-17', time:'15:30', importance:'medium', title:'Empire State Endeksi – Mart 2026',      category:'Sanayi',         previous:'-5.7',     forecast:'-2.0',     actual:null,    note:null },
  { id:'2627',  country:'US', flag:'🇺🇸', date:'2026-03-18', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.75',      forecast:'%3.75',      actual:'%3.75', note:'Fed faizini sabit tuttu. Enflasyon direktifi: %2 hedefine yaklaşılıyor.' },
  { id:'2627b', country:'US', flag:'🇺🇸', date:'2026-03-18', time:'21:00', importance:'high',   title:'FOMC Dot Plot – Faiz Projeksiyonları (SEP)', category:'Merkez Bankası', previous:'%3.0',   forecast:'%3.1',       actual:'%3.1',  note:'Uzun vadeli faiz projeksiyonu: %3.1 (önceki: %3.0). Yıl sonu faiz beklentisi değişmedi.' },
  { id:'2627c', country:'US', flag:'🇺🇸', date:'2026-03-18', time:'21:30', importance:'medium', title:'Powell Basın Toplantısı (FOMC)',         category:'Merkez Bankası', previous:null,         forecast:null,         actual:null,    note:'Fed Başkanı Jerome Powell\'ın FOMC sonrası basın açıklaması.' },
  { id:'2628',  country:'TR', flag:'🇹🇷', date:'2026-03-20', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%42.50',   forecast:'%40.00',   actual:null,    note:'Faiz indirim sürecinin devamı bekleniyor.' },
  { id:'2629',  country:'US', flag:'🇺🇸', date:'2026-03-20', time:'15:30', importance:'medium', title:'İlk İşsizlik Başvuruları (Haftalık)',   category:'İstihdam',       previous:'221K',     forecast:'220K',     actual:null,    note:null },
  { id:'2630',  country:'US', flag:'🇺🇸', date:'2026-03-27', time:'15:30', importance:'high',   title:'GDP Q4 2025 (Nihai Revizyon)',          category:'Büyüme',         previous:'%2.3',     forecast:'%2.4',     actual:null,    note:null },
  { id:'2631',  country:'US', flag:'🇺🇸', date:'2026-03-28', time:'15:30', importance:'high',   title:'PCE Fiyat Endeksi – Şubat 2026',       category:'Enflasyon',      previous:'%2.5',     forecast:'%2.5',     actual:null,    note:"Fed'in tercih ettiği enflasyon göstergesi." },
  { id:'2632',  country:'TR', flag:'🇹🇷', date:'2026-03-31', time:'10:00', importance:'high',   title:'GSYİH Q4 2025 – Türkiye',              category:'Büyüme',         previous:'%2.1',     forecast:'%2.8',     actual:null,    note:null },

  // ─────────────────── NİSAN 2026 ───────────────────
  { id:'2633',  country:'TR', flag:'🇹🇷', date:'2026-04-03', time:'10:00', importance:'high',   title:'TÜFE – Mart 2026',                     category:'Enflasyon',      previous:'%39.05',   forecast:'%38.0',    actual:null,    note:null },
  { id:'2634',  country:'US', flag:'🇺🇸', date:'2026-04-04', time:'15:30', importance:'high',   title:'NFP – Mart 2026',                      category:'İstihdam',       previous:'151K',     forecast:'170K',     actual:null,    note:null },
  { id:'2635',  country:'US', flag:'🇺🇸', date:'2026-04-10', time:'15:30', importance:'high',   title:'CPI – Mart 2026',                      category:'Enflasyon',      previous:'%2.8',     forecast:'%2.7',     actual:null,    note:null },
  { id:'2636',  country:'TR', flag:'🇹🇷', date:'2026-04-17', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%40.00',   forecast:'%37.50',   actual:null,    note:null },
  { id:'2637',  country:'US', flag:'🇺🇸', date:'2026-04-28', time:'14:30', importance:'high',   title:'GDP Q1 2026 (İlk Tahmin)',              category:'Büyüme',         previous:'%2.4',     forecast:'%2.2',     actual:null,    note:null },
  { id:'2638',  country:'US', flag:'🇺🇸', date:'2026-04-30', time:'15:30', importance:'high',   title:'PCE Fiyat Endeksi – Mart 2026',        category:'Enflasyon',      previous:'%2.5',     forecast:'%2.4',     actual:null,    note:null },

  // ─────────────────── MAYIS 2026 ───────────────────
  { id:'2639',  country:'US', flag:'🇺🇸', date:'2026-05-07', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%4.25–4.50',forecast:'%4.00–4.25',actual:null,   note:'Faiz indirimi beklenebilir.' },
  { id:'2640',  country:'TR', flag:'🇹🇷', date:'2026-05-04', time:'10:00', importance:'high',   title:'TÜFE – Nisan 2026',                    category:'Enflasyon',      previous:'%38.0',    forecast:'%36.5',    actual:null,    note:null },
  { id:'2641',  country:'US', flag:'🇺🇸', date:'2026-05-08', time:'15:30', importance:'high',   title:'NFP – Nisan 2026',                     category:'İstihdam',       previous:'170K',     forecast:'165K',     actual:null,    note:null },
  { id:'2642',  country:'TR', flag:'🇹🇷', date:'2026-05-22', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%37.50',   forecast:'%35.00',   actual:null,    note:null },
  { id:'2643',  country:'US', flag:'🇺🇸', date:'2026-05-14', time:'15:30', importance:'high',   title:'CPI – Nisan 2026',                     category:'Enflasyon',      previous:'%2.7',     forecast:'%2.6',     actual:null,    note:null },

  // ─────────────────── HAZİRAN 2026 ───────────────────
  { id:'2644',  country:'US', flag:'🇺🇸', date:'2026-06-05', time:'15:30', importance:'high',   title:'NFP – Mayıs 2026',                     category:'İstihdam',       previous:'165K',     forecast:'160K',     actual:null,    note:null },
  { id:'2645',  country:'TR', flag:'🇹🇷', date:'2026-06-03', time:'10:00', importance:'high',   title:'TÜFE – Mayıs 2026',                    category:'Enflasyon',      previous:'%35.0',    forecast:'%33.0',    actual:null,    note:null },
  { id:'2646',  country:'US', flag:'🇺🇸', date:'2026-06-11', time:'15:30', importance:'high',   title:'CPI – Mayıs 2026',                     category:'Enflasyon',      previous:'%2.6',     forecast:'%2.5',     actual:null,    note:null },
  { id:'2647',  country:'US', flag:'🇺🇸', date:'2026-06-18', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%4.00–4.25',forecast:'%3.75–4.00',actual:null,  note:null },
  { id:'2648',  country:'TR', flag:'🇹🇷', date:'2026-06-19', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%35.00',   forecast:'%32.50',   actual:null,    note:null },

  // ─────────────────── TEMMUZ 2026 ───────────────────
  { id:'2649',  country:'US', flag:'🇺🇸', date:'2026-07-10', time:'15:30', importance:'high',   title:'NFP – Haziran 2026',                   category:'İstihdam',       previous:'160K',     forecast:'155K',     actual:null,    note:null },
  { id:'2650',  country:'TR', flag:'🇹🇷', date:'2026-07-03', time:'10:00', importance:'high',   title:'TÜFE – Haziran 2026',                  category:'Enflasyon',      previous:'%32.5',    forecast:'%30.0',    actual:null,    note:null },
  { id:'2651',  country:'US', flag:'🇺🇸', date:'2026-07-16', time:'15:30', importance:'high',   title:'CPI – Haziran 2026',                   category:'Enflasyon',      previous:'%2.5',     forecast:'%2.4',     actual:null,    note:null },
  { id:'2652',  country:'US', flag:'🇺🇸', date:'2026-07-29', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.75–4.00',forecast:'%3.75–4.00',actual:null,  note:null },
  { id:'2653',  country:'TR', flag:'🇹🇷', date:'2026-07-24', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%32.50',   forecast:'%30.00',   actual:null,    note:null },

  // ─────────────────── AĞUSTOS 2026 ───────────────────
  { id:'2654',  country:'US', flag:'🇺🇸', date:'2026-08-07', time:'15:30', importance:'high',   title:'NFP – Temmuz 2026',                    category:'İstihdam',       previous:'155K',     forecast:'150K',     actual:null,    note:null },
  { id:'2655',  country:'TR', flag:'🇹🇷', date:'2026-08-04', time:'10:00', importance:'high',   title:'TÜFE – Temmuz 2026',                   category:'Enflasyon',      previous:'%30.0',    forecast:'%28.0',    actual:null,    note:null },
  { id:'2656',  country:'US', flag:'🇺🇸', date:'2026-08-13', time:'15:30', importance:'high',   title:'CPI – Temmuz 2026',                    category:'Enflasyon',      previous:'%2.4',     forecast:'%2.3',     actual:null,    note:null },
  { id:'2657',  country:'TR', flag:'🇹🇷', date:'2026-08-21', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%30.00',   forecast:'%27.50',   actual:null,    note:null },

  // ─────────────────── EYLÜL 2026 ───────────────────
  { id:'2658',  country:'US', flag:'🇺🇸', date:'2026-09-04', time:'15:30', importance:'high',   title:'NFP – Ağustos 2026',                   category:'İstihdam',       previous:'150K',     forecast:'148K',     actual:null,    note:null },
  { id:'2659',  country:'TR', flag:'🇹🇷', date:'2026-09-03', time:'10:00', importance:'high',   title:'TÜFE – Ağustos 2026',                  category:'Enflasyon',      previous:'%28.0',    forecast:'%26.0',    actual:null,    note:null },
  { id:'2660',  country:'US', flag:'🇺🇸', date:'2026-09-10', time:'15:30', importance:'high',   title:'CPI – Ağustos 2026',                   category:'Enflasyon',      previous:'%2.3',     forecast:'%2.2',     actual:null,    note:null },
  { id:'2661',  country:'US', flag:'🇺🇸', date:'2026-09-17', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.75–4.00',forecast:'%3.50–3.75',actual:null,  note:null },
  { id:'2662',  country:'TR', flag:'🇹🇷', date:'2026-09-18', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%27.50',   forecast:'%25.00',   actual:null,    note:null },

  // ─────────────────── EKİM 2026 ───────────────────
  { id:'2663',  country:'US', flag:'🇺🇸', date:'2026-10-02', time:'15:30', importance:'high',   title:'NFP – Eylül 2026',                     category:'İstihdam',       previous:'148K',     forecast:'145K',     actual:null,    note:null },
  { id:'2664',  country:'TR', flag:'🇹🇷', date:'2026-10-03', time:'10:00', importance:'high',   title:'TÜFE – Eylül 2026',                    category:'Enflasyon',      previous:'%26.0',    forecast:'%24.0',    actual:null,    note:null },
  { id:'2665',  country:'US', flag:'🇺🇸', date:'2026-10-09', time:'15:30', importance:'high',   title:'CPI – Eylül 2026',                     category:'Enflasyon',      previous:'%2.2',     forecast:'%2.1',     actual:null,    note:null },
  { id:'2666',  country:'US', flag:'🇺🇸', date:'2026-10-29', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.50–3.75',forecast:'%3.50–3.75',actual:null,  note:null },
  { id:'2667',  country:'TR', flag:'🇹🇷', date:'2026-10-23', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%25.00',   forecast:'%22.50',   actual:null,    note:null },

  // ─────────────────── KASIM 2026 ───────────────────
  { id:'2668',  country:'US', flag:'🇺🇸', date:'2026-11-06', time:'15:30', importance:'high',   title:'NFP – Ekim 2026',                      category:'İstihdam',       previous:'145K',     forecast:'143K',     actual:null,    note:null },
  { id:'2669',  country:'TR', flag:'🇹🇷', date:'2026-11-03', time:'10:00', importance:'high',   title:'TÜFE – Ekim 2026',                     category:'Enflasyon',      previous:'%24.0',    forecast:'%22.0',    actual:null,    note:null },
  { id:'2670',  country:'US', flag:'🇺🇸', date:'2026-11-12', time:'15:30', importance:'high',   title:'CPI – Ekim 2026',                      category:'Enflasyon',      previous:'%2.1',     forecast:'%2.0',     actual:null,    note:null },
  { id:'2671',  country:'TR', flag:'🇹🇷', date:'2026-11-20', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%22.50',   forecast:'%20.00',   actual:null,    note:null },

  // ─────────────────── ARALIK 2026 ───────────────────
  { id:'2672',  country:'US', flag:'🇺🇸', date:'2026-12-04', time:'15:30', importance:'high',   title:'NFP – Kasım 2026',                     category:'İstihdam',       previous:'143K',     forecast:'140K',     actual:null,    note:null },
  { id:'2673',  country:'TR', flag:'🇹🇷', date:'2026-12-03', time:'10:00', importance:'high',   title:'TÜFE – Kasım 2026',                    category:'Enflasyon',      previous:'%22.0',    forecast:'%20.0',    actual:null,    note:null },
  { id:'2674',  country:'US', flag:'🇺🇸', date:'2026-12-10', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.50–3.75',forecast:'%3.25–3.50',actual:null,  note:null },
  { id:'2675',  country:'TR', flag:'🇹🇷', date:'2026-12-18', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%20.00',   forecast:'%17.50',   actual:null,    note:null },
  { id:'2676',  country:'US', flag:'🇺🇸', date:'2026-12-11', time:'15:30', importance:'high',   title:'CPI – Kasım 2026',                     category:'Enflasyon',      previous:'%2.0',     forecast:'%1.9',     actual:null,    note:null },
  { id:'2677',  country:'US', flag:'🇺🇸', date:'2026-12-23', time:'15:30', importance:'high',   title:'GDP Q3 2026 (Nihai Revizyon)',          category:'Büyüme',         previous:'%2.0',     forecast:'%2.1',     actual:null,    note:null },
];

function toDateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    return value.length >= 10 ? value.slice(0, 10) : null;
  }
  if (value instanceof Date && !isNaN(value)) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * getEvents — filter static calendar by date range and optional country/importance.
 * @param {string|Date} dateFrom — inclusive lower bound (YYYY-MM-DD or Date)
 * @param {string|Date} dateTo   — inclusive upper bound (YYYY-MM-DD or Date)
 * @param {{country?: 'TR'|'US', importance?: 'high'|'medium'|'low'}} [opts]
 * @returns {Array} matching events sorted by date+time
 */
function getEvents(dateFrom, dateTo, opts = {}) {
  const fromKey = toDateKey(dateFrom);
  const toKey   = toDateKey(dateTo);

  return ECONOMIC_CALENDAR_2026
    .filter(e => {
      if (fromKey && e.date < fromKey) return false;
      if (toKey   && e.date > toKey)   return false;
      if (opts.country    && e.country    !== opts.country)    return false;
      if (opts.importance && e.importance !== opts.importance) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time || '').localeCompare(b.time || '');
    });
}

/**
 * getHighImpactForDate — yalnizca importance:'high' olan TR + US olaylari.
 * Cron uyarisi icin tek gunluk pencere ile cagrilir.
 * @param {string|Date} date
 * @returns {Array} importance:'high' events for that date
 */
function getHighImpactForDate(date) {
  const key = toDateKey(date);
  if (!key) return [];
  return getEvents(key, key, { importance: 'high' });
}

module.exports = {
  ECONOMIC_CALENDAR_2026,
  getEvents,
  getHighImpactForDate,
};
