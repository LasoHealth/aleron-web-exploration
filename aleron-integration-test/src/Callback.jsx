import { useEffect, useRef, useState } from 'react'
import { ROLES, exchangeCode, fetchRoster, probe } from './canvas.js'
import Attribution from './Attribution.jsx'
import Results from './Results.jsx'

// Only the physician route redirects, so this only ever handles a staff login.
export default function Callback() {
  const [stage, setStage] = useState('starting')
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  const [granted, setGranted] = useState('')
  // Kept so the attribution probe can write as this physician rather than as
  // the app. It never leaves the dev server.
  const [staffToken, setStaffToken] = useState('')
  const [subject, setSubject] = useState(null)

  // The authorization code is single-use, so this must run exactly once even if
  // React re-invokes the effect (StrictMode, HMR). A second exchange would fail.
  const started = useRef(false)

  const params = new URLSearchParams(location.search)
  const role = sessionStorage.getItem('role')

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function run() {
      if (params.get('error')) {
        throw new Error(`${params.get('error')}: ${params.get('error_description') ?? ''}`)
      }
      if (!params.get('code')) {
        throw new Error('No ?code in the callback URL. Start the login again from the route page.')
      }
      if (params.get('state') !== sessionStorage.getItem('state')) {
        throw new Error(
          'State mismatch — refusing to exchange the code (possible CSRF).\n\n' +
            'This also happens if you reloaded /callback: the stored state is consumed and the ' +
            'authorization code is single-use, so a refresh can never succeed. Start over.',
        )
      }

      setStage('exchanging')
      // Codes expire in ~60s, so this runs immediately on landing.
      const token = await exchangeCode(params.get('code'))
      setGranted(token.scope ?? '')
      setStaffToken(token.access_token)

      setStage('probing')
      const patients = await fetchRoster()
      setSubject(patients[0] ?? null)
      // Staff context: no subject, so every patient is expected to be readable.
      setResults(await probe(token.access_token, patients, ''))
      setStage('done')
    }

    run().catch((err) => {
      setError(err.message)
      setStage('failed')
    })
  }, [])

  if (stage === 'failed') {
    const launch = ROLES[role]?.launch()
    // Everything needed to tell a Canvas misconfiguration apart from a bad
    // request on our side, without digging through devtools.
    const sent = {
      role: role ?? '(none in sessionStorage)',
      scope: ROLES[role]?.scope ?? '(unknown)',
      launch: launch ? `${launch}  →  ${atob(launch)}` : '(unknown)',
      callbackQuery: location.search || '(empty)',
    }

    return (
      <>
        <h1>Authorization failed</h1>
        <pre>{error}</pre>

        <h2>What we sent</h2>
        <pre>{Object.entries(sent).map(([k, v]) => `${k.padEnd(15)} ${v}`).join('\n')}</pre>

        <p className="muted">
          A staff login needs a valid <code>launch</code> context, and the requested scope must be
          allowed on the Canvas app — check both against <code>/auth/applications/</code>.
        </p>
        <p>
          {role && <a className="btn" href={`/${role}`}>Start over</a>}
          <a className="btn" href="/">← back</a>
        </p>
      </>
    )
  }

  if (stage === 'done') {
    return (
      <>
        <h1>{ROLES[role].title}</h1>
        <Results
          results={results}
          role={{ ...ROLES[role], scope: granted || ROLES[role].scope }}
          subject=""
        />
        <Attribution token={staffToken} patientId={subject?.id} patientName={subject?.name} />
        <p><a className="btn" href="/">← back</a></p>
      </>
    )
  }

  return <p>{stage === 'probing' ? 'Probing patients…' : 'Exchanging authorization code…'}</p>
}
