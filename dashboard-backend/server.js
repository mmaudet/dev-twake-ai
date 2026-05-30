import express from 'express'

import {
  exchangeCode,
  getStoredTokens,
  clearTokens,
  loadOidcConfig
} from './tokens.js'
import { listRecent } from './jmap.js'
import { eventsForDay } from './caldav.js'

const app = express()
const PORT = process.env.PORT || 8090
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || 'https://mmaudet-dashboard.dev-twake.maudet.cloud'

app.use(express.json())

// CORS — single dashboard origin, with credentials so cookies pass through
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', DASHBOARD_ORIGIN)
  res.set('Vary', 'Origin')
  res.set('Access-Control-Allow-Credentials', 'true')
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/api/status', async (req, res) => {
  try {
    const tokens = await getStoredTokens()
    const oidc = await loadOidcConfig()
    res.json({
      connected: !!tokens?.access_token,
      expires_at: tokens ? (tokens.saved_at || 0) + (tokens.expires_in || 0) : null,
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

// POST { code, code_verifier } — invoked by the dashboard after OIDC redirect
app.post('/oidc/callback', async (req, res) => {
  try {
    const { code, code_verifier } = req.body || {}
    if (!code || !code_verifier) {
      return res.status(400).json({ error: 'code and code_verifier required' })
    }
    await exchangeCode({ code, code_verifier })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/disconnect', async (req, res) => {
  await clearTokens()
  res.json({ ok: true })
})

app.get('/api/mail/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30)
    const emails = await listRecent(limit)
    res.json({ emails })
  } catch (e) {
    if (e.code === 'NOT_CONNECTED') return res.status(401).json({ error: 'NOT_CONNECTED' })
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/calendar/day', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const events = await eventsForDay(date)
    res.json({ date, events })
  } catch (e) {
    if (e.code === 'NOT_CONNECTED') return res.status(401).json({ error: 'NOT_CONNECTED' })
    res.status(500).json({ error: e.message })
  }
})

// Bind to all interfaces so the Tailscale-facing nginx on Hermes can reach
// us at 100.64.110.85:PORT. There is no public interface on athena exposing
// this port — only the Tailscale network — so this is safe.
app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`dashboard-backend listening on 0.0.0.0:${PORT}`)
})
