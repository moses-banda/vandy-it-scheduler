import { useState, useEffect } from 'react'
import api from '../../services/api'
import { fmtDateTime } from '../../utils/time'

export default function InviteCodesPanel({ workers = [] }) {
  const [invites, setInvites] = useState([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const loadInvites = async () => {
    try {
      const res = await api.get('/invites')
      setInvites(res.data)
    } catch (err) {
      console.error('Failed to load invites:', err)
      setError('Failed to load invite codes.')
    }
  }

  useEffect(() => {
    loadInvites()
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      await api.post('/invites')
      await loadInvites()
    } catch (err) {
      console.error('Generation failed:', err)
      setError('Failed to generate invite code.')
    } finally {
      setGenerating(false)
    }
  }

  const copyToClipboard = (code) => {
    navigator.clipboard.writeText(code)
    alert('Code copied to clipboard!')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Registration Invite Codes</h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate New Code'}
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}

      <div className="grid gap-3">
        {invites.length === 0 ? (
          <div className="text-center text-gray-400 py-8">No invite codes generated yet.</div>
        ) : (
          [...invites].reverse().map((invite) => (
            <div key={invite.id} className="bg-white border rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-lg font-medium text-gray-800 tracking-wider bg-gray-100 px-3 py-1 rounded inline-block mb-2">
                  {invite.code}
                </div>
                <div className="text-sm text-gray-500">
                  Created: {fmtDateTime(invite.created_at)}
                </div>
                {invite.used && invite.used_by && (
                  <div className="text-sm text-gray-400 mt-1">
                    Used by: {workers.find((w) => w.id === invite.used_by)?.name ?? invite.used_by}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${invite.used ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {invite.used ? 'Used' : 'Available'}
                </span>
                {!invite.used && (
                  <button onClick={() => copyToClipboard(invite.code)} className="text-sm text-blue-600 hover:underline">
                    Copy Code
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
