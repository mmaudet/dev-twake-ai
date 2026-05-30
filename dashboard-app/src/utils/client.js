import CozyClient from 'cozy-client'

import manifest from '../../manifest.webapp'
import schema from 'src/doctypes'

export const getClient = () => {
  const root = document.querySelector('[role=application]')
  const data = JSON.parse(root.dataset.cozy)
  const protocol = window.location.protocol
  const cozyUrl = `${protocol}//${data.domain}`

  // NB: do not pass `store: false` — the legacy {{.CozyBar}} injection used
  // to supply a global Redux store, the new pre-built bar.js does not, and
  // cozy-client's useQuery relies on a store via the clientContext.
  return new CozyClient({
    uri: cozyUrl,
    token: data.token,
    appMetadata: {
      slug: manifest.slug,
      version: manifest.version
    },
    schema
  })
}
