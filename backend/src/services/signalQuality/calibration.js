/**
 * signalQuality/calibration.js
 * ---------------------------------------------------------------------------
 * Ham skoru GERÇEK kazanma olasılığına eşleyen kalibrasyon motoru.
 *
 * Teşhis edilen sorun: Her motor farklı skala kullanıyor (6/10, 7/12, 0..100)
 * ve "güven" değerleri gerçek isabet oranına karşılık gelmiyor. "%70 sinyal"
 * gerçekte %70 kazanmıyor.
 *
 * Çözüm — iki katmanlı Empirical-Bayes + izotonik regresyon:
 *   1) Normalize skor [0..1] → kova (bucket).
 *   2) Her kova için kazanma oranı, namespace havuz ortalamasına doğru
 *      SHRINKAGE ile küçük örnekte stabilize edilir (Beta posterior).
 *   3) Kovalar arası MONOTONLUK PAVA (pool-adjacent-violators) izotonik
 *      regresyon ile zorlanır: daha yüksek skor => daha düşük olmayan olasılık.
 *   4) Beta güven aralığı ve efektif örneklem ile "kalibre mi?" bayrağı.
 *
 * Saf/serileştirilebilir: fs YOK. Disk kalıcılığı için serialize()/deserialize().
 * Böylece birim testlerde deterministik ve yan etkisizdir.
 */

'use strict';

const DEFAULTS = Object.freeze({
  nBuckets: 10, // [0,1] => 10 kova
  base: 0.5, // hiç veri yokken taban oran
  poolKappa: 12, // havuz oranını tabana çeken sanal örnek
  bucketKappa: 8, // kova oranını havuza çeken sanal örnek
  minEffective: 15, // kalibre sayılması için gereken (total) örnek
  z: 1.645, // ~%90 güven aralığı
  fallbackSlope: 3.6, // veri öncesi lojistik harita eğimi
});

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function bucketIndex(score, nBuckets) {
  const s = clamp(Number(score), 0, 1);
  let b = Math.floor(s * nBuckets);
  if (b >= nBuckets) b = nBuckets - 1;
  if (b < 0) b = 0;
  return b;
}

/** Ağırlıklı izotonik (azalmayan) regresyon — PAVA. */
function isotonicNonDecreasing(y, w) {
  const blocks = [];
  for (let i = 0; i < y.length; i++) {
    let b = { wy: (w[i] || 0) * y[i], w: w[i] || 0, n: 1, mean: y[i] };
    while (blocks.length && blocks[blocks.length - 1].mean > b.mean) {
      const p = blocks.pop();
      const wy = p.wy + b.wy;
      const ww = p.w + b.w;
      const nn = p.n + b.n;
      b = { wy, w: ww, n: nn, mean: ww > 0 ? wy / ww : (p.mean + b.mean) / 2 };
    }
    blocks.push(b);
  }
  const out = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.mean);
  return out;
}

class Calibrator {
  constructor(opts = {}) {
    this.cfg = { ...DEFAULTS, ...opts };
    /** @type {Map<string,{buckets:Array<{wins:number,total:number,rSum:number,rCount:number}>}>} */
    this.ns = new Map();
    this._cache = new Map(); // namespace -> isotonic p[]
  }

  _ensure(namespace) {
    let e = this.ns.get(namespace);
    if (!e) {
      e = {
        buckets: Array.from({ length: this.cfg.nBuckets }, () => ({
          wins: 0,
          total: 0,
          rSum: 0,
          rCount: 0,
        })),
      };
      this.ns.set(namespace, e);
    }
    return e;
  }

  /**
   * Bir sonucu kaydet.
   * @param {string} namespace  motor+strateji+yön (ör. 'cryptoScorer:futures_long')
   * @param {number} score      normalize skor [0..1]
   * @param {boolean|number|{win:boolean,r?:number}} outcome  kazandı mı / R getiri
   */
  record(namespace, score, outcome) {
    const e = this._ensure(namespace);
    const b = e.buckets[bucketIndex(score, this.cfg.nBuckets)];
    let won;
    let r = null;
    if (typeof outcome === 'boolean') won = outcome;
    else if (typeof outcome === 'number') {
      r = outcome;
      won = outcome > 0;
    } else if (outcome && typeof outcome === 'object') {
      won = !!outcome.win;
      if (typeof outcome.r === 'number') r = outcome.r;
    } else {
      throw new Error('record: geçersiz outcome');
    }
    b.total += 1;
    if (won) b.wins += 1;
    if (r !== null) {
      b.rSum += r;
      b.rCount += 1;
    }
    this._cache.delete(namespace);
    return this;
  }

  /** Namespace havuz ortalaması (tabana shrink edilmiş). */
  _poolMean(e) {
    let w = 0;
    let t = 0;
    for (const b of e.buckets) {
      w += b.wins;
      t += b.total;
    }
    const { poolKappa, base } = this.cfg;
    return { mean: (w + poolKappa * base) / (t + poolKappa), total: t };
  }

  /** Her kova için shrink edilmiş oran, sonra izotonik. Sonuç cache'lenir. */
  _fit(namespace) {
    if (this._cache.has(namespace)) return this._cache.get(namespace);
    const e = this.ns.get(namespace);
    if (!e) return null;
    const { bucketKappa } = this.cfg;
    const pool = this._poolMean(e);
    const shrunk = e.buckets.map((b) => (b.wins + bucketKappa * pool.mean) / (b.total + bucketKappa));
    const weights = e.buckets.map((b) => b.total + bucketKappa);
    const iso = isotonicNonDecreasing(shrunk, weights);
    const fitted = { iso, shrunk, weights, pool };
    this._cache.set(namespace, fitted);
    return fitted;
  }

