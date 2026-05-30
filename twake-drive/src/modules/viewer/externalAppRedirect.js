// Some file types live in dedicated Cozy coquilles rather than the
// built-in preview/download viewer. When the Drive opens such a file —
// via "+ Créer", a double-click in the list, a deep-link from the
// Dashboard, a shared URL, anywhere — we shouldn't show the generic
// "Document EXCALIDRAW / Télécharger ce fichier" screen, we should
// bounce to the coquille that knows how to edit the format.
//
// Today the only such type is .excalidraw; if we add more (.tldraw,
// .quill, …), drop them in the same dispatch table.

import { generateWebLink } from 'cozy-client'

const HANDLERS = [
  {
    matches: file =>
      typeof file?.name === 'string' &&
      file.name.toLowerCase().endsWith('.excalidraw'),
    slug: 'excalidraw',
    hash: file => `/edit/${file._id || file.id}`
  }
]

export function findExternalAppHandler(file) {
  return HANDLERS.find(h => h.matches(file))
}

export function externalAppUrl(client, file, handler) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const cozyUrl = client?.getStackClient().uri
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const subDomainType = client?.getInstanceOptions().subdomain
  return generateWebLink({
    slug: handler.slug,
    cozyUrl,
    subDomainType,
    pathname: '',
    hash: handler.hash(file)
  })
}

export function redirectToExternalAppIfNeeded(client, file) {
  if (!file) return false
  const handler = findExternalAppHandler(file)
  if (!handler) return false
  const url = externalAppUrl(client, file, handler)
  window.location.href = url
  return true
}
