import express from 'express'

import {
  exchangeCode,
  getStore,
  clearTokens,
  loadOidcConfig,
  VALID_WIDGETS
} from './tokens.js'
import { listRecent } from './jmap.js'
import { eventsForDay, listCalendars } from './caldav.js'

const app = express()
const PORT = process.env.PORT || 8090
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || 'https://mmaudet-dashboard.dev-twake.maudet.cloud'

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

const statusFor = tokens => ({
  connected: !!tokens?.access_token,
  expires_at: tokens ? (tokens.saved_at || 0) + (tokens.expires_in || 0) : null
})

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

app.post('/oidc/callback', async (req, res) => {
  try {
    const { code, code_verifier, widget } = req.body || {}
    if (!code || !code_verifier) {
      return res.status(400).json({ error: 'code and code_verifier required' })
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