  /**
   * Kalibre olasılık + güven aralığı.
   * @returns {{p:number, lo:number, hi:number, n:number, effectiveN:number,
   *            calibrated:boolean, source:'isotonic'|'fallback', bucket:number,
   *            prior:number}}
   */
  probability(namespace, score) {
    const e = this.ns.get(namespace);
    const bi = bucketIndex(score, this.cfg.nBuckets);
    if (!e) {
      return {
        p: this.fallbackProbability(score),
        lo: null,
        hi: null,
        n: 0,
        effectiveN: 0,
        calibrated: false,
        source: 'fallback',
        bucket: bi,
        prior: this.cfg.base,
      };
    }
    const fit = this._fit(namespace);
    const b = e.buckets[bi];
    const p = fit.iso[bi];

    // Beta parametreleri (shrink edilmiş) — güven aralığı için
    const alpha = b.wins + this.cfg.bucketKappa * fit.pool.mean;
    const beta = b.total - b.wins + this.cfg.bucketKappa * (1 - fit.pool.mean);
    const a = Math.max(alpha, 1e-6);
    const bt = Math.max(beta, 1e-6);
    const mean = a / (a + bt);
    const variance = (a * bt) / ((a + bt) * (a + bt) * (a + bt + 1));
    const sd = Math.sqrt(variance);
    const lo = clamp(mean - this.cfg.z * sd, 0, 1);
    const hi = clamp(mean + this.cfg.z * sd, 0, 1);

    const calibrated = b.total >= this.cfg.minEffective;
    return {
      p: round(p, 4),
      lo: round(lo, 4),
      hi: round(hi, 4),
      n: b.total,
      effectiveN: round(a + bt, 2),
      calibrated,
      source: calibrated ? 'isotonic' : 'isotonic',
      bucket: bi,
      prior: round(fit.pool.mean, 4),
    };
  }

  /** Veri öncesi monoton lojistik harita (0.5 merkezli). */
  fallbackProbability(score) {
    const s = clamp(Number(score), 0, 1);
    const p = 1 / (1 + Math.exp(-this.cfg.fallbackSlope * 2 * (s - 0.5)));
    return round(p, 4);
  }

  /** Ortalama R (varsa) + standart hata. */
  expectancy(namespace) {
    const e = this.ns.get(namespace);
    if (!e) return { avgR: null, n: 0 };
    let sum = 0;
    let cnt = 0;
    let sumSq = 0;
    for (const b of e.buckets) {
      sum += b.rSum;
      cnt += b.rCount;
    }
    if (!cnt) return { avgR: null, n: 0 };
    const avg = sum / cnt;
    // ikinci moment kova-bazlı tutulmadığı için yaklaşık; yalnız izleme amaçlı
    return { avgR: round(avg, 4), n: cnt };
  }

  /**
   * Kalibrasyon hatası ölçütleri (izleme/doğrulama için).
   * Brier: kova-içi sabit tahminle KESİN hesap.
   * ECE: ağırlıklı |ampirik - tahmin|.
   */
  calibrationError(namespace) {
    const e = this.ns.get(namespace);
    if (!e) return { brier: null, ece: null, n: 0 };
    const fit = this._fit(namespace);
    let N = 0;
    let brierSum = 0;
    let eceSum = 0;
    for (let i = 0; i < e.buckets.length; i++) {
      const b = e.buckets[i];
      if (!b.total) continue;
      const p = fit.iso[i];
      const emp = b.wins / b.total;
      brierSum += b.wins * (1 - p) * (1 - p) + (b.total - b.wins) * p * p;
      eceSum += b.total * Math.abs(emp - p);
      N += b.total;
    }
    if (!N) return { brier: null, ece: null, n: 0 };
    return { brier: round(brierSum / N, 5), ece: round(eceSum / N, 5), n: N };
  }

  /** Namespace kova özeti (rapor/panel için). */
  summary(namespace) {
    const e = this.ns.get(namespace);
    if (!e) return null;
    const fit = this._fit(namespace);
    return {
      namespace,
      prior: round(fit.pool.mean, 4),
      totalSamples: fit.pool.total,
      buckets: e.buckets.map((b, i) => ({
        range: [round(i / this.cfg.nBuckets, 2), round((i + 1) / this.cfg.nBuckets, 2)],
        wins: b.wins,
        total: b.total,
        empirical: b.total ? round(b.wins / b.total, 4) : null,
        calibrated: round(fit.iso[i], 4),
      })),
    };
  }

  serialize() {
    return {
      cfg: this.cfg,
      ns: Array.from(this.ns.entries()).map(([k, v]) => [k, v.buckets]),
    };
  }

  static deserialize(obj) {
    const c = new Calibrator(obj && obj.cfg ? obj.cfg : {});
    if (obj && Array.isArray(obj.ns)) {
      for (const [k, buckets] of obj.ns) {
        c.ns.set(k, { buckets });
      }
    }
    return c;
  }
}

function round(x, d = 2) {
  if (x === null || !Number.isFinite(x)) return null;
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}

module.exports = { Calibrator, DEFAULTS, isotonicNonDecreasing, bucketIndex };
