/**
 * GOLDEN TESTS — authService saf güvenlik mantığı (D7)
 *   - getUserRole: admin tespiti (hardcoded owner + ADMIN_EMAILS + role passthrough)
 *   - validatePasswordStrength: parola politikası
 * Supabase mock'lanır (require-time createClient'i engelle); test edilen
 * fonksiyonlar saf, Supabase'e dokunmaz.
 */
jest.mock('../../src/lib/supabase', () => ({
  supabaseAdmin: {},
  isSupabaseEnabled: () => false,
}));

const auth = require('../../src/services/authService');

describe('getUserRole — admin yetki tespiti (kritik)', () => {
  test('hardcoded owner e-postası → admin', () => {
    expect(auth.getUserRole({ email: 'hsnkrkl19@gmail.com' })).toBe('admin');
  });
  test('owner e-postası BÜYÜK harf → admin (normalize)', () => {
    expect(auth.getUserRole({ email: 'HSNKRKL19@GMAIL.COM' })).toBe('admin');
  });
  test('owner e-postası ama role=user olsa bile → admin (e-posta önceliği)', () => {
    expect(auth.getUserRole({ email: 'hsnkrkl19@gmail.com', role: 'user' })).toBe('admin');
  });
  test('rastgele kullanıcı → user', () => {
    expect(auth.getUserRole({ email: 'rando@example.com' })).toBe('user');
  });
  test('profile.role=admin passthrough → admin', () => {
    expect(auth.getUserRole({ email: 'rando@example.com', role: 'admin' })).toBe('admin');
  });
  test('rastgele kullanıcı role=user → user', () => {
    expect(auth.getUserRole({ email: 'rando@example.com', role: 'user' })).toBe('user');
  });
  test('user yok → user (güvenli varsayılan)', () => {
    expect(auth.getUserRole(null)).toBe('user');
    expect(auth.getUserRole({})).toBe('user');
  });
});

describe('validatePasswordStrength — parola politikası', () => {
  test('geçerli parola → null (hata yok)', () => {
    expect(auth.validatePasswordStrength('ValidPass1')).toBeNull();
  });
  test('8 karakterden kısa → hata', () => {
    expect(auth.validatePasswordStrength('Aa1')).toMatch(/8 karakter/);
  });
  test('küçük harf yok → hata', () => {
    expect(auth.validatePasswordStrength('ALLUPPER1')).toMatch(/kucuk harf/);
  });
  test('büyük harf yok → hata', () => {
    expect(auth.validatePasswordStrength('alllower1')).toMatch(/buyuk harf/);
  });
  test('rakam yok → hata', () => {
    expect(auth.validatePasswordStrength('NoDigitsHere')).toMatch(/rakam/);
  });
  test('128 karakterden uzun → hata', () => {
    const longPass = 'Aa1' + 'x'.repeat(130);
    expect(auth.validatePasswordStrength(longPass)).toMatch(/128/);
  });
  test('boş/null → hata (en az 8)', () => {
    expect(auth.validatePasswordStrength('')).toMatch(/8 karakter/);
    expect(auth.validatePasswordStrength(null)).toMatch(/8 karakter/);
  });
});
