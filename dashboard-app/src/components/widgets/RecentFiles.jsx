import React from 'react'
import { Q, useQuery, useClient } from 'cozy-client'

import Icon from 'cozy-ui/transpiled/react/Icon'
import Spinner from 'cozy-ui/transpiled/react/Spinner'

import excalidrawIcon from 'src/assets/icon-excalidraw.svg'
import gristIcon from 'src/assets/icon-grist.png'

// Only sort on updated_at — the (type, updated_at) composite index doesn't
// exist by default and creating it for a sandbox isn't worth it. Filter
// client-side for files (and skip notes which have their own widget).
const filesQuery = () =>
  Q('io.cozy.files')
    .where({ trashed: false })
    .indexFields(['updated_at'])
    .sortBy([{ updated_at: 'desc' }])
    .limitBy(40)

const formatDate = ts => {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  } catch (e) {
    return ''
  }
}

const buildDriveFileUrl = (cozyUrl, dirId, fileId) => {
  const u = new URL(cozyUrl)
  const host = u.host.replace(/^([^.]+)\./, '$1-drive.')
  return `${u.protocol}//${host}/#/folder/${dirId}/file/${fileId}`
}

// External coquilles that own a given file extension. The widget bypasses
// the Drive file viewer (which would render the generic "Document XYZ /
// Télécharger" stub) and opens these files directly in their coquille,
// mirroring the dispatch the Drive fork does on a double-click in the
// list. Keys are lowercase extensions, values are slug + hash builder.
const EXTERNAL_APP_HANDLERS = [
  {
    matches: file => (file.name || '').toLowerCase().endsWith('.excalidraw'),
    slug: 'excalidraw',
    hash: fileId => `/edit/${fileId}`
  },
  {
    matches: file =>
      file.mime === 'application/pdf' ||
      (file.name || '').toLowerCase().endsWith('.pdf'),
    slug: 'bentopdf',
    hash: fileId => `/edit/${fileId}`
  }
]

const buildExternalAppUrl = (cozyUrl, slug, hash) => {
  const u = new URL(cozyUrl)
  const host = u.host.replace(/^([^.]+)\./, '$1-' + slug + '.')
  return `${u.protocol}//${host}/#${hash}`
}

// cozy-stack exposes GET /shortcuts/:id which returns the resolved URL +
// the parsed target metadata as JSON (when Accept: application/json).
const fetchShortcutInfo = async (client, fileId) => {
  const json = await client.stackClient.fetchJSON('GET', `/shortcuts/${fileId}`)
  return (json && json.data && json.data.attributes) || null
}

const openFile = async (client, cozyUrl, file) => {
  if (file.class === 'shortcut') {
    try {
      const info = await fetchShortcutInfo(client, file._id)
      // Trust the URL the coquille that materialized the shortcut put on it
      // (e.g. the grist coquille stores `https://<slug>-grist.<domain>/#/doc/<id>`
      // and its hash router opens the right iframe). An older grist version
      // stored the canonical Grist URL directly, which also still works — both
      // shapes resolve correctly, so we no longer special-case grist here.
      const url = info && info.url
      if (url) {
        window.open(url, '_blank')
        return
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[dashboard] could not resolve shortcut, falling back to Drive', e)
    }
  }
  // Files that belong to an external coquille (.excalidraw, …) skip the
  // Drive file viewer entirely — the viewer would render the generic
  // "Document XYZ / Télécharger" stub even though the Drive fork knows
  // how to dispatch them. We jump straight to the coquille like the Drive
  // dispatcher would do on a double-click.
  const handler = EXTERNAL_APP_HANDLERS.find(h => h.matches(file))
  if (handler) {
    window.open(buildExternalAppUrl(cozyUrl, handler.slug, handler.hash(file._id)), '_blank')
    return
  }
  window.open(buildDriveFileUrl(cozyUrl, file.dir_id, file._id), '_blank')
}

const RecentFiles = () => {
  const client = useClient()
  const result = useQuery(filesQuery, { as: 'recentFiles' })
  const cozyUrl = client.getStackClient().uri

  if (result.fetchStatus === 'loading' || !result.data) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 16 }}><Spinner size="large" /></div>
  }
  const isNote = f =>
    f.mime === 'text/vnd.cozy.note+markdown' ||
    f.class === 'note' ||
    (f.name && f.name.endsWith('.cozy-note'))
  const files = (result.data || [])
    .filter(f => f.type === 'file' && !isNote(f))
    .slice(0, 8)
  if (files.length === 0) return <div className="dashboard-empty">Aucun fichier récent.</div>

  return (
    <ul className="dashboard-list">
      {files.map(file => {
        const isShortcut = file.class === 'shortcut'
        return (
          <li
            key={file._id}
            className="dashboard-list-item"
            onClick={() => openFile(client, cozyUrl, file)}
          >
            <span className={`dashboard-list-icon ${isShortcut ? 'icon-shortcut' : 'icon-file'}`}>
              <FileTypeIcon file={file} isShortcut={isShortcut} />
            </span>
            <div className="dashboard-list-text">
              <div className="dashboard-list-primary">{file.name}</div>
              <div className="dashboard-list-secondary">{formatDate(file.updated_at || file.created_at)}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// Pick a file-type icon: Excalidraw for *.excalidraw, PDF badge for PDFs,
// Grist petal for shortcuts that point to a Grist doc, cozy-ui defaults
// otherwise.
const FileTypeIcon = ({ file, isShortcut }) => {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.excalidraw')) {
    return <img src={excalidrawIcon} alt="Excalidraw" width={20} height={20} style={{ borderRadius: 3, display: 'block' }} />
  }
  if (file.mime === 'application/pdf' || name.endsWith('.pdf')) {
    return (
      <span
        aria-label="PDF"
        style={{
          width: 24, height: 24,
          background: '#fde4e4', color: '#c0392b',
          borderRadius: 3, fontSize: 9, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          letterSpacing: 0.4
        }}
      >PDF</span>
    )
  }
  const target = file.metadata && file.metadata.target
  if (isShortcut && target && target.app === 'grist') {
    return <img src={gristIcon} alt="Grist" width={20} height={20} style={{ borderRadius: 3, display: 'block' }} />
  }
  return <Icon icon={isShortcut ? 'link' : 'file-type-cloud'} size={18} />
}

export default RecentFiles
