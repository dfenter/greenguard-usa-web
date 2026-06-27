import React from 'react'
import { AdminChat } from 'greenguard-portal'

// Collapsed button — the default state (gold-accented ops assistant trigger)
export function CollapsedButton() {
  return (
    <div style={{ position: 'relative', transform: 'translateZ(0)', height: 120, overflow: 'hidden', background: 'var(--bg)', borderRadius: 8 }}>
      <AdminChat />
    </div>
  )
}

// Expanded panel — static recreation of the open chat state
export function ExpandedPanel() {
  return (
    <div style={{ width: 360, background: '#0d1a10', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(201,168,76,0.35)', boxShadow: '0 12px 36px rgba(0,0,0,0.55)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ padding: '14px 18px', background: 'rgba(201,168,76,0.07)', borderBottom: '1px solid rgba(201,168,76,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 900, color: '#c9a84c', fontSize: '1rem' }}>Ops Assistant</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.5)' }}>Route · customers · inventory · SMS</div>
        </div>
        <span style={{ color: 'rgba(212,230,202,0.6)', fontSize: '1.4rem' }}>×</span>
      </div>
      <div style={{ padding: 16, minHeight: 200 }}>
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(201,168,76,0.08)', borderRadius: 8, fontSize: '0.85rem', color: 'rgba(212,230,202,0.85)', maxWidth: '85%' }}>
          Ops assistant. Ask me about today's route, a customer, tank inventory, or say 'text [name] I'm on my way'.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <div style={{ padding: '8px 12px', background: 'rgba(201,168,76,0.12)', borderRadius: 8, fontSize: '0.85rem', color: '#c9a84c', maxWidth: '85%' }}>
            How many stops today?
          </div>
        </div>
        <div style={{ padding: '8px 12px', background: 'rgba(201,168,76,0.08)', borderRadius: 8, fontSize: '0.85rem', color: 'rgba(212,230,202,0.85)', maxWidth: '85%' }}>
          You have 6 stops today. First is Sarah Johnson at 10:00 AM.
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(201,168,76,0.15)', display: 'flex', gap: 8 }}>
        <input style={{ flex: 1, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: '8px 12px', color: '#d4e6ca', fontSize: '0.85rem' }} placeholder="Ask anything…" readOnly />
        <button style={{ background: '#c9a84c', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#0d1a10', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem' }}>Send</button>
      </div>
    </div>
  )
}
