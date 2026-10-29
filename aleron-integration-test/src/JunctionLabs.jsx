import { useEffect, useState } from 'react'

// Junction, not Canvas. The question: can Aleron pull "the labs a physician can
// order" from Junction? The catalog is per team, never per physician, and there
// is no dry-run endpoint, so this screen shows the list next to what an order
// actually accepts. Where they disagree is the finding.
//
// Sources and open questions: the Confluence page for this question in the
// Aleron (AL) space. Endpoint behaviour here is measured, not quoted.

async function post(body) {
  const r = await fetch('/api/junction', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

const count = (rows, key) =>
  Object.entries(rows.reduce((m, r) => ({ ...m, [r[key]]: (m[r[key]] ?? 0) + 1 }), {}))
    .map(([k, n]) => `${k}: ${n}`)
    .join(', ') || '—'

function Probe({ title, result, children }) {
  const ok = result?.status === 200
  return (
    <tr>
      <th>{title}</th>
      <td className={result ? (ok ? 'pass' : 'fail') : 'muted'}>{result ? result.status : '—'}</td>
      <td>{children}</td>
    </tr>
  )
}

export default function JunctionLabs() {
  const [data, setData] = useState(null)
  const [orders, setOrders] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    post({ op: 'labs' }).then(setData).catch((e) => setData({ error: String(e) }))
  }, [])

  // A re-run skips tests that already got an order, so a failure part-way
  // through does not place a second order for the ones that worked.
  async function tryOrders() {
    setBusy(true)
    const done = (orders?.results ?? []).filter((r) => r.status === 200)
    const next = await post({ op: 'tryOrders', skip: done.map((r) => r.id) }).catch((e) => ({ error: String(e) }))
    if (next.results) {
      next.results = [...done, ...next.results]
      next.tried = next.results.length
      next.accepted = next.results.filter((r) => r.status === 200).length
    }
    setOrders(next)
    setBusy(false)
  }

  if (!data) return <><h1>Junction orderable labs</h1><p className="muted">Reading the catalog…</p></>
  if (data.error) {
    return (
      <>
        <h1>Junction orderable labs</h1>
        <pre>{JSON.stringify(data, null, 2)}</pre>
        <p><a className="btn" href="/">← back</a></p>
      </>
    )
  }

  const activeIds = new Set(data.active.rows.map((r) => r.id))
  const accountIds = new Set((data.withAccount?.rows ?? []).map((r) => r.id))
  const sameWithAccount =
    data.withAccount && activeIds.size === accountIds.size && [...activeIds].every((id) => accountIds.has(id))
  const accounts = Array.isArray(data.accounts.data) ? data.accounts.data : []

  return (
    <>
      <h1>Junction orderable labs</h1>
      <p className="muted">
        Sandbox at <code>{data.base}</code>. The list is the team’s catalog filtered to{' '}
        <code>status=active</code>. That is necessary, not sufficient: lab account, patient state,
        answers to additional questions and consents are only checked when an order is placed.
      </p>

      <h2>Active lab tests ({data.active.rows.length})</h2>
      {data.active.status !== 200 ? (
        <pre>{JSON.stringify(data.active, null, 2)}</pre>
      ) : (
        <table>
          <thead>
            <tr><th>Name</th><th>Lab</th><th>Method</th><th>Markers</th><th>Not orderable</th><th>Required Qs</th></tr>
          </thead>
          <tbody>
            {data.active.rows.map((t) => (
              <tr key={t.id}>
                <td>{t.name}<br /><small className="muted"><code>{t.id}</code></small></td>
                <td>{t.lab}</td>
                <td>{t.method}</td>
                <td>{t.markers}</td>
                <td>{t.markersNotOrderable}</td>
                <td>{t.requiredAoe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Probes</h2>
      <table>
        <tbody>
          <Probe title="Lab accounts" result={data.accounts}>
            {accounts.length === 0
              ? 'none listed'
              : accounts.map((a) => (
                  <div key={a.id}><code>{a.lab ?? a.lab_slug ?? a.id}</code> {a.owner} · {a.status} · {a.delegated_flow}</div>
                ))}
          </Probe>
          <Probe title="List, no status filter" result={data.anyStatus}>
            {count(data.anyStatus.rows, 'status')}
          </Probe>
          <Probe title="generation_method=all" result={data.withAuto}>
            {data.withAuto.rows.length} rows, {data.withAuto.rows.filter((r) => r.auto).length} auto-generated
          </Probe>
          <Probe title="lab_account_id = platform account" result={data.withAccount}>
            {data.withAccount
              ? sameWithAccount ? 'same set as the unfiltered active list' : `${accountIds.size} rows vs ${activeIds.size}: differs`
              : 'no platform account in the lab-account list, so not run'}
          </Probe>
          <Probe title="lab_test_limit=500" result={data.limit500}>{data.limit500.detail ?? 'accepted'}</Probe>
          <Probe title="GET /v3/lab_tests (deprecated)" result={data.deprecated}>
            <small>{data.deprecated.detail.slice(0, 120)}</small>
          </Probe>
          <Probe title="GET /v3/lab_tests/labs" result={data.labs}>{data.labs.count ?? '—'} labs</Probe>
        </tbody>
      </table>

      <h2>Does an order accept what the list shows?</h2>
      <p className="muted">
        Places one real sandbox order per active test, with a physician supplied, no{' '}
        <code>lab_account_id</code>. Junction has no delete for orders, so this is a button.
      </p>
      <p>
        <button className="btn" disabled={busy} onClick={tryOrders}>
          {busy ? 'Placing…' : `Try ordering all ${data.active.rows.length}`}
        </button>
      </p>
      {orders?.error && <pre>{JSON.stringify(orders, null, 2)}</pre>}
      {orders?.results && (
        <>
          <p className={orders.accepted === orders.tried ? 'pass' : 'fail'}>
            {orders.accepted} of {orders.tried} accepted.
          </p>
          <table>
            <thead><tr><th>Test</th><th>HTTP</th><th>Order status</th><th>Detail</th></tr></thead>
            <tbody>
              {orders.results.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}<br /><small className="muted">{r.method}</small></td>
                  <td className={r.status === 200 ? 'pass' : 'fail'}>{r.status ?? r.error}</td>
                  <td>{r.orderStatus ?? '—'}</td>
                  <td><small>{r.statusDetail ?? r.detail ?? ''}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p><a className="btn" href="/">← back</a></p>
    </>
  )
}
