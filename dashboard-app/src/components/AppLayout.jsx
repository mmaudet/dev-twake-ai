import React from 'react'
import { Outlet } from 'react-router-dom'

import { Layout, Main, Content } from 'cozy-ui/transpiled/react/Layout'
import Sprite from 'cozy-ui/transpiled/react/Icon/Sprite'
import Alerter from 'cozy-ui/transpiled/react/Alerter'
import { useI18n } from 'cozy-ui/transpiled/react/I18n'

const AppLayout = () => {
  const { t } = useI18n()
  return (
    <Layout>
      <Main>
        <Content className="u-mh-1 u-mv-1">
          <Outlet />
        </Content>
      </Main>
      <Alerter t={t} />
      <Sprite />
    </Layout>
  )
}

export default AppLayout
