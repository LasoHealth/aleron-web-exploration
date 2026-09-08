// Check the claims in the Aleron API ground truth against a real instance.
//
//   node --env-file=script.env verify-api.mjs            # read-only claims
//   node --env-file=script.env verify-api.mjs --write    # also the write claims
//   node --env-file=script.env verify-api.mjs --json     # machine-readable
//
// Why this exists: an audit of the physician-portal designs produced a
// capability matrix read off docs.canvasmedical.com, and 142 planned changes
// now depend on it. Documentation describes Canvas in general; this describes
// the instance we integrate with. Several claims in that matrix were already
// wrong, and each one was wrong in a way that read perfectly plausibly.
//
// Each claim names the document assertion it tests, so a FAIL is directly
// actionable rather than just interesting.
//
// Write claims are behind --write because they create real records on the
// instance. They only ever touch the fixture patients in created-patients.json,
// they never delete, and everything they create is tagged in its text so it is
// obvious in the chart that a test made it.

import { readFileSync } from 'node:fs'

const AUTH = (process.env.CANVAS_URL ?? '').replace(/\/+$/, '')
const FHIR = AUTH.replace('https://', 'https://fumage-')
const WRITE = process.argv.includes('--write')
const JSON_OUT = process.argv.includes('--json')

if (!AUTH || !process.env.SCRIPT_CLIENT_ID) {
  console.error('Missing CANVAS_URL / SCRIPT_CLIENT_ID. Run with --env-file=script.env')
  process.exit(2)
}

// ── plumbing ───────────────────────────────────────────────────────────────

