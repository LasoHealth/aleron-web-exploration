import { useEffect, useState } from 'react'
import { fetchRoster } from './canvas.js'

// Orders are documented as plugin-gated (ORDERING F2/F3), and the FHIR route is
// closed (ServiceRequest POST -> 405). Neither is the whole truth: the Canvas
// UI's own /api/LabOrder/ takes this app's client_credentials token and returns
// 201. This page is that made pressable.
//
// What it is really for is the round trip. Three identities land on one order
// and only one is ours to choose:
//
//   originator        the API caller, a staff pk we do not control
//   orderingProvider  inherited from the note's provider, which we DO set
//   committer         null until a human signs in the Canvas UI
//
// So: create an order here, open its note in Canvas, sign, come back and press
// Refresh. If committer fills in with the signer, that is the first direct
// evidence on priority 1 — whose name ends up on an order.
export default function OrderLifecycle() {
  const [patients, setPatients] = useState([])
  const [patientId, setPatientId] = useState('')
  const [staff, setStaff] = useState([])
  const [providerKey, setProviderKey] = useState('')
  const [orders, setOrders] = useState([])
  const [busy, setBusy] = useState('')
  const [log, setLog] = useState([])

  useEffect(() => {
    fetchRoster().then((rows) => {
      setPatients(rows)
      if (rows[0]) setPatientId(rows[0].id)
    })
    post({ op: 'staff' }).then((b) => setStaff(b?.staff ?? []))
    refresh()
  }, [])

  async function post(body) {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { ...(await res.json().catch(() => null)), _status: res.status }
  }

  // Reads the list without touching the log, so a refresh does not bury the
  // result being read.
  async function refresh() {
    const b = await post({ op: 'list' })
    setOrders(b?.orders ?? [])
  }

  async function run(body, label) {
    setBusy(label)
    const started = Date.now()
    try {
      const b = await post(body)
      setLog((prev) => [{ label, status: b._status, ms: Date.now() - started, body: b }, ...prev])
      await refresh()
    } catch (err) {
      setLog((prev) => [{ label, status: 0, ms: Date.now() - started, body: { error: String(err) } }, ...prev])
    } finally {
      setBusy('')
    }
  }

  const signed = orders.filter((o) => o.committer).length

  return (
    <>
      <h1>Order lifecycle</h1>
      <p className="muted">
        <b>Orders are documented as plugin-gated and they are not.</b>{' '}
        <code>POST /api/LabOrder/</code> takes this app's <code>client_credentials</code> token and
        returns <code>201</code> — the same undocumented <code>/api/</code> surface that signs notes.
        The FHIR route really is closed: <code>ServiceRequest</code> <code>POST</code> answers{' '}
        <code>405</code>. Nothing here signs or sends an order; signing is the physician's act, in
        Canvas.
      </p>

      <h2>Subject</h2>
      <p>
        <label>
          Patient{' '}
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            {patients.length === 0 && <option value="">no roster — run create-patients</option>}
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
            ))}
          </select>
        </label>
      </p>
      <p>
        <label>
          Ordering physician{' '}
          <select value={providerKey} onChange={(e) => setProviderKey(e.target.value)}>
            <option value="">first Practitioner (default)</option>
            {staff.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}{s.isPractitioner ? '' : ' — staff, not a FHIR Practitioner'}
              </option>
            ))}
          </select>
        </label>
      </p>
      <p className="muted">
        This sets <code>providerKey</code> on the note, and the order inherits it as{' '}
        <code>orderingProvider</code>. That is the one identity on an order Aleron controls, and it
        is how priority 1 would be satisfied — so changing it here and checking the resulting order
        is the actual test.
      </p>

      <h2>Acts</h2>
      <p>
        <button
          disabled={!patientId || busy}
          onClick={() => run({ op: 'create', patientId, providerKey }, 'create')}
        >
          {busy === 'create' ? 'Creating…' : 'Create lab order'}
        </button>
        <button disabled={busy} onClick={() => run({ op: 'list' }, 'list')}>Refresh</button>
      </p>
      <p className="muted">
        Create makes a note and hangs an order off it. The order comes back with a requisition
        number, empty <code>tests</code> and no lab partner — so there is nothing to transmit even
        if it were signed.
      </p>

      <h2>
        Orders ({orders.length}){' '}
        {orders.length > 0 && (
          <span className={signed ? 'pass' : 'fail'}>
            {signed ? `${signed} signed` : 'none signed yet'}
          </span>
        )}
      </h2>
      {orders.length === 0 && <p className="muted">No lab orders on the instance.</p>}
      {orders.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Ordering provider<br /><span className="muted">from the note — ours</span></th>
              <th>Originator<br /><span className="muted">the API caller</span></th>
              <th>Committer<br /><span className="muted">who signed</span></th>
              <th>Sign / withdraw</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <code>{o.id}</code>
                  <br />
                  <small className="muted">{o.requisitionNumber}</small>
                  {o.enteredInError && <><br /><small className="fail">entered in error</small></>}
                </td>
                <td>{o.orderingProvider ?? <span className="muted">none</span>}</td>
                <td><code className="muted">{o.originator ?? '—'}</code></td>
                <td>
                  {o.committer
                    ? <span className="pass"><code>{o.committer}</code></span>
                    : <span className="muted">unsigned</span>}
                </td>
                <td>
                  {o.permalink && (
                    <a className="btn" href={o.permalink} target="_blank" rel="noreferrer">
                      Open in Canvas ↗
                    </a>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => run({ op: 'withdraw', orderId: o.id }, `withdraw ${o.id}`)}
                  >
                    Withdraw
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">
        <b>Withdraw</b> marks the order entered-in-error and deleted. There is no hard delete —{' '}
        <code>DELETE</code> answers <code>405</code>, and a chart wants a withdrawal recorded rather
        than a row removed. The order stays readable as a FHIR <code>ServiceRequest</code> with{' '}
        <code>status: entered_in_error</code>.
      </p>

      <h2>Results</h2>
      {log.length === 0 && <p className="muted">Nothing run yet.</p>}
      {log.map((entry, i) => (
        <details key={log.length - i} open={i === 0}>
          <summary>
            <code>{entry.label}</code>{' '}
            <span className={entry.status >= 200 && entry.status < 300 ? 'pass' : 'fail'}>
              {entry.status || 'threw'}
            </span>{' '}
            <span className="muted">{entry.ms} ms</span>
          </summary>
          {entry.body?.note?.permalink && (
            <p>
              <a className="btn" href={entry.body.note.permalink} target="_blank" rel="noreferrer">
                Open the note to sign ↗
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
