import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Spinner from 'cozy-ui/transpiled/react/Spinner'
import Alerter from 'cozy-ui/transpiled/react/Alerter'

import Sidebar from 'src/components/Sidebar'
import { BACKEND_BASE } from 'src/utils/backend'

const OidcCallback = () => {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    const run = async () => {
      // Path-based callback: ?code=...&state=...
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')
      const pkce = JSON.parse(sessionStorage.getItem('linagora_pkce') || 'null')
      if (!code) {
        setError('Code manquant dans la réponse OIDC')
        return
      }
      if (!pkce || pkce.state !== state) {
        setError('State OIDC invalide ou expiré — relance la connexion')
        return
      }
      try {
        const res = await fetch(`${BACKEND_BASE}/oidc/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, code_verifier: pkce.code_verifier })
        })
        const json = await res.json()
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
        sessionStorage.removeItem('linagora_pkce')
        Alerter.success('Connecté à LINAGORA')
        // Hash routing: clean URL to /#/
        window.history.replaceState({}, '', '/#/')
        navigate('/')
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        setError(`Échec de la connexion : ${e.message}`)
      }
    }
    run()
  }, [navigate])

  return (
    <div className="dashboard-shell">
      <Sidebar config={{}} />
      <main className="dashboard-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {error ? (
          <div className="dashboard-error" style={{ textAlign: 'center', maxWidth: 480 }}>
            <h2>Connexion LINAGORA échouée</h2>
            <p>{error}</p>
            <button className="create-btn" onClick={() => navigate('/widgets')}>
              Retour aux widgets
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <Spinner size="xxlarge" />
            <p style={{ marginTop: 16 }}>Connexion à LINAGORA en cours…</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default OidcCallback
