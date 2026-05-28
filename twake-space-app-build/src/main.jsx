import 'cozy-ui/dist/cozy-ui.utils.min.css'
import 'cozy-ui-plus/dist/stylesheet.css'
import 'cozy-bar/dist/stylesheet.css'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import CozyClient, { CozyProvider } from 'cozy-client'
import { RealtimePlugin } from 'cozy-realtime'
import { BreakpointsProvider } from 'cozy-ui/transpiled/react/providers/Breakpoints'
import CozyTheme from 'cozy-ui-plus/dist/providers/CozyTheme'
import I18n from 'twake-i18n'
import { BarComponent, BarProvider } from 'cozy-bar'

const appNode = document.querySelector('[role=application]')
const dataset = appNode?.dataset || {}
const cozyData = dataset.cozy ? JSON.parse(dataset.cozy) : {}
const domain = cozyData.domain || dataset.cozyDomain || window.location.host
const token = cozyData.token || dataset.cozyToken

const client = new CozyClient({
  uri: `${window.location.protocol}//${domain}`,
  token,
})
client.registerPlugin(RealtimePlugin)

const locale = cozyData.locale || dataset.cozyLocale || 'en'
const noopDictRequire = () => ({})

function App() {
  return (
    <CozyProvider client={client}>
      <I18n lang={locale} dictRequire={noopDictRequire}>
        <CozyTheme ignoreCozySettings>
          <BreakpointsProvider>
            <BrowserRouter>
              <BarProvider>
                <BarComponent />
              </BarProvider>
            </BrowserRouter>
          </BreakpointsProvider>
        </CozyTheme>
      </I18n>
    </CozyProvider>
  )
}

const host = document.createElement('div')
host.style.display = 'none'
document.body.appendChild(host)
createRoot(host).render(<App />)
