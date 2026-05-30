import memoize from 'lodash/memoize'

import { initTranslation } from 'cozy-ui/transpiled/react/I18n'

import { getClient } from 'src/utils/client'

// The new pre-built cozy-bar bundle (bar.js loaded via <script defer> in
// index.ejs) self-initialises from the data-cozy-* attributes on the
// application div. No JS init call is needed here, unlike the legacy
// `cozy.bar.init({...})` pattern.
const setupApp = memoize(() => {
  const container = document.querySelector('[role=application]')
  const cozyData = JSON.parse(container.dataset.cozy)
  const lang = (cozyData.locale && /^\{\{\..*\}\}$/.test(cozyData.locale) === false)
    ? cozyData.locale
    : 'en'
  const polyglot = initTranslation(lang, lang => require(`locales/${lang}`))
  const client = getClient()

  return { container, client, lang, polyglot }
})

export default setupApp
