export function getPasswordChecks(password) {
  const value = password || ''

  return [
    {
      id: 'length',
      label: 'En az 8 karakter',
      passed: value.length >= 8,
    },
    {
      id: 'lowercase',
      label: 'En az 1 kucuk harf',
      passed: /[a-z]/.test(value),
    },
    {
      id: 'uppercase',
      label: 'En az 1 buyuk harf',
      passed: /[A-Z]/.test(value),
    },
    {
      id: 'number',
      label: 'En az 1 rakam',
      passed: /\d/.test(value),
    },
  ]
}

export function isPasswordValid(password) {
  return getPasswordChecks(password).every((check) => check.passed)
}
