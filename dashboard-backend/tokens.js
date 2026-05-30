import { promises as fs } from 'fs'

const TOKENS_PATH = process.env.TOKENS_PATH || '/home/mmaudet/.dashboard-backend/tokens.json'
const OIDC_CONFIG_PATH = process.env.OIDC_CONFIG_PATH || '/home/mmaudet/.dashboard-backend/oidc.json'

// Widget id constants — these are the keys under which we store tokens
// in the JSON file. Each widget keeps its own independent connection,
// even though both go through sso.linagora.com with the same client.
export const VALID_WIDGETS = new Set(['mail', 'calendar'])

let cache = null

export const loadOidcConfig = async () => {
  const raw = await fs.readFile(OIDC_CONFIG_PATH, 'utf8')
  return JSON.parse(raw)
}

const readTokens = async () => {
  try {
    const raw = await fs.readFile(TOKENS_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    // Migration: legacy single-account file → put under widget 'mail'
    if (parsed.access_token && !parsed.mail && !parsed.calendar) {
      cache = { mail: parsed, calendar: null }
    } else {
      cache = {
        mail: parsed.mail || null,
        calendar: parsed.calendar || null
      }
    }
    return cache
  } catch (e) {
    if (e.code === 'ENOENT') {
      cache = { mail: null, calendar: null }
      return cache
    }
    throw e
  }
}

const writeTokens = async store => {
  await fs.writeFile(TOKENS_PATH, JSON.stringify(store, null, 2), { mode: 0o600 })
  cache = store
  return store
}

export const getStore = async () => {
  if (cache) return cache
  return readTokens()
}

const assertWidget = widget => {
  if (!VALID_WIDGETS.has(widget)) {
    throw Object.assign(new Error(`Invalid widget '${widget}'`), { status: 400 })
  }
}

export const getTokens = async widget => {
  assertWidget(widget)
  const store = await getStore()
  return store[widget]
}

export const saveTokens = async (widget, tokens) => {
  assertWidget(widget)
  const store = await getStore()
  store[widget] = {
    ...tokens,
    saved_at: Math.floor(Date.now() / 1000)
  }
  await writeTokens(store)
  return store[widget]
}

export const clearTokens = async widget => {
  assertWidget(widget)
  const store = await getStore()
  store[widget] = null
  await writeTokens(store)
}

export const isExpired = (tokens, marginSeconds = 60) => {
  if (!tokens || !tokens.access_token) return true
  const savedAt = tokens.saved_at || 0
  const expiresIn = tokens.expires_in || 0
  return Date.now() / 1000 >= savedAt + expiresIn - marginSeconds
}

export const exchangeCode = async (widget, { code, code_verifier, redirect_uri }) => {
  assertWidget(widget)
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
    throw new Error(`OIDC token exchange failed: ${res.status} ${await res.text()}`)
  }
  return saveTokens(widget, await res.json())
}

const refreshTokens = async (widget, tokens) => {
  const cfg = await loadOidcConfig()
  if (!tokens?.refresh_token) {
    const err = new Error('NOT_CONNECTED')
    err.code = 'NOT_CONNECTED'
    throw err
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
    throw new Error(`Refresh failed: ${res.status} ${await res.text()}`)
  }
  const fresh = await res.json()
  return saveTokens(widget, {
    refresh_token: tokens.refresh_token, // Lemonldap may not rotate
    ...fresh
  })
}

export const getValidAccessToken = async widget => {
  let tokens = await getTokens(widget)
  if (!tokens) {
    const err = new Error('NOT_CONNECTED')
    err.code = 'NOT_CONNECTED'
    throw err
  }
  if (isExpired(tokens)) {
    tokens = await refreshTokens(widget, tokens)
  }
  return tokens.access_token
}
