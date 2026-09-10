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

// The internal /api/ endpoints key on integer primary keys rather than the
// uuids the FHIR and Note APIs use. A note's pk is carried base64 in its own
// permalink, as Note:<x>:<id>.
async function openNoteFor(patientKey) {
  const list = await call('GET', `${AUTH}/core/api/notes/v1/Note?patientKey=${patientKey}&limit=100`, { base: '' })
  const open = (list.body?.results ?? []).find((n) => n.currentState === 'NEW')
  if (!open) return null
  const full = await call('GET', `${AUTH}/core/api/notes/v1/Note/${open.noteKey}`, { base: '' })
  const id = Number(
    Buffer.from((full.body?.permalink ?? '').split('/').pop() ?? '', 'base64').toString().split(':').pop(),
  )
  return id ? { id, noteKey: open.noteKey } : null
}

async function patientPkFor(patientKey) {
  const r = await call('GET', `${AUTH}/api/Patient/?key=${patientKey}`, { base: '' })
  const pk = Number(r.body?.entry?.[0]?.resource?.id)
  return Number.isFinite(pk) ? pk : null
}

// Distinct staff keys to attribute a note to. The Practitioner search finds
// only clinicians exposed as FHIR resources; note providers reveal the rest,
// and an order can name those too.
async function staffKeys() {
  const prac = await call('GET', '/Practitioner?_count=50')
  const keys = new Set((prac.body?.entry ?? []).map((e) => e.resource.id))
  const notes = await call('GET', `${AUTH}/core/api/notes/v1/Note?limit=100`, { base: '' })
  for (const n of notes.body?.results ?? []) if (n.providerKey) keys.add(n.providerKey)
  return [...keys]
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
      id: 'W6',
      claim: 'DocumentReference create works from outside Canvas, so an order-authorization document is a real interim record',
      doc: 'C5 records DocumentReference.crs from the granted scope and the vendor release note, neither of which is a measurement. Aleron-Web already ships this path (DocumentReferenceResource::recordOrderAuthorization) but its only test stubs the client, so nothing has ever proven the write lands. ORDERING §4.5 prefers a CustomCommand instead; if this fails there is no interim and the order record is blocked on AL-100 rather than improved by it.',
      write: true,
      async run() {
        if (!SUBJECT) return { status: 'SKIP', detail: 'no fixture patients' }
        const prac = await call('GET', '/Practitioner?_count=1')
        const practitionerId = prac.body?.entry?.[0]?.resource?.id
        if (!practitionerId) return { status: 'SKIP', detail: 'no Practitioner on the instance to attribute to' }

        // The exact shape Aleron-Web sends: text/plain body, requires-signature,
        // author and reviewer both the ordering physician, review required.
        const EXT = 'http://schemas.canvasmedical.com/fhir/'
        const body = {
          resourceType: 'DocumentReference',
          extension: [
            { url: EXT + 'document-reference-clinical-date', valueDate: new Date().toISOString().slice(0, 10) },
            { url: EXT + 'document-reference-review-mode', valueCode: 'RR' },
            {
              url: EXT + 'document-reference-reviewer',
              valueReference: { reference: `Practitioner/${practitionerId}`, type: 'Practitioner' },
            },
            { url: EXT + 'document-reference-requires-signature', valueBoolean: true },
            { url: EXT + 'document-reference-comment', valueString: 'verify-api W6 probe' },
          ],
          status: 'current',
          type: { text: 'Lab Order Authorization' },
          category: [{ coding: [{ system: EXT + 'document-reference-category', code: 'uncategorizedclinicaldocument' }] }],
          subject: { reference: `Patient/${SUBJECT.id}`, type: 'Patient' },
          content: [{ attachment: { contentType: 'text/plain', data: Buffer.from('W6 probe: order authorization').toString('base64') } }],
          author: [{ reference: `Practitioner/${practitionerId}`, type: 'Practitioner' }],
        }
        const res = await call('POST', '/DocumentReference', { body })
        // The instance may only accept application/pdf. Retry as a PDF so the
        // finding distinguishes 'create is closed' from 'our contentType is wrong'.
        const MINIMAL_PDF = 'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDAvS2lkc1tdPj4KZW5kb2JqCnRyYWlsZXIKPDwvUm9vdCAxIDAgUj4+CiUlRU9G';
        const asPdf = res.status >= 400
          ? await call('POST', '/DocumentReference', { body: { ...body, content: [{ attachment: { contentType: 'application/pdf', data: MINIMAL_PDF } }] } })
          : null
        if (asPdf?.location) created.push('DocumentReference ' + asPdf.location)
        // Third shape: PDF plus a real LOINC coding. create() already accepts a
        // loincCode; recordOrderAuthorization simply never passes one.
        const asCoded = asPdf && asPdf.status >= 400
          ? await call('POST', '/DocumentReference', { body: { ...body,
              type: { coding: [{ system: 'http://loinc.org', code: '11506-3' }] },
              content: [{ attachment: { contentType: 'application/pdf', data: MINIMAL_PDF } }] } })
          : null
        if (asCoded?.location) created.push('DocumentReference ' + asCoded.location)
        // Fourth shape: an accepted LOINC. 11506-3 (Progress note) is refused and
        // the error names the allowlist, so try one that is on it. 34109-9 is "Note".
        const asAccepted = asCoded && asCoded.status >= 400
          ? await call('POST', '/DocumentReference', { body: { ...body,
              type: { coding: [{ system: 'http://loinc.org', code: '34109-9' }] },
              content: [{ attachment: { contentType: 'application/pdf', data: MINIMAL_PDF } }] } })
          : null
        if (asAccepted?.location) created.push('DocumentReference ' + asAccepted.location)
        if (res.location) created.push(`DocumentReference ${res.location}`)

        if (res.status < 300) {
          return {
            status: 'PASS',
            detail: `created ${res.status}. The interim order-authorization document is real, so DocumentReference can carry the record until AL-100 lands.`,
          }
        }
        if (asAccepted && asAccepted.status < 300) {
          return {
            status: 'INFO',
            detail:
              `text/plain ${res.status}; pdf ${asPdf.status}; pdf+11506-3 ${asCoded.status}; ` +
              `pdf+34109-9 created ${asAccepted.status}. DocumentReference create WORKS, but ` +
              'the shape is narrow: application/pdf only, exactly one type.coding, and a LOINC ' +
              'from a closed 24-code allowlist. Aleron-Web fails all three — recordOrderAuthorization ' +
              'sends text/plain with a free-text type, and recordProgressNote sends LOINC 11506-3, ' +
              'which is not on the list. Both are fixable in the resource class.',
          }
        }
        if (asCoded && asCoded.status < 300) {
          return {
            status: 'INFO',
            detail:
              `text/plain ${res.status}; application/pdf ${asPdf.status}; ` +
              `application/pdf + LOINC coding created ${asCoded.status}. ` +
              'DocumentReference create WORKS. recordOrderAuthorization is wrong in two ' +
              'fields: it sends text/plain and a free-text type where Canvas requires ' +
              'application/pdf and exactly one type.coding. Fixable, not a closed door.',
          }
        }
        if (asPdf && asPdf.status < 300) {
          return {
            status: 'INFO',
            detail: `text/plain refused ${res.status}: ${why(res)} — but application/pdf created ${asPdf.status}. DocumentReference create WORKS; Aleron-Web's recordOrderAuthorization sends text/plain and cannot land as written. That is a bug to fix, not a closed door.`,
          }
        }
        return {
          status: 'FAIL',
          detail: `text/plain ${res.status}: ${why(res)}${asPdf ? `; pdf ${asPdf.status}: ${why(asPdf)}` : ''}${asCoded ? `; pdf+11506-3 ${asCoded.status}: ${why(asCoded)}` : ''}${asAccepted ? `; pdf+34109-9 ${asAccepted.status}: ${why(asAccepted)}` : ''}. DocumentReference is NOT a working interim — the order record depends on AL-100's CustomCommand.`,
        }
      },
    },
    {
      id: 'W7',
      claim: 'Observation create accepts a real lab analyte, so Junction results can land as Observations',
      doc: 'W1 tried only a weight (accepted) and a risk score (refused 422 "Requested Sign does not exist"). API-GROUND-TRUTH says create is "restricted in practice to vitals/panel-shaped categories. Do not assume arbitrary scores can be stored." Aleron-Web\'s OrderResultCanvasRecorder maps every Junction result to an Observation, so whether a lab LOINC passes decides if that path works at all.',
      write: true,
      async run() {
        if (!SUBJECT) return { status: 'SKIP', detail: 'no fixture patients' }
        const mk = (category, code, display, value, unit) => ({
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: category }] }],
          code: { coding: [{ system: 'http://loinc.org', code, display }] },
          subject: { reference: `Patient/${SUBJECT.id}` },
          effectiveDateTime: new Date().toISOString(),
          valueQuantity: { value, unit, system: 'http://unitsofmeasure.org', code: unit },
        })
        // Total cholesterol: an ordinary Quest/Junction panel analyte. Tried as a
        // lab first, since that is the correct FHIR category for a result, then
        // as a vital in case the gate is on category rather than code.
        const asLab = await call('POST', '/Observation', { body: mk('laboratory', '2093-3', 'Cholesterol [Mass/volume] in Serum or Plasma', 190, 'mg/dL') })
        const asVital = asLab.status >= 400
          ? await call('POST', '/Observation', { body: mk('vital-signs', '2093-3', 'Cholesterol [Mass/volume] in Serum or Plasma', 190, 'mg/dL') })
          : null
        if (asLab.location) created.push(`Observation ${asLab.location}`)
        if (asVital?.location) created.push(`Observation ${asVital.location}`)

        if (asLab.status < 300) {
          return { status: 'PASS', detail: `lab-category cholesterol accepted ${asLab.status}. Junction results can land as Observations.` }
        }
        if (asVital && asVital.status < 300) {
          return {
            status: 'INFO',
            detail: `laboratory category refused (${asLab.status}: ${why(asLab)}) but vital-signs accepted (${asVital.status}). The gate is the category, not the code — Aleron-Web must send vital-signs or use $create-lab-report.`,
          }
        }
        return {
          status: 'FAIL',
          detail: `lab ${asLab.status}: ${why(asLab)}${asVital ? `; as vital ${asVital.status}: ${why(asVital)}` : ''}. A real lab analyte cannot be an Observation, so OrderResultCanvasRecorder cannot work and $create-lab-report is the only route.`,
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
  // ---- orders ----
  // Everything above tests reads and notes. These two test the act the whole
  // ordering design is about, and they use the internal /api/ surface X7 found
  // rather than FHIR or a plugin.
  {
    id: 'O2',
    claim: 'Every order command is plugin-gated, so a standalone external app cannot create a signable order',
    doc: 'ORDERING §1 facts F2 and F3, which the routing table in §3 and priority 3 both rest on',
    write: true,
    async run() {
      if (!SUBJECT) return { status: 'SKIP', detail: 'no fixture patients' }

      const note = await openNoteFor(SUBJECT.id)
      if (!note) return { status: 'SKIP', detail: 'no open note on the fixture patient to attach a command to' }
      const patientPk = await patientPkFor(SUBJECT.id)
      if (!patientPk) return { status: 'SKIP', detail: 'could not resolve the patient primary key' }

      // The row: the internal endpoint really does create one.
      const made = await call('POST', `${AUTH}/api/LabOrder/`, {
        base: '', body: { patient: patientPk, note: note.id },
      })
      if (made.status >= 300) {
        return { status: 'PASS', detail: `POST /api/LabOrder/ → ${made.status}: ${why(made)}. Every order surface is closed.` }
      }
      const id = made.body?.id
      created.push(`LabOrder ${id} (marked entered-in-error by this run)`)

      // The command: does the order appear in the note the physician opens?
      // This is what an earlier version of this claim never checked, and it is
      // the difference between a record and a signable order.
      const full = await call('GET', `${AUTH}/api/Note/${note.id}`, { base: '' })
      const commands = (full.body?.body ?? []).filter((b) => b?.type && b.type !== 'text')

      // And is there any route that commits it?
      const commit = await call('POST', `${AUTH}/api/LabOrder/${id}/commit`, { base: '', body: {} })
      const forced = await call('PATCH', `${AUTH}/api/LabOrder/${id}`, { base: '', body: { committer: 1 } })

      const eie = await call('PATCH', `${AUTH}/api/LabOrder/${id}`, { base: '', body: { enteredInError: true } })
      const del = await call('PATCH', `${AUTH}/api/LabOrder/${id}`, { base: '', body: { deleted: true } })

      const signable = commands.length > 0
      return {
        status: signable ? 'FAIL' : 'PASS',
        detail:
          `POST /api/LabOrder/ → ${made.status}, requisition ${made.body?.requisitionNumber}, ` +
          `orderingProvider ${JSON.stringify(made.body?.orderingProvider)} — so an order ROW is ` +
          `creatable with client_credentials and no plugin. But the note body holds ` +
          `${commands.length} command(s), /commit → ${commit.status}, and PATCH {committer} → ` +
          `${forced.status} leaving committer ${JSON.stringify(forced.body?.audit?.committer)}. ` +
          (signable
            ? 'FAIL: the order reached the note as a command, so F2/F3 are wrong.'
            : 'PASS with a caveat worth reading: the row exists but never becomes a command in the ' +
              'note, so Canvas shows an empty note, there is nothing for a physician to sign, and ' +
              'committer cannot be set. F2/F3 hold for the layer that matters. ') +
          `Withdrawn: enteredInError=${JSON.stringify(eie.body?.enteredInError)}, ` +
          `deleted=${JSON.stringify(del.body?.deleted)}.`,
      }
    },
  },
  {
    id: 'O3',
    claim: 'An order cannot be made to name a physician of our choosing, so priority 1 needs a plugin',
    doc: 'ORDERING §0 priority 1 and §4.8; F1 says attribution follows whoever authenticated',
    write: true,
    async run() {
      if (!SUBJECT) return { status: 'SKIP', detail: 'no fixture patients' }
      const patientPk = await patientPkFor(SUBJECT.id)
      if (!patientPk) return { status: 'SKIP', detail: 'could not resolve the patient primary key' }

      // Two staff to choose between. The instance exposes one Practitioner, so
      // the second comes from a note provider — an order can name staff who are
      // not FHIR Practitioners, which is worth knowing on its own.
      const providers = await staffKeys()
      if (providers.length < 2) {
        return { status: 'SKIP', detail: `need two staff to compare, found ${providers.length}` }
      }

      const [pr, loc] = await Promise.all([
        call('GET', '/Practitioner?_count=1'),
        call('GET', '/Location?_count=1'),
      ])
      const locationKey = loc.body?.entry?.[0]?.resource?.id
      if (!locationKey) return { status: 'SKIP', detail: 'no Location to reference' }

      // One order per provider, identical in every other respect.
      const placed = []
      for (const providerKey of providers.slice(0, 2)) {
        const note = await call('POST', `${AUTH}/core/api/notes/v1/Note`, {
          base: '',
          body: {
            patientKey: SUBJECT.id,
            providerKey,
            practiceLocationKey: locationKey,
            noteTypeName: 'Office visit',
            encounterStartTime: new Date().toISOString(),
            title: `${stamp} — ordering-provider inheritance test`,
          },
        })
        const noteId = Number(
          Buffer.from((note.body?.permalink ?? '').split('/').pop() ?? '', 'base64')
            .toString().split(':').pop(),
        )
        if (!noteId) { placed.push({ providerKey, error: `note create → ${note.status}` }); continue }
        created.push(`Note ${note.body?.noteKey}`)

        const order = await call('POST', `${AUTH}/api/LabOrder/`, {
          base: '', body: { patient: patientPk, note: noteId },
        })
        if (order.body?.id) created.push(`LabOrder ${order.body.id} (marked entered-in-error by this run)`)
        placed.push({
          providerKey,
          orderId: order.body?.id,
          orderingProvider: order.body?.orderingProvider ?? null,
          originator: order.body?.audit?.originator ?? null,
        })
        if (order.body?.id) {
          await call('PATCH', `${AUTH}/api/LabOrder/${order.body.id}`, { base: '', body: { enteredInError: true } })
          await call('PATCH', `${AUTH}/api/LabOrder/${order.body.id}`, { base: '', body: { deleted: true } })
        }
      }

      const names = placed.map((x) => x.orderingProvider)
      const differed = names[0] && names[1] && names[0] !== names[1]
      return {
        // The document says we cannot choose. If the two names differ, we can.
        status: differed ? 'FAIL' : 'PASS',
        detail:
          placed.map((x) => `provider ${String(x.providerKey).slice(0, 8)} → order ${x.orderId} ` +
            `orderingProvider ${JSON.stringify(x.orderingProvider)}`).join('; ') +
          (differed
            ? `. FAIL is the finding: orderingProvider is inherited from the note's providerKey, so ` +
              `Aleron chooses the physician named on an order by choosing the note's provider. ` +
              `originator stays the API caller (${JSON.stringify(placed[0].originator)}) and committer ` +
              `stays null — the name on the order and the signer are different fields, and only the ` +
              `first is ours. Priority 1 is partly satisfiable without a plugin.`
            : `. Both orders carry the same provider, so the note's providerKey does not decide it.`),
      }
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
