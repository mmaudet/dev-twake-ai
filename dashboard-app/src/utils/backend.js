// Dashboard backend base URL (LINAGORA bridge: OIDC + JMAP + CalDAV).
// Lives at https://dashboard-api.dev-twake.maudet.cloud, in front of athena's
// systemd `dashboard-backend.service`.
export const BACKEND_BASE = 'https://dashboard-api.dev-twake.maudet.cloud'

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

// Build a PKCE OIDC authorize URL targeting LINAGORA SSO, with config pulled
// from the backend (so the React app never sees client_id hardcoded).
// Stores code_verifier + state in sessionStorage so the /oidc/callback view
// can retrieve them.
export const startLinagoraConnect = async () => {
  const statusRes = await fetch(`${BACKEND_BASE}/api/status`, { credentials: 'include' })
  if (!statusRes.ok) throw new Error('backend /api/status unreachable')
  const status = await statusRes.json()
  const cfg = status.auth_url_template

  const code_verifier = randString(32)
  const code_challenge = await sha256base64url(code_verifier)
  const state = randString(16)
  const nonce = randString(16)

  sessionStorage.setItem('linagora_pkce', JSON.stringify({ code_verifier, state, nonce }))

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

export const disconnectLinagora = async () => {
  await fetch(`${BACKEND_BASE}/api/disconnect`, {
    method: 'POST',
    credentials: 'include'
  })
}

export const fetchConnectedStatus = async () => {
  const res = await fetch(`${BACKEND_BASE}/api/status`, { credentials: 'include' })
  if (!res.ok) return { connected: false }
  return res.json()
}
