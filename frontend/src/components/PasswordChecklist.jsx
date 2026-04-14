import { CheckCircle2, Circle } from 'lucide-react'
import { getPasswordChecks } from '../utils/passwordPolicy'

export default function PasswordChecklist({ password }) {
  const checks = getPasswordChecks(password)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {checks.map((check) => (
        <div
          key={check.id}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
            check.passed
              ? 'border-green-500/30 bg-green-500/10 text-green-300'
              : 'border-dark-600 bg-dark-800/60 text-gray-400'
          }`}
        >
          {check.passed ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <Circle className="h-4 w-4 flex-shrink-0" />
          )}
          <span>{check.label}</span>
        </div>
      ))}
    </div>
  )
}
