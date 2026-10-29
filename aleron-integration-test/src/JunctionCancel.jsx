import { useEffect, useState } from 'react'

// Junction, not Canvas. The question: what can be cancelled after an order is
// placed, and what does a cancelled order look like? Each scenario places its
// own sandbox order, drives it to a state with the simulator, then cancels it.
// Junction has no delete, so a run leaves five orders behind. The docs conflict
// on the cancel route itself, so the row shows which request actually worked.

async function post(body) {
  const r = await fetch('/api/junction', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

const after = (a) => (a ? `${a.status} · ${a.last ?? '—'}${a.detail ? ` (${a.detail})` : ''}` : '—')

export default function JunctionCancel() {
  const [tests, setTests] = useState(null)
  const [testId, setTestId] = useState('')
  const [busy, setBusy] = useState(false)
  const [run, setRun] = useState(null)

  useEffect(() => {
    // The catalog probe already lists active tests, so reuse it rather than add an op.
    post({ op: 'labs' })
      .then((d) => {
        const rows = d.active?.rows ?? []
        setTests(rows)
        setTestId(rows[0]?.id ?? '')
      })
      .catch((e) => setRun({ error: String(e) }))
  }, [])

  async function go() {
    const t = tests.find((x) => x.id === testId)
    setBusy(true)
    setRun(null)
    setRun(await post({ op: 'cancelScenarios', labTestId: t.id, method: t.method }).catch((e) => ({ error: String(e) })))
    setBusy(false)
  }

  return (
    <>
      <h1>Junction order cancellation</h1>
      <p className="muted">
        Sandbox only. Each scenario places a real order, so one run leaves five behind. It takes a
        minute or more: the simulator is polled for up to six seconds per state.
      </p>

      {!tests ? <p className="muted">Reading active lab tests…</p> : (
        <p>
          <label>
            Lab test{' '}
            <select value={testId} onChange={(e) => setTestId(e.target.value)}>
              {tests.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.method} @ {t.lab}</option>)}
            </select>
          </label>
          <button className="btn" disabled={busy || !testId} onClick={go}>
            {busy ? 'Running…' : 'Run cancel scenarios'}
          </button>
        </p>
      )}

      {run?.error && <pre>{JSON.stringify(run, null, 2)}</pre>}
      {run?.rows && (
        <table>
          <thead>
            <tr><th>Scenario</th><th>Simulated to</th><th>Cancel</th><th>Order afterwards</th></tr>
          </thead>
          <tbody>
            {run.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.scenario}{r.orderId && <><br /><small className="muted"><code>{r.orderId}</code></small></>}</td>
                <td>
                  {r.error ? <span className="fail">{r.error}</span>
                    : r.sim ? <>
                        <span className={r.sim.http === 200 && r.sim.reached ? 'pass' : 'fail'}>
                          {r.sim.http === 200 ? (r.sim.reached ? 'reached' : `stayed at ${r.sim.now}`) : `refused ${r.sim.http}`}
                        </span>
                        <br /><small className="muted"><code>{r.sim.target}</code></small>
                        <br /><small className="muted">{r.sim.calls} call(s): {r.sim.trail.join(' → ')}</small>
                        {r.sim.detail && <><br /><small>{r.sim.detail}</small></>}
                      </>
                    : <span className="muted">none, left in ordered</span>}
                </td>
                <td>
                  {r.cancel ? <>
                    <span className={r.cancel.http === 200 ? 'pass' : 'fail'}>{r.cancel.http}</span>
                    {r.cancel.tried.map((t) => <div key={t}><small className="muted">{t}</small></div>)}
                    <details><summary><small>body</small></summary><pre>{r.cancel.body}</pre></details>
                  </> : <span className="muted">not called</span>}
                </td>
                <td><small>{after(r.cancel?.after ?? r.after)}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p><a className="btn" href="/">← back</a></p>
    </>
  )
}
