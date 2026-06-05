// lead-capture.js — P1 tests
// Covers: email validation, HubSpot 409 treated as success, missing token, API failure

import { describe, test, expect, vi, beforeEach } from 'vitest'

let mockFetch
let POST

beforeEach(async () => {
  vi.resetModules()
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
  vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token')
  const mod = await import('../pages/api/lead-capture.js')
  POST = mod.POST
})

function req(body) {
  return { request: new Request('http://x/api/lead-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })}
}

// ── P1: email validation ──────────────────────────────────────────────────────

describe('email validation', () => {
  test('valid email reaches HubSpot and returns ok:true', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 })
    const res = await POST(req({ email: 'user@example.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  test('bare @ rejected as invalid — does not reach HubSpot', async () => {
    const res = await POST(req({ email: '@' }))
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('a@ rejected — missing domain', async () => {
    const res = await POST(req({ email: 'a@' }))
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('no dot in domain rejected', async () => {
    const res = await POST(req({ email: 'user@localhost' }))
    expect(res.status).toBe(400)
  })

  test('empty email rejected', async () => {
    const res = await POST(req({ email: '' }))
    expect(res.status).toBe(400)
  })

  test('missing email field rejected', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  test('email > 254 chars rejected', async () => {
    const long = 'a'.repeat(250) + '@b.co'
    const res = await POST(req({ email: long }))
    expect(res.status).toBe(400)
  })

  test('whitespace trimmed before validation', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 })
    const res = await POST(req({ email: '  user@example.com  ' }))
    expect(res.status).toBe(200)
    // Verify trimmed email sent to HubSpot
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.properties.email).toBe('user@example.com')
  })
})

// ── P1: HubSpot response handling ────────────────────────────────────────────

describe('HubSpot response handling', () => {
  test('HubSpot 201 → ok:true', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 })
    const res = await POST(req({ email: 'new@example.com' }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  test('HubSpot 409 (duplicate contact) treated as success', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 409 })
    const res = await POST(req({ email: 'existing@example.com' }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  test('HubSpot 500 returns 500', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    const res = await POST(req({ email: 'user@example.com' }))
    expect(res.status).toBe(500)
  })

  test('HubSpot request includes correct properties', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 })
    await POST(req({ email: 'user@example.com' }))
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.properties.hs_lead_status).toBe('NEW')
    expect(body.properties.lead_source).toBe('website_lead_magnet')
  })
})

// ── P1: missing configuration ─────────────────────────────────────────────────

describe('missing configuration', () => {
  test('missing HUBSPOT_ACCESS_TOKEN returns 500 without calling HubSpot', async () => {
    vi.stubEnv('HUBSPOT_ACCESS_TOKEN', '')
    vi.resetModules()
    const mod = await import('../pages/api/lead-capture.js')
    const res = await mod.POST(req({ email: 'user@example.com' }))
    expect(res.status).toBe(500)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