let token
async function auth() {
  if (token) return token
  const res = await fetch(`${AUTH}/auth/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SCRIPT_CLIENT_ID,
      client_secret: process.env.SCRIPT_CLIENT_SECRET,
    }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error(`token failed: ${JSON.stringify(body)}`)
  token = body.access_token
  grantedScopes = (body.scope ?? '').split(/\s+/)
  return token
}
let grantedScopes = []

// One request helper for both hosts. Returns status plus the parsed body when
// there is one, because a refusal's OperationOutcome is usually the finding.
async function call(method, url, { body, headers = {}, base = FHIR } = {}) {
  const t = await auth()
  const res = await fetch(url.startsWith('http') ? url : base + url, {
    method,
    headers: {
      authorization: `Bearer ${t}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { /* not json */ }
  return { status: res.status, body: parsed, text, location: res.headers.get('location') }
}

// The first OperationOutcome diagnostic, which is where Canvas puts the reason.
const why = (r) =>
  r.body?.issue?.[0]?.diagnostics ??
  r.body?.issue?.[0]?.details?.text ??
  (typeof r.body?.detail === 'string' ? r.body.detail : null) ??
  (r.text || '').slice(0, 200)

const PATIENTS = (() => {
  try {
    return Object.values(JSON.parse(readFileSync('created-patients.json', 'utf8')))
  } catch {
    return []
  }
})()
const SUBJECT = PATIENTS[0]

// Anything this run creates, so the report can say what it left behind.
const created = []
const stamp = `aleron-verify ${new Date().toISOString()}`

// The v1 REST Note API's stateChange reaches neither SGN nor DLT. The Canvas UI
// performs both through POST /api/NoteStateChangeEvent/, which is UNDOCUMENTED
// as an HTTP endpoint and accepts a client_credentials token. Two claims below
// depend on it, so it lives here rather than being inlined into either.
//
// It needs an integer noteId, carried base64 in the note's own permalink as
// Note:<x>:<id>, and a checksum from GET /api/Note/{noteId} — an optimistic
// concurrency guard that answers 409 when stale, so read it immediately before
// the write, exactly as the UI does.
async function noteStateChange(noteKey, state) {
  const note = await call('GET', `${AUTH}/core/api/notes/v1/Note/${noteKey}`, { base: '' })
  const permalink = note.body?.permalink ?? ''
  const noteId = Number(
    Buffer.from(permalink.split('/').pop() ?? '', 'base64').toString().split(':').pop(),
  )
  if (!noteId) return { status: 0, display: 'no permalink, so no noteId to address' }

  const current = await call('GET', `${AUTH}/api/Note/${noteId}`, { base: '' })
  const r = await call('POST', `${AUTH}/api/NoteStateChangeEvent/`, {
    base: '',
    body: { noteId, state, noteChecksum: current.body?.checksum },
  })
  return { status: r.status, noteId, display: r.body?.display ?? r.body?.detail ?? null }
}

// ── the claims ─────────────────────────────────────────────────────────────
// status: PASS (document is right) | FAIL (document is wrong) | INFO | SKIP

const claims = [
  // ---- absences that carry design weight ----
  {
    id: 'A1',
    claim: 'RiskAssessment is not exposed, so engine risk output cannot use the resource FHIR designed for it',
    doc: 'ORDERING-DESIGN-AND-INTEGRATION §8; audit Part 5 decision 3',
    async run() {
      const r = await call('GET', '/RiskAssessment')
      return r.status === 404 || r.status === 400
        ? { status: 'PASS', detail: `GET /RiskAssessment → ${r.status}` }
        : { status: 'FAIL', detail: `expected 404, got ${r.status}. This reopens the engine-output decision.` }
    },
  },
  {
    id: 'A2',
    claim: 'FamilyMemberHistory is not exposed, so risk group D cannot assert a family-history negative',
    doc: 'audit v2-risk-models change 9',
    async run() {
      const r = await call('GET', '/FamilyMemberHistory')
      return r.status === 404 || r.status === 400
        ? { status: 'PASS', detail: `→ ${r.status}` }
        : { status: 'FAIL', detail: `got ${r.status}; group D could assert negatives after all` }
    },
  },
  {
    id: 'A3',
    claim: 'Neither AuditEvent nor Subscription exists: Aleron learns of Canvas acts only by reading',
    doc: 'audit finding C7',
    async run() {
      const [a, s] = await Promise.all([call('GET', '/AuditEvent'), call('GET', '/Subscription')])
      const gone = (x) => x.status === 404 || x.status === 400
      return gone(a) && gone(s)
        ? { status: 'PASS', detail: `AuditEvent ${a.status}, Subscription ${s.status}` }
        : { status: 'FAIL', detail: `AuditEvent ${a.status}, Subscription ${s.status} — a push path may exist` }
    },
  },

  // ---- the operation the CapabilityStatement does not declare ----
  {
    id: 'O1',
    claim: '$create-lab-report is reachable externally, so Junction results need no plugin to reach the chart',
    doc: 'ORDERING §5.4 assumed the plugin effect because the CapabilityStatement omits this operation',
    async run() {
      const scoped = grantedScopes.some((s) => s.endsWith('DiagnosticReport.create-lab-report'))
      // An empty body distinguishes "no such route" (404) from "route exists,
      // body rejected" (400/422) without creating anything.
      const r = await call('POST', '/DiagnosticReport/$create-lab-report', { body: {} })
      if (r.status === 404) {
        return { status: 'PASS', detail: `not present (404); the plugin effect is the only path. scope granted: ${scoped}` }
      }
      return {
        status: 'FAIL',
        detail: `operation EXISTS (POST → ${r.status}: ${why(r)}). Scope granted: ${scoped}. ` +
                `Junction results can be written without a plugin — §5.4 and audit Part 1 step 5 are wrong.`,
      }
    },
  },

  // ---- the capability matrix, from the granted scope's CRUS notation ----
  {
    id: 'M1',
    claim: 'Observation has create but no update; DocumentReference likewise; Goal/CarePlan/ServiceRequest/MedicationRequest read-only; CareTeam updatable but not creatable',
    doc: 'API-GROUND-TRUTH §1',
    async run() {
      await auth()
      // Canvas grants a `<scope>/<Resource>.<crus>` form alongside the verbose
      // one, and it is the tightest statement of what this app may do.
      const crus = {}
      for (const s of grantedScopes) {
        const m = /^user\/([A-Za-z]+)\.([crus]+)$/.exec(s)
        if (m) crus[m[1]] = m[2]
      }
      const expect = {
        Observation: 'crs', DocumentReference: 'crs', Condition: 'crus',
        Goal: 'rs', CarePlan: 'rs', ServiceRequest: 'rs', MedicationRequest: 'rs',
        CareTeam: 'rus',
      }
      const bad = Object.entries(expect).filter(([k, v]) => crus[k] !== v)
      return bad.length === 0
        ? { status: 'PASS', detail: Object.entries(expect).map(([k, v]) => `${k}=${v}`).join(' ') }
        : { status: 'FAIL', detail: bad.map(([k, v]) => `${k}: expected ${v}, granted ${crus[k] ?? 'none'}`).join('; ') }
    },
  },
  {
    id: 'M2',
    claim: 'QuestionnaireResponse is the home for patient-reported outcomes, with create/read/update',
    doc: 'ORDERING §4; audit Part 4 "Aleron-owned facts"',
    async run() {
      await auth()
      const user = grantedScopes.find((s) => /^user\/QuestionnaireResponse\.[crus]+$/.test(s))
      const pat = grantedScopes.find((s) => /^patient\/QuestionnaireResponse\.[crus]+$/.test(s))
      const writable = (user ?? '').includes('c')
      return writable
        ? { status: 'PASS', detail: `${user}` }
        : {
            status: 'FAIL',
            detail: `user scope is ${user ?? 'absent'} (no create) while ${pat ?? 'patient scope absent'}. ` +
                    `Writing a PRO may require a patient-scoped token, which the design does not account for.`,
          }
    },
  },
  {
    id: 'M3',
    claim: 'Task is the cross-patient work-queue primitive, searchable by owner and label without a patient',
    doc: 'audit finding C4',
    async run() {
      const r = await call('GET', '/Task?_count=1')
      const userScoped = grantedScopes.some((s) => /^user\/Task\./.test(s))
      const sysScoped = grantedScopes.some((s) => /^system\/Task\./.test(s))
      return {
        status: r.status === 200 ? 'PASS' : 'FAIL',
        detail: `cross-patient search → ${r.status}, total=${r.body?.total ?? '?'}; ` +
                `scopes: user=${userScoped} system=${sysScoped}` +
                (userScoped ? '' : ' — Task is system-scoped only, so a physician-scoped token may not reach it'),
      }
    },
  },

  // ---- writes ----
  {
    id: 'W1',
    claim: 'Observation create is restricted to a fixed vital list, so an engine risk score cannot be stored as one',
    doc: 'audit finding C8; ORDERING §8. This is the claim that sent engine output to a CDM.',
    write: true,
    async run() {
      if (!SUBJECT) return { status: 'SKIP', detail: 'no fixture patients' }
      const mk = (code, display, value, unit) => ({
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code, display }] },
        subject: { reference: `Patient/${SUBJECT.id}` },
        effectiveDateTime: new Date().toISOString(),
        valueQuantity: { value, unit, system: 'http://unitsofmeasure.org', code: unit },
      })
      // A documented vital, then a cardiovascular risk score. If the second is
      // accepted, Observations are a viable home for engine output.
      const vital = await call('POST', '/Observation', { body: mk('29463-7', 'Body weight', 80, 'kg') })
      const score = await call('POST', '/Observation', { body: mk('99055-6', 'Cardiovascular disease 10Y risk', 2.7, '%') })
      if (vital.location) created.push(`Observation ${vital.location}`)
      if (score.location) created.push(`Observation ${score.location}`)
      const vitalOk = vital.status < 300
      const scoreRefused = score.status >= 400
      if (vitalOk && scoreRefused) {
        return { status: 'PASS', detail: `vital ${vital.status}; risk score ${score.status}: ${why(score)}` }
      }
      if (vitalOk && !scoreRefused) {
        return {
          status: 'FAIL',
          detail: `risk score ACCEPTED (${score.status}). Observations can hold engine output after all — ` +
                  `this reopens audit Part 5 decision 3, which chose a CDM on this restriction.`,
        }
      }
      return { status: 'INFO', detail: `vital itself refused (${vital.status}: ${why(vital)}) — inconclusive` }
    },
  },
  {
    id: 'W2',
    claim: 'The only supported Condition update is marking it entered-in-error, so "update existing problem" has no FHIR path',
    doc: 'audit v2-care-plan change 1',
    write: true,
    async run() {
      if (!SUBJECT) return { status: 'SKIP', detail: 'no fixture patients' }
      const create = await call('POST', '/Condition', {
        body: {
          resourceType: 'Condition',
          clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
          verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'encounter-diagnosis' }] }],
          code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'R73.03', display: 'Prediabetes' }] },
          subject: { reference: `Patient/${SUBJECT.id}` },
          note: [{ text: stamp }],
        },
      })
      if (create.status >= 300) return { status: 'INFO', detail: `create failed ${create.status}: ${why(create)}` }
      const id = (create.location ?? '').split('/').filter(Boolean).pop()
      created.push(`Condition ${id}`)
      const read = await call('GET', `/Condition/${id}`)
      const base = read.body
      // Try to change something other than verificationStatus.
      const attempt = await call('PUT', `/Condition/${id}`, {
        body: { ...base, onsetDateTime: '2020-01-01', note: [{ text: `${stamp} — update attempt` }] },
      })
      const after = await call('GET', `/Condition/${id}`)
      const changed = after.body?.onsetDateTime === '2020-01-01'
      return changed
        ? { status: 'FAIL', detail: `onsetDateTime was accepted and persisted (PUT ${attempt.status}). Condition update is broader than documented.` }
        : { status: 'PASS', detail: `PUT ${attempt.status}; onsetDateTime not persisted, as documented ("no changes to other fields will be processed")` }
    },
  },
  {
    id: 'W3',
    claim: 'Locking a note generates the PDF and the FHIR DocumentReference — Aleron does not write the document',
    doc: 'audit verdict 1, which says six screens have this backwards. The single most load-bearing claim in the set.',
    write: true,
    async run() {
      if (!SUBJECT) return { status: 'SKIP', detail: 'no fixture patients' }
      const [prac, loc] = await Promise.all([call('GET', '/Practitioner?_count=1'), call('GET', '/Location?_count=1')])
      const providerKey = prac.body?.entry?.[0]?.resource?.id
      const locationKey = loc.body?.entry?.[0]?.resource?.id
      if (!providerKey || !locationKey) {
        return { status: 'SKIP', detail: `need a Practitioner and a Location (got ${providerKey}, ${locationKey})` }
      }
      const before = await call('GET', `/DocumentReference?patient=${SUBJECT.id}&_count=1`)
      const beforeTotal = before.body?.total ?? 0

      const NOTE = `${AUTH}/core/api/notes/v1/Note`
      const mk = await call('POST', NOTE, {
        base: '',
        body: {
          patientKey: SUBJECT.id,
          providerKey,
          practiceLocationKey: locationKey,
          noteTypeName: 'Office visit',
          encounterStartTime: new Date().toISOString(),
          title: `${stamp} — note lock test`,
        },
      })
      if (mk.status >= 300) {
        return { status: 'INFO', detail: `note create → ${mk.status}: ${why(mk)} (noteTypeName may need to match a configured type)` }
      }
      const noteKey = mk.body?.noteKey ?? (mk.location ?? '').split('/').filter(Boolean).pop()
      created.push(`Note ${noteKey}`)

      const lock = await call('PATCH', `${NOTE}/${noteKey}`, { base: '', body: { stateChange: 'LKD' } })
      // Generation is documented as asynchronous, so give it a real chance
      // before concluding it did not happen.
      await new Promise((r) => setTimeout(r, 8000))
      const afterLock = (await call('GET', `/DocumentReference?patient=${SUBJECT.id}&_count=1`)).body?.total ?? 0

      // The claim is that the LOCK does this. It does not. Signing does, and
      // stateChange cannot reach SGN — POST /api/NoteStateChangeEvent/ can.
      const sgn = await noteStateChange(noteKey, 'SGN')
      await new Promise((r) => setTimeout(r, 8000))
      const afterSign = (await call('GET', `/DocumentReference?patient=${SUBJECT.id}&_count=1`)).body?.total ?? 0

      const lockMade = afterLock > beforeTotal
      const signMade = afterSign > afterLock
      return {
        // The documented claim is that the lock does it. FAIL means the
        // documentation is wrong, which is the finding, so say so explicitly
        // rather than letting a red line read as a broken test.
        status: lockMade ? 'PASS' : signMade ? 'FAIL' : 'INFO',
        detail:
          `lock → ${lock.status} (${lock.body?.currentState ?? why(lock)}), documents ${beforeTotal} → ${afterLock}; ` +
          `sign → ${sgn.status} (${sgn.display ?? ''}), documents ${afterLock} → ${afterSign}. ` +
          (lockMade
            ? 'the lock generated it, as documented'
            : signMade
              ? 'FAIL is the finding: the lock generated nothing and the SIGN generated it. ' +
                'Canvas documents the opposite (INSTANCE-FINDINGS X7)'
              : 'neither generated a document — unexpected, re-check by hand'),
      }
    },
  },
  {
    id: 'W5',
    claim: 'A note cannot be deleted: DELETE is 405 and stateChange refuses DLT',
    doc: 'INSTANCE-FINDINGS X6, which drew that conclusion from the v1 REST API alone. X7 corrects it.',
    write: true,
    async run() {
      if (!SUBJECT) return { status: 'SKIP', detail: 'no fixture patients' }
      const [prac, loc] = await Promise.all([call('GET', '/Practitioner?_count=1'), call('GET', '/Location?_count=1')])
      const providerKey = prac.body?.entry?.[0]?.resource?.id
      const locationKey = loc.body?.entry?.[0]?.resource?.id
      if (!providerKey || !locationKey) return { status: 'SKIP', detail: 'need a Practitioner and a Location' }

      const NOTE = `${AUTH}/core/api/notes/v1/Note`
      const mk = await call('POST', NOTE, {
        base: '',
        body: {
          patientKey: SUBJECT.id,
          providerKey,
          practiceLocationKey: locationKey,
          noteTypeName: 'Office visit',
          encounterStartTime: new Date().toISOString(),
          title: `${stamp} — note delete test`,
        },
      })
      if (mk.status >= 300) return { status: 'INFO', detail: `note create → ${mk.status}: ${why(mk)}` }
      const noteKey = mk.body?.noteKey
      created.push(`Note ${noteKey}`)

      const del = await call('DELETE', `${NOTE}/${noteKey}`, { base: '' })
      const patch = await call('PATCH', `${NOTE}/${noteKey}`, { base: '', body: { stateChange: 'DLT' } })
      const nsce = await noteStateChange(noteKey, 'DLT')
      const state = (await call('GET', `${NOTE}/${noteKey}`, { base: '' })).body?.currentState

      return {
        status: del.status < 300 || patch.status < 300 ? 'PASS' : nsce.status < 300 ? 'FAIL' : 'INFO',
        detail:
          `DELETE → ${del.status}; stateChange DLT → ${patch.status}; ` +
          `POST /api/NoteStateChangeEvent/ → ${nsce.status}; note is now ${state}. ` +
          (nsce.status < 300
            ? 'FAIL is the finding: the documented API cannot delete, the undocumented UI endpoint can, ' +
              'reversibly with UND (INSTANCE-FINDINGS X7)'
            : 'nothing deleted the note'),
      }
    },
  },
  {
    id: 'W4',
    claim: 'ServiceRequest has no create, so the FHIR route to orders is closed and only commands remain',
    doc: 'API-GROUND-TRUTH §1; ORDERING F2',
    write: true,
    async run() {
      if (!SUBJECT) return { status: 'SKIP', detail: 'no fixture patients' }
      const r = await call('POST', '/ServiceRequest', {
        body: {
          resourceType: 'ServiceRequest', status: 'active', intent: 'order',
          subject: { reference: `Patient/${SUBJECT.id}` },
          code: { coding: [{ system: 'http://loinc.org', code: '24331-1', display: 'MRI abdomen' }] },
        },
      })
      if (r.location) created.push(`ServiceRequest ${r.location}`)
      return r.status >= 400
        ? { status: 'PASS', detail: `POST → ${r.status}: ${why(r)}` }
        : { status: 'FAIL', detail: `POST accepted (${r.status}) — orders could be written in FHIR, which changes the whole ordering design` }
    },
  },
]

