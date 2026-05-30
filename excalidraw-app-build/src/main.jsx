// Bundled Excalidraw editor for the Cozy "excalidraw" coquille.
//
// Looks up `cozyDomain`, `cozyToken` and the `fileId` of the .excalidraw
// file on `window.__excalidrawEditor` (set by the coquille's index.html),
// fetches the file content from cozy-stack, hydrates the Excalidraw
// component, and debounce-saves the scene back on every change.

import 'react'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

const EMPTY_SCENE = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements: [],
  appState: {},
  files: {}
}

function getEditorCtx() {
  const ctx = window.__excalidrawEditor || {}
  if (!ctx.cozyDomain || !ctx.cozyToken || !ctx.fileId) {
    throw new Error('Missing editor context — cozyDomain/cozyToken/fileId not set')
  }
  return ctx
}

async function fetchFileContent({ cozyDomain, cozyToken, fileId }) {
  const res = await fetch(`https://${cozyDomain}/files/download/${fileId}`, {
    credentials: 'include',
    headers: { 'Authorization': `Bearer ${cozyToken}` }
  })
  if (!res.ok) throw new Error(`Download → ${res.status}`)
  const text = await res.text()
  if (!text.trim()) return EMPTY_SCENE
  try {
    return JSON.parse(text)
  } catch (e) {
    console.warn('[excalidraw] file content unparseable, starting blank', e)
    return EMPTY_SCENE
  }
}

async function uploadFileContent({ cozyDomain, cozyToken, fileId }, body) {
  // cozy-stack: PUT /files/:file-id?Type=file overwrites the binary content
  // of an existing file (alongside POST /files/:dir-id which creates).
  const res = await fetch(
    `https://${cozyDomain}/files/${fileId}?Type=file`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${cozyToken}`,
        'Content-Type': 'application/json'
      },
      body
    }
  )
  if (!res.ok) throw new Error(`PUT /files → ${res.status} ${await res.text()}`)
}

function App() {
  const ctx = getEditorCtx()
  const [initial, setInitial] = useState(null)
  const [excalApi, setExcalApi] = useState(null)
  const saveTimer = useRef(null)
  const lastSavedJson = useRef('')

  useEffect(() => {
    fetchFileContent(ctx)
      .then(d => {
        lastSavedJson.current = JSON.stringify(d)
        setInitial({
          elements: d.elements || [],
          appState: { ...(d.appState || {}), collaborators: new Map() },
          files: d.files || {}
        })
      })
      .catch(e => {
        console.error('[excalidraw] load failed', e)
        lastSavedJson.current = JSON.stringify(EMPTY_SCENE)
        setInitial({ elements: [], appState: { collaborators: new Map() }, files: {} })
      })
  }, [])

  const scheduleSave = useCallback((elements, appState, files) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const json = serializeAsJSON(elements, appState, files, 'local')
        if (json === lastSavedJson.current) return
        await uploadFileContent(ctx, json)
        lastSavedJson.current = json
      } catch (e) {
        console.warn('[excalidraw] save failed', e)
      }
    }, 800)
  }, [])

  // Flush any pending save when the tab goes hidden / unloads.
  useEffect(() => {
    const flush = () => {
      if (!excalApi) return
      const elements = excalApi.getSceneElements()
      const appState = excalApi.getAppState()
      const files = excalApi.getFiles()
      const json = serializeAsJSON(elements, appState, files, 'local')
      if (json === lastSavedJson.current) return
      try {
        // Use fetch+keepalive so the request can survive unload.
        fetch(`https://${ctx.cozyDomain}/files/${ctx.fileId}?Type=file`, {
          method: 'PUT',
          credentials: 'include',
          keepalive: true,
          headers: {
            'Authorization': `Bearer ${ctx.cozyToken}`,
            'Content-Type': 'application/json'
          },
          body: json
        })
        lastSavedJson.current = json
      } catch {}
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [excalApi])

  if (!initial) {
    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'system-ui', color: '#555' }
    }, 'Chargement…')
  }

  return React.createElement(Excalidraw, {
    initialData: initial,
    excalidrawAPI: setExcalApi,
    onChange: scheduleSave,
    langCode: 'fr-FR'
  })
}

const mount = document.getElementById('excalidraw-root')
createRoot(mount).render(React.createElement(App))
