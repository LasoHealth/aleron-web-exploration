import { Fragment } from 'react'

// Pure presentation: the table and the verdict only. Callers own the page
// heading and navigation, since they differ per route.
export default function Results({ results, role, subject }) {
  const { rows, search } = results
  const unexpected = rows.filter((row) => !row.ok)

  return (
    <>
      <p className="muted">
        Scope <code>{role.scope}</code>
        {subject ? <> · scoped to patient <code>{subject}</code></> : ' · no patient context'}
      </p>

      {unexpected.length === 0 ? (
        <p className="pass">PASS — every patient responded as expected.</p>
      ) : (
        <p className="fail">
          FAIL — {unexpected.length} patient(s) responded unexpectedly:{' '}
          {unexpected.map((row) => row.name).join(', ')}
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Patient</th>
            <th>UUID</th>
            <th>GET /Patient/{'{id}'}</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr>
                <td className={row.id === subject ? 'subject' : undefined}>{row.name}</td>
                <td><code>{row.id}</code></td>
                <td>{row.status} {row.readable ? 'readable' : 'refused'}</td>
                <td className={row.ok ? 'pass' : 'fail'}>{row.ok ? 'as expected' : 'UNEXPECTED'}</td>
              </tr>
              {row.detail && (
                <tr>
                  <td colSpan={4}>
                    <details open={!row.ok}>
                      <summary>Response body ({row.status})</summary>
                      <pre>{row.detail}</pre>
                    </details>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      <h2>Search: GET /Patient</h2>
      <p>
        Status {search.status} · returned <strong>{search.total ?? 'n/a'}</strong>{' '}
        ({subject ? 'expected at most 1' : `expected ${rows.length}`})
      </p>
      {search.detail && (
        <details open>
          <summary>Response body ({search.status})</summary>
          <pre>{search.detail}</pre>
        </details>
      )}
    </>
  )
}
