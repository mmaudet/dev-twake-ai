import React from 'react'
import {
  Route,
  Navigate,
  RouterProvider,
  createHashRouter,
  createRoutesFromElements
} from 'react-router-dom'

import AppLayout from 'src/components/AppLayout'
import Dashboard from 'src/components/Dashboard'
import Settings from 'src/components/Settings'
import WidgetStore from 'src/components/WidgetStore'
import OidcCallback from 'src/components/OidcCallback'

const AppRouter = () => {
  const routes = (
    <Route path="/" element={<AppLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="settings" element={<Settings />} />
      <Route path="widgets" element={<WidgetStore />} />
      <Route path="oidc/callback" element={<OidcCallback />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  )
  const router = createHashRouter(createRoutesFromElements(routes))
  return <RouterProvider router={router} />
}

export default AppRouter
