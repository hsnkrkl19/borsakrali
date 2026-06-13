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
  ],
  coverageDirectory: '<rootDir>/coverage',
  clearMocks: true,
  verbose: true,
};
