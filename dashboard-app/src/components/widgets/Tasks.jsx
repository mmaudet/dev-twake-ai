import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import Spinner from 'cozy-ui/transpiled/react/Spinner'

const KANBN_BASE = 'https://kanbn.dev-twake.maudet.cloud/api/v1'

const fetchKanbnTasks = async apiKey => {
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }

  const meRes = await fetch(`${KANBN_BASE}/users/me`, { headers })
  if (!meRes.ok) throw new Error(`kan.bn /users/me ${meRes.status}`)
  const me = await meRes.json()

  const wsRes = await fetch(`${KANBN_BASE}/workspaces`, { headers })
  if (!wsRes.ok) throw new Error(`kan.bn /workspaces ${wsRes.status}`)
  const workspaces = await wsRes.json()
  const wsList = Array.isArray(workspaces) ? workspaces : (workspaces.data || workspaces.items || [])

  const allTasks = []
  for (const item of wsList) {
    // /workspaces returns [{ role, workspace: {publicId, ...} }] in v0.5.x
    const ws = item.workspace || item
    const wsId = ws.publicId || ws.id
    if (!wsId) continue
    try {
      const wsDetailRes = await fetch(`${KANBN_BASE}/workspaces/${wsId}`, { headers })
      if (!wsDetailRes.ok) continue
      const wsDetail = await wsDetailRes.json()
      const myMember = (wsDetail.members || []).find(
        m => (m.user && m.user.id === me.id) || m.userId === me.id
      )
      if (!myMember) continue
      const myMemberId = myMember.publicId

      const boardsRes = await fetch(`${KANBN_BASE}/workspaces/${wsId}/boards`, { headers })
      if (!boardsRes.ok) continue
      const boards = await boardsRes.json()
      const boardList = Array.isArray(boards) ? boards : (boards.data || boards.items || [])

      for (const board of boardList) {
        const boardId = board.publicId || board.id
        if (!boardId) continue
        const url = `${KANBN_BASE}/boards/${boardId}?members%5B%5D=${encodeURIComponent(myMemberId)}`
        const boardRes = await fetch(url, { headers })
        if (!boardRes.ok) continue
        const boardData = await boardRes.json()
        const lists = boardData.lists || []
        for (const list of lists) {
          for (const card of list.cards || []) {
            allTasks.push({
              id: card.publicId || card.id,
              title: card.title,
              boardName: board.name,
              listName: list.name,
              dueDate: card.dueDate,
              url: `https://kanbn.dev-twake.maudet.cloud/boards/${boardId}`
            })
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[tasks] workspace fetch failed', wsId, e)
    }
  }
  return allTasks
}

const Tasks = ({ config }) => {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!config.kanbnApiKey) {
      setTasks([])
      setError(null)
      return
    }
    let cancelled = false
    setTasks(null)
    setError(null)
    fetchKanbnTasks(config.kanbnApiKey)
      .then(t => { if (!cancelled) setTasks(t) })
      .catch(e => { if (!cancelled) setError(e.message || String(e)) })
    return () => { cancelled = true }
  }, [config.kanbnApiKey])

  if (!config.kanbnApiKey) {
    return (
      <div className="u-c-grey">
        Configurez votre API key kan.bn dans les{' '}
        <Link to="/settings">paramètres</Link> pour voir vos tâches.
      </div>
    )
  }
  if (error) {
    return <div className="u-c-error">Erreur : {error}</div>
  }
  if (tasks === null) {
    return <div className="u-flex u-flex-justify-center u-mt-1"><Spinner size="large" /></div>
  }
  if (tasks.length === 0) {
    return <div className="u-c-grey">Aucune tâche assignée.</div>
  }

  return (
    <ul className="dashboard-list">
      {tasks.slice(0, 10).map(t => (
        <li
          key={t.id}
          className="dashboard-list-item"
          onClick={() => window.open(t.url, '_blank')}
        >
          <div className="dashboard-list-text">
            <div className="dashboard-list-primary">{t.title}</div>
            <div className="dashboard-list-secondary">
              {t.boardName} · {t.listName}{t.dueDate ? ` · ${new Date(t.dueDate).toLocaleDateString()}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default Tasks
