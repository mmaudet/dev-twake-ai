import React from 'react'
import { Q, useQuery, useClient } from 'cozy-client'

import Icon from 'cozy-ui/transpiled/react/Icon'
import Spinner from 'cozy-ui/transpiled/react/Spinner'

// Cozy notes are stored as io.cozy.files with mime
// 'text/vnd.cozy.note+markdown' and a .cozy-note extension. The class
// field is 'text', not 'note', so we must filter on mime/name instead.
const notesQuery = () =>
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

const buildNoteUrl = (cozyUrl, noteId) => {
  // Strip the trailing .cozy-note from the file id-as-URL is not needed
  // because cozy-notes routes by file _id directly.
  const u = new URL(cozyUrl)
  const host = u.host.replace(/^([^.]+)\./, '$1-notes.')
  return `${u.protocol}//${host}/#/n/${noteId}`
}

const displayName = name => {
  if (!name) return 'Sans titre'
  return name.replace(/\.cozy-note$/, '')
}

const RecentNotes = () => {
  const client = useClient()
  const result = useQuery(notesQuery, { as: 'recentNotes' })
  const cozyUrl = client.getStackClient().uri

  if (result.fetchStatus === 'loading' || !result.data) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 16 }}><Spinner size="large" /></div>
  }
  const isNote = f =>
    f.mime === 'text/vnd.cozy.note+markdown' ||
    f.class === 'note' ||
    (f.name && f.name.endsWith('.cozy-note'))
  const notes = (result.data || []).filter(isNote).slice(0, 8)
  if (notes.length === 0) return <div className="dashboard-empty">Aucune note récente.</div>

  return (
    <ul className="dashboard-list">
      {notes.map(note => (
        <li
          key={note._id}
          className="dashboard-list-item"
          onClick={() => window.open(buildNoteUrl(cozyUrl, note._id), '_blank')}
        >
          <span className="dashboard-list-icon icon-note">
            <Icon icon="file-type-text" size={18} />
          </span>
          <div className="dashboard-list-text">
            <div className="dashboard-list-primary">{displayName(note.name)}</div>
            <div className="dashboard-list-secondary">{formatDate(note.updated_at || note.created_at)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default RecentNotes
