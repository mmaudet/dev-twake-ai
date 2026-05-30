import React, { useState } from 'react'
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
import { disconnectLinagora } from 'src/utils/backend'

const ResponsiveGridLayout = WidthProvider(Responsive)

// Widgets bound to the LINAGORA SSO — adding one here exposes the
// "Se déconnecter" action in its ⋯ menu.
const LINAGORA_WIDGETS = new Set(['mail', 'calendar'])

const Dashboard = () => {
  const {
    layouts, config, widgets, loaded,
    updateLayouts, updateConfig, updateWidgetConfig, setWidgetEnabled, DEFAULT_LAYOUT
  } = useDashboardLayout()
  const [configureFor, setConfigureFor] = useState(null) // widget id with ConfigureModal open
  const [reloadKey, setReloadKey] = useState(0)

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

  const buildMenuActions = (cat, widgetState) => {
    const actions = []
    if (cat.ConfigureModal) {
      actions.push({ label: 'Configurer', onClick: () => setConfigureFor(cat.id) })
    }
    if (LINAGORA_WIDGETS.has(cat.id)) {
      actions.push({
        label: `Se déconnecter de LINAGORA`,
        onClick: async () => {
          await disconnectLinagora(cat.id)
          setReloadKey(k => k + 1)
          Alerter.success('Déconnecté de LINAGORA')
        }
      })
    }
    actions.push({
      label: 'Retirer le widget',
      danger: true,
      onClick: () => {
        setWidgetEnabled(cat.id, false)
        Alerter.info(`Widget "${cat.name}" retiré`)
      }
    })
    return actions
  }

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
          <WidgetCard title={cat.name} menuActions={buildMenuActions(cat, widgetState)}>
            <Component
              config={config}
              updateConfig={updateConfig}
              widgetConfig={widgetState.config}
              updateWidgetConfig={patch => updateWidgetConfig(item.i, patch)}
              reloadKey={reloadKey}
            />
          </WidgetCard>
        </div>
      )
    })

  const configuringCat = configureFor ? WIDGET_CATALOG[configureFor] : null
  const configuringState = configureFor ? widgets[configureFor] || { config: {} } : null

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

        {configuringCat && configuringCat.ConfigureModal && (
          <configuringCat.ConfigureModal
            open
            onClose={() => setConfigureFor(null)}
            widgetConfig={configuringState.config}
            onSave={patch => updateWidgetConfig(configureFor, patch)}
          />
        )}
      </main>
    </div>
  )
}

export default Dashboard
