import { useEffect, useState } from 'react'

// Junction, not Canvas. The question: can Aleron let a clinician build their own
// lab test (POST /v3/lab_tests) from a list of markers (GET /v3/lab_tests/markers)?
// Sandbox only. A panel made here cannot be deleted through the API, only
// archived, so the probe names its panels and archives them again.

async function post(body) {
  const r = await fetch('/api/junction', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

export default function JunctionCreateTest() {
  const [labs, setLabs] = useState([])
  const [filter, setFilter] = useState({ lab_slug: 'labcorp', name: '', a_la_carte_enabled: '', page: 1, size: 25 })
  const [found, setFound] = useState(null)
  const [picked, setPicked] = useState({})
  const [form, setForm] = useState({ name: '', description: '', method: 'walk_in_test', fasting: false })
  const [made, setMade] = useState(null)
  const [probe, setProbe] = useState(null)
  const [busy, setBusy] = useState('')

  useEffect(() => { post({ op: 'labList' }).then((d) => setLabs(d.labs ?? [])) }, [])

  async function search(page = 1) {
    setBusy('search')
    const next = { ...filter, page }
    setFilter(next)
    setFound(await post({ op: 'markers', query: next }).catch((e) => ({ error: String(e) })))
    setBusy('')
  }

  async function create() {
    setBusy('create')
    const chosen = Object.values(picked)
    setMade(await post({
      op: 'createTest',
      test: {
        name: `Aleron harness ${form.name || 'panel'}`,
        description: form.description || 'Aleron harness, sandbox only',
        method: form.method,
        fasting: form.fasting,
        marker_ids: chosen.map((m) => m.id),
        lab_slug: labs.find((l) => l.id === chosen[0]?.labId)?.slug,
      },
    }).catch((e) => ({ error: String(e) })))
    setBusy('')
  }

  async function runProbe() {
    setBusy('probe')
    setProbe(null)
    setProbe(await post({ op: 'probeCreate' }).catch((e) => ({ error: String(e) })))
    setBusy('')
  }

  const chosen = Object.values(picked)
  const lab = labs.find((l) => l.slug === filter.lab_slug)

  return (
    <>
      <h1>Junction: create our own lab tests</h1>
      <p className="muted">
        Sandbox only. Pick markers, then create a panel. Panels cannot be deleted through the API,
        so use the probe below sparingly: it creates several and archives them again.
      </p>

      <h2>1. Markers</h2>
      <p>
        <label>Lab{' '}
          <select value={filter.lab_slug} onChange={(e) => setFilter({ ...filter, lab_slug: e.target.value })}>
            <option value="">(no filter)</option>
            {labs.map((l) => <option key={l.id} value={l.slug}>{l.name}</option>)}
          </select>
        </label>{' '}
        <label>Name or code{' '}
          <input value={filter.name} onChange={(e) => setFilter({ ...filter, name: e.target.value })} />
        </label>{' '}
        <label>À la carte{' '}
          <select value={filter.a_la_carte_enabled} onChange={(e) => setFilter({ ...filter, a_la_carte_enabled: e.target.value })}>
            <option value="">any</option>
            <option value="true">enabled</option>
            <option value="false">not enabled</option>
          </select>
        </label>{' '}
        <button className="btn" disabled={busy} onClick={() => search(1)}>{busy === 'search' ? 'Searching…' : 'Search'}</button>
      </p>
      {found?.error && <pre>{JSON.stringify(found, null, 2)}</pre>}
      {found && !found.error && (
        <>
          <p className={found.status === 200 ? 'pass' : 'fail'}>
            HTTP {found.status}. {found.total ?? '?'} markers, page {found.page} of {found.pages}.
            {found.detail && <> {found.detail}</>}
          </p>
          <table>
            <thead>
              <tr><th /><th>Marker</th><th>Type</th><th>Code</th><th>À la carte</th><th>Questions</th><th>Contains</th></tr>
            </thead>
            <tbody>
              {found.markers.map((m) => (
                <tr key={m.id}>
                  <td>
                    <input type="checkbox" checked={Boolean(picked[m.id])}
                      onChange={(e) => {
                        const next = { ...picked }
                        if (e.target.checked) next[m.id] = m; else delete next[m.id]
                        setPicked(next)
                      }} />
                  </td>
                  <td>{m.name}<br /><small className="muted">id {m.id}{m.unit ? ` · ${m.unit}` : ''}</small></td>
                  <td>{m.type}</td>
                  <td><code>{m.providerId}</code></td>
                  <td>{String(m.aLaCarte)}</td>
                  <td>{m.requiredQuestions ? `${m.requiredQuestions} required` : '—'}</td>
                  <td>{m.components || m.expectedResults ? `${m.components} parts, ${m.expectedResults} results` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <button className="btn" disabled={busy || filter.page <= 1} onClick={() => search(filter.page - 1)}>← prev</button>
            <button className="btn" disabled={busy || filter.page >= (found.pages ?? 1)} onClick={() => search(filter.page + 1)}>next →</button>
          </p>
          <details><summary>First marker as returned</summary><pre>{JSON.stringify(found.sample, null, 2)}</pre></details>
        </>
      )}

      <h2>2. Create a panel from {chosen.length} marker(s)</h2>
      {lab && <p className="muted">{lab.name} supports: {lab.methods.join(', ')}</p>}
      <p>
        <label>Name{' '}<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>{' '}
        <label>Method{' '}
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {['walk_in_test', 'at_home_phlebotomy', 'testkit', 'on_site_collection'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>{' '}
        <label><input type="checkbox" checked={form.fasting} onChange={(e) => setForm({ ...form, fasting: e.target.checked })} /> fasting</label>{' '}
        <button className="btn" disabled={busy || !chosen.length} onClick={create}>{busy === 'create' ? 'Creating…' : 'Create panel'}</button>
      </p>
      {made && (
        <>
          <p className={made.status === 200 ? 'pass' : 'fail'}>HTTP {made.status}</p>
          <pre>{JSON.stringify(made.test ?? made.detail ?? made, null, 2)}</pre>
        </>
      )}

      <h2>3. Probe the open questions</h2>
      <p className="muted">
        Marker list without a lab filter and past the size limit, both id lists, mixed labs,
        duplicates, each method, update, version history, archive and delete. Creates a handful of
        panels and archives them afterwards. Takes under a minute.
      </p>
      <p><button className="btn" disabled={busy} onClick={runProbe}>{busy === 'probe' ? 'Running…' : 'Run probe'}</button></p>
      {probe?.error && <pre>{JSON.stringify(probe, null, 2)}</pre>}
      {probe?.rows && (
        <table>
          <thead><tr><th>Request</th><th>HTTP</th><th>Result</th></tr></thead>
          <tbody>
            {probe.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td className={r.http === 200 ? 'pass' : 'fail'}>{r.http}</td>
                <td><small>{r.note}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p><a className="btn" href="/">← back</a></p>
    </>
  )
}
