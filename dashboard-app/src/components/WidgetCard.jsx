import React, { useEffect, useRef, useState } from 'react'

import Icon from 'cozy-ui/transpiled/react/Icon'

// WidgetCard renders a draggable widget. The card can declare:
// - title:        small uppercase label
// - menuActions:  list of { label, onClick, danger? } to show under a ⋯ menu
//   in the top-right corner. Always-visible.
const WidgetCard = ({ title, menuActions, children }) => {
  const ref = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return undefined
    const onDown = e => {
      if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const actions = menuActions && menuActions.length > 0 ? menuActions : null

  return (
    <section className="dashboard-widget-card">
      <div className="widget-drag-handle">
        <span className="widget-title">{title}</span>
        {actions && (
          <div ref={ref} className="widget-menu-anchor">
            <button
              className="widget-menu-btn"
              aria-label="Actions du widget"
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
              onMouseDown={e => e.stopPropagation()}
            >
              <Icon icon="dots" size={16} />
            </button>
            {menuOpen && (
              <div className="create-menu widget-menu-popover">
                {actions.map((a, i) => (
                  <button
                    key={i}
                    className={`create-menu-item${a.danger ? ' is-danger' : ''}`}
                    onClick={e => {
                      e.stopPropagation()
                      setMenuOpen(false)
                      a.onClick && a.onClick()
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="dashboard-widget-body">{children}</div>
    </section>
  )
}

export default WidgetCard