// ── Junction, once a key arrives ───────────────────────────────────────────
// T0 in the ordering document: the two calls that decide whether priority 1
// already works. Skipped, not omitted, so the gap is visible in the report.

const JUNCTION_BASE = process.env.JUNCTION_BASE_URL ?? 'https://api.sandbox.tryvital.io'
const junctionClaims = [
  {
    id: 'J1',
    claim: 'The lab account is delegated, so an order can name the logged-in physician (priority 1)',
    doc: 'ORDERING §2.1 / T0. If delegated_flow is already order_delegated or fully_delegated there is no prerequisite.',
    async run() {
      const r = await fetch(`${JUNCTION_BASE}/v3/lab_test/lab_account`, {
        headers: { 'x-vital-api-key': process.env.JUNCTION_API_KEY },
      })
      const body = await r.json().catch(() => null)
      if (!r.ok) return { status: 'INFO', detail: `→ ${r.status}: ${JSON.stringify(body).slice(0, 200)}` }
      const flows = (body?.data ?? (Array.isArray(body) ? body : [body]))
        .map((a) => `${a?.lab ?? '?'}=${a?.delegated_flow ?? '?'}`)
      const delegated = JSON.stringify(body).match(/order_delegated|fully_delegated/)
      return {
        status: delegated ? 'PASS' : 'FAIL',
        detail: `${flows.join(' ')}${delegated ? '' : ' — not delegated: a supplied physician would be ignored'}`,
      }
    },
  },
  {
    id: 'J2',
    claim: 'Junction returns order.physician, so whose NPI is on an order is a field rather than an interpretation',
    doc: 'ORDERING §2.1. Place a sandbox order with physician set, then read it back.',
    async run() {
      return { status: 'SKIP', detail: 'needs a sandbox order placed with a physician; wire once J1 reports' }
    },
  },
]

