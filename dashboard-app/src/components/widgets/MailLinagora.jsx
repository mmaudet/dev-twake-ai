import React, { useEffect, useState, useCallback } from 'react'

import Icon from 'cozy-ui/transpiled/react/Icon'
import Spinner from 'cozy-ui/transpiled/react/Spinner'

import { BACKEND_BASE, startLinagoraConnect, WIDGET_IDS } from 'src/utils/backend'

const formatDate = ts => {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  } catch (e) { return '' }
}

const MailLinagora = ({ reloadKey }) => {
  const [state, setState] = useState({ loading: true, error: null, emails: null, notConnected: false })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(`${BACKEND_BASE}/api/mail/recent?limit=10`, { credentials: 'include' })
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}))
        if (body.error === 'NOT_CONNECTED') {
          setState({ loading: false, error: null, emails: null, notConnected: true })
          return
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setState({ loading: false, error: null, emails: json.emails || [], notConnected: false })
    } catch (e) {
      setState({ loading: false, error: e.message, emails: null, notConnected: false })
    }
  }, [])

  // reloadKey changes (e.g. after a disconnect from the widget menu) → refetch
  useEffect(() => { load() }, [load, reloadKey])

  if (state.notConnected) {
    return (
      <div className="dashboard-empty">
        <p>Connectez votre compte LINAGORA pour voir vos derniers mails.</p>
        <button className="create-btn" style={{ width: 'auto', marginTop: 8 }} onClick={() => startLinagoraConnect(WIDGET_IDS.MAIL)}>
          Se connecter à LINAGORA
        </button>
      </div>
    )
  }
  if (state.loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 16 }}><Spinner size="large" /></div>
  }
  if (state.error) {
    return <div className="dashboard-error">Erreur : {state.error}</div>
  }
  const emails = state.emails || []
  if (emails.length === 0) {
    return <div className="dashboard-empty">Aucun mail récent.</div>
  }
  return (
    <ul className="dashboard-list">
      {emails.map(e => (
        <li
          key={e.id}
          className="dashboard-list-item"
          onClick={() => window.open('https://mmaudet-mail.twake.linagora.com/', '_blank')}
        >
          <span className="dashboard-list-icon icon-mail">
            <Icon icon="email" size={18} />
          </span>
          <div className="dashboard-list-text">
            <div className="dashboard-list-primary" style={e.unread ? { fontWeight: 700 } : undefined}>
              {e.subject}
            </div>
            <div className="dashboard-list-secondary">
              {e.from} · {formatDate(e.receivedAt)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default MailLinagora
