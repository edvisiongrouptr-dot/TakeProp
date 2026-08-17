'use client'

import { FormEvent, useState } from 'react'

const networks = {
  bep20: { label: 'BNB Smart Chain (BEP20)', short: 'BEP20', address: '0x30127dee8f4bfeaec586c32d580a8b6066eac11b', warning: 'Only send USDT using BNB Smart Chain (BEP20).' },
  erc20: { label: 'Ethereum (ERC20)', short: 'ERC20', address: '0x30127dee8f4bfeaec586c32d580a8b6066eac11b', warning: 'Only send USDT using Ethereum (ERC20). Network fees may be higher.' },
  trc20: { label: 'Tron (TRC20)', short: 'TRC20', address: 'TLTKYRdtpaaYXoSHMgUgEJ3BGARbQkcx3g', warning: 'Only send USDT using Tron (TRC20).' },
  ton: { label: 'TON', short: 'TON', address: 'UQCuT9QECsZp-iBmSM1v8c8Gdga3JWww1sENWn6sywc4cjKc', warning: 'Only send USDT on TON. Do not send NFTs or another token.' }
} as const
type Network = keyof typeof networks

export default function CheckoutForm({ planId }: { planId: string }) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [network, setNetwork] = useState<Network>('bep20')
  const selected = networks[network]
  async function copyAddress() {
    await navigator.clipboard.writeText(selected.address)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('')
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/orders/usdt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId, txHash: form.get('txHash'), network }) })
    const result = await response.json(); setLoading(false)
    if (!response.ok) return setMessage(result.error || 'Unable to submit payment.')
    window.location.href = '/dashboard?payment=submitted'
  }
  return <div className="paymentBox">
    <div className="network"><span>PAYMENT NETWORK</span><div className="networkTabs">{(Object.keys(networks) as Network[]).map(key=><button type="button" key={key} className={network===key?'on':''} onClick={()=>{setNetwork(key);setCopied(false);setMessage('')}}>{networks[key].short}</button>)}</div><b>USDT · {selected.label}</b><small>{selected.warning} Funds sent using another network may be lost.</small></div>
    <div className="wallet"><span>DEPOSIT ADDRESS</span><code>{selected.address}</code><button type="button" onClick={copyAddress}>{copied ? 'Copied ✓' : 'Copy address'}</button></div>
    <ol><li>Send the exact USDT amount shown above.</li><li>Wait for the transaction to appear in your wallet history.</li><li>Paste the BEP20 transaction hash below.</li></ol>
    <form onSubmit={submit}><label>TRANSACTION HASH (TXID)<input name="txHash" required minLength={20} maxLength={100} placeholder="Paste the transaction hash" autoComplete="off" /></label>{message && <div className="checkoutMessage">{message}</div>}<button className="btn" disabled={loading}>{loading ? 'Submitting…' : 'I have paid — submit for review →'}</button></form>
    <small className="reviewNote">Payments are reviewed before a simulated account is issued. Never send funds from an unsupported network.</small>
  </div>
}
