#!/usr/bin/env node
/**
 * signalQuality izleme raporu — sunucuda periyodik çalıştır.
 *   node scripts/signalQuality_monitor.js
 * Cron örneği (haftalık, Pazartesi 08:00):
 *   0 8 * * 1  cd /path/to/backend && node scripts/signalQuality_monitor.js >> logs/sq-monitor.log 2>&1
 */
'use strict';
try {
  require('../src/services/signalQuality/monitor').printReport();
} catch (e) {
  console.error('signalQuality monitor hatası:', e && e.message);
}
