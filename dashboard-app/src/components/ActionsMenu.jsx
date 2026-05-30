import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Icon from 'cozy-ui/transpiled/react/Icon'

const ActionsMenu = ({ onResetLayout }) => {
  const navigate = useNavigate()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const onDown = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        aria-label="Plus d'actions"
        onClick={() => setOpen(o => !o)}
      >
        <Icon icon="dots" size={20} />
      </button>
      {open && (
        <div
          className="create-menu"
          style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', minWidth: 220, zIndex: 10 }}
        >
          <button
            className="create-menu-item"
            onClick={() => { setOpen(false); navigate('/widgets') }}
          >
            <span className="create-menu-item-icon"><Icon icon="apps" size={18} /></span>
            Gérer les widgets
          </button>
          <button
            className="create-menu-item"
            onClick={() => { setOpen(false); navigate('/settings') }}
          >
            <span className="create-menu-item-icon"><Icon icon="gear" size={18} /></span>
            Paramètres
          </button>
          <button
            className="create-menu-item"
            onClick={() => { setOpen(false); onResetLayout && onResetLayout() }}
          >
            <span className="create-menu-item-icon"><Icon icon="restore" size={18} /></span>
            Réinitialiser le layout
          </button>
        </div>
      )}
    </div>
  )
}

export default ActionsMenu
