import { useEffect, useRef, useState, useCallback } from 'react'
import { useClient } from 'cozy-client'

const SETTING_ID = 'dashboard'
const DEFAULT_LAYOUT = {
  lg: [
    { i: 'recentFiles',  x: 0, y: 0, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'recentNotes',  x: 6, y: 0, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'tasks',        x: 0, y: 6, w: 8, h: 6, minW: 4, minH: 4 },
    { i: 'quickCapture', x: 8, y: 6, w: 4, h: 6, minW: 3, minH: 4 }
  ]
}

const DEFAULT_CONFIG = {
  kanbnApiKey: '',
  openprojectApiKey: ''
}

// Stocké dans io.cozy.settings avec un _id custom. C'est la convention Cozy
// pour des settings d'app : on crée un doc avec un _id stable.
const SETTING_DOC_ID = 'io.cozy.settings/dashboard.layout'

const useDashboardLayout = () => {
  const client = useClient()
  const [layouts, setLayouts] = useState(DEFAULT_LAYOUT)
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const revRef = useRef(null)
  const saveTimer = useRef(null)

  // Initial fetch
  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      try {
        const { data } = await client.stackClient.fetchJSON(
          'GET',
          `/data/io.cozy.settings/${encodeURIComponent(SETTING_ID)}`
        )
        if (cancelled) return
        revRef.current = data._rev
        if (data.layouts) setLayouts(data.layouts)
        if (data.config) setConfig({ ...DEFAULT_CONFIG, ...data.config })
      } catch (err) {
        // 404 = doc doesn't exist yet, fine — keep defaults
        if (err.status !== 404) {
          // eslint-disable-next-line no-console
          console.warn('[dashboard] could not load settings', err)
        }
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [client])

  const persist = useCallback(
    (nextLayouts, nextConfig) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        const body = {
          _id: SETTING_ID,
          layouts: nextLayouts,
          config: nextConfig
        }
        if (revRef.current) body._rev = revRef.current
        try {
          const res = await client.stackClient.fetchJSON(
            'PUT',
            `/data/io.cozy.settings/${encodeURIComponent(SETTING_ID)}`,
            body
          )
          revRef.current = res.rev || res._rev
        } catch (err) {
          // 409 = conflict, refetch rev and retry once
          if (err.status === 409) {
            try {
              const { _rev } = await client.stackClient.fetchJSON(
                'GET',
                `/data/io.cozy.settings/${encodeURIComponent(SETTING_ID)}`
              )
              revRef.current = _rev
              body._rev = _rev
              const res = await client.stackClient.fetchJSON(
                'PUT',
                `/data/io.cozy.settings/${encodeURIComponent(SETTING_ID)}`,
                body
              )
              revRef.current = res.rev || res._rev
            } catch (e2) {
              // eslint-disable-next-line no-console
              console.error('[dashboard] save failed after retry', e2)
            }
          } else {
            // eslint-disable-next-line no-console
            console.error('[dashboard] save failed', err)
          }
        }
      }, 400)
    },
    [client]
  )

  const updateLayouts = useCallback(
    nextLayouts => {
      setLayouts(nextLayouts)
      persist(nextLayouts, config)
    },
    [config, persist]
  )

  const updateConfig = useCallback(
    nextConfig => {
      const merged = { ...config, ...nextConfig }
      setConfig(merged)
      persist(layouts, merged)
    },
    [config, layouts, persist]
  )

  return { layouts, config, loaded, updateLayouts, updateConfig, DEFAULT_LAYOUT }
}

export default useDashboardLayout
