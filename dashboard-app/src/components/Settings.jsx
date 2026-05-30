import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

import Button from 'cozy-ui/transpiled/react/Button'
import TextField from 'cozy-ui/transpiled/react/MuiCozyTheme/TextField'
import Card from 'cozy-ui/transpiled/react/Card'
import Alerter from 'cozy-ui/transpiled/react/Alerter'

import useDashboardLayout from 'src/hooks/useDashboardLayout'

const Settings = () => {
  const { config, loaded, updateConfig, updateLayouts, DEFAULT_LAYOUT } = useDashboardLayout()
  const [kanbnApiKey, setKanbnApiKey] = useState('')
  const [defaultKanbnListId, setDefaultKanbnListId] = useState('')
  const [openprojectApiKey, setOpenprojectApiKey] = useState('')

  useEffect(() => {
    if (loaded) {
      setKanbnApiKey(config.kanbnApiKey || '')
      setDefaultKanbnListId(config.defaultKanbnListId || '')
      setOpenprojectApiKey(config.openprojectApiKey || '')
    }
  }, [loaded, config])

  const save = () => {
    updateConfig({ kanbnApiKey, defaultKanbnListId, openprojectApiKey })
    Alerter.success('Paramètres enregistrés')
  }

  const resetLayout = () => {
    updateLayouts(DEFAULT_LAYOUT)
    Alerter.info('Layout réinitialisé')
  }

  if (!loaded) return null

  return (
    <div className="u-mh-1 u-mv-1" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h2>Paramètres du Dashboard</h2>
      <p>
        <Link to="/">← Retour au dashboard</Link>
      </p>

      <Card className="u-p-1 u-mt-1">
        <h3>kan.bn</h3>
        <p className="u-fz-small u-c-grey">
          Génère ton API key sur{' '}
          <a href="https://kanbn.dev-twake.maudet.cloud/settings/api" target="_blank" rel="noreferrer">
            kanbn.dev-twake.maudet.cloud/settings/api
          </a>
        </p>
        <TextField
          label="API key (Bearer)"
          value={kanbnApiKey}
          onChange={e => setKanbnApiKey(e.target.value)}
          fullWidth
          type="password"
        />
        <TextField
          label="listPublicId par défaut pour Quick capture"
          value={defaultKanbnListId}
          onChange={e => setDefaultKanbnListId(e.target.value)}
          fullWidth
          helperText="Optionnel — pré-remplit le formulaire de création de tâche"
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card className="u-p-1 u-mt-1">
        <h3>OpenProject</h3>
        <p className="u-fz-small u-c-grey">
          Génère ton API token dans OpenProject (Compte → Tokens → API). Stocké
          mais pas encore exploité — v1 du widget Tasks.
        </p>
        <TextField
          label="API token"
          value={openprojectApiKey}
          onChange={e => setOpenprojectApiKey(e.target.value)}
          fullWidth
          type="password"
        />
      </Card>

      <div className="u-mt-1" style={{ display: 'flex', gap: 12 }}>
        <Button label="Enregistrer" onClick={save} />
        <Button theme="secondary" label="Réinitialiser le layout" onClick={resetLayout} />
      </div>
    </div>
  )
}

export default Settings
