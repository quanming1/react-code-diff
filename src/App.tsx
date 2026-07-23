import { useState } from 'react'
import { CodeDiff } from './code-diff'
import type { ViewMode, Theme } from './code-diff'
import './App.css'

const OLD_CODE = `import { useState, useEffect } from 'react'

interface User {
  id: number
  name: string
  email: string
  role: string
}

export function UserCard({ user }: { user: User }) {
  const [expanded, setExpanded] = useState(false)
  const [avatar, setAvatar] = useState('')

  useEffect(() => {
    fetch(\`/api/avatars/\${user.id}\`)
      .then(res => res.json())
      .then(data => setAvatar(data.url))
  }, [user.id])

  return (
    <div className="user-card" onClick={() => setExpanded(!expanded)}>
      <img src={avatar} alt={user.name} className="avatar" />
      <div className="user-info">
        <h3>{user.name}</h3>
        <p>{user.email}</p>
        <span className="badge">{user.role}</span>
      </div>
      {expanded && (
        <div className="user-details">
          <p>ID: {user.id}</p>
          <p>Role: {user.role}</p>
        </div>
      )}
    </div>
  )
}

export function UserList({ users }: { users: User[] }) {
  return (
    <div className="user-list">
      {users.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  )
}`

const NEW_CODE = `import { useState, useEffect, useCallback } from 'react'

interface User {
  id: number
  name: string
  email: string
  role: UserRole
  avatarUrl?: string
}

type UserRole = 'admin' | 'member' | 'guest'

export function UserCard({ user }: { user: User }) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (user.avatarUrl) return
    console.warn('Avatar URL missing for user', user.id)
  }, [user.id, user.avatarUrl])

  const toggleExpand = useCallback(() => {
    setExpanded(prev => !prev)
  }, [])

  return (
    <div className="user-card" onClick={toggleExpand}>
      <img
        src={user.avatarUrl ?? '/default-avatar.png'}
        alt={user.name}
        className="avatar"
        loading="lazy"
      />
      <div className="user-info">
        <h3>{user.name}</h3>
        <p>{user.email}</p>
        <span className="badge">{user.role}</span>
      </div>
      {expanded && (
        <div className="user-details">
          <p>ID: {user.id}</p>
          <p>Role: {user.role}</p>
        </div>
      )}
    </div>
  )
}

export function UserList({ users }: { users: User[] }) {
  if (users.length === 0) {
    return <div className="empty-state">No users found</div>
  }

  return (
    <div className="user-list">
      {users.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  )
}`

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [theme, setTheme] = useState<Theme>('dark')
  const [wrapLines, setWrapLines] = useState(false)
  const [showDiffOnly, setShowDiffOnly] = useState(true)

  return (
    <div className="demo-app">
      <div className="demo-controls">
        <div className="demo-btn-group">
          <button
            className={viewMode === 'split' ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
          <button
            className={viewMode === 'unified' ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setViewMode('unified')}
          >
            Unified
          </button>
        </div>
        <div className="demo-btn-group">
          <button
            className={theme === 'dark' ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setTheme('dark')}
          >
            Dark
          </button>
          <button
            className={theme === 'light' ? 'demo-btn active' : 'demo-btn'}
            onClick={() => setTheme('light')}
          >
            Light
          </button>
        </div>
        <button
          className={wrapLines ? 'demo-btn active' : 'demo-btn'}
          onClick={() => setWrapLines((v) => !v)}
        >
          Wrap
        </button>
        <button
          className={showDiffOnly ? 'demo-btn active' : 'demo-btn'}
          onClick={() => setShowDiffOnly((v) => !v)}
        >
          Diff Only
        </button>
      </div>

      <CodeDiff
        oldValue={OLD_CODE}
        newValue={NEW_CODE}
        language="tsx"
        fileName="UserCard.tsx"
        viewMode={viewMode}
        theme={theme}
        wrapLines={wrapLines}
        showDiffOnly={showDiffOnly}
        contextLines={3}
        maxHeight="70vh"
      />
    </div>
  )
}

export default App
