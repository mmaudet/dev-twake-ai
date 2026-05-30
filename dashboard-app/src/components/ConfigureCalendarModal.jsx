import React, { useEffect, useState } from 'react'

import Dialog, { DialogTitle, DialogContent, DialogActions } from 'cozy-ui/transpiled/react/Dialog'
import Button from 'cozy-ui/transpiled/react/Button'
import Spinner from 'cozy-ui/transpiled/react/Spinner'
import Alerter from 'cozy-ui/transpiled/react/Alerter'

import { BACKEND_BASE, startLinagoraConnect, WIDGET_IDS } from 'src/utils/backend'

const ConfigureCalendarModal = ({ open, onClose, widgetConfig, onSave }) => {
  const [calendars, setCalendars] = useState(null)
  const [selected, setSelected] = useState(() => new Set(widgetConfig?.selectedCalendarIds || []))
  const [error, setError] = useState(null)
  const [notConnected, setNotConnected] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setError(null)
    setCalendars(null)
    setNotConnected(false)
    fetch(`${BACKEND_BASE}/api/calendar/calendars`, { credentials: 'include' })
      .then(async res => {
        if (cancelled) return
        if (res.status === 401) {
          setNotConnected(true)
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (cancelled) return
        setCalendars(json.calendars || [])
        // Default selection: user's own calendar(s) if nothing saved yet
        if (!widgetConfig?.selectedCalendarIds) {
          const owns = (json.calendars || []).filter(c => c.isOwn).map(c => c.id)
          setSelected(new Set(owns))
        }
      })
      .catch(e => {
        if (!cancelled) setError(e.message)
      })
    return () => { cancelled = true }
  }, [open, widgetConfig])

  if (!open) return null

  const toggle = id => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const save = () => {
    onSave({ selectedCalendarIds: [...selected] })
    Alerter.success('Calendriers enregistrés')
    onClose()
  }

  const own = calendars ? calendars.filter(c => c.isOwn) : []
  const shared = calendars ? calendars.filter(c => !c.isOwn) : []

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Calendriers à afficher dans le widget</DialogTitle>
      <DialogContent>
        {notConnected ? (
          <div>
            <p>Vous n'êtes pas encore connecté à LINAGORA pour le calendrier.</p>
            <Button label="Se connecter à LINAGORA" onClick={() => startLinagoraConnect(WIDGET_IDS.CALENDAR)} />
          </div>
        ) : error ? (
          <div className="dashboard-error">Erreur : {error}</div>
        ) : !calendars ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner size="large" /></div>
        ) : (
          <div>
            {own.length > 0 && (
              <div className="calendar-config-group">
                <h4 className="calendar-config-group-title">Mes calendriers</h4>
                {own.map(c => (
                  <label key={c.id} className="calendar-config-row">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    <span>{c.displayname}</span>
                  </label>
                ))}
              </div>
            )}
            {shared.length > 0 && (
              <div className="calendar-config-group">
                <h4 className="calendar-config-group-title">Partagés ({shared.length})</h4>
                {shared.map(c => (
                  <label key={c.id} className="calendar-config-row">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    <span>{c.displayname}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button theme="secondary" label="Annuler" onClick={onClose} />
        <Button label="Enregistrer" onClick={save} disabled={!calendars} />
      </DialogActions>
    </Dialog>
  )
}

export default ConfigureCalendarModal