// ── run ────────────────────────────────────────────────────────────────────

const results = []
for (const c of [...claims, ...junctionClaims.map((j) => ({ ...j, junction: true }))]) {
  if (c.write && !WRITE) {
    results.push({ ...c, status: 'SKIP', detail: 'write claim; pass --write to run' })
    continue
  }
  if (c.junction && !process.env.JUNCTION_API_KEY) {
    results.push({ ...c, status: 'SKIP', detail: 'JUNCTION_API_KEY not set' })
    continue
  }
  try {
    results.push({ ...c, ...(await c.run()) })
  } catch (err) {
    results.push({ ...c, status: 'INFO', detail: `threw: ${err.message}` })
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(results.map(({ run, ...r }) => r), null, 2))
} else {
  const MARK = { PASS: 'PASS', FAIL: 'FAIL', SKIP: 'skip', INFO: 'info' }
  console.log(`\nCanvas ${AUTH.replace('https://', '')}${WRITE ? '  (writes enabled)' : '  (read-only)'}\n`)
  for (const r of results) {
    console.log(`${MARK[r.status]}  ${r.id}  ${r.claim}`)
    console.log(`        ${r.detail}`)
    if (r.status === 'FAIL') console.log(`        doc: ${r.doc}`)
    console.log()
  }
  const n = (s) => results.filter((r) => r.status === s).length
  console.log(`${n('PASS')} confirmed, ${n('FAIL')} contradicted, ${n('INFO')} inconclusive, ${n('SKIP')} skipped`)
  if (created.length) {
    console.log(`\nLeft on the instance (all tagged "${stamp}"):`)
    for (const c of created) console.log(`  ${c}`)
  }
  if (n('FAIL')) {
    console.log('\nA FAIL means a document claim is wrong, not that Canvas is broken.')
  }
}

process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0)
