import React from 'react'
import { Q, useQuery, useClient } from 'cozy-client'

import Icon from 'cozy-ui/transpiled/react/Icon'
import Spinner from 'cozy-ui/transpiled/react/Spinner'

const notesQuery = () =>
  Q('io.cozy.files')
    .where({
      class: 'note',
      trashed: false
    })
    .indexFields(['class', 'updated_at'])
    .sortBy([{ class: 'desc' }, { updated_at: 'desc' }])
    .limitBy(10)

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
  const u = new URL(cozyUrl)
  const host = u.host.replace(/^([^.]+)\./, '$1-notes.')
  return `${u.protocol}//${host}/#/n/${noteId}`
}

const RecentNotes = () => {
  const client = useClient()
  const result = useQuery(notesQuery, { as: 'recentNotes' })
  const cozyUrl = client.getStackClient().uri

  if (result.fetchStatus === 'loading' || !result.data) {
    return <div className="u-flex u-flex-justify-center u-mt-1"><Spinner size="large" /></div>
  }
  const notes = (result.data || []).slice(0, 8)
  if (notes.length === 0) return <div className="u-c-grey">Aucune note récente.</div>

  return (
    <ul className="dashboard-list">
      {notes.map(note => (
        <li
          key={note._id}
          className="dashboard-list-item"
          onClick={() => window.open(buildNoteUrl(cozyUrl, note._id), '_blank')}
        >
          <Icon icon="file-type-text" size={20} className="dashboard-list-icon" />
          <div className="dashboard-list-text">
            <div className="dashboard-list-primary">{note.name || 'Sans titre'}</div>
            <div className="dashboard-list-secondary">{formatDate(note.updated_at || note.created_at)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default RecentNotes
