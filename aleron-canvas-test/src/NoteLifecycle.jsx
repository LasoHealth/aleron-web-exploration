import { useEffect, useState } from 'react'
import { fetchRoster } from './canvas.js'

// Canvas documents locking a note as the thing that generates the note PDF and
// its FHIR DocumentReference. On aleronmd-dev it does not. These three buttons
// are that claim, made pressable: create a note, lock it, then go looking for
// the document. The third button is expected to come back empty, and the point
// is that anyone can now reproduce it in about ten seconds rather than taking
// it on trust from a document.
export default function NoteLifecycle() {
  const [patients, setPatients] = useState([])
  const [patientId, setPatientId] = useState('')
  const [noteKey, setNoteKey] = useState('')
  const [notes, setNotes] = useState([])
  const [busy, setBusy] = useState('')
  const [log, setLog] = useState([])

  useEffect(() => {
    fetchRoster().then((rows) => {
      setPatients(rows)
      if (rows[0]) {
        setPatientId(rows[0].id)
        refresh(rows[0].id)
      }
    })
  }, [])

  async function run(op, key = noteKey) {
    setBusy(op)
    const started = Date.now()
    try {
      const res = await fetch('/api/note', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op, patientId, noteKey: key }),
      })
      const body = await res.json()
      // Carry the new key forward so lock and PDF act on what create just made
      // without anyone copying a uuid between fields.
      if (op === 'create' && body?.note?.noteKey) setNoteKey(body.note.noteKey)
      if (op === 'list') setNotes(body?.notes ?? [])
      // Anything that changed a note leaves the list stale, so refresh it.
      if (op !== 'list' && op !== 'pdf') refresh()
      setLog((prev) => [{ op, status: res.status, ms: Date.now() - started, body }, ...prev])
      return body
    } catch (err) {
      setLog((prev) => [{ op, status: 0, ms: Date.now() - started, body: { error: String(err) } }, ...prev])
    } finally {
      setBusy('')
    }
  }

  // Reads the list without touching the log, so a refresh after every act does
  // not bury the result the user is reading.
  async function refresh(id = patientId) {
    if (!id) return
    const res = await fetch('/api/note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'list', patientId: id }),
    })
    const body = await res.json().catch(() => null)
    setNotes(body?.notes ?? [])
  }

  const needsNote = !noteKey

  return (
    <>
      <h1>Note lifecycle</h1>
      <p className="muted">
        Every call is made server-side with the app's <code>client_credentials</code> token, which
        is the grant the Note API documents. A physician's{' '}
        <code>authorization_code</code> token is answered <code>403</code> here; the clinician is
        named by the <code>providerKey</code> field instead.
      </p>

      <h2>Subject</h2>
      <p>
        <label>
          Patient{' '}
          <select
            value={patientId}
            onChange={(e) => { setPatientId(e.target.value); refresh(e.target.value) }}
          >
            {patients.length === 0 && <option value="">no roster — run create-patients</option>}
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
            ))}
          </select>
        </label>
      </p>
      <p>
        <label>
          Note{' '}
          <input
            value={noteKey}
            onChange={(e) => setNoteKey(e.target.value.trim())}
            placeholder="noteKey — filled in by Create, or paste one"
            size="42"
          />
        </label>
      </p>

      <h2>Acts</h2>
      <p>
        <button disabled={!patientId || busy} onClick={() => run('create')}>
          {busy === 'create' ? 'Creating…' : '1. Create note'}
        </button>
        <button disabled={needsNote || busy} onClick={() => run('lock')}>
          {busy === 'lock' ? 'Locking…' : '2. Lock note'}
        </button>
        <button disabled={needsNote || busy} onClick={() => run('sign')}>
          {busy === 'sign' ? 'Signing…' : '3. Sign note'}
        </button>
        <button disabled={needsNote || busy} onClick={() => run('pdf')}>
          {busy === 'pdf' ? 'Looking…' : '4. Retrieve note PDF'}
        </button>
      </p>
      <p className="muted">
        Create leaves the note at <code>NEW</code>; lock moves it to <code>LKD</code>.{' '}
        <b>Signing is what produces the PDF</b> — not locking, whatever both Canvas doc pages say.
        Locked notes on this instance produced none; the first signature produced one within five
        seconds. Sign needs the note locked first, and it also goes through{' '}
        <code>/api/NoteStateChangeEvent/</code>, since <code>stateChange</code> refuses{' '}
        <code>SGN</code> too.
      </p>

      <h2>Notes on this patient ({notes.length})</h2>
      <p className="muted">
        <b>Delete goes through <code>POST /api/NoteStateChangeEvent/</code>, which is undocumented
        as an HTTP endpoint</b> — it is what the Canvas UI itself calls, and it accepts this app's
        <code>client_credentials</code> token. The v1 REST Note API cannot do it: <code>DELETE</code>{' '}
        answers <code>405</code> and <code>stateChange</code> refuses <code>DLT</code>. The delete
        is soft and reversible with <code>UND</code>. <b>Void</b> retitles instead, which is all the
        documented API allows, and it works even on a signed note.
      </p>
      <p>
        <button disabled={!patientId || busy} onClick={() => run('deleteAll')}>
          {busy === 'deleteAll' ? 'Trying…' : 'Delete all notes'}
        </button>
        <button
          disabled={!patientId || busy}
          onClick={() => {
            if (confirm(`Retitle all ${notes.length} notes on this patient as void? The original titles are not recoverable.`)) run('voidAll')
          }}
        >
          {busy === 'voidAll' ? 'Voiding…' : 'Void all notes'}
        </button>
        <button disabled={!patientId || busy} onClick={() => refresh()}>Refresh</button>
      </p>
      {notes.length > 0 && (
        <table>
          <thead>
            <tr><th>State</th><th>Title</th><th>Note</th><th /></tr>
          </thead>
          <tbody>
            {notes.map((n) => {
              const selected = Boolean(n.noteKey) && n.noteKey === noteKey
              return (
                <tr key={n.noteKey} className={selected ? 'selected' : undefined}>
                  <td><code>{n.currentState}</code></td>
                  <td>
                    {n.title || <span className="muted">untitled</span>}
                    {/* The act buttons above operate on whatever is selected, so
                        which row that is has to be readable from the row. */}
                    {selected && <span className="muted"> &larr; the acts above use this note</span>}
                  </td>
                  <td><code className="muted">{(n.noteKey ?? '').slice(0, 8)}</code></td>
                  <td>
                    <button disabled={busy} onClick={() => run('delete', n.noteKey)}>Delete</button>
                    <button disabled={busy} onClick={() => run('void', n.noteKey)}>Void</button>
                    <button disabled={busy || selected} onClick={() => setNoteKey(n.noteKey)}>
                      {selected ? 'Selected' : 'Select'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <h2>Results</h2>
      {log.length === 0 && <p className="muted">Nothing run yet.</p>}
      {log.map((entry, i) => (
        <details key={log.length - i} open={i === 0}>
          <summary>
            <code>{entry.op}</code>{' '}
            <span className={entry.status >= 200 && entry.status < 300 ? 'pass' : 'fail'}>
              {entry.status || 'threw'}
            </span>{' '}
            <span className="muted">{entry.ms} ms</span>
            {entry.op === 'pdf' && (
              <span className={entry.body?.found ? 'pass' : 'fail'}>
                {entry.body?.found ? ' — PDF found' : ' — no PDF'}
              </span>
            )}
          </summary>
          {entry.body?.document?.href && (
            <p>
              <a className="btn" href={entry.body.document.href} target="_blank" rel="noreferrer">
                Open the PDF
              </a>
            </p>
          )}
          <pre>{JSON.stringify(entry.body, null, 2)}</pre>
        </details>
      ))}

      <p><a className="btn" href="/">← back</a></p>
    </>
  )
}
