import { useEffect, useState } from 'react'

// Junction, not Canvas. This screen exists for one question that is easy to get
// wrong by hand: whether `order.physician` on a placed order tells you anything
// about who the ordering physician actually is.
//
// It does not. The field echoes whatever you send, on an account that is not
// delegated, for a physician on no roster anywhere — and if you send nothing it
// is backfilled with the team's registered physician. So the two arms below are
// the point: running only the left one looks like a success.
//
// Recorded as J1/J2 under "Junction sandbox" in Meridian-Web's
// docs/canvas/INSTANCE-FINDINGS.md.

// Deliberately not on the team roster, so a backfill is visible as a backfill.
//
// Generated fresh on every page load, and that is load-bearing: placing an
// order REGISTERS the physician on the team, so a hard-coded name would be on
// the roster from the second run onwards and the two arms would stop proving
// anything. Junction publishes no delete for the roster, so each run leaves an
// entry behind.
const stranger = () => {
  const unique = String(Date.now()).slice(-10)
  return {
    first_name: 'Harness',
    last_name: `Stranger-${unique}`,
    npi: unique,
    licensed_states: ['CA'],
  }
}

export default function JunctionOrder() {
  const [ctx, setCtx] = useState(null)
  const [labTestId, setLabTestId] = useState('')
  const [busy, setBusy] = useState('')
  const [arms, setArms] = useState({})
  const [error, setError] = useState(null)

  async function post(body) {
    const r = await fetch('/api/junction', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return r.json()
  }

  useEffect(() => {
    post({ op: 'context' })
      .then((c) => {
        if (c.error) return setError(c)
        setCtx(c)
        // at_home_phlebotomy is the arm the simulate call below advances.
        const preferred = c.tests?.find((t) => t.method === 'at_home_phlebotomy') ?? c.tests?.[0]
        setLabTestId(preferred?.id ?? '')
      })
      .catch((e) => setError({ error: String(e) }))
  }, [])

  async function place(arm, physician) {
    setBusy(arm)
    const started = Date.now()
    const body = await post({ op: 'place', physician, labTestId })
    setArms((a) => ({ ...a, [arm]: { ...body, ms: Date.now() - started } }))
    setBusy('')
  }

  const delegated = ctx?.labAccounts?.some((a) =>
    /order_delegated|fully_delegated/.test(a.delegated_flow ?? ''),
  )

  if (error) {
    return (
      <>
        <h1>Junction lab orders</h1>
        <pre>{JSON.stringify(error, null, 2)}</pre>
        <p className="muted">
          The key lives in <code>web.env</code> as <code>JUNCTION_KEY</code> and never reaches the
          browser — this page talks to <code>/api/junction</code>, which holds it server-side.
        </p>
        <p><a className="btn" href="/">← back</a></p>
      </>
    )
  }

  return (
    <>
      <h1>Junction lab orders</h1>
      <p className="muted">
        Sandbox only: the same key is refused <code>401</code> by <code>api.tryvital.io</code>. Orders
        placed here are real sandbox orders and cannot be deleted — Junction has no delete, and cancel
        closes once results land.
      </p>

      <h2>Delegation context</h2>
      {!ctx && <p className="muted">Reading lab accounts, team and roster…</p>}
      {ctx && (
        <>
          <table>
            <tbody>
              <tr>
                <th>Lab accounts</th>
                <td>
                  {ctx.labAccounts.length === 0
                    ? <span className="muted">
                        none — every order runs on a Junction platform account, which is the
                        non-delegated case
                      </span>
                    : ctx.labAccounts.map((a) => (
                        <div key={a.id}><code>{a.lab}</code> — {a.delegated_flow}</div>
                      ))}
                </td>
              </tr>
              <tr>
                <th>Team <code>delegated_flow</code></th>
                <td><code>{ctx.teamDelegatedFlow ?? '—'}</code></td>
              </tr>
              <tr>
                <th>Registered physicians</th>
                <td>
                  {ctx.roster.length === 0
                    ? <span className="muted">none</span>
                    : ctx.roster.map((p) => (
                        <div key={p.npi}>{p.first_name} {p.last_name} — <code>{p.npi}</code></div>
                      ))}
                  <small className="muted">
                    Not a gate on ordering — an unknown NPI is accepted — but this is what an omitted
                    physician is filled in with. It grows: every order registers its physician here,
                    and Junction publishes no way to remove one, so the <code>Stranger-…</code>
                    entries below are this page’s own leavings.
                  </small>
                </td>
              </tr>
            </tbody>
          </table>
          <p className={delegated ? 'pass' : 'fail'}>
            {delegated
              ? 'A delegated account exists — a supplied physician may be the orderer of record.'
              : 'Not delegated. Junction’s network is the ordering physician of record, whatever this page shows below.'}
          </p>
        </>
      )}

      <h2>The two arms</h2>
      <p className="muted">
        Run both. Reading only the left one is the mistake this screen exists to prevent: it comes
        back looking exactly like success.
      </p>
      <p>
        <label>
          Lab test{' '}
          <select value={labTestId} onChange={(e) => setLabTestId(e.target.value)}>
            {(ctx?.tests ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name} — {t.method} @ {t.lab}</option>
            ))}
          </select>
        </label>
      </p>
      <p>
        <button className="btn" disabled={!labTestId || busy} onClick={() => place('supplied', stranger())}>
          {busy === 'supplied' ? 'Placing…' : 'Place with a physician we supply'}
        </button>
        <button className="btn" disabled={!labTestId || busy} onClick={() => place('omitted', null)}>
          {busy === 'omitted' ? 'Placing…' : 'Place with no physician at all'}
        </button>
      </p>

      <table>
        <thead>
          <tr>
            <th>Arm</th>
            <th>Sent</th>
            <th>Read back from <code>GET /v3/order/{'{id}'}</code></th>
            <th />
          </tr>
        </thead>
        <tbody>
          {['supplied', 'omitted'].map((arm) => {
            const r = arms[arm]
            const sent = r?.sent
            const got = r?.readBack
            return (
              <tr key={arm}>
                <td>{arm === 'supplied' ? 'physician supplied' : 'physician omitted'}</td>
                <td>
                  {!r ? <span className="muted">—</span>
                    : sent ? <>{sent.first_name} {sent.last_name}<br /><code>{sent.npi}</code></>
                    : <span className="muted">nothing</span>}
                </td>
                <td>
                  {!r ? <span className="muted">—</span>
                    : r.error ? <span className="fail">{r.error}: {String(r.detail).slice(0, 120)}</span>
                    : got ? <>{got.first_name} {got.last_name}<br /><code>{got.npi}</code></>
                    : <span className="muted">null</span>}
                </td>
                <td>
                  {r?.orderId && (
                    <a className="btn" href={r.requisitionUrl} target="_blank" rel="noreferrer">
                      Requisition PDF
                    </a>
                  )}
                  {r?.ms != null && <><br /><small className="muted">{r.ms} ms</small></>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {arms.supplied?.readBack && arms.omitted?.readBack && (
        <p className={arms.supplied.readBack.npi === arms.supplied.sent?.npi ? 'fail' : 'pass'}>
          {arms.supplied.readBack.npi === arms.supplied.sent?.npi
            ? 'Both arms returned a physician, and each returned a different one — the supplied arm ' +
              'echoed ours, the omitted arm was backfilled from the roster. So the field records ' +
              'our own input and cannot tell you who the lab treats as the orderer. Reconciling it ' +
              'against what you sent always passes, including when a silent fallback has happened.'
            : 'The supplied physician did not survive — read this against the delegation context above.'}
        </p>
      )}

      <h2>What the requisition does not settle</h2>
      <p className="muted">
        The PDF renders, but on sandbox it is a canned Labcorp fixture — ordering physician
        “Test Physician” with a blank NPI, client “Vital”, a patient in Florida — and it is byte-identical
        across collection methods. Only the test code is yours. Nothing about a real requisition can be
        concluded from it, which is why the question of whether a supplied physician reaches the lab is
        still open. <code>signature_image</code> is worse: a valid base64 PNG makes order creation
        return <code>500</code>.
      </p>

      <p><a className="btn" href="/">← back</a></p>
    </>
  )
}
