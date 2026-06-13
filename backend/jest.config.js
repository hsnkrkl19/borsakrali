/**
 * Jest config — Doğrulama Harness'i (Faz 1, verify-and-fix branch)
 * Yalnızca tests/ altındaki *.test.js dosyalarını çalıştırır; backend kökündeki
 * ad-hoc test_*.js keşif scriptlerini ÇALIŞTIRMAZ (roots ile sınırlandı).
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'src/services/formulaService.js',
    'src/services/fundamentalScoresService.js',
  ],
  coverageDirectory: '<rootDir>/coverage',
  // Kritik finansal modül için ≥%90 kapsam zorunlu (kabul kriteri kilidi).
  // Düşerse `npm test` (CI) kırmızı olur.
  coverageThreshold: {
    './src/services/formulaService.js': { statements: 90, lines: 90, functions: 90 },
  },
  clearMocks: true,
  verbose: true,
};
