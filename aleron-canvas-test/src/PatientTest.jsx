import { useEffect, useState } from 'react'
import { ROLES, fetchRoster, mintPatientToken, probe } from './canvas.js'
import Results from './Results.jsx'

// No OAuth redirect here: the patient-scoped token is minted server-side from
// client_credentials + patient=<id>, so the whole test runs without leaving the
// page and we choose the subject.
export default function PatientTest() {
  const [patients, setPatients] = useState(null)
  const [stage, setStage] = useState('idle')
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  const [subject, setSubject] = useState('')
  const [granted, setGranted] = useState('')

  useEffect(() => { fetchRoster().then(setPatients) }, [])

  async function run(patient) {
    setStage('minting')
    setError(null)
    setResults(null)
    setSubject(patient.id)
    try {
      const token = await mintPatientToken(patient.id)
      setGranted(token.scope)
      setStage('probing')
      setResults(await probe(token.access_token, patients, patient.id))
      setStage('done')
    } catch (err) {
      setError(err.message)
      setStage('failed')
    }
  }

  if (!patients) return <p>Loading…</p>

  const back = <p><a className="btn" href="/">← back</a></p>

  if (patients.length === 0) {
    return (
      <>
        <h1>{ROLES.patient.title}</h1>
        <p>No <code>created-patients.json</code> yet — run <code>npm run create-patients</code> first.</p>
        {back}
      </>
    )
  }

  return (
    <>
      <h1>{ROLES.patient.title}</h1>
      <p className="muted">{ROLES.patient.blurb}</p>

      <p className="muted">
        <code>client_credentials</code> + <code>patient=&lt;id&gt;</code> + <code>patient/Patient.read</code>.
      </p>
      <p>
        {patients.map((patient, i) => (
          <button key={patient.id} onClick={() => run(patient)} disabled={stage === 'minting' || stage === 'probing'}>
            Scope to {patient.name}{i === 0 ? ' (A)' : ''}
          </button>
        ))}
      </p>

      {stage === 'minting' && <p>Minting patient-scoped token…</p>}
      {stage === 'probing' && <p>Probing patients…</p>}
      {stage === 'failed' && (
        <>
          <h2>Token request failed</h2>
          <pre>{error}</pre>
        </>
      )}
      {stage === 'done' && (
        <Results results={results} role={{ ...ROLES.patient, scope: granted }} subject={subject} />
      )}
      {back}
    </>
  )
}
