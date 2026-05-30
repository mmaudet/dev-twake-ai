import React, { useEffect, useRef, useState } from 'react'
import { Q, useClient } from 'cozy-client'

import Icon from 'cozy-ui/transpiled/react/Icon'
import Alerter from 'cozy-ui/transpiled/react/Alerter'
import Dialog, { DialogTitle, DialogContent, DialogActions } from 'cozy-ui/transpiled/react/Dialog'
import Button from 'cozy-ui/transpiled/react/Button'
import TextField from 'cozy-ui/transpiled/react/MuiCozyTheme/TextField'

import StorageBlock from 'src/components/StorageBlock'

const buildAppUrl = (cozyUrl, slug, path = '/') => {
  const u = new URL(cozyUrl)
  const host = u.host.replace(/^([^.]+)\./, `$1-${slug}.`)
  return `${u.protocol}//${host}${path}`
}

const refetchWidgets = client => {
  const refresh = Q('io.cozy.files')
    .where({ trashed: false })
    .indexFields(['updated_at'])
    .sortBy([{ updated_at: 'desc' }])
    .limitBy(40)
  try { client.query(refresh, { as: 'recentFiles' }) } catch (_) {}
  try { client.query(refresh, { as: 'recentNotes' }) } catch (_) {}
}

const noteSchema = {
  nodes: [
    ['doc', { content: 'block+' }],
    ['paragraph', { content: 'inline*', group: 'block' }],
    ['text', { group: 'inline' }]
  ]
}

const Sidebar = ({ config }) => {
  const client = useClient()
  const cozyUrl = client.getStackClient().uri
  const fileInputRef = useRef(null)
  const menuRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [taskDialog, setTaskDialog] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskListId, setTaskListId] = useState(config.defaultKanbnListId || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!menuOpen) return undefined
    const onDown = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => { setTaskListId(config.defaultKanbnListId || '') }, [config.defaultKanbnListId])

  const onNewNote = async () => {
    setMenuOpen(false)
    setBusy(true)
    try {
      const rootDir = await client.stackClient.fetchJSON('GET', '/files/io.cozy.files.root-dir')
      const dirId = rootDir.data ? rootDir.data.id : 'io.cozy.files.root-dir'
      const res = await client.stackClient.fetchJSON('POST', '/notes', {
        data: {
          type: 'io.cozy.notes.documents',
          attributes: { title: '', dir_id: dirId, schema: noteSchema }
        }
      })
      const noteId = res.data && res.data.id
      refetchWidgets(client)
      if (noteId) window.open(buildAppUrl(cozyUrl, 'notes', `/#/n/${noteId}`), '_blank')
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e)
      Alerter.error('Impossible de créer la note')
    } finally {
      setBusy(false)
    }
  }

  const onUploadClick = () => {
    setMenuOpen(false)
    if (fileInputRef.current) fileInputRef.current.click()
  }
  const onFileChange = async e => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setBusy(true)
    try {
      const url = `/files/io.cozy.files.root-dir?Type=file&Name=${encodeURIComponent(file.name)}`
      await client.stackClient.fetchJSON('POST', url, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' }
      })
      refetchWidgets(client)
      Alerter.success(`Fichier "${file.name}" uploadé`)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      Alerter.error("Échec de l'upload")
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  const onOpenTaskDialog = () => {
    setMenuOpen(false)
    setTaskDialog(true)
  }
  const onNewTask = async () => {
    if (!taskTitle.trim()) return
    if (!config.kanbnApiKey || !taskListId.trim()) {
      Alerter.error('API key kan.bn ou listPublicId manquant (voir paramètres)')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('https://kanbn.dev-twake.maudet.cloud/api/v1/cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.kanbnApiKey}`
        },
        body: JSON.stringify({
          title: taskTitle,
          description: '',
          listPublicId: taskListId,
          labelPublicIds: [],
          memberPublicIds: [],
          position: 'end'
        })
      })
      if (!res.ok) throw new Error(`kan.bn POST /cards ${res.status}`)
      Alerter.success('Tâche créée')
      setTaskTitle('')
      setTaskDialog(false)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      Alerter.error('Création de tâche échouée')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="dashboard-sidebar">
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button className="create-btn" onClick={() => setMenuOpen(o => !o)} disabled={busy}>
          <span className="create-btn-icon">+</span>
          Créer
        </button>
        {menuOpen && (
          <div className="create-menu">
            <button className="create-menu-item" onClick={onNewNote} disabled={busy}>
              <span className="create-menu-item-icon"><Icon icon="file-type-text" size={20} color="#f5a623" /></span>
              Nouvelle note
            </button>
            <button className="create-menu-item" onClick={onUploadClick} disabled={busy}>
              <span className="create-menu-item-icon"><Icon icon="upload" size={20} color="#297EF2" /></span>
              Uploader un fichier
            </button>
            <button className="create-menu-item" onClick={onOpenTaskDialog} disabled={busy}>
              <span className="create-menu-item-icon"><Icon icon="check-square" size={20} color="#f5a623" /></span>
              Nouvelle tâche kan.bn
            </button>
          </div>
        )}
        <input ref={fileInputRef} type="file" hidden onChange={onFileChange} />
      </div>

      <div className="dashboard-sidebar-spacer" />

      <StorageBlock />

      {taskDialog && (
        <Dialog open onClose={() => setTaskDialog(false)}>
          <DialogTitle>Nouvelle tâche kan.bn</DialogTitle>
          <DialogContent>
            <TextField
              label="Titre"
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="listPublicId (board cible)"
              value={taskListId}
              onChange={e => setTaskListId(e.target.value)}
              fullWidth
              helperText="Pré-rempli depuis les paramètres si défini"
              style={{ marginTop: 12 }}
            />
          </DialogContent>
          <DialogActions>
            <Button theme="secondary" label="Annuler" onClick={() => setTaskDialog(false)} />
            <Button label="Créer" onClick={onNewTask} busy={busy} />
          </DialogActions>
        </Dialog>
      )}
    </aside>
  )
}

export default Sidebar
