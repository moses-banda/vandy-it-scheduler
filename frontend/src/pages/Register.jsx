import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../services/api'

const FIELDS = [
  { key: 'name',     label: 'Full Name',          type: 'text',     placeholder: 'Jane Smith',            required: true },
  { key: 'email',    label: 'Email',              type: 'email',    placeholder: 'you@vanderbilt.edu',     required: true },
  { key: 'phone',    label: 'Phone (optional)',   type: 'tel',      placeholder: '(615) 000-0000',         required: false },
  { key: 'password', label: 'Password',           type: 'password', placeholder: '••••••••',               required: true },
]

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'worker', invite_code: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/register', form)
      setSuccess(true)
      setTimeout(() => navigate('/login'), 1800)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Registration failed. Check your invite code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Brand header */}
      <div className="bg-blue-700 px-6 pt-14 pb-14 text-white flex-shrink-0">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-blue-200 text-sm mb-6 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
          </svg>
          Back to sign in
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Create account</h1>
        <p className="text-blue-200 text-sm mt-1">You'll need an invite code from your manager</p>
      </div>

      {/* Card */}
      <div className="px-5 -mt-6 pb-8 flex-1">
        <div className="bg-white rounded-2xl shadow-lg p-6">

          {success && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-100 text-green-700 px-4 py-3 rounded-xl text-sm mb-5">
              <span className="text-xl">✓</span>
              <span className="font-medium">Account created! Redirecting to sign in…</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm mb-5">
              <span className="shrink-0 mt-px">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {FIELDS.map(({ key, label, type, placeholder, required }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {label}
                </label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={placeholder}
                  required={required}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            ))}

            {/* Role selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[{ val: 'worker', label: 'Student Worker' }, { val: 'manager', label: 'Manager' }].map((r) => (
                  <button
                    key={r.val}
                    type="button"
                    onClick={() => set('role', r.val)}
                    className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                      form.role === r.val
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Invite code */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Invite Code
              </label>
              <input
                type="text"
                value={form.invite_code}
                onChange={(e) => set('invite_code', e.target.value.trim())}
                placeholder="e.g. xYz123Ab"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-gray-50 font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <p className="text-xs text-gray-400 mt-1.5 text-center">Ask your manager for an invite code</p>
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full bg-blue-600 text-white py-3.5 rounded-xl text-base font-semibold hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Creating account…
                </span>
              ) : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
