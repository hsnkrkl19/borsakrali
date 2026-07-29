/* Altın Botu Panel — vanilla JS, no external dependencies. */
"use strict";

var TOKEN_KEY = "altin_botu_token";

/* ------------------------------------------------------------------ state */
var engineEnabled = false;
var currentConfig = null;
var latestStatus = null;
var strategiesList = [];
var authRequired = false;
var lastEvents = [];
var lastUiLogs = [];
var posMsgTimer = null;

/* in-flight guards so polling requests never stack */
var fastBusy = false;
var slowBusy = false;
var statsBusy = false;

/* ---------------------------------------------------------------- helpers */
function el(id) { return document.getElementById(id); }

function esc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n) {
  var v = Number(n);
  if (n === null || n === undefined || !isFinite(v)) return "—";
  return v.toFixed(2);
}

function fmtSigned(n) {
  var v = Number(n);
  if (n === null || n === undefined || !isFinite(v)) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

function fmtPrice(n) {
  var v = Number(n);
  if (n === null || n === undefined || !isFinite(v) || v === 0) return "—";
  return v.toFixed(2);
}

function fmtTime(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 19).replace("T", " ");
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

function numVal(id, fallback) {
  var v = parseFloat(el(id).value);
  return isNaN(v) ? fallback : v;
}

function intVal(id, fallback) {
  var v = parseInt(el(id).value, 10);
  return isNaN(v) ? fallback : v;
}

/* -------------------------------------------------------------- API layer */
function api(path, opts) {
  opts = opts || {};
  var headers = {};
  var token = localStorage.getItem(TOKEN_KEY);
  /* fetch() rejects header values containing characters above U+00FF
     (e.g. Turkish ş/ğ/İ in the password) — percent-encode the token;
     the server decodes it with urllib.parse.unquote. */
  if (token) headers["X-Auth-Token"] = encodeURIComponent(token);
  var method = opts.method || "GET";
  var init = { method: method, headers: headers };
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timeoutMs = opts.timeout || (method === "GET" ? 6000 : 20000);
  var timeoutId = null;
  if (controller) {
    init.signal = controller.signal;
    timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
  }
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  var request = fetch(path, init).then(function (res) {
    if (res.status === 401) {
      showLogin();
      var authErr = new Error("auth");
      authErr.isAuth = true;
      throw authErr;
    }
    return res.json().catch(function () { return null; }).then(function (data) {
      if (!res.ok) {
        var msg = (data && data.detail) ? data.detail : ("HTTP " + res.status);
        throw new Error(msg);
      }
      return data;
    });
  }).catch(function (err) {
    if (err && err.name === "AbortError") {
      throw new Error("İstek zaman aşımına uğradı; panel kilitlenmeden tekrar kullanılabilir.");
    }
    throw err;
  });
  return request.then(function (data) {
    if (timeoutId) clearTimeout(timeoutId);
    return data;
  }, function (err) {
    if (timeoutId) clearTimeout(timeoutId);
    throw err;
  });
}

/* ------------------------------------------------------------------ login */
function showLogin() {
  authRequired = true;
  el("login-overlay").classList.remove("hidden");
  el("login-password").focus();
}

function hideLogin() {
  authRequired = false;
  el("login-overlay").classList.add("hidden");
  el("login-error").textContent = "";
}

function doLogin() {
  var pw = el("login-password").value;
  var errEl = el("login-error");
  errEl.textContent = "";
  fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pw })
  }).then(function (res) {
    return res.json().catch(function () { return null; });
  }).then(function (data) {
    if (data && data.ok) {
      localStorage.setItem(TOKEN_KEY, pw);
      hideLogin();
      init();
    } else {
      errEl.textContent = "Şifre hatalı.";
    }
  }).catch(function () {
    errEl.textContent = "Sunucuya ulaşılamıyor.";
  });
}

/* ----------------------------------------------------------- status render */
function setEngineButton(enabled) {
  var btn = el("engine-toggle");
  btn.textContent = enabled ? "BOTU DURDUR" : "BOTU BAŞLAT";
  btn.setAttribute("aria-pressed", enabled ? "true" : "false");
  btn.classList.toggle("on", enabled);
  btn.classList.toggle("off", !enabled);
}

function setEngineMessage(text, kind) {
  var box = el("engine-message");
  box.textContent = text || "";
  box.className = "kpi-caption " + (kind === "ok" ? "pnl-pos" : (kind === "err" ? "pnl-neg" : "muted"));
}

