import ICAL from 'ical.js'

import { getValidAccessToken } from './tokens.js'

const CAL_BASE = process.env.CAL_BASE || 'https://tcalendar.linagora.com'

const userIdCache = new Map()      // accessToken → userId
const calendarsCache = new Map()   // accessToken → [{id, href, displayname, isOwn}]

const getUserId = async accessToken => {
  if (userIdCache.has(accessToken)) return userIdCache.get(accessToken)
  const res = await fetch(`${CAL_BASE}/api/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`tcalendar /api/user failed: ${res.status}`)
  const user = await res.json()
  const id = user.id || user._id
  userIdCache.set(accessToken, id)
  return id
}

// PROPFIND on /dav/calendars/<userId>/ to discover all calendars (own +
// delegated). Sabre returns internal hrefs starting with /calendars/, we
// prepend /dav so the proxy on tcalendar.linagora.com routes the follow-up
// REPORT to Sabre.
const fetchCalendars = async accessToken => {
  if (calendarsCache.has(accessToken)) return calendarsCache.get(accessToken)
  const userId = await getUserId(accessToken)
  const res = await fetch(`${CAL_BASE}/dav/calendars/${userId}/`, {
    method: 'PROPFIND',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Depth: '1',
      'Content-Type': 'application/xml'
    },
    body: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`
  })
  if (!res.ok && res.status !== 207) {
    throw new Error(`PROPFIND calendars failed: ${res.status}`)
  }
  const xml = await res.text()
  const calendars = []
  const responseRe = /<[^>]*?:?response[^>]*>([\s\S]*?)<\/[^>]*?:?response>/g
  let m
  while ((m = responseRe.exec(xml)) !== null) {
    const block = m[1]
    let href = (block.match(/<[^>]*?:?href[^>]*>([^<]+)</) || [])[1]
    const name = (block.match(/<[^>]*?:?displayname[^>]*>([^<]+)</) || [])[1]
    if (!href || !href.match(new RegExp(`/calendars/${userId}/[^/]+/?$`))) continue
    if (/\/(inbox|outbox)\/?$/.test(href)) continue
    if (!name) continue
    if (!href.startsWith('/dav/')) href = '/dav' + href
    if (!href.endsWith('/')) href += '/'
    // Calendar ID = last path segment before final /
    const segments = href.replace(/\/$/, '').split('/')
    const id = segments[segments.length - 1]
    calendars.push({
      id,
      href,
      displayname: name,
      isOwn: id === userId
    })
  }
  calendarsCache.set(accessToken, calendars)
  return calendars
}

export const listCalendars = async () => {
  const accessToken = await getValidAccessToken('calendar')
  return fetchCalendars(accessToken)
}

const formatICalDate = d => {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

const parseEventsFromCalendarMultiget = (xml, calendarName) => {
  const events = []
  const responseRe = /<[^>]*?:?response[^>]*>([\s\S]*?)<\/[^>]*?:?response>/g
  let m
  while ((m = responseRe.exec(xml)) !== null) {
    const block = m[1]
    const cdata = (block.match(/<[^>]*?:?calendar-data[^>]*>([\s\S]*?)<\/[^>]*?:?calendar-data>/) || [])[1]
    if (!cdata) continue
    const icalStr = cdata
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
    try {
      const jcal = ICAL.parse(icalStr)
      const vcal = new ICAL.Component(jcal)
      for (const ve of vcal.getAllSubcomponents('vevent')) {
        const event = new ICAL.Event(ve)
        events.push({
          uid: event.uid,
          summary: event.summary || '(sans titre)',
          location: event.location || '',
          start: event.startDate ? event.startDate.toJSDate().toISOString() : null,
          end: event.endDate ? event.endDate.toJSDate().toISOString() : null,
          calendarName
        })
      }
    } catch (e) {
      // ignore malformed ICS blobs
    }
  }
  return events
}

const queryEventsInRange = async (accessToken, calendarHref, startUTC, endUTC, calendarName) => {
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${formatICalDate(startUTC)}" end="${formatICalDate(endUTC)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`
  const res = await fetch(`${CAL_BASE}${calendarHref}`, {
    method: 'REPORT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8'
    },
    body: xmlBody
  })
  if (res.status === 404) return []
  if (!res.ok && res.status !== 207) throw new Error(`REPORT ${calendarHref} failed: ${res.status}`)
  const xml = await res.text()
  return parseEventsFromCalendarMultiget(xml, calendarName)
}

// dateISO: 'YYYY-MM-DD'
// calendarIds: array of calendar ids to include (default = user's own only)
export const eventsForDay = async (dateISO, calendarIds) => {
  const accessToken = await getValidAccessToken('calendar')
  const allCalendars = await fetchCalendars(accessToken)
  let calendars
  if (Array.isArray(calendarIds) && calendarIds.length > 0) {
    const set = new Set(calendarIds)
    calendars = allCalendars.filter(c => set.has(c.id))
  } else {
    // Default: user's own calendar only
    calendars = allCalendars.filter(c => c.isOwn)
  }
  const day = new Date(dateISO)
  const startUTC = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0))
  const endUTC = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1, 0, 0, 0))
  const all = []
  await Promise.all(calendars.map(async cal => {
    try {
      const events = await queryEventsInRange(accessToken, cal.href, startUTC, endUTC, cal.displayname)
      all.push(...events)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[caldav] cal ${cal.href} failed: ${e.message}`)
    }
  }))
  // Dedupe by uid+start, prefer the user's own calendar copy
  const ownCalName = allCalendars.find(c => c.isOwn)?.displayname
  const byKey = new Map()
  for (const e of all) {
    const key = `${e.uid || e.summary}|${e.start || ''}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, e)
    } else if (e.calendarName === ownCalName && prev.calendarName !== ownCalName) {
      byKey.set(key, e)
    }
  }
  const startISO = startUTC.toISOString()
  const endISO = endUTC.toISOString()
  const cleaned = [...byKey.values()].filter(e => e.start && e.start >= startISO && e.start < endISO)
  cleaned.sort((a, b) => a.start.localeCompare(b.start))
  return cleaned.slice(0, 50)
}
