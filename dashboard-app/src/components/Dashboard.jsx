import React from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import Spinner from 'cozy-ui/transpiled/react/Spinner'
import Alerter from 'cozy-ui/transpiled/react/Alerter'

import useDashboardLayout from 'src/hooks/useDashboardLayout'
import Sidebar from 'src/components/Sidebar'
import ActionsMenu from 'src/components/ActionsMenu'
import WidgetCard from 'src/components/WidgetCard'
import { WIDGET_CATALOG } from 'src/widgets/catalog'

const ResponsiveGridLayout = WidthProvider(Responsive)

const Dashboard = () => {
  const {
    layouts, config, widgets, loaded,
    updateLayouts, updateConfig, updateWidgetConfig, DEFAULT_LAYOUT
  } = useDashboardLayout()

  const onResetLayout = () => {
    updateLayouts(DEFAULT_LAYOUT)
    Alerter.info('Layout réinitialisé')
  }

  if (!loaded) {
    return (
      <div className="dashboard-shell">
        <Sidebar config={{}} />
        <main className="dashboard-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spinner size="xxlarge" />
        </main>
      </div>
    )
  }

  // Only render widgets whose catalogue entry has a Component AND that the
  // user hasn't disabled. Items in the layout that don't match are filtered
  // out (catalogue entries removed in a future release, "coming soon"
  // widgets, etc.).
  const items = (layouts.lg || [])
    .filter(item => {
      const cat = WIDGET_CATALOG[item.i]
      if (!cat || !cat.Component) return false
      const w = widgets[item.i]
      return w ? w.enabled !== false : true
    })
    .map(item => {
      const cat = WIDGET_CATALOG[item.i]
      const Component = cat.Component
      const widgetState = widgets[item.i] || { config: {} }
      return (
        <div key={item.i} className="dashboard-widget-cell">
          <WidgetCard title={cat.name}>
            <Component
              config={config}
              updateConfig={updateConfig}
              widgetConfig={widgetState.config}
              updateWidgetConfig={patch => updateWidgetConfig(item.i, patch)}
            />
          </WidgetCard>
        </div>
      )
    })

  return (
    <div className="dashboard-shell">
      <Sidebar config={config} />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1 className="dashboard-title">Tableau de bord</h1>
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
