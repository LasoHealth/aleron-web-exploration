import { useEffect, useState } from 'react'
import { ROLES, beginLogin, fetchConfig } from './canvas.js'

// The only route that actually leaves the page: a staff member logs into Canvas
// and consents, and we come back to /callback with an authorization code.
export default function PhysicianLogin() {
  const { title, blurb, scope } = ROLES.physician
  const [config, setConfig] = useState(null)

  useEffect(() => { fetchConfig().then(setConfig) }, [])

  if (!config) return <p>Loading…</p>

  const back = <p><a className="btn" href="/">← back</a></p>

  if (!config.clientId) {
    return (
      <>
        <h1>{title}</h1>
        <p>
          No <code>WEB_CLIENT_ID</code> — set it and <code>WEB_CLIENT_SECRET</code> in{' '}
          <code>web.env</code>, then restart the dev server.
        </p>
        {back}
      </>
    )
  }

  return (
    <>
      <h1>{title}</h1>
      <p className="muted">{blurb} Scope <code>{scope}</code>.</p>
      <p>
        <button onClick={() => beginLogin('physician', config)}>Log in as staff</button>
      </p>
      {back}
    </>
  )
}
