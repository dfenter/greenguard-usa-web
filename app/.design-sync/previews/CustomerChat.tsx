import React from 'react'
import { CustomerChat } from 'greenguard-portal'

// Collapsed button — default state (green-accented customer help trigger)
export function CollapsedButton() {
  return (
    <div style={{ position: 'relative', transform: 'translateZ(0)', height: 120, overflow: 'hidden', background: 'var(--bg)', borderRadius: 8 }}>
      <CustomerChat />
    </div>
  )
}

// Expanded panel — static recreation of the open chat state
export function ExpandedPanel() {
  return (
    <div style={{ width: 360, background: '#0d1a10', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(125,255,170,0.25)', boxShadow: '0 12px 36px rgba(0,0,0,0.55)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ padding: '14px 18px', background: 'rgba(125,255,170,0.06)', borderBottom: '1px solid rgba(125,255,170,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 900, color: '#7dffaa', fontSize: '1rem' }}>GreenGuard Assistant</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.5)' }}>Service · scheduling · billing</div>
        </div>
        <span style={{ color: 'rgba(212,230,202,0.6)', fontSize: '1.4rem' }}>×</span>
      </div>
      <div style={{ padding: 16, minHeight: 200 }}>
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(125,255,170,0.07)', borderRadius: 8, fontSize: '0.85rem', color: 'rgba(212,230,202,0.85)', maxWidth: '85%' }}>
          Hi! I'm your GreenGuard service assistant. Ask me about your service schedule, billing, or how your traps work.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <div style={{ padding: '8px 12px', background: 'rgba(125,255,170,0.1)', borderRadius: 8, fontSize: '0.85rem', color: '#7dffaa', maxWidth: '85%' }}>
            When is my next service visit?
          </div>
        </div>
        <div style={{ padding: '8px 12px', background: 'rgba(125,255,170,0.07)', borderRadius: 8, fontSize: '0.85rem', color: 'rgba(212,230,202,0.85)', maxWidth: '85%' }}>
          Your next visit is scheduled for Thursday, June 26 between 9–11 AM.
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(125,255,170,0.1)', display: 'flex', gap: 8 }}>
        <input style={{ flex: 1, background: 'rgba(125,255,170,0.05)', border: '1px solid rgba(125,255,170,0.15)', borderRadius: 8, padding: '8px 12px', color: '#d4e6ca', fontSize: '0.85rem' }} placeholder="Ask anything…" readOnly />
        <button style={{ background: '#7dffaa', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#0d1a10', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem' }}>Send</button>
      </div>
    </div>
  )
}
