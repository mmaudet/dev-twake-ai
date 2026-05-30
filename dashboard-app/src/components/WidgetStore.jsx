import React from 'react'
import { Link } from 'react-router-dom'

import Icon from 'cozy-ui/transpiled/react/Icon'
import Spinner from 'cozy-ui/transpiled/react/Spinner'

import useDashboardLayout from 'src/hooks/useDashboardLayout'
import Sidebar from 'src/components/Sidebar'
import { listWidgets, CATEGORY_LABEL } from 'src/widgets/catalog'

const WidgetCardRow = ({ widget, enabled, onToggle, disabled }) => (
  <div className={`widgetstore-card ${enabled ? 'is-enabled' : ''}`}>
    <span className={`dashboard-list-icon ${widget.accent}`} style={{ width: 40, height: 40 }}>
      <Icon icon={widget.icon} size={22} />
    </span>
    <div className="widgetstore-card-text">
      <div className="widgetstore-card-title">{widget.name}</div>
      <div className="widgetstore-card-desc">{widget.description}</div>
    </div>
    <label className="widgetstore-switch">
      <input
        type="checkbox"
        checked={enabled}
        disabled={disabled}
        onChange={e => onToggle(widget.id, e.target.checked)}
      />
      <span className="widgetstore-switch-track" />
    </label>
  </div>
)

const WidgetStore = () => {
  const { config, widgets, loaded, setWidgetEnabled } = useDashboardLayout()

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

  const all = listWidgets()
  const sections = ['cozy', 'external', 'coming-soon'].map(cat => ({
    key: cat,
    label: CATEGORY_LABEL[cat],
    items: all.filter(w => w.category === cat)
  })).filter(s => s.items.length > 0)

  return (
    <div className="dashboard-shell">
      <Sidebar config={config} />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Gérer les widgets</h1>
            <Link to="/" className="widgetstore-back">← Retour au tableau de bord</Link>
          </div>
        </header>

        {sections.map(section => (
          <section key={section.key} className="widgetstore-section">
            <h2 className="widgetstore-section-title">{section.label}</h2>
            <div className="widgetstore-grid">
              {section.items.map(widget => {
                const state = widgets[widget.id] || { enabled: false }
                const disabled = section.key === 'coming-soon'
                return (
                  <WidgetCardRow
                    key={widget.id}
                    widget={widget}
                    enabled={state.enabled && !disabled}
                    disabled={disabled}
                    onToggle={setWidgetEnabled}
                  />
                )
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

export default WidgetStore
