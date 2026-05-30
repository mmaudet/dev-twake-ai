import ICAL from 'ical.js'

import { getValidAccessToken } from './tokens.js'

const CAL_BASE = process.env.CAL_BASE || 'https://tcalendar.linagora.com'

let cachedUserId = null
let cachedUserIdFor = null
let cachedCalendarHrefs = null
let cachedCalendarsFor = null

const escapeXml = s => String(s).replace(/[<>&'"]/g, c => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
}[c]))

const getUserId = async accessToken => {
  if (cachedUserId && cachedUserIdFor === accessToken) return cachedUserId
  const res = await fetch(`${CAL_BASE}/api/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`tcalendar /api/user failed: ${res.status}`)
  const user = await res.json()
  cachedUserId = user.id || user._id
  cachedUserIdFor = accessToken
  return cachedUserId
}

// PROPFIND on /dav/calendars/<userId>/ to discover calendars (Depth: 1).
// Returns array of {href, displayname}.
const listCalendars = async (accessToken, userId) => {
  if (cachedCalendarHrefs && cachedCalendarsFor === accessToken) return cachedCalendarHrefs
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
  // Naive XML parsing — pull <d:href> + <d:displayname>
  const calendars = []
  const responseRe = /<[^>]*?:?response[^>]*>([\s\S]*?)<\/[^>]*?:?response>/g
  let m
  while ((m = responseRe.exec(xml)) !== null) {
    const block = m[1]
    const href = (block.match(/<[^>]*?:?href[^>]*>([^<]+)</) || [])[1]
    const name = (block.match(/<[^>]*?:?displayname[^>]*>([^<]+)</) || [])[1]
    // Only keep child calendars (not the root /calendars/<userId>/)
    if (href && href.match(new RegExp(`/calendars/${userId}/[^/]+/?$`))) {
      calendars.push({ href: href.replace(/\/$/, '') + '/', displayname: name || 'Calendar' })
    }
  }
  cachedCalendarHrefs = calendars
  cachedCalendarsFor = accessToken
  return calendars
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
    let icalStr = cdata
    // Unescape XML entities
    icalStr = icalStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
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
          allDay: event.startDate ? !event.startDate.isDate === false : false,
          calendarName
        })
      }
    } catch (e) {
      // ignore malformed events
    }
  }
  return events
}

const queryEventsInRange = async (accessToken, calendarHref, startUTC, endUTC, calendarName) => {
  const start = formatICalDate(startUTC)
  const end = formatICalDate(endUTC)
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${start}" end="${end}"/>
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
  if (res.status === 404) return [] // empty calendar
  if (!res.ok && res.status !== 207) {
    throw new Error(`REPORT ${calendarHref} failed: ${res.status}`)
  }
  const xml = await res.text()
  return parseEventsFromCalendarMultiget(xml, calendarName)
}

export const eventsForDay = async dateISO => {
  const accessToken = await getValidAccessToken()
  const userId = await getUserId(accessToken)
  const calendars = await listCalendars(accessToken, userId)
  const day = new Date(dateISO)
  const startUTC = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0))
  const endUTC = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1, 0, 0, 0))
  const all = []
  for (const cal of calendars) {
    try {
      const events = await queryEventsInRange(accessToken, cal.href, startUTC, endUTC, cal.displayname)
      all.push(...events)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[caldav] cal ${cal.href} failed: ${e.message}`)
    }
  }
  all.sort((a, b) => {
    if (!a.start) return 1
    if (!b.start) return -1
    return a.start.localeCompare(b.start)
  })
  return all
}
