'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './admin.module.css'

export default function AccountActions({
  kind,
  id,
  current,
}: {
  kind: 'kyc' | 'account' | 'risk' | 'user'
  id: string
  current?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(status?: string) {
    const reason =
      prompt(
        kind === 'risk'
          ? 'Resolution note'
          : kind === 'user'
            ? status === 'suspended'
              ? 'Reason for suspending this user'
              : 'Reason for restoring this user'
            : `Reason for ${status}`,
      ) || ''

    if (reason.trim().length < 5) return

    setBusy(true)
    setError('')

    const action =
      kind === 'kyc'
        ? 'set_kyc'
        : kind === 'account'
          ? 'set_account_status'
          : kind === 'user'
            ? 'set_user_suspension'
            : 'resolve_risk'

    const body =
      kind === 'kyc'
        ? { action, userId: id, status, reason }
        : kind === 'account'
          ? { action, accountId: id, status, reason }
          : kind === 'user'
            ? {
                action,
                userId: id,
                suspended: status === 'suspended',
                reason,
              }
            : { action, eventId: id, reason }

    const response = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const result = await response.json().catch(() => ({}))
    setBusy(false)

    if (!response.ok) {
      setError(result.error || 'Operation failed')
      return
    }

    router.refresh()
  }

  return (
    <div className={styles.miniActions}>
      {kind === 'kyc' && (
        <>
          <button
            disabled={busy || current === 'approved'}
            onClick={() => run('approved')}
          >
            Approve KYC
          </button>
          <button
            disabled={busy || current === 'rejected'}
            onClick={() => run('rejected')}
          >
            Reject
          </button>
        </>
      )}

      {kind === 'account' && (
        <>
          <button
            disabled={busy || current === 'active'}
            onClick={() => run('active')}
          >
            Activate
          </button>
          <button
            disabled={busy || current === 'suspended'}
            onClick={() => run('suspended')}
          >
            Suspend
          </button>
          <button
            disabled={busy || current === 'closed'}
            onClick={() => run('closed')}
          >
            Close
          </button>
        </>
      )}

      {kind === 'user' &&
        (current === 'suspended' ? (
          <button disabled={busy} onClick={() => run('active')}>
            Restore user
          </button>
        ) : (
          <button disabled={busy} onClick={() => run('suspended')}>
            Suspend user
          </button>
        ))}

      {kind === 'risk' && (
        <button disabled={busy} onClick={() => run()}>
          Resolve event
        </button>
      )}

      {error && <p>{error}</p>}
    </div>
  )
}
