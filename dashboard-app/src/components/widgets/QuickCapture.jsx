import React, { useRef, useState } from 'react'
import { useClient } from 'cozy-client'

import Button from 'cozy-ui/transpiled/react/Button'
import TextField from 'cozy-ui/transpiled/react/MuiCozyTheme/TextField'
import { Dialog, DialogTitle, DialogContent, DialogActions } from 'cozy-ui/transpiled/react/Dialog'
import Alerter from 'cozy-ui/transpiled/react/Alerter'

const buildAppUrl = (cozyUrl, slug, path = '/') => {
  const u = new URL(cozyUrl)
  const host = u.host.replace(/^([^.]+)\./, `$1-${slug}.`)
  return `${u.protocol}//${host}${path}`
}

const QuickCapture = ({ config }) => {
  const client = useClient()
  const fileInputRef = useRef(null)
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskListId, setTaskListId] = useState(config.defaultKanbnListId || '')
  const [busy, setBusy] = useState(false)

  const cozyUrl = client.getStackClient().uri

  // ----- New note -----
  const onNewNote = async () => {
    setBusy(true)
    try {
      // Find the user's root dir id
      const rootDir = await client.stackClient.fetchJSON('GET', '/files/io.cozy.files.root-dir')
      const dirId = rootDir.data ? rootDir.data.id : 'io.cozy.files.root-dir'
      // Create note via the notes API of cozy-stack
      const res = await client.stackClient.fetchJSON('POST', '/notes', {
        data: {
          type: 'io.cozy.notes.documents',
          attributes: {
            title: '',
            dir_id: dirId,
            schema: {
              nodes: [
                ['doc', { content: 'block+' }],
                ['paragraph', { content: 'inline*', group: 'block' }],
                ['text', { group: 'inline' }]
              ]
            }
          }
        }
      })
      const noteId = res.data && res.data.id
      if (noteId) {
        window.open(buildAppUrl(cozyUrl, 'notes', `/#/n/${noteId}`), '_blank')
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e)
      Alerter.error('Impossible de créer la note')
    } finally {
      setBusy(false)
    }
  }

  // ----- Upload file -----
  const onUploadClick = () => {
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

  // ----- New kan.bn task -----
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
      setShowTaskDialog(false)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      Alerter.error('Création de tâche échouée')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="u-flex u-flex-column" style={{ gap: 8 }}>
      <Button label="Nouvelle note" icon="plus" onClick={onNewNote} busy={busy} />
      <Button label="Uploader un fichier" icon="upload" onClick={onUploadClick} busy={busy} />
      <input ref={fileInputRef} type="file" hidden onChange={onFileChange} />
      <Button label="Nouvelle tâche kan.bn" icon="checklist" onClick={() => setShowTaskDialog(true)} busy={busy} />

      {showTaskDialog && (
        <Dialog open onClose={() => setShowTaskDialog(false)}>
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
              helperText="Récupérable via l'API kan.bn ou les paramètres dashboard"
              style={{ marginTop: 12 }}
            />
          </DialogContent>
          <DialogActions>
            <Button theme="secondary" label="Annuler" onClick={() => setShowTaskDialog(false)} />
            <Button label="Créer" onClick={onNewTask} busy={busy} />
          </DialogActions>
        </Dialog>
      )}
    </div>
  )
}

export default QuickCapture
