import { getValidAccessToken } from './tokens.js'

const JMAP_BASE = process.env.JMAP_BASE || 'https://jmap.linagora.com'

const sessionCache = new Map()  // accessToken → session

const getSession = async accessToken => {
  if (sessionCache.has(accessToken)) return sessionCache.get(accessToken)
  const res = await fetch(`${JMAP_BASE}/jmap/session`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`JMAP session failed: ${res.status}`)
  const session = await res.json()
  sessionCache.set(accessToken, session)
  return session
}

export const listRecent = async (limit = 10) => {
  const accessToken = await getValidAccessToken('mail')
  const session = await getSession(accessToken)
  const accountId = session.primaryAccounts?.['urn:ietf:params:jmap:mail']
  if (!accountId) throw new Error('No JMAP mail account')
  const apiUrl = session.apiUrl || `${JMAP_BASE}/jmap`
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls: [
        ['Email/query', {
          accountId,
          sort: [{ property: 'receivedAt', isAscending: false }],
          limit
        }, '0'],
        ['Email/get', {
          accountId,
          '#ids': { resultOf: '0', name: 'Email/query', path: '/ids' },
          properties: ['id', 'subject', 'from', 'receivedAt', 'preview', 'keywords']
        }, '1']
      ]
    })
  })
  if (!res.ok) throw new Error(`JMAP API failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  const emails = json.methodResponses.find(m => m[0] === 'Email/get')?.[1]?.list || []
  return emails.map(e => ({
    id: e.id,
    subject: e.subject || '(sans sujet)',
    from: e.from?.[0]?.name || e.from?.[0]?.email || '?',
    fromEmail: e.from?.[0]?.email || '',
    receivedAt: e.receivedAt,
    preview: e.preview || '',
    unread: !e.keywords?.$seen
  }))
}
