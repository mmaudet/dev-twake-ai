import React from 'react'
import { Q, useQuery, useClient } from 'cozy-client'

import Icon from 'cozy-ui/transpiled/react/Icon'
import Spinner from 'cozy-ui/transpiled/react/Spinner'

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

// Shortcuts (.url files) store their target inside their binary as
// "[InternetShortcut]\nURL=https://...". Download and parse to redirect
// straight to the target instead of opening Drive.
const fetchShortcutTarget = async (client, fileId) => {
  const res = await client.stackClient.fetch('GET', `/files/download/${fileId}`)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const text = await res.text()
  const m = text.match(/^URL=(.+)$/m)
  return m ? m[1].trim() : null
}

const openFile = async (client, cozyUrl, file) => {
  if (file.class === 'shortcut') {
    try {
      const target = await fetchShortcutTarget(client, file._id)
      if (target) {
        window.open(target, '_blank')
        return
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[dashboard] could not resolve shortcut, falling back to Drive', e)
    }
  }
  window.open(buildDriveFileUrl(cozyUrl, file.dir_id, file._id), '_blank')
}

const RecentFiles = () => {
  const client = useClient()
  const result = useQuery(filesQuery, { as: 'recentFiles' })
  const cozyUrl = client.getStackClient().uri

  if (result.fetchStatus === 'loading' || !result.data) {
    return <div className="u-flex u-flex-justify-center u-mt-1"><Spinner size="large" /></div>
  }
  const files = (result.data || [])
    .filter(f => f.type === 'file' && f.class !== 'note')
    .slice(0, 8)
  if (files.length === 0) return <div className="u-c-grey">Aucun fichier récent.</div>

  return (
    <ul className="dashboard-list">
      {files.map(file => (
        <li
          key={file._id}
          className="dashboard-list-item"
          onClick={() => openFile(client, cozyUrl, file)}
        >
          <Icon
            icon={file.class === 'shortcut' ? 'link' : 'file-type-cloud'}
            size={20}
            className="dashboard-list-icon"
          />
          <div className="dashboard-list-text">
            <div className="dashboard-list-primary">{file.name}</div>
            <div className="dashboard-list-secondary">{formatDate(file.updated_at || file.created_at)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default RecentFiles
