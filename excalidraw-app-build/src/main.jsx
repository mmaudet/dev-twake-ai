// Bundled Excalidraw editor for the Cozy "excalidraw" coquille.
//
// Looks up `cozyDomain`, `cozyToken` and the `fileId` of the .excalidraw
// file on `window.__excalidrawEditor` (set by the coquille's index.html),
// fetches the file content from cozy-stack, hydrates the Excalidraw
// component, debounce-saves the scene back on every change, and mirrors
// the Excalidraw title (appState.name) onto the Drive file name so a
// rename in the Excalidraw header propagates to the Drive.

import 'react'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

const EXTENSION = '.excalidraw'

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

function stripExt(name) {
  if (!name) return ''
  return name.toLowerCase().endsWith(EXTENSION)
    ? name.slice(0, -EXTENSION.length)
    : name
}

// Cozy's VFS rejects slashes and a few other chars in file names. Replace
// them defensively so a title with `/` doesn't surface as a 4xx.
function sanitizeName(name) {
  return (name || '').trim().replace(/[\\/]+/g, '-').slice(0, 200)
}

async function fetchFileMeta({ cozyDomain, cozyToken, fileId }) {
  const res = await fetch(`https://${cozyDomain}/files/${fileId}`, {
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${cozyToken}`,
      'Accept': 'application/vnd.api+json'
    }
  })
  if (!res.ok) throw new Error(`GET /files/${fileId} → ${res.status}`)
  const body = await res.json()
  return body.data
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

async function renameFile({ cozyDomain, cozyToken, fileId }, newName) {
  const res = await fetch(`https://${cozyDomain}/files/${fileId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${cozyToken}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json'
    },
    body: JSON.stringify({
      data: {
        type: 'io.cozy.files',
        id: fileId,
        attributes: { name: newName }
      }
    })
  })
  if (!res.ok) throw new Error(`PATCH /files name → ${res.status} ${await res.text()}`)
  const body = await res.json()
  return body.data.attributes.name
}

const titleBarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5em',
  padding: '0.5em 1em',
  borderBottom: '1px solid #e6e6e6',
  background: '#f5f5fb',
  fontFamily: 'system-ui, sans-serif',
  flex: '0 0 auto',
  minHeight: '2.5em',
  boxSizing: 'border-box'
}
const titleInputStyle = {
  flex: '1 1 auto',
  border: '1px solid transparent',
  borderRadius: 4,
  padding: '0.3em 0.6em',
  fontSize: '1em',
  background: 'transparent',
  color: '#333',
  outline: 'none',
  minWidth: 0
}
const extLabelStyle = {
  color: '#999',
  fontSize: '0.85em',
  fontFamily: 'monospace'
}

function TitleBar({ value, onCommit }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const commit = () => {
    const next = sanitizeName(draft)
    if (next && next !== value) onCommit(next)
    else setDraft(value)
  }
  return React.createElement('div', { style: titleBarStyle },
    React.createElement('input', {
      style: titleInputStyle,
      value: draft,
      onChange: e => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: e => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
        else if (e.key === 'Escape') { e.preventDefault(); setDraft(value); e.target.blur() }
      },
      placeholder: 'Sans titre',
      'aria-label': 'Nom du dessin'
    }),
    React.createElement('span', { style: extLabelStyle }, EXTENSION)
  )
}

function App() {
  const ctx = getEditorCtx()
  const [initial, setInitial] = useState(null)
  const [excalApi, setExcalApi] = useState(null)
  const [title, setTitle] = useState('')
  const saveTimer = useRef(null)
  const lastSavedJson = useRef('')
  // The Drive file name is the single source of truth. We mirror it into
  // the local title state on mount, and PATCH the file when the user
  // edits it via the title bar above the editor.
  const currentDriveName = useRef('')

  useEffect(() => {
    Promise.all([fetchFileMeta(ctx), fetchFileContent(ctx)])
      .then(([meta, scene]) => {
        currentDriveName.current = meta.attributes.name
        const driveTitle = stripExt(meta.attributes.name)
        setTitle(driveTitle)
        const appState = { ...(scene.appState || {}), collaborators: new Map() }
        appState.name = driveTitle
        // Re-stringify with the synced name so the very first save (if
        // any) doesn't no-op on a stale `name` field.
        lastSavedJson.current = JSON.stringify({ ...scene, appState: { ...appState, collaborators: undefined } })
        setInitial({
          elements: scene.elements || [],
          appState,
          files: scene.files || {}
        })
      })
      .catch(e => {
        console.error('[excalidraw] load failed', e)
        lastSavedJson.current = JSON.stringify(EMPTY_SCENE)
        setInitial({ elements: [], appState: { collaborators: new Map() }, files: {} })
      })
  }, [])

  async function pushNameIfChanged(appState) {
    const sceneName = sanitizeName(appState && appState.name)
    if (!sceneName) return
    const want = sceneName + EXTENSION
    if (want === currentDriveName.current) return
    try {
      const got = await renameFile(ctx, want)
      currentDriveName.current = got
    } catch (e) {
      console.warn('[excalidraw] file rename failed', e.message || e)
    }
  }

  const scheduleSave = useCallback((elements, appState, files) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const json = serializeAsJSON(elements, appState, files, 'local')
        if (json !== lastSavedJson.current) {
          await uploadFileContent(ctx, json)
          lastSavedJson.current = json
        }
        // Title sync runs even when only the name changed — the JSON
        // diff above may be zero-length (Excalidraw doesn't serialize
        // appState.name in some builds) but we still want to PATCH.
        await pushNameIfChanged(appState)
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
      if (json !== lastSavedJson.current) {
        try {
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
      // Fire-and-forget rename so a title edited just before quitting
      // doesn't get lost. PATCH supports keepalive too.
      const sceneName = sanitizeName(appState && appState.name)
      if (sceneName) {
        const want = sceneName + EXTENSION
        if (want !== currentDriveName.current) {
          try {
            fetch(`https://${ctx.cozyDomain}/files/${ctx.fileId}`, {
              method: 'PATCH',
              credentials: 'include',
              keepalive: true,
              headers: {
                'Authorization': `Bearer ${ctx.cozyToken}`,
                'Content-Type': 'application/vnd.api+json'
              },
              body: JSON.stringify({
                data: {
                  type: 'io.cozy.files',
                  id: ctx.fileId,
                  attributes: { name: want }
                }
              })
            })
            currentDriveName.current = want
          } catch {}
        }
      }
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

  const onTitleCommit = async next => {
    setTitle(next)
    // Push the new name into Excalidraw's appState so subsequent
    // serializations carry it too. excalApi may not be set yet on the
    // very first render — that's fine, the load path already seeded it.
    if (excalApi) {
      excalApi.updateScene({ appState: { ...excalApi.getAppState(), name: next } })
    }
    try {
      const got = await renameFile(ctx, next + EXTENSION)
      currentDriveName.current = got
    } catch (e) {
      console.warn('[excalidraw] rename failed', e.message || e)
      // Roll back the title field if the rename was rejected.
      setTitle(stripExt(currentDriveName.current))
    }
  }

  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%'
    }
  },
    React.createElement(TitleBar, { value: title, onCommit: onTitleCommit }),
    React.createElement('div', {
      style: {
        flex: '1 1 auto',
        minHeight: 0,
        position: 'relative'
      }
    },
      React.createElement(Excalidraw, {
        initialData: initial,
        excalidrawAPI: setExcalApi,
        onChange: scheduleSave,
        langCode: 'fr-FR'
      })
    )
  )
}

const mount = document.getElementById('excalidraw-root')
createRoot(mount).render(React.createElement(App))
