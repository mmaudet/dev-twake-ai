import React, { useEffect, useState, useCallback } from 'react'

import Icon from 'cozy-ui/transpiled/react/Icon'
import Spinner from 'cozy-ui/transpiled/react/Spinner'

import { BACKEND_BASE, startLinagoraConnect } from 'src/utils/backend'

const ymd = d => {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const prettyDate = d => d.toLocaleDateString('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long'
})

const formatTime = iso => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch (e) { return '' }
}

const CalendarLinagora = () => {
  const [date, setDate] = useState(() => new Date())
  const [state, setState] = useState({ loading: true, error: null, events: null, notConnected: false })

  const load = useCallback(async dt => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(`${BACKEND_BASE}/api/calendar/day?date=${ymd(dt)}`, { credentials: 'include' })
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}))
        if (body.error === 'NOT_CONNECTED') {
          setState({ loading: false, error: null, events: null, notConnected: true })
          return
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setState({ loading: false, error: null, events: json.events || [], notConnected: false })
    } catch (e) {
      setState({ loading: false, error: e.message, events: null, notConnected: false })
    }
  }, [])

  useEffect(() => { load(date) }, [date, load])

  const shift = days => {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    setDate(next)
  }

  const isToday = ymd(date) === ymd(new Date())

  return (
    <div>
      <div className="calendar-nav">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Jour précédent">‹</button>
        <button
          className="calendar-nav-label"
          onClick={() => setDate(new Date())}
          title="Aller à aujourd'hui"
        >
          {isToday ? "Aujourd'hui" : prettyDate(date)}
        </button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Jour suivant">›</button>
      </div>

      {state.notConnected ? (
        <div className="dashboard-empty">
          <p>Connectez votre compte LINAGORA pour voir votre agenda.</p>
          <button className="create-btn" style={{ width: 'auto', marginTop: 8 }} onClick={() => startLinagoraConnect()}>
            Se connecter à LINAGORA
          </button>
        </div>
      ) : state.loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 16 }}><Spinner size="large" /></div>
      ) : state.error ? (
        <div className="dashboard-error">Erreur : {state.error}</div>
      ) : !state.events || state.events.length === 0 ? (
        <div className="dashboard-empty">Aucun événement ce jour-là.</div>
      ) : (
        <ul className="dashboard-list">
          {state.events.map(e => (
            <li
              key={e.uid || `${e.start}-${e.summary}`}
              className="dashboard-list-item"
              onClick={() => window.open('https://calendar.twake.app/', '_blank')}
            >
              <span className="dashboard-list-icon icon-calendar">
                <Icon icon="calendar" size={18} />
              </span>
              <div className="dashboard-list-text">
                <div className="dashboard-list-primary">{e.summary}</div>
                <div className="dashboard-list-secondary">
                  {formatTime(e.start)}{e.end ? ` – ${formatTime(e.end)}` : ''}
                  {e.location ? ` · ${e.location}` : ''}
                  {e.calendarName ? ` · ${e.calendarName}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default CalendarLinagora
