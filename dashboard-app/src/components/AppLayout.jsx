import React from 'react'
import { Outlet } from 'react-router-dom'

import Sprite from 'cozy-ui/transpiled/react/Icon/Sprite'
import Alerter from 'cozy-ui/transpiled/react/Alerter'
import { useI18n } from 'cozy-ui/transpiled/react/I18n'

// The shell is now <Outlet/> only — the actual chrome (sidebar + main +
// header + actions menu) is defined per-route, because the Settings route
// uses a different (centered) layout.
const AppLayout = () => {
  const { t } = useI18n()
  return (
    <>
      <Outlet />
      <Alerter t={t} />
      <Sprite />
    </>
  )
}

export default AppLayout
