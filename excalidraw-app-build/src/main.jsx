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

// Debug log gate: enabled if window.__excalidrawEditor.debug is truthy
// (set from index.html via ?debug=1 or via the manifest). Off in prod
// to keep the browser console clean for end users.
const dbg = (...args) => {
  if (window.__excalidrawEditor && window.__excalidrawEditor.debug) {
    // eslint-disable-next-line no-console
    console.log(...args)
  }
}
// Non-fatal warnings: only surfaced behind the same debug gate.
const warn = (...args) => {
  if (window.__excalidrawEditor && window.__excalidrawEditor.debug) {
    // eslint-disable-next-line no-console
    console.warn(...args)
  }
}

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

// Cozy's VFS rejects slashes and a few other chars in file names. Strip
// path separators, ASCII control chars (\x00-\x1f, plus DEL) — defensive
// against pasted weird input or Unicode-confusable smuggling — and cap at
// 200 chars to stay below filesystem limits.
function sanitizeName(name) {
  return (name || '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .replace(/[\\/]+/g, '-')
    .slice(0, 200)
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

// Walk up from dirId to the root, collecting {id, name} for each parent
// folder. Used to render the breadcrumb path under the filename. We stop
// at the root directory (whose name is "" and id "io.cozy.files.root-dir").
async function fetchParentPath({ cozyDomain, cozyToken }, startDirId) {
  const chain = []
  let id = startDirId
  // Cap the climb to a safe depth so a bad data shape can't loop.
  for (let depth = 0; depth < 20 && id && id !== 'io.cozy.files.root-dir'; depth++) {
    const res = await fetch(`https://${cozyDomain}/files/${id}`, {
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${cozyToken}`,
        'Accept': 'application/vnd.api+json'
      }
    })
    if (!res.ok) break
    const body = await res.json()
    const a = body.data.attributes
    chain.unshift({ id: body.data.id, name: a.name || '/' })
    id = a.dir_id
  }
  return chain
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
    warn('[excalidraw] file content unparseable, starting blank', e)
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

// Top bar styled after cozy-notes' editor header:
//   [back arrow] [app icon] [bold filename | breadcrumb path]
// 48px tall, light background, thin bottom shadow. The filename is a
// click-to-edit affordance — clicking it swaps the bold label for an
// input pre-filled with the current name. Blur or Enter commits.
const barStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75em',
  padding: '0 1rem',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  fontFamily: 'system-ui, sans-serif',
  flex: '0 0 auto',
  height: '3rem',
  boxSizing: 'border-box'
}
const iconBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2rem',
  height: '2rem',
  border: 0,
  background: 'transparent',
  color: '#444',
  cursor: 'pointer',
  borderRadius: 4,
  padding: 0,
  flex: '0 0 auto'
}
const appIconStyle = { width: '1.5rem', height: '1.5rem', flex: '0 0 auto' }
const fileInfosStyle = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  minWidth: 0,
  flex: '1 1 auto',
  lineHeight: 1.2
}
const filenameRowStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.15em',
  minWidth: 0
}
const filenameLabelStyle = {
  fontWeight: 600,
  color: '#222',
  fontSize: '0.95rem',
  cursor: 'text',
  padding: '2px 4px',
  borderRadius: 3,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '40em'
}
const filenameLabelHoverStyle = { ...filenameLabelStyle, background: '#f3f3f7' }
const filenameExtStyle = {
  color: '#999',
  fontSize: '0.85rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
}
const filenameInputStyle = {
  border: '1px solid #6965DB',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: '0.95rem',
  fontWeight: 600,
  color: '#222',
  outline: 'none',
  background: '#fff',
  minWidth: '8em',
  maxWidth: '40em'
}
const breadcrumbRowStyle = {
  fontSize: '0.78rem',
  color: '#888',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}
const breadcrumbSepStyle = { padding: '0 0.4em', color: '#bbb' }
const breadcrumbLinkStyle = { color: '#666', textDecoration: 'none' }

// Build a URL into the user's Drive at a given folder.
function driveFolderUrl(cozyDomain, folderId) {
  // We're at e.g. mmaudet-excalidraw.dev-twake.maudet.cloud; the Drive lives
  // at mmaudet-drive.dev-twake.maudet.cloud. Swap the "excalidraw" segment.
  const parts = location.hostname.split('.')
  parts[0] = parts[0].replace(/-excalidraw$/, '-drive')
  return `${location.protocol}//${parts.join('.')}/#/folder/${folderId}`
}

function BackButton({ cozyDomain, dirId }) {
  if (!dirId) return null
  return React.createElement('a', {
    href: driveFolderUrl(cozyDomain, dirId),
    title: 'Retour au dossier',
    'aria-label': 'Retour au dossier',
    style: { ...iconBtnStyle, textDecoration: 'none' }
  },
    React.createElement('svg', {
      width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
    }, React.createElement('path', { d: 'M15 6l-6 6 6 6' }))
  )
}

function AppIconImg() {
  return React.createElement('img', {
    src: 'icon.svg',
    alt: '',
    style: appIconStyle
  })
}

function Breadcrumb({ cozyDomain, path, dirId }) {
  // `path` is a list of {name, id} from root → parent of the file.
  // Each segment links to the Drive at that folder.
  if (!path || !path.length) return null
  const items = []
  path.forEach((seg, i) => {
    items.push(React.createElement('a', {
      key: 'seg-' + i,
      href: driveFolderUrl(cozyDomain, seg.id),
      style: breadcrumbLinkStyle
    }, seg.name))
    if (i < path.length - 1) {
      items.push(React.createElement('span', {
        key: 'sep-' + i,
        style: breadcrumbSepStyle
      }, '›'))
    }
  })
  return React.createElement('div', { style: breadcrumbRowStyle }, ...items)
}

function TitleBar({ cozyDomain, value, dirId, path, onCommit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [hover, setHover] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = sanitizeName(draft)
    if (next && next !== value) onCommit(next)
    else setDraft(value)
  }

  const filenameView = editing
    ? React.createElement('div', { style: filenameRowStyle },
        React.createElement('input', {
          ref: inputRef,
          style: filenameInputStyle,
          value: draft,
          onChange: e => setDraft(e.target.value),
          onBlur: commit,
          onKeyDown: e => {
            if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
            else if (e.key === 'Escape') { e.preventDefault(); setDraft(value); setEditing(false) }
          },
          placeholder: 'Sans titre',
          'aria-label': 'Nom du fichier'
        }),
        React.createElement('span', { style: filenameExtStyle }, EXTENSION)
      )
    : React.createElement('div', { style: filenameRowStyle },
        React.createElement('span', {
          style: hover ? filenameLabelHoverStyle : filenameLabelStyle,
          onClick: () => setEditing(true),
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          title: 'Cliquer pour renommer'
        }, value || 'Sans titre'),
        React.createElement('span', { style: filenameExtStyle }, EXTENSION)
      )

  return React.createElement('header', { style: barStyle },
    React.createElement(BackButton, { cozyDomain, dirId }),
    React.createElement(AppIconImg),
    React.createElement('div', { style: fileInfosStyle },
      filenameView,
      React.createElement(Breadcrumb, { cozyDomain, path, dirId })
    )
  )
}

function App() {
  const ctx = getEditorCtx()
  const [initial, setInitial] = useState(null)
  const [excalApi, setExcalApi] = useState(null)
  const [title, setTitle] = useState('')
  const [dirId, setDirId] = useState(null)
  const [path, setPath] = useState([])
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
        setDirId(meta.attributes.dir_id)
        // Kick off the parent-folder walk in the background; the editor
        // mounts without waiting.
        fetchParentPath(ctx, meta.attributes.dir_id)
          .then(setPath)
          .catch(e => warn('[excalidraw] path lookup failed', e))
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
      warn('[excalidraw] file rename failed', e.message || e)
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
        warn('[excalidraw] save failed', e)
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
      warn('[excalidraw] rename failed', e.message || e)
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
    React.createElement(TitleBar, {
      cozyDomain: ctx.cozyDomain,
      value: title,
      dirId,
      path,
      onCommit: onTitleCommit
    }),
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
