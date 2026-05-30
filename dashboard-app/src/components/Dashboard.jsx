import React from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { useI18n } from 'cozy-ui/transpiled/react/I18n'
import Spinner from 'cozy-ui/transpiled/react/Spinner'
import Alerter from 'cozy-ui/transpiled/react/Alerter'

import useDashboardLayout from 'src/hooks/useDashboardLayout'
import Sidebar from 'src/components/Sidebar'
import ActionsMenu from 'src/components/ActionsMenu'
import WidgetCard from 'src/components/WidgetCard'
import RecentFiles from 'src/components/widgets/RecentFiles'
import RecentNotes from 'src/components/widgets/RecentNotes'
import Tasks from 'src/components/widgets/Tasks'

const ResponsiveGridLayout = WidthProvider(Responsive)

const WIDGETS = {
  recentFiles: { titleKey: 'widgets.recentFiles.title', Component: RecentFiles },
  recentNotes: { titleKey: 'widgets.recentNotes.title', Component: RecentNotes },
  tasks:       { titleKey: 'widgets.tasks.title',       Component: Tasks }
}

const Dashboard = () => {
  const { t } = useI18n()
  const {
    layouts, config, loaded, updateLayouts, updateConfig, DEFAULT_LAYOUT
  } = useDashboardLayout()

  const onResetLayout = () => {
    updateLayouts(DEFAULT_LAYOUT)
    Alerter.info('Layout réinitialisé')
  }

  if (!loaded) {
    return (
      <div className="dashboard-shell">
        <Sidebar config={{}} />
        <div className="dashboard-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spinner size="xxlarge" />
        </div>
      </div>
    )
  }

  const items = (layouts.lg || [])
    .filter(item => WIDGETS[item.i])
    .map(item => {
      const { Component, titleKey } = WIDGETS[item.i]
      return (
        <div key={item.i} className="dashboard-widget-cell">
          <WidgetCard title={t(titleKey)}>
            <Component config={config} updateConfig={updateConfig} />
          </WidgetCard>
        </div>
      )
    })

  return (
    <div className="dashboard-shell">
      <Sidebar config={config} />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1 className="dashboard-title">{t('appTitle')}</h1>
          <div className="dashboard-actions">
            <ActionsMenu onResetLayout={onResetLayout} />
          </div>
        </header>

        <ResponsiveGridLayout
          className="dashboard-grid"
          layouts={layouts}
          onLayoutChange={(_curr, all) => updateLayouts(all)}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={48}
          margin={[16, 16]}
          draggableHandle=".widget-drag-handle"
          compactType="vertical"
        >
          {items}
        </ResponsiveGridLayout>
      </main>
    </div>
  )
}

export default Dashboard
