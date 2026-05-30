import React, { useEffect, useState } from 'react'
import { useClient } from 'cozy-client'

import Icon from 'cozy-ui/transpiled/react/Icon'

const formatGB = bytes => {
  const num = Number(bytes)
  if (!num || isNaN(num)) return null
  return (num / (1024 * 1024 * 1024)).toFixed(2)
}

const StorageBlock = () => {
  const client = useClient()
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    let cancelled = false
    client.stackClient
      .fetchJSON('GET', '/settings/disk-usage')
      .then(res => {
        if (cancelled) return
        const attrs = (res && res.data && res.data.attributes) || {}
        setUsage({ used: attrs.used, quota: attrs.quota })
      })
      .catch(() => {
        if (!cancelled) setUsage({ used: 0, quota: null })
      })
    return () => { cancelled = true }
  }, [client])

  if (!usage) return null
  const usedGB = formatGB(usage.used) || '0.00'
  const quotaGB = formatGB(usage.quota)

  return (
    <div className="storage-block">
      <div className="storage-block-icon">
        <Icon icon="cloud" size={20} />
      </div>
      <div className="storage-block-text">
        <span className="storage-block-label">Stockage</span>
        <span className="storage-block-meta">
          {quotaGB ? `${usedGB} Go sur ${quotaGB} Go` : `${usedGB} Go utilisés`}
        </span>
      </div>
    </div>
  )
}

export default StorageBlock