function renderReadiness(st) {
  var ready = !!st.trade_ready;
  var enabled = !!st.engine_enabled;
  var blockers = st.trade_blockers || [];
  var card = el("readiness-card");
  card.classList.remove("ready", "blocked", "waiting");
  card.classList.add(ready ? "ready" : "blocked");

  if (ready) {
    el("readiness-title").textContent = "İşlem almaya hazır";
    el("readiness-copy").textContent = "Demo hesap, MT5, risk ve doğrulanmış strateji kapıları açık. Yeni sinyal bekleniyor.";
  } else if (!enabled) {
    el("readiness-title").textContent = "Bot durduruldu";
    el("readiness-copy").textContent = "Aşağıdaki engeller giderildiğinde üstteki Botu Başlat düğmesini kullanın.";
  } else {
    el("readiness-title").textContent = "Bot aktif, işlem koşulu bekleniyor";
    el("readiness-copy").textContent = "Motor çalışıyor ancak yeni emir için aşağıdaki güvenlik koşulları tamamlanmalı.";
  }

  var signalRows = Object.keys(st.last_signals || {}).map(function (key) {
    return st.last_signals[key] || {};
  }).sort(function (a, b) {
    return String(b.time || "").localeCompare(String(a.time || ""));
  });
  var latestSignal = signalRows.length ? signalRows[0] : null;
  var latestReason = latestSignal && latestSignal.reason
    ? ((latestSignal.symbol ? latestSignal.symbol + ": " : "") + latestSignal.reason)
    : "Yeni kapanmış mum ve doğrulanmış strateji sinyali bekleniyor.";

  el("readiness-list").innerHTML = blockers.slice(0, 5).map(function (reason) {
    return "<li>" + esc(reason) + "</li>";
  }).join("");
  el("engine-state-label").textContent = enabled ? "Aktif" : "Durduruldu";
  setEngineMessage(ready ? latestReason : (blockers[0] || "Durum bekleniyor."), ready ? "ok" : "");
  el("last-status-time").textContent = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildLimitText(limit, dailyTotal) {
  var dl = currentConfig && currentConfig.risk ? currentConfig.risk.daily_limit : null;
  var html;
  if (dl && !dl.enabled) {
    html = "Limit: kapalı";
  } else {
    /* limit.limit arrives negative for a loss limit — always show magnitude. */
    var maxLoss = dl ? dl.max_loss : Math.abs((limit && limit.limit) || 0);
    html = "Limit: −" + fmt(maxLoss) + " / kullanılan " + fmtSigned(dailyTotal);
  }
  if (limit && limit.hit) {
    var isProfit = limit.kind === "profit";
    html += ' <span class="limit-hit">LİMİT AŞILDI (' +
      (isProfit ? "kar" : "zarar") + " " + fmt(Math.abs(limit.limit || 0)) + ")</span>";
  }
  return html;
}

function renderStatus(st) {
  latestStatus = st || {};
  engineEnabled = !!st.engine_enabled;
  setEngineButton(engineEnabled);
  renderReadiness(st);
  renderAccountBinding(st);

  var connected = !!st.connected;
  el("conn-dot").className = "dot " + (connected ? "green" : "red");
  var execMode = "MT5 DEMO";
  el("conn-text").textContent = connected ? (execMode === "PAPER" ? "MT5 Veri Bağlı" : "MT5 Bağlı") : "MT5 Bağlı Değil";
  el("exec-mode").textContent = execMode;

  var acc = st.account || {};
  var cur = acc.currency ? " " + acc.currency : "";
  el("acc-login").textContent = acc.login ? (acc.login + "@" + (acc.server || "?")) : "—";
  el("acc-balance").textContent = (acc.balance !== undefined && acc.balance !== null) ? (fmt(acc.balance) + cur) : "—";
  el("acc-equity").textContent = (acc.equity !== undefined && acc.equity !== null) ? (fmt(acc.equity) + cur) : "—";

  // Account-lock warning straight from the server-side guard (single source
  // of truth; also covers the "terminal not authorized" state).
  var guard = st.account_guard || { ok: true, reason: "" };
  var warnEl = el("acc-warning");
  warnEl.classList.toggle("hidden", guard.ok !== false);
  if (guard.ok === false) {
    warnEl.textContent = guard.reason || "YANLIŞ HESAP — İŞLEMLER ENGELLENDİ";
  }

  var daily = st.daily || {};
  var total = Number(daily.total || 0);
  var pnlEl = el("daily-pnl");
  pnlEl.textContent = fmtSigned(total) + cur;
  pnlEl.classList.toggle("pnl-pos", total >= 0);
  pnlEl.classList.toggle("pnl-neg", total < 0);

  el("limit-info").innerHTML = buildLimitText(st.limit || {}, total);

  lastUiLogs = st.ui_logs || [];
  renderEventLog();
}

function connectionLost(err) {
  if (err && err.isAuth) return;
  el("conn-dot").className = "dot red";
  el("conn-text").textContent = "Sunucuya ulaşılamıyor";
  var card = el("readiness-card");
  card.classList.remove("ready", "waiting");
  card.classList.add("blocked");
  el("readiness-title").textContent = "Panel bağlantısı kesildi";
  el("readiness-copy").textContent = "Bot arka planda çalışıyor olabilir; panel yeniden bağlanmayı deniyor.";
  el("readiness-list").innerHTML = "<li>" + esc((err && err.message) || "VPS paneline ulaşılamıyor.") + "</li>";
}

function renderAccountBinding(st) {
  var account = (st && st.account) || {};
  var login = Number(account.login || 0);
  var server = String(account.server || "");
  var mode = String(account.trade_mode_label || "").toLowerCase();
  var locked = currentConfig && currentConfig.mt5 ? currentConfig.mt5 : {};
  var same = login > 0 && Number(locked.login || 0) === login &&
    String(locked.server || "").toLowerCase() === server.toLowerCase();
  var btn = el("bind-current-demo");

  el("locked-demo-account").textContent = Number(locked.login || 0)
    ? (Number(locked.login) + "@" + (String(locked.server || "?") || "?"))
    : "Henüz kilitlenmedi";
  el("current-demo-account").textContent = login
    ? (login + "@" + (server || "?" ) + (mode ? " • " + mode.toUpperCase() : ""))
    : "MT5 hesabı bekleniyor…";
  btn.disabled = !login || mode !== "demo" || same;
  btn.textContent = same ? "Bu Demo Hesabı Zaten Kilitli" : "Bağlı Demo Hesabına Kilitle";
}

function bindCurrentDemoAccount() {
  var account = (latestStatus && latestStatus.account) || {};
  var login = Number(account.login || 0);
  var server = String(account.server || "");
  var mode = String(account.trade_mode_label || "").toLowerCase();
  var btn = el("bind-current-demo");
  var msg = el("account-bind-msg");
  if (!login || !server || mode !== "demo") {
    msg.textContent = "Bağlı hesap MT5 tarafından demo olarak doğrulanamadı.";
    msg.className = "account-bind-msg err";
    return;
  }
  if (!window.confirm(
    login + "@" + server + " hesabı yeni demo kilidi olacak. Motor durdurulacak ve işlem açmadan önce yeniden başlatmanız gerekecek. Devam edilsin mi?"
  )) return;

  btn.disabled = true;
  btn.textContent = "Demo Hesap Doğrulanıyor…";
  msg.textContent = "Motor güvenli durduruluyor ve hesap doğrulanıyor…";
  msg.className = "account-bind-msg";
  var stopFirst = engineEnabled
    ? api("/api/engine/stop", { method: "POST", body: {} })
    : Promise.resolve({ enabled: false });
  stopFirst.then(function () {
    engineEnabled = false;
    setEngineButton(false);
    return api("/api/account/bind_current_demo", { method: "POST", body: {}, timeout: 20000 });
  }).then(function (result) {
    if (result && result.config) populateSettings(result.config);
    msg.textContent = (result && result.message ? result.message : "Demo hesap kilitlendi.") + " Şimdi üstten Botu Başlat düğmesini kullanın.";
    msg.className = "account-bind-msg ok";
    return refreshStatus();
  }).catch(function (err) {
    if (!err.isAuth) {
      msg.textContent = "Hesap kilitlenemedi: " + err.message;
      msg.className = "account-bind-msg err";
    }
    renderAccountBinding(latestStatus || {});
  });
}

/* -------------------------------------------------------------- positions */
function renderPositions(list) {
  var body = el("positions-body");
  var empty = el("positions-empty");
  el("close-all-btn").disabled = !list.length;
  if (!list.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  body.innerHTML = list.map(function (p) {
    var pnl = Number(p.profit || 0) + Number(p.swap || 0);
    var isBuy = p.direction === "buy";
    return "<tr>" +
      '<td class="num">' + esc(p.ticket) + "</td>" +
      "<td>" + esc(p.symbol) + "</td>" +
      '<td><span class="badge ' + (isBuy ? "badge-buy" : "badge-sell") + '">' + (isBuy ? "AL" : "SAT") + "</span></td>" +
      '<td class="num">' + fmt(p.volume) + "</td>" +
      '<td class="num">' + fmtPrice(p.price_open) + "</td>" +
      '<td class="num">' + fmtPrice(p.sl) + "</td>" +
      '<td class="num">' + fmtPrice(p.tp) + "</td>" +
      '<td class="num ' + (pnl >= 0 ? "pnl-pos" : "pnl-neg") + '">' + fmtSigned(pnl) + "</td>" +
      "<td>" + esc(fmtTime(p.time)) + "</td>" +
      '<td><button class="btn btn-danger btn-xs close-pos-btn" data-ticket="' + esc(p.ticket) + '" type="button">Kapat</button></td>' +
      "</tr>";
  }).join("");
}

function showPosMsg(text, ok) {
  var msg = el("positions-msg");
  msg.textContent = text;
  msg.className = "inline-msg " + (ok ? "ok" : "err");
  if (posMsgTimer) clearTimeout(posMsgTimer);
  posMsgTimer = setTimeout(function () {
    msg.textContent = "";
    msg.className = "inline-msg";
  }, 7000);
}

function closeTicket(ticket, btn) {
  btn.disabled = true;
  api("/api/trade/close", { method: "POST", body: { ticket: ticket } })
    .then(function (r) {
      showPosMsg(r && r.message ? r.message : (r && r.ok ? "İşlem kapatıldı." : "Kapatma başarısız."), !!(r && r.ok));
      refreshPositions().catch(function () {});
    })
    .catch(function (e) {
      if (!e.isAuth) showPosMsg("Hata: " + e.message, false);
      btn.disabled = false;
    });
}

function closeAll() {
  if (!window.confirm("Tüm açık işlemler kapatılacak. Emin misiniz?")) return;
  var btn = el("close-all-btn");
  btn.disabled = true;
  api("/api/trade/close_all", { method: "POST", body: {} })
    .then(function (r) {
      var extra = (r && r.errors && r.errors.length) ? (" Hatalar: " + r.errors.join("; ")) : "";
      showPosMsg(((r && r.closed) || 0) + " işlem kapatıldı." + extra, !!(r && r.ok));
    })
    .catch(function (e) {
      if (!e.isAuth) showPosMsg("Hata: " + e.message, false);
    })
    .then(function () {
      btn.disabled = false;
      refreshPositions().catch(function () {});
    });
}

/* ------------------------------------------------------------ manual trade */
function manualTrade(direction) {
  var resEl = el("mt-result");
  var body = { symbol_key: el("mt-symbol").value, direction: direction };

  var lot = el("mt-lot").value.trim();
  if (lot !== "") {
    var lotNum = parseFloat(lot);
    if (isNaN(lotNum) || lotNum <= 0) {
      resEl.textContent = "Lot 0'dan büyük bir sayı olmalıdır.";
      resEl.className = "result-msg err";
      return;
    }
    body.lot = lotNum;
  }
  var sl = el("mt-sl").value.trim();
  if (sl !== "") body.sl_price = parseFloat(sl);
  var tp = el("mt-tp").value.trim();
  if (tp !== "") body.tp_price = parseFloat(tp);

  var buyBtn = el("mt-buy");
  var sellBtn = el("mt-sell");
  buyBtn.disabled = true;
  sellBtn.disabled = true;
  resEl.textContent = "Emir gönderiliyor…";
  resEl.className = "result-msg";

  api("/api/trade/open", { method: "POST", body: body })
    .then(function (r) {
      resEl.textContent = (r && r.message) ? r.message : ((r && r.ok) ? "Emir gönderildi." : "Emir başarısız.");
      resEl.className = "result-msg " + ((r && r.ok) ? "ok" : "err");
      refreshPositions().catch(function () {});
    })
    .catch(function (e) {
      if (!e.isAuth) {
        resEl.textContent = "Hata: " + e.message;
        resEl.className = "result-msg err";
      }
    })
    .then(function () {
      buyBtn.disabled = false;
      sellBtn.disabled = false;
    });
}

/* ---------------------------------------------------------------- trades */
function renderTrades(trades) {
  var body = el("trades-body");
  var empty = el("trades-empty");
  if (!trades.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  body.innerHTML = trades.map(function (t) {
    var closed = t.status === "closed";
    var pnl = Number(t.profit || 0);
    var isBuy = t.direction === "buy";
    return "<tr>" +
      '<td class="num">' + esc(t.position_id) + "</td>" +
      "<td>" + esc(t.symbol) + "</td>" +
      '<td><span class="badge ' + (isBuy ? "badge-buy" : "badge-sell") + '">' + (isBuy ? "AL" : "SAT") + "</span></td>" +
      '<td class="num">' + fmt(t.volume) + "</td>" +
      "<td>" + esc(fmtTime(t.open_time)) + "</td>" +
      '<td class="num">' + fmtPrice(t.open_price) + "</td>" +
      "<td>" + (closed ? esc(fmtTime(t.close_time)) : "—") + "</td>" +
      '<td class="num">' + (closed ? fmtPrice(t.close_price) : "—") + "</td>" +
      '<td class="num ' + (closed ? (pnl >= 0 ? "pnl-pos" : "pnl-neg") : "") + '">' + (closed ? fmtSigned(pnl) : "—") + "</td>" +
      "<td>" + esc(t.strategy || "—") + "</td>" +
      '<td><span class="status-badge ' + (closed ? "st-closed" : "st-open") + '">' + (closed ? "Kapalı" : "Açık") + "</span></td>" +
      "</tr>";
  }).join("");
}

/* ----------------------------------------------------------------- stats */
function renderStats(s) {
  if (!s) return;
  var total = Number(s.total || 0);
  el("stat-total").textContent = String(total);
  var winRate = total > 0 ? (Number(s.wins || 0) / total) * 100 : 0;
  el("stat-winrate").textContent = "%" + winRate.toFixed(1);
  var pf = Number(s.profit_factor);
  el("stat-pf").textContent = isFinite(pf) ? pf.toFixed(2) : "—";
  var tp = Number(s.total_profit || 0);
  var tpEl = el("stat-profit");
  tpEl.textContent = fmtSigned(tp);
  tpEl.className = "num " + (tp >= 0 ? "pnl-pos" : "pnl-neg");
}

/* ------------------------------------------------------------- event log */
function tagClass(tag) {
  tag = String(tag || "").toLowerCase();
  if (tag === "error" || tag === "critical") return "error";
  if (tag === "warning" || tag === "warn" || tag === "limit") return "warn";
  if (tag === "order" || tag === "signal") return "action";
  return "info";
}

function renderEventLog() {
  var items = [];
  var i;
  for (i = 0; i < lastEvents.length; i++) {
    items.push({ time: lastEvents[i].time, tag: lastEvents[i].kind || "info", msg: lastEvents[i].message });
  }
  for (i = 0; i < lastUiLogs.length; i++) {
    items.push({ time: lastUiLogs[i].time, tag: lastUiLogs[i].level || "info", msg: lastUiLogs[i].msg });
  }
  items.sort(function (a, b) {
    return String(b.time || "").localeCompare(String(a.time || ""));
  });
  items = items.slice(0, 80);
  var box = el("events-list");
  if (!items.length) {
    box.innerHTML = '<div class="empty">Henüz olay yok</div>';
    return;
  }
  box.innerHTML = items.map(function (it) {
    return '<div class="event-row">' +
      '<span class="ev-time num">' + esc(fmtTime(it.time)) + "</span>" +
      '<span class="ev-tag tag-' + tagClass(it.tag) + '">' + esc(it.tag) + "</span>" +
      '<span class="ev-msg">' + esc(it.msg) + "</span>" +
      "</div>";
  }).join("");
}

/* ----------------------------------------------------------------- learn */
function runLearn() {
  var btn = el("learn-btn");
  var box = el("learn-results");
  btn.disabled = true;
  box.innerHTML = '<div class="empty">Analiz ediliyor…</div>';
  api("/api/learn")
    .then(function (r) {
      var parts = [];
      if (r && r.generated_at) {
        parts.push('<div class="muted small">Oluşturulma: ' + esc(fmtTime(r.generated_at)) + "</div>");
      }
      var sugs = (r && r.suggestions) || [];
      if (!sugs.length) {
        parts.push('<div class="empty">Öneri bulunamadı.</div>');
      }
      for (var i = 0; i < sugs.length; i++) {
        var s = sugs[i];
        var sev = (s.severity === "high" || s.severity === "medium") ? s.severity : "info";
        var sevText = sev === "high" ? "YÜKSEK" : (sev === "medium" ? "ORTA" : "BİLGİ");
        parts.push('<div class="suggestion"><span class="sev sev-' + sev + '">' + sevText + "</span><span>" + esc(s.text) + "</span></div>");
      }
      if (r && r.proposed_params && Object.keys(r.proposed_params).length) {
        parts.push('<div class="muted small" style="margin-top:10px">Önerilen ayarlar:</div>');
        parts.push('<pre class="params-pre">' + esc(JSON.stringify(r.proposed_params, null, 2)) + "</pre>");
      }
      box.innerHTML = parts.join("");
    })
    .catch(function (e) {
      if (!e.isAuth) box.innerHTML = '<div class="result-msg err">Analiz başarısız: ' + esc(e.message) + "</div>";
    })
    .then(function () { btn.disabled = false; });
}

/* ------------------------------------------------------------- research */
function renderResearch(status, latest) {
  var statusEl = el("research-status");
  var running = !!(status && status.running);
  var runBtn = el("research-run-btn");
  runBtn.disabled = running;
  runBtn.textContent = running ? "Araştırma Çalışıyor" : "Araştırmayı Başlat";
  statusEl.textContent = running
    ? "Araştırma çalışıyor; MT5 geçmiş verisi ve walk-forward fold'ları işleniyor…"
    : ((status && status.last_error)
      ? ("Son araştırma hatası: " + status.last_error)
      : ("Son çalışma: " + fmtTime((status && status.last_finished) || (latest && latest.generated_at))));
  statusEl.className = "research-status " + ((status && status.last_error) ? "err" : (running ? "" : "ok"));
  var rows = (latest && latest.candidates) || [];
  var body = el("research-body");
  var empty = el("research-empty");
  if (!rows.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  body.innerHTML = rows.map(function (row) {
    var pass = !!(row.gates && row.gates.all_pass);
    var fold = row.fold_summary || {};
    var hold = row.holdout_metrics || {};
    var stress = row.double_spread_metrics || {};
    var actions = pass
      ? '<button class="btn btn-primary btn-sm research-approve" data-symbol="' + esc(row.symbol_key) + '" data-strategy="' + esc(row.strategy) + '">Onayla</button>'
      : '<span class="muted">Kapılar geçilmedi</span>';
    actions += ' <button class="btn btn-sm research-rollback" data-symbol="' + esc(row.symbol_key) + '">Rollback</button>';
    return "<tr>" +
      "<td>" + esc(row.symbol) + "</td>" +
      "<td>" + esc(row.strategy) + "</td>" +
      '<td class="num">' + esc(fold.count || 0) + "</td>" +
      '<td class="num">' + esc(fold.total_oos_trades || 0) + "</td>" +
      '<td class="num">' + Number(hold.profit_factor || 0).toFixed(2) + "</td>" +
      '<td class="num">%' + Number(hold.total_return_pct || 0).toFixed(2) + "</td>" +
      '<td class="num">%' + Number(stress.total_return_pct || 0).toFixed(2) + "</td>" +
      '<td><span class="status-badge ' + (pass ? "st-open" : "st-closed") + '">' + (pass ? "ONAYA HAZIR" : "RED") + "</span></td>" +
      "<td>" + actions + "</td></tr>";
  }).join("");
}

function refreshResearch() {
  return Promise.all([api("/api/research/status"), api("/api/research/latest")])
    .then(function (results) { renderResearch(results[0] || {}, results[1] || {}); });
}

function runResearch() {
  var btn = el("research-run-btn");
  btn.disabled = true;
  btn.textContent = "Sıraya Alınıyor…";
  api("/api/research/run", { method: "POST", body: {} })
    .then(function () { return refreshResearch(); })
    .catch(function (e) {
      if (!e.isAuth) showPosMsg("Araştırma başlatılamadı: " + e.message, false);
      btn.disabled = false;
      btn.textContent = "Araştırmayı Başlat";
    });
}

function approveResearch(symbolKey, strategyName) {
  var reviewer = window.prompt("Onaylayan kişi/ad:", "");
  if (!reviewer) return;
  if (!window.confirm(symbolKey + "/" + strategyName + " yalnızca MT5 DEMO champion olacak. Onaylıyor musunuz?")) return;
  api("/api/research/approve", { method: "POST", body: { symbol_key: symbolKey, strategy: strategyName, reviewer: reviewer } })
    .then(function () { showPosMsg("MT5 DEMO champion onaylandı.", true); return refreshResearch(); })
    .catch(function (e) { if (!e.isAuth) showPosMsg("Onay başarısız: " + e.message, false); });
}

function rollbackResearch(symbolKey) {
  var reviewer = window.prompt("Rollback yapan kişi/ad:", "");
  if (!reviewer) return;
  var reason = window.prompt("Rollback nedeni:", "performans bozulması");
  if (!reason) return;
  api("/api/research/rollback", { method: "POST", body: { symbol_key: symbolKey, reviewer: reviewer, reason: reason } })
    .then(function () { showPosMsg("Önceki champion geri getirildi.", true); return refreshResearch(); })
    .catch(function (e) { if (!e.isAuth) showPosMsg("Rollback başarısız: " + e.message, false); });
}

/* -------------------------------------------------------------- settings */
function buildStrategySelect(active) {
  var sel = el("set-strategy");
  if (!strategiesList.length) {
    sel.innerHTML = '<option value="' + esc(active) + '">' + esc(active) + "</option>";
    return;
  }
  sel.innerHTML = strategiesList.map(function (s) {
    return '<option value="' + esc(s.name) + '"' + (s.name === active ? " selected" : "") + ">" +
      esc(s.display_name || s.name) + "</option>";
  }).join("");
}

function strategyNamesForSymbol(cfg, symbolKey, fallback) {
  var assignments = cfg && cfg.strategy ? (cfg.strategy.assignments || {}) : {};
  var raw = assignments[symbolKey];
  var names = [];
  if (Array.isArray(raw)) {
    names = raw.slice();
  } else if (raw) {
    names = [raw];
  } else if (fallback) {
    names = [fallback];
  }
  var seen = {};
  return names.map(String).filter(function (name) {
    if (!name || seen[name]) return false;
    seen[name] = true;
    return true;
  });
}

function buildStrategyOptions(selected) {
  var box = el("strategy-options");
  var selectedMap = {};
  (selected || []).forEach(function (name) { selectedMap[name] = true; });
  var options = strategiesList.filter(function (s) {
    return !s.symbols || s.symbols.indexOf("gold") !== -1;
  });
  if (!options.length) {
    box.innerHTML = '<div class="muted small">Strateji bulunamadı.</div>';
    return;
  }
  box.innerHTML = options.map(function (s) {
    var checked = selectedMap[s.name] ? " checked" : "";
    var desc = (s.description || "").slice(0, 120);
    return '<label class="strategy-option">' +
      '<input type="checkbox" class="strategy-choice" value="' + esc(s.name) + '"' + checked + ">" +
      '<span><strong>' + esc(s.display_name || s.name) + "</strong>" +
      '<span>' + esc(desc) + "</span></span>" +
      "</label>";
  }).join("");
}

function selectedStrategyNames() {
  var inputs = document.querySelectorAll("#strategy-options .strategy-choice:checked");
  var names = [];
  for (var i = 0; i < inputs.length; i++) names.push(inputs[i].value);
  if (!names.length) names.push(el("set-strategy").value || "gold_trend");
  return names;
}

function findStrategy(name) {
  for (var i = 0; i < strategiesList.length; i++) {
    if (strategiesList[i].name === name) return strategiesList[i];
  }
  return null;
}

function renderStrategyParams(name) {
  var box = el("strategy-params");
  var meta = findStrategy(name);
  var defaults = (meta && meta.default_params) || {};
  var overrides = {};
  if (currentConfig && currentConfig.strategy && currentConfig.strategy.params &&
      currentConfig.strategy.params[name]) {
    overrides = currentConfig.strategy.params[name];
  }
  el("strategy-desc").textContent = (meta && meta.description) || "";
  var keys = Object.keys(defaults);
  if (!keys.length) {
    box.innerHTML = '<div class="muted small">Bu stratejinin ayarlanabilir parametresi yok.</div>';
    return;
  }
  box.innerHTML = keys.map(function (k) {
    var defVal = defaults[k];
    var val = overrides[k] !== undefined ? overrides[k] : defVal;
    if (typeof defVal === "boolean") {
      return '<label class="check"><input type="checkbox" class="sp-input" data-key="' + esc(k) + '"' +
        (val ? " checked" : "") + "> " + esc(k) + "</label>";
    }
    var inputType = typeof defVal === "number" ? "number" : "text";
    return "<label>" + esc(k) +
      '<input type="' + inputType + '" step="any" class="sp-input" data-key="' + esc(k) + '" value="' + esc(val) + '"></label>';
  }).join("");
}

function collectStrategyParams(name) {
  var meta = findStrategy(name);
  var defaults = (meta && meta.default_params) || {};
  var out = {};
  var inputs = document.querySelectorAll("#strategy-params .sp-input");
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var k = inp.getAttribute("data-key");
    var defVal = defaults[k];
    if (typeof defVal === "boolean") {
      out[k] = inp.checked;
    } else if (typeof defVal === "number") {
      var v = parseFloat(inp.value);
      out[k] = isNaN(v) ? defVal : v;
    } else {
      out[k] = inp.value;
    }
  }
  return out;
}

function populateSettings(cfg) {
  currentConfig = cfg || {};
  var risk = currentConfig.risk || {};
  var dl = risk.daily_limit || {};
  var trade = currentConfig.trade || {};
  var syms = currentConfig.symbols || {};
  var enabled = syms.enabled || {};
  var account = currentConfig.account || {};
  var execution = currentConfig.execution || {};
  var paper = execution.paper || {};

  var mode = risk.lot_mode === "manual" ? "manual" : "auto";
  var radio = document.querySelector('input[name="lot-mode"][value="' + mode + '"]');
  if (radio) radio.checked = true;

  el("set-manual-lot").value = risk.manual_lot !== undefined ? risk.manual_lot : 0.01;
  el("set-size-override").value = account.size_override !== undefined ? account.size_override : 0;
  el("set-risk-percent").value = risk.risk_percent !== undefined ? risk.risk_percent : 1.0;
  el("set-sl-points").value = trade.default_sl_points !== undefined ? trade.default_sl_points : 3000;
  el("set-tp-points").value = trade.default_tp_points !== undefined ? trade.default_tp_points : 5000;
  el("set-max-open").value = risk.max_open_positions !== undefined ? risk.max_open_positions : 2;
  el("set-max-per-symbol").value = risk.max_positions_per_symbol !== undefined ? risk.max_positions_per_symbol : 1;
  el("set-dl-enabled").checked = !!dl.enabled;
  el("set-dl-maxloss").value = dl.max_loss !== undefined ? dl.max_loss : 100;
  el("set-dl-maxprofit").value = dl.max_profit !== undefined ? dl.max_profit : 0;
  el("set-dl-action").value = dl.action || "close_all_stop";
  el("set-sym-gold").checked = enabled.gold !== false;
  el("set-sym-btc").checked = enabled.btc !== false;
  el("set-exec-mode").value = "mt5";
  el("set-paper-balance").value = paper.balance !== undefined ? paper.balance : 10000;
  el("set-require-demo").checked = execution.require_demo_account !== false;

  var active = (currentConfig.strategy && currentConfig.strategy.active) || "trend_momentum";
  var selected = strategyNamesForSymbol(currentConfig, "gold", active);
  if (selected.length && selected.indexOf(active) === -1) active = selected[0];
  el("set-allow-unverified").checked = false;
  buildStrategySelect(active);
  buildStrategyOptions(selected);
  renderStrategyParams(active);
  if (latestStatus) renderAccountBinding(latestStatus);
}

function saveSettings() {
  var btn = el("settings-save");
  var msg = el("settings-msg");
  var modeInput = document.querySelector('input[name="lot-mode"]:checked');
  var selectedStrategies = selectedStrategyNames();
  var active = selectedStrategies[0] || el("set-strategy").value || "trend_momentum";
  var existingAssignments = (
    currentConfig && currentConfig.strategy && currentConfig.strategy.assignments
  ) ? currentConfig.strategy.assignments : {};

  var partial = {
    account: {
      size_override: numVal("set-size-override", 0)
    },
    risk: {
      lot_mode: modeInput ? modeInput.value : "auto",
      manual_lot: numVal("set-manual-lot", 0.01),
      risk_percent: numVal("set-risk-percent", 1.0),
      max_open_positions: intVal("set-max-open", 2),
      max_positions_per_symbol: intVal("set-max-per-symbol", 1),
      daily_limit: {
        enabled: el("set-dl-enabled").checked,
        max_loss: numVal("set-dl-maxloss", 100),
        max_profit: numVal("set-dl-maxprofit", 0),
        action: el("set-dl-action").value
      }
    },
    trade: {
      default_sl_points: numVal("set-sl-points", 3000),
      default_tp_points: numVal("set-tp-points", 5000)
    },
    symbols: {
      enabled: {
        gold: el("set-sym-gold").checked,
        btc: el("set-sym-btc").checked
      }
    },
    execution: {
      mode: "mt5",
      require_demo_account: el("set-require-demo").checked,
      paper: {
        balance: numVal("set-paper-balance", 10000),
        currency: "USD",
        auto_close_sl_tp: true
      }
    },
    strategy: {
      active: active,
      allow_unverified: false,
      assignments: Object.assign({}, existingAssignments, { gold: selectedStrategies }),
      params: {}
    }
  };
  partial.strategy.params[active] = collectStrategyParams(active);

  btn.disabled = true;
  msg.textContent = "Kaydediliyor…";
  msg.className = "save-msg";

  api("/api/config", { method: "POST", body: partial })
    .then(function (newCfg) {
      populateSettings(newCfg);
      msg.textContent = "Ayarlar kaydedildi.";
      msg.className = "save-msg ok";
      setTimeout(function () {
        if (msg.className.indexOf("ok") !== -1) {
          msg.textContent = "";
          msg.className = "save-msg";
        }
      }, 4000);
    })
    .catch(function (e) {
      if (!e.isAuth) {
        msg.textContent = "Kaydetme hatası: " + e.message;
        msg.className = "save-msg err";
      }
    })
    .then(function () { btn.disabled = false; });
}

/* ---------------------------------------------------------- engine toggle */
function toggleEngine() {
  var btn = el("engine-toggle");
  btn.disabled = true;
  btn.textContent = "KONTROL EDİLİYOR…";
  setEngineMessage(engineEnabled ? "Motor durduruluyor…" : "Motor etkinleştiriliyor…", "");
  api(engineEnabled ? "/api/engine/stop" : "/api/engine/start", { method: "POST", body: {} })
    .then(function (r) {
      engineEnabled = !!(r && r.enabled);
      setEngineButton(engineEnabled);
      setEngineMessage(engineEnabled ? "Motor aktif; güvenlik koşulları kontrol ediliyor." : "Motor güvenli biçimde durduruldu.", engineEnabled ? "ok" : "");
      return refreshStatus();
    })
    .catch(function (e) {
      setEngineButton(engineEnabled);
      if (!e.isAuth) setEngineMessage("Başlatma hatası: " + e.message, "err");
    })
    .then(function () { btn.disabled = false; });
}

/* ---------------------------------------------------------------- polling */
function refreshStatus() {
  return api("/api/status").then(renderStatus);
}

function refreshPositions() {
  return api("/api/positions").then(function (pos) {
    renderPositions(pos || []);
  });
}

function fastTick() {
  if (fastBusy || authRequired) return;
  fastBusy = true;
  Promise.all([refreshStatus(), refreshPositions()])
    .catch(connectionLost)
    .then(function () { fastBusy = false; });
}

function slowTick() {
  if (slowBusy || authRequired) return;
  slowBusy = true;
  Promise.all([api("/api/trades?limit=100"), api("/api/events?limit=100")])
    .then(function (results) {
      renderTrades(results[0] || []);
      lastEvents = results[1] || [];
      renderEventLog();
    })
    .catch(function () {})
    .then(function () { slowBusy = false; });
}

function statsTick() {
  if (statsBusy || authRequired) return;
  statsBusy = true;
  api("/api/stats")
    .then(renderStats)
    .catch(function () {})
    .then(function () { statsBusy = false; });
}

/* ------------------------------------------------------------------- init */
function init() {
  api("/api/strategies")
    .then(function (list) {
      strategiesList = list || [];
      return api("/api/config");
    })
    .then(function (cfg) {
      populateSettings(cfg);
    })
    .catch(function () {})
    .then(function () {
      if (!authRequired) {
        fastTick();
        slowTick();
        statsTick();
        refreshResearch().catch(function () {});
      }
    });
}

function bindEvents() {
  el("login-btn").addEventListener("click", doLogin);
  el("login-password").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") doLogin();
  });

  el("engine-toggle").addEventListener("click", toggleEngine);
  el("close-all-btn").addEventListener("click", closeAll);

  el("positions-body").addEventListener("click", function (ev) {
    var btn = ev.target.closest ? ev.target.closest(".close-pos-btn") : null;
    if (!btn) return;
    closeTicket(Number(btn.getAttribute("data-ticket")), btn);
  });

  el("mt-buy").addEventListener("click", function () { manualTrade("buy"); });
  el("mt-sell").addEventListener("click", function () { manualTrade("sell"); });

  el("set-strategy").addEventListener("change", function () {
    renderStrategyParams(el("set-strategy").value);
  });
  el("strategy-options").addEventListener("change", function (ev) {
    var input = ev.target && ev.target.closest ? ev.target.closest(".strategy-choice") : null;
    if (!input || !input.checked) return;
    el("set-strategy").value = input.value;
    renderStrategyParams(input.value);
  });
  el("settings-save").addEventListener("click", saveSettings);
  el("bind-current-demo").addEventListener("click", bindCurrentDemoAccount);
  el("learn-btn").addEventListener("click", runLearn);
  el("research-run-btn").addEventListener("click", runResearch);
  el("research-body").addEventListener("click", function (ev) {
    var approve = ev.target.closest ? ev.target.closest(".research-approve") : null;
    if (approve) {
      approveResearch(approve.getAttribute("data-symbol"), approve.getAttribute("data-strategy"));
      return;
    }
    var rollback = ev.target.closest ? ev.target.closest(".research-rollback") : null;
    if (rollback) rollbackResearch(rollback.getAttribute("data-symbol"));
  });
}

document.addEventListener("DOMContentLoaded", function () {
  bindEvents();
  init();
  setInterval(fastTick, 2000);
  setInterval(slowTick, 10000);
  setInterval(statsTick, 30000);
  setInterval(function () { if (!authRequired) refreshResearch().catch(function () {}); }, 30000);
});
