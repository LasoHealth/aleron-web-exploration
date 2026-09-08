import { useEffect, useRef, useState } from 'react'

// Does a note locked through the API carry the physician's name or the app's?
//
// Canvas answers this by *how the request authenticated*, not by any field in
// the payload — an API key or client_credentials records "Canvas Bot", an
// authorization_code token records the staff member who authorized it. That is
// the whole basis for attributing an order to the physician who is logged into
// Aleron, so it is worth proving rather than reading.
//
// The probe writes two notes with an identical body and the same providerKey.
// The only difference is the bearer token. Whatever the two notes say about
// their author is therefore caused by the token and nothing else.

export default function Attribution({ token, patientId, patientName }) {
  const [state, setState] = useState('idle')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const ran = useRef(false)

  async function run() {
    if (ran.current) return
    ran.current = true
    setState('running')
    try {
      const res = await fetch('/api/attribution-probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, patientId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(JSON.stringify(body, null, 2))
      setResult(body)
      setState('done')
    } catch (err) {
      setError(err.message)
      setState('failed')
    }
  }

  useEffect(() => {
    if (token && patientId) run()
  }, [token, patientId])

  if (state === 'idle') return null
  if (state === 'running') return <p>Writing two notes, one per token…</p>
  if (state === 'failed') {
    return (
      <>
        <h2>Attribution probe failed</h2>
        <pre>{error}</pre>
      </>
    )
  }

  const { staff, service, provenance } = result

  return (
    <>
      <h2>Who does Canvas record as the author?</h2>
      <p className="muted">
        Two notes on {patientName ?? 'the first fixture patient'}, same body, same{' '}
        <code>providerKey</code>. Only the token differs, so any difference in authorship is
        caused by the token.
      </p>

      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Grant</th>
            <th>Note</th>
            <th>State</th>
            <th>Open in Canvas</th>
          </tr>
        </thead>
        <tbody>
          {[
            { label: 'The physician', grant: 'authorization_code', ...staff },
            { label: 'The app', grant: 'client_credentials', ...service },
          ].map((row) => (
            <tr key={row.grant}>
              <td>{row.label}</td>
              <td><code>{row.grant}</code></td>
              <td>{row.error ? '—' : <code>{row.noteKey}</code>}</td>
              <td>{row.error ? <span className="fail">{row.error}</span> : row.currentState}</td>
              <td>
                {row.permalink ? (
                  <a href={row.permalink} target="_blank" rel="noreferrer">open ↗</a>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted">
        Canvas does not return the author on the note object, so open both. The expected result is
        that the first carries your name and the second says <em>Canvas Bot</em>. If they both say
        Canvas Bot, attribution does not follow the token and an order cannot be attributed to the
        physician from outside Canvas — which would be the single most consequential finding in the
        integration.
      </p>

      {provenance?.length > 0 && (
        <>
          <h3>Provenance for this patient</h3>
          <pre>{provenance.map((p) => `${p.recorded ?? '?'}  ${p.agent ?? '?'}  ${p.target ?? ''}`).join('\n')}</pre>
        </>
      )}
      {provenance?.length === 0 && (
        <p className="muted">
          No <code>Provenance</code> rows for this patient, so the record has to be read in the
          Canvas UI rather than through FHIR.
        </p>
      )}
    </>
  )
}
