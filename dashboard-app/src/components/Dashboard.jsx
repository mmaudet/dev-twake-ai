import React from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { useI18n } from 'cozy-ui/transpiled/react/I18n'
import Spinner from 'cozy-ui/transpiled/react/Spinner'

import useDashboardLayout from 'src/hooks/useDashboardLayout'
import WidgetCard from 'src/components/WidgetCard'
import RecentFiles from 'src/components/widgets/RecentFiles'
import RecentNotes from 'src/components/widgets/RecentNotes'
import Tasks from 'src/components/widgets/Tasks'
import QuickCapture from 'src/components/widgets/QuickCapture'

const ResponsiveGridLayout = WidthProvider(Responsive)

const WIDGETS = {
  recentFiles:  { titleKey: 'widgets.recentFiles.title',  Component: RecentFiles },
  recentNotes:  { titleKey: 'widgets.recentNotes.title',  Component: RecentNotes },
  tasks:        { titleKey: 'widgets.tasks.title',        Component: Tasks },
  quickCapture: { titleKey: 'widgets.quickCapture.title', Component: QuickCapture }
}

const Dashboard = () => {
  const { t } = useI18n()
  const { layouts, config, loaded, updateLayouts, updateConfig } = useDashboardLayout()

  if (!loaded) {
    return (
      <div className="u-flex u-flex-justify-center u-mt-2">
        <Spinner size="xxlarge" />
      </div>
    )
  }

  const items = (layouts.lg || []).map(item => {
    const def = WIDGETS[item.i]
    if (!def) return null
    const { Component } = def
    return (
      <div key={item.i} className="dashboard-widget-cell">
        <WidgetCard title={t(def.titleKey)}>
          <Component config={config} updateConfig={updateConfig} />
        </WidgetCard>
      </div>
    )
  }).filter(Boolean)

  return (
    <ResponsiveGridLayout
      className="dashboard-grid"
      layouts={layouts}
      onLayoutChange={(_curr, all) => updateLayouts(all)}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
      rowHeight={48}
      margin={[12, 12]}
      draggableHandle=".widget-drag-handle"
      compactType="vertical"
    >
      {items}
    </ResponsiveGridLayout>
  )
}

export default Dashboard
