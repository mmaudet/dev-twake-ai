import crypto from 'crypto'

import express from 'express'

import {
  exchangeCode,
  getStore,
  clearTokens,
  loadOidcConfig,
  isExpired,
  VALID_WIDGETS
} from './tokens.js'
import { listRecent } from './jmap.js'
import { eventsForDay, listCalendars } from './caldav.js'

const app = express()
const PORT = process.env.PORT || 8090
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || 'https://mmaudet-dashboard.dev-twake.maudet.cloud'

// ─── Server-side PKCE store ────────────────────────────────────────────────
// The frontend keeps `code_verifier` in sessionStorage and POSTs it on
// callback. The hermes agent has no browser session, so it can't follow
// that flow. Instead it calls /api/oidc/auth-url which generates the PKCE
// pair server-side; the verifier is kept in memory keyed by `state`. The
// callback (POST /oidc/callback) accepts `state` as a fallback for
// `code_verifier` and looks the verifier up here.
const PKCE_TTL_MS = 5 * 60 * 1000
const pendingPkce = new Map() // state -> { verifier, widget, created_at }

const prunePkce = () => {
  const now = Date.now()
  for (const [state, entry] of pendingPkce.entries()) {
    if (now - entry.created_at > PKCE_TTL_MS) pendingPkce.delete(state)
  }
}

const b64url = buf => buf.toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const generatePkce = () => {
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const state = b64url(crypto.randomBytes(16))
  const nonce = b64url(crypto.randomBytes(16))
  return { verifier, challenge, state, nonce }
}

app.use(express.json())

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', DASHBOARD_ORIGIN)
  res.set('Vary', 'Origin')
  res.set('Access-Control-Allow-Credentials', 'true')
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// `connected` reports whether we currently hold something usable. An
// access_token expired past `isExpired` is only usable if we still have a
// refresh_token to swap it for — otherwise the front should show "Reconnect"
// instead of trying to call /api/mail/recent and getting a 401.
const statusFor = tokens => {
  if (!tokens?.access_token) {
    return { connected: false, expires_at: null }
  }
  const expires_at = (tokens.saved_at || 0) + (tokens.expires_in || 0)
  const connected = !isExpired(tokens) || !!tokens.refresh_token
  return { connected, expires_at }
}

app.get('/api/status', async (req, res) => {
  try {
    const store = await getStore()
    const oidc = await loadOidcConfig()
    res.json({
      widgets: {
        mail: statusFor(store.mail),
        calendar: statusFor(store.calendar)
      },
      auth_url_template: {
        issuer: oidc.issuer,
        client_id: oidc.client_id,
        redirect_uri: oidc.redirect_uri,
        scope: oidc.scope
      }
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Server-side PKCE generator for agent-initiated reconnect.
// The hermes agent (via linagora-cal reconnect) calls this to get a URL
// the user can tap on Telegram. The verifier stays here until the SSO
// roundtrip returns and POSTs the matching `state`. One-shot, 5-min TTL.
app.get('/api/oidc/auth-url', async (req, res) => {
  try {
    prunePkce()
    const widget = String(req.query.widget || '')
    if (!VALID_WIDGETS.has(widget)) {
      return res.status(400).json({ error: `widget must be one of ${[...VALID_WIDGETS].join(', ')}` })
    }
    const cfg = await loadOidcConfig()
    const { verifier, challenge, state, nonce } = generatePkce()
    pendingPkce.set(state, { verifier, widget, created_at: Date.now() })
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.client_id,
      redirect_uri: cfg.redirect_uri,
      scope: cfg.scope,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })
    res.json({
      auth_url: `${cfg.issuer}/oauth2/authorize?${params}`,
      state,
      widget,
      expires_at: Math.floor((Date.now() + PKCE_TTL_MS) / 1000)
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/oidc/callback', async (req, res) => {
  try {
    prunePkce()
    let { code, code_verifier, widget, state } = req.body || {}
    if (!code) {
      return res.status(400).json({ error: 'code required' })
    }
    // Agent-initiated flow: the caller sends `state` instead of `code_verifier`
    // and the widget comes from the pending entry.
    if (!code_verifier && state) {
      const entry = pendingPkce.get(state)
      if (!entry) {
        return res.status(400).json({ error: 'state unknown or expired' })
      }
      pendingPkce.delete(state) // one-shot
      code_verifier = entry.verifier
      widget = widget || entry.widget
    }
    if (!code_verifier) {
      return res.status(400).json({ error: 'code_verifier or valid state required' })
    }
    if (!VALID_WIDGETS.has(widget)) {
      return res.status(400).json({ error: `widget must be one of ${[...VALID_WIDGETS].join(', ')}` })
    }
    await exchangeCode(widget, { code, code_verifier })
    res.json({ ok: true, widget })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/disconnect', async (req, res) => {
  try {
    const widget = req.body?.widget
    if (!VALID_WIDGETS.has(widget)) {
      return res.status(400).json({ error: 'widget required' })
    }
    await clearTokens(widget)
    res.json({ ok: true, widget })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/mail/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30)
    res.json({ emails: await listRecent(limit) })
  } catch (e) {
    if (e.code === 'NOT_CONNECTED') return res.status(401).json({ error: 'NOT_CONNECTED' })
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/calendar/calendars', async (req, res) => {
  try {
    const cals = await listCalendars()
    res.json({ calendars: cals.map(c => ({ id: c.id, displayname: c.displayname, isOwn: c.isOwn })) })
  } catch (e) {
    if (e.code === 'NOT_CONNECTED') return res.status(401).json({ error: 'NOT_CONNECTED' })
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/calendar/day', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    let calendarIds
    if (req.query.calendarIds) {
      calendarIds = String(req.query.calendarIds).split(',').filter(Boolean)
    }
    const events = await eventsForDay(date, calendarIds)
    res.json({ date, events })
  } catch (e) {
    if (e.code === 'NOT_CONNECTED') return res.status(401).json({ error: 'NOT_CONNECTED' })
    res.status(500).json({ error: e.message })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`dashboard-backend listening on 0.0.0.0:${PORT}`)
})
