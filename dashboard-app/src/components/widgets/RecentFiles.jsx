import React from 'react'
import { Q, useQuery, useClient } from 'cozy-client'

import Icon from 'cozy-ui/transpiled/react/Icon'
import Spinner from 'cozy-ui/transpiled/react/Spinner'

// Only sort on updated_at — the (type, updated_at) composite index doesn't
// exist by default and creating it for a sandbox isn't worth it. We filter
// client-side instead (limitBy is generous so we still have plenty of files
// after filtering out the notes).
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

const buildDriveUrl = (cozyUrl, dirId) => {
  const u = new URL(cozyUrl)
  const host = u.host.replace(/^([^.]+)\./, '$1-drive.')
  return `${u.protocol}//${host}/#/folder/${dirId}`
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
          onClick={() => window.open(buildDriveUrl(cozyUrl, file.dir_id), '_blank')}
        >
          <Icon icon="file-type-cloud" size={20} className="dashboard-list-icon" />
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
