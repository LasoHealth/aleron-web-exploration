import { useEffect, useState } from 'react'
import { fetchRoster } from './canvas.js'

// What this page establishes, and it took a real sign-off attempt to find:
//
//   POST /api/LabOrder/ creates an order ROW with client_credentials and no
//   plugin. 201, a requisition number, and orderingProvider inherited from the
//   note's providerKey — so Aleron chooses the physician named on an order.
//
//   It does NOT create a command. The order never appears in the note's body,
//   so Canvas opens an empty note, there is nothing for a physician to sign,
//   and committer stays null. No commit route exists and PATCH {committer}
//   answers 200 while leaving the field null.
//
// So F2/F3 hold for the layer that matters. An order record is reachable; a
// signable order is not. Three identities land on one order and only the middle
// one is ours:
//
//   originator        the API caller, a staff pk we do not control
//   orderingProvider  inherited from the note's provider, which we DO set
//   committer         set only by a real commit, which needs a plugin
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
        <code>POST /api/LabOrder/</code> takes this app's <code>client_credentials</code> token and
        returns <code>201</code> with no plugin — the same undocumented <code>/api/</code> surface
        that signs notes. The FHIR route really is closed: <code>ServiceRequest</code>{' '}
        <code>POST</code> answers <code>405</code>.
      </p>
      <p className="muted">
        <b>But an order created this way cannot be signed, and that is the finding.</b> It never
        reaches the note as a command, so <b>Canvas opens an empty note with nothing to sign</b>.
        Signing that note signs an empty note and leaves <code>committer</code> null — there is no
        commit route, and <code>PATCH {'{'}committer{'}'}</code> answers <code>200</code> while
        changing nothing. An order <em>record</em> is reachable from outside Canvas; a{' '}
        <em>signable</em> order is not, so ORDERING F2/F3 hold for the layer that matters.
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
        <code>orderingProvider</code> — proven by placing two otherwise identical orders under
        different providers and getting different names back. It is the one identity on an order
        Aleron controls, and it is how the <em>naming</em> half of priority 1 is satisfied without a
        plugin. The <em>signing</em> half is not.
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
      {orders.length > 0 && signed === 0 && (
        <p className="muted">
          <b>Expect every order to read unsigned.</b> Signing its note in Canvas will not change
          this: the note has no order command in it to sign.
        </p>
      )}
      {orders.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Ordering provider<br /><span className="muted">from the note — ours</span></th>
              <th>Originator<br /><span className="muted">the API caller</span></th>
              <th>Committer<br /><span className="muted">needs a plugin</span></th>
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
                Open the note in Canvas ↗
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
