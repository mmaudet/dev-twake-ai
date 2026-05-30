import { useEffect, useRef, useState, useCallback } from 'react'
import { useClient } from 'cozy-client'

import { WIDGET_CATALOG, listWidgets } from 'src/widgets/catalog'

const SETTING_ID = 'dashboard'

const DEFAULT_CONFIG = {
  kanbnApiKey: '',
  openprojectApiKey: ''
}

// Build a default layout from the catalogue, in declaration order, packing
// widgets into 12-column rows. Only widgets with enabledByDefault=true are
// included.
const buildDefaultLayout = () => {
  let x = 0
  let y = 0
  let rowH = 0
  const lg = []
  for (const w of listWidgets()) {
    if (!w.enabledByDefault) continue
    const { w: ww, h, minW, minH } = w.defaultLayout
    if (x + ww > 12) { x = 0; y += rowH; rowH = 0 }
    lg.push({ i: w.id, x, y, w: ww, h, minW, minH })
    x += ww
    rowH = Math.max(rowH, h)
  }
  return { lg }
}

const DEFAULT_LAYOUT = buildDefaultLayout()

// widgets state shape: { [id]: { enabled: boolean, config: {...} } }
const buildDefaultWidgets = () => {
  const out = {}
  for (const w of listWidgets()) {
    out[w.id] = { enabled: !!w.enabledByDefault, config: {} }
  }
  return out
}

const DEFAULT_WIDGETS = buildDefaultWidgets()

const useDashboardLayout = () => {
  const client = useClient()
  const [layouts, setLayouts] = useState(DEFAULT_LAYOUT)
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS)
  const [loaded, setLoaded] = useState(false)
  const revRef = useRef(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      try {
        const doc = await client.stackClient.fetchJSON(
          'GET',
          `/data/io.cozy.settings/${encodeURIComponent(SETTING_ID)}`
        )
        if (cancelled) return
        revRef.current = doc._rev
        if (doc.layouts) setLayouts(doc.layouts)
        if (doc.config) setConfig({ ...DEFAULT_CONFIG, ...doc.config })
        if (doc.widgets) {
          // Merge saved widgets state with catalogue defaults so newly added
          // catalogue entries appear (disabled) without losing user toggles.
          const merged = { ...DEFAULT_WIDGETS }
          for (const id of Object.keys(doc.widgets)) {
            if (merged[id]) merged[id] = { ...merged[id], ...doc.widgets[id] }
          }
          setWidgets(merged)
        }
      } catch (err) {
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
    (nextLayouts, nextConfig, nextWidgets) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        const body = {
          _id: SETTING_ID,
          layouts: nextLayouts,
          config: nextConfig,
          widgets: nextWidgets
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
          if (err.status === 409) {
            try {
              const current = await client.stackClient.fetchJSON(
                'GET',
                `/data/io.cozy.settings/${encodeURIComponent(SETTING_ID)}`
              )
              revRef.current = current._rev
              body._rev = current._rev
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
      persist(nextLayouts, config, widgets)
    },
    [config, widgets, persist]
  )

  const updateConfig = useCallback(
    nextConfig => {
      const merged = { ...config, ...nextConfig }
      setConfig(merged)
      persist(layouts, merged, widgets)
    },
    [config, layouts, widgets, persist]
  )

  // Toggle a widget on/off. When turning on, append it to the layout with
  // its catalogue defaults. When turning off, remove it from the layout
  // (but keep its config sub-object).
  const setWidgetEnabled = useCallback(
    (id, enabled) => {
      const cat = WIDGET_CATALOG[id]
      if (!cat) return
      const nextWidgets = {
        ...widgets,
        [id]: { ...(widgets[id] || { config: {} }), enabled }
      }
      let nextLayouts = layouts
      if (enabled) {
        const lg = layouts.lg || []
        if (!lg.some(item => item.i === id)) {
          // append at the bottom — find max y+h then place there
          const yBottom = lg.reduce((max, it) => Math.max(max, it.y + it.h), 0)
          nextLayouts = {
            ...layouts,
            lg: [...lg, { i: id, x: 0, y: yBottom, ...cat.defaultLayout }]
          }
        }
      } else {
        nextLayouts = {
          ...layouts,
          lg: (layouts.lg || []).filter(item => item.i !== id)
        }
      }
      setWidgets(nextWidgets)
      setLayouts(nextLayouts)
      persist(nextLayouts, config, nextWidgets)
    },
    [widgets, layouts, config, persist]
  )

  const updateWidgetConfig = useCallback(
    (id, patch) => {
      const prev = widgets[id] || { enabled: false, config: {} }
      const nextWidgets = {
        ...widgets,
        [id]: { ...prev, config: { ...(prev.config || {}), ...patch } }
      }
      setWidgets(nextWidgets)
      persist(layouts, config, nextWidgets)
    },
    [widgets, layouts, config, persist]
  )

  return {
    layouts,
    config,
    widgets,
    loaded,
    updateLayouts,
    updateConfig,
    setWidgetEnabled,
    updateWidgetConfig,
    DEFAULT_LAYOUT
  }
}

export default useDashboardLayout
