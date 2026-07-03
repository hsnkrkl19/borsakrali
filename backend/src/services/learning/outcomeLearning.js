/**
 * outcomeLearning — JENERİK sonuç-öğrenme çekirdeği (fabrika).
 *
 * Her sinyal sistemi kendi örneğini yaratır: kombo anahtarı sistemin seçimi
 * (forex: enstrüman · mt5: enstrüman:TF · BIST: sembol...). Kapanan işlemlerin
 * R-katsayısı rolling penceriye akar; çekirdek üç kararı verir:
 *
 *   • DEVRE KESİCİ: gerçek modda n >= disableMinN VE son disableWindow işlemde
 *     toplam R <= disableSumR VE PF < disablePf → kombo GÖLGE moduna geçer
 *     (sinyaller sanal izlenir: para/push/köprü YOK).
 *   • GERİ AÇILMA: gölgede n >= enableMinN VE toplam R > 0 VE PF >= enablePf
 *     → gerçeğe döner. Mod değişiminde hedef pencere SIFIRLANIR (taze kanıt).
 *   • RİSK ÇARPANI (opsiyonel, multEnabled): kanıtla x1.5/x1.25/x0.75.
 *
 * Kill-switch: opts.disabledEnv=1 → kararlar ASKIDA (istatistik birikir, eylem yok).
 * Kalıcılık: opts.file (disk) + opsiyonel opts.persist(state) hook'u.
 * Her karar decisions[] denetim kaydına yazılır — kara kutu yok.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_RULES = {
  roll: 40,
  disableWindow: 20, disableMinN: 12, disableSumR: -3, disablePf: 0.85,
  enableMinN: 10, enablePf: 1.05,
  multEnabled: false, multMinN: 15, maxMult: 1.5,
};

function statsOf(list) {
  const rs = list.map((x) => x.r).filter((r) => Number.isFinite(r));
  const n = rs.length;
  const sumR = +rs.reduce((a, b) => a + b, 0).toFixed(2);
  const grossWin = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const pf = grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? 99 : 1);
  const wins = rs.filter((r) => r > 0).length;
  return { n, sumR, pf, wins, winRate: n > 0 ? Math.round((wins / n) * 100) : null };
}

function createLearning(opts) {
  const rules = { ...DEFAULT_RULES, ...(opts.rules || {}) };
  const file = opts.file;
  const disabledEnv = opts.disabledEnv;
  const persistHook = opts.persist || null;

  let state = { version: 1, combos: {}, decisions: [] };
  let loaded = false;

  const disabled = () => !!(disabledEnv && process.env[disabledEnv] === '1');

  function load() {
    if (loaded) return;
    try {
      if (file && fs.existsSync(file)) {
        const p = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (p && p.combos) state = { version: 1, combos: p.combos, decisions: p.decisions || [] };
        loaded = true;                  // okunabilir (veya bozuk-ama-var) dosya → kilitle
      }
      // Dosya YOKSA kilitleme: boot'ta botPersistence.loadAll restore'u bizden
      // SONRA diski doldurabilir — erken boş-latch Supabase state'ini ezerdi.
    } catch (_) { loaded = true; }      // bozuk dosya: üzerine temiz yazılacak
  }
  function reloadFromDisk() { loaded = false; load(); }
  function persist() {
    try {
      if (file) {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = `${file}.tmp`;      // atomik — yarım learning dosyası kalmasın
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
        fs.renameSync(tmp, file);
        loaded = true;
      }
    } catch (_) {}
    try { if (persistHook) persistHook(state); } catch (_) {}
  }
  function comboOf(key) {
    load();
    if (!state.combos[key]) state.combos[key] = { mode: 'real', riskMult: 1, real: [], shadow: [] };
    return state.combos[key];
  }
  function logDecision(key, from, to, reason) {
    state.decisions.push({ t: new Date().toISOString(), combo: key, from, to, reason });
    if (state.decisions.length > 100) state.decisions = state.decisions.slice(-100);
  }
  function decideMult(combo) {
    if (!rules.multEnabled) return 1;
    const s = statsOf(combo.real);
    if (s.n < rules.multMinN) return 1;
    let m = 1;
    if (s.pf >= 1.5 && s.sumR >= 5) m = 1.5;
    else if (s.pf >= 1.2 && s.sumR >= 2) m = 1.25;
    else if (s.pf < 1.0) m = 0.75;
    return Math.min(m, rules.maxMult);
  }

  /** rec: { r, usd, outcome, t, shadow } */
  function recordClose(key, rec) {
    const combo = comboOf(key);
    const kind = rec.shadow ? 'shadow' : 'real';
    combo[kind].push({ r: Number.isFinite(rec.r) ? rec.r : null, usd: rec.usd ?? null, outcome: rec.outcome, t: rec.t || Math.floor(Date.now() / 1000) });
    if (combo[kind].length > rules.roll) combo[kind] = combo[kind].slice(-rules.roll);

    let decision = null;
    if (!disabled()) {
      if (combo.mode === 'real' && kind === 'real') {
        const s = statsOf(combo.real.slice(-rules.disableWindow));
        if (s.n >= rules.disableMinN && s.sumR <= rules.disableSumR && s.pf < rules.disablePf) {
          combo.mode = 'shadow'; combo.shadow = []; combo.riskMult = 1;
          decision = `DEVRE KESİLDİ: son ${s.n} işlem ${s.sumR >= 0 ? '+' : ''}${s.sumR}R, PF ${s.pf} → gölge`;
          logDecision(key, 'real', 'shadow', decision);
        }
      } else if (combo.mode === 'shadow' && kind === 'shadow') {
        const s = statsOf(combo.shadow);
        if (s.n >= rules.enableMinN && s.sumR > 0 && s.pf >= rules.enablePf) {
          combo.mode = 'real'; combo.real = []; combo.riskMult = 1;
          decision = `GERİ AÇILDI: gölgede ${s.n} işlem +${s.sumR}R, PF ${s.pf} → gerçek`;
          logDecision(key, 'shadow', 'real', decision);
        }
      }
      if (combo.mode === 'real' && rules.multEnabled) {
        const m = decideMult(combo);
        if (m !== combo.riskMult) {
          logDecision(key, `x${combo.riskMult}`, `x${m}`, `risk çarpanı (${statsOf(combo.real).n} işlem kanıtı)`);
          combo.riskMult = m;
        }
      }
    }
    persist();
    return decision;
  }

  function modeFor(key) { return disabled() ? 'real' : comboOf(key).mode; }
  function riskMultFor(key) {
    if (disabled()) return 1;
    const c = comboOf(key);
    return c.mode === 'real' ? (c.riskMult || 1) : 1;
  }
  function summary() {
    load();
    const combos = {};
    for (const [k, c] of Object.entries(state.combos)) {
      combos[k] = { mode: c.mode, riskMult: c.riskMult, real: statsOf(c.real), shadow: statsOf(c.shadow) };
    }
    return {
      enabled: !disabled(),
      shadowCombos: Object.entries(combos).filter(([, c]) => c.mode === 'shadow').map(([k]) => k),
      boostedCombos: Object.entries(combos).filter(([, c]) => c.riskMult > 1).map(([k, c]) => `${k} x${c.riskMult}`),
      reducedCombos: Object.entries(combos).filter(([, c]) => c.riskMult < 1).map(([k, c]) => `${k} x${c.riskMult}`),
      combos,
    };
  }
  function recentDecisions(hours = 26) {
    load();
    const cutoff = Date.now() - hours * 3600 * 1000;
    return state.decisions.filter((d) => new Date(d.t).getTime() >= cutoff);
  }
  function _resetForTest() { state = { version: 1, combos: {}, decisions: [] }; loaded = true; }

  return { recordClose, modeFor, riskMultFor, summary, recentDecisions, load, reloadFromDisk, disabled, _resetForTest, RULES: rules };
}

module.exports = { createLearning, statsOf };
