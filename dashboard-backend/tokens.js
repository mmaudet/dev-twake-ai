import { promises as fs } from 'fs'

const TOKENS_PATH = process.env.TOKENS_PATH || '/home/mmaudet/.dashboard-backend/tokens.json'
const OIDC_CONFIG_PATH = process.env.OIDC_CONFIG_PATH || '/home/mmaudet/.dashboard-backend/oidc.json'

let cache = null

export const loadOidcConfig = async () => {
  const raw = await fs.readFile(OIDC_CONFIG_PATH, 'utf8')
  return JSON.parse(raw)
}

const readTokens = async () => {
  try {
    const raw = await fs.readFile(TOKENS_PATH, 'utf8')
    cache = JSON.parse(raw)
    return cache
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

const writeTokens = async tokens => {
  const enriched = {
    ...tokens,
    saved_at: Math.floor(Date.now() / 1000)
  }
  await fs.writeFile(TOKENS_PATH, JSON.stringify(enriched, null, 2), { mode: 0o600 })
  cache = enriched
  return enriched
}

export const getStoredTokens = async () => {
  if (cache) return cache
  return readTokens()
}

export const saveTokens = writeTokens

export const isExpired = (tokens, marginSeconds = 60) => {
  if (!tokens || !tokens.access_token) return true
  const savedAt = tokens.saved_at || 0
  const expiresIn = tokens.expires_in || 0
  const expiresAt = savedAt + expiresIn
  return Date.now() / 1000 >= expiresAt - marginSeconds
}

// Exchange an auth code (with PKCE verifier) for tokens. Pure PKCE flow,
// no client_secret needed — confirmed empirically with mmaudet-dashboard.
export const exchangeCode = async ({ code, code_verifier, redirect_uri }) => {
  const cfg = await loadOidcConfig()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect_uri || cfg.redirect_uri,
    client_id: cfg.client_id,
    code_verifier
  })
  const res = await fetch(`${cfg.issuer}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`OIDC token exchange failed: ${res.status} ${errBody}`)
  }
  return saveTokens(await res.json())
}

const refreshTokens = async tokens => {
  const cfg = await loadOidcConfig()
  if (!tokens?.refresh_token) {
    throw new Error('No refresh_token stored — user must re-authenticate')
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: cfg.client_id
  })
  const res = await fetch(`${cfg.issuer}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Refresh failed: ${res.status} ${errBody}`)
  }
  const fresh = await res.json()
  // refresh_token may or may not be rotated by Lemonldap — keep old as fallback
  return saveTokens({
    refresh_token: tokens.refresh_token,
    ...fresh
  })
}

export const getValidAccessToken = async () => {
  let tokens = await getStoredTokens()
  if (!tokens) {
    const err = new Error('NOT_CONNECTED')
    err.code = 'NOT_CONNECTED'
    throw err
  }
  if (isExpired(tokens)) {
    tokens = await refreshTokens(tokens)
  }
  return tokens.access_token
}

export const clearTokens = async () => {
  try {
    await fs.unlink(TOKENS_PATH)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  cache = null
}
