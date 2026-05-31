// Dashboard backend base URL (LINAGORA bridge: OIDC + JMAP + CalDAV).
export const BACKEND_BASE = 'https://dashboard-api.dev-twake.maudet.cloud'

export const WIDGET_IDS = { MAIL: 'mail', CALENDAR: 'calendar' }

const randString = (len = 32) => {
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const sha256base64url = async input => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// 5 minutes — covers the user clicking the button, the Linagora SSO
// roundtrip, and a slow tab. Beyond that the stored verifier is stale
// and the callback should refuse it rather than try to redeem a code
// that no longer matches.
export const PKCE_TTL_MS = 5 * 60 * 1000

// Kick off PKCE OIDC for a specific widget. The widget id is stored in
// sessionStorage alongside the PKCE values so the /oidc/callback view
// can POST it back to the backend, which then routes the tokens to the
// right slot.
export const startLinagoraConnect = async widget => {
  const statusRes = await fetch(`${BACKEND_BASE}/api/status`, { credentials: 'include' })
  if (!statusRes.ok) throw new Error('backend /api/status unreachable')
  const status = await statusRes.json()
  const cfg = status.auth_url_template

  const code_verifier = randString(32)
  const code_challenge = await sha256base64url(code_verifier)
  const state = randString(16)
  const nonce = randString(16)

  sessionStorage.setItem('linagora_pkce', JSON.stringify({
    code_verifier, state, nonce, widget, created_at: Date.now()
  }))

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.client_id,
    redirect_uri: cfg.redirect_uri,
    scope: cfg.scope,
    state,
    nonce,
    code_challenge,
    code_challenge_method: 'S256'
  })
  window.location.href = `${cfg.issuer}/oauth2/authorize?${params}`
}

export const disconnectLinagora = async widget => {
  await fetch(`${BACKEND_BASE}/api/disconnect`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ widget })
  })
}

export const fetchStatus = async () => {
  const res = await fetch(`${BACKEND_BASE}/api/status`, { credentials: 'include' })
  if (!res.ok) return { widgets: { mail: { connected: false }, calendar: { connected: false } } }
  return res.json()
}
