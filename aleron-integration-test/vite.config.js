import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Everything resolves from this file's folder so the server behaves the same
// however it was launched.
const HERE = import.meta.dirname

// script.env supplies CANVAS_URL; web.env supplies the authorization_code app's
// credentials. Later file wins on any overlap.
for (const f of ['script.env', 'web.env']) {
  try {
    process.loadEnvFile(join(HERE, f))
  } catch {
    console.warn(`[canvas] could not read ${f}`)
  }
}

const HOST = 'maple-desktop.tailfc79a9.ts.net'
const PORT = 5173
const REDIRECT_URI = `https://${HOST}:${PORT}/callback`

const { WEB_CLIENT_ID, WEB_CLIENT_SECRET, SCRIPT_CLIENT_ID, SCRIPT_CLIENT_SECRET, CANVAS_URL } =
  process.env

// Patient-scoped tokens come from client_credentials, which is a different grant
// type and therefore a different Canvas app — the script one. `patient/*.read` is
// rejected as an unauthorized scope, so ask for exactly what the probe reads.
const PATIENT_SCOPE = 'patient/Patient.read'
// Write is the point of the probe: a read-only token cannot create the note
// whose authorship is the question.
const PROBE_SCOPE = 'user/*.read user/Note.write'
// The first fixture patient. Hard-coded so the no-JS route needs no state.
const PROBE_PATIENT = '61bd3c40e6ea4b0a81e59a46100d9041'
const AUTH = (CANVAS_URL ?? '').replace(/\/+$/, '')
const FHIR = AUTH.replace('https://', 'https://fumage-')

// Junction is a second vendor on the same harness. The key is sandbox-only —
// api.tryvital.io refuses it 401 — and it never leaves this process: see the
// note on /api/junction below for why it must not become a VITE_ variable.
const JUNCTION_KEY = process.env.JUNCTION_KEY ?? process.env.JUNCTION_API_KEY
const JUNCTION_BASE = process.env.JUNCTION_BASE_URL ?? 'https://api.sandbox.tryvital.io'

if (!WEB_CLIENT_ID || !WEB_CLIENT_SECRET) {
  console.warn('[canvas] web.env is missing WEB_CLIENT_ID / WEB_CLIENT_SECRET — login will fail')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

const NOTE_API = `${AUTH}/core/api/notes/v1/Note`
const bearer = (t) => ({ authorization: `Bearer ${t}`, accept: 'application/json' })

// The Note API is documented with grant_type=client_credentials and names the
// clinician in providerKey rather than by who holds the token, so every note
// route uses this rather than a physician's authorization_code token — which
// the Note API answers with 403.
async function serviceToken() {
  const r = await fetch(`${AUTH}/auth/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: SCRIPT_CLIENT_ID,
      client_secret: SCRIPT_CLIENT_SECRET,
    }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`no service token: ${JSON.stringify(j)}`)
  return j.access_token
}

const VOID_TITLE = 'VOID - Aleron test artefact, not a clinical record'

// Every title this harness has ever written, so a bulk act can tell its own
// leavings from the fixture's baseline. Add to it rather than widening it: a
// loose pattern here is how a cleanup button reaches something it should not.
const OURS = /^(VOID - Aleron|Aleron |attribution probe|aleron-verify|CORRECTION - written by the app)/i

// The v1 REST Note API reaches neither DLT nor SGN: DELETE answers 405 and
// stateChange refuses both transitions. The Canvas UI does it through
// POST /api/NoteStateChangeEvent/, which is UNDOCUMENTED as an HTTP endpoint
// but accepts our client_credentials token, and whose note type publishes a
// stateTransitionMatrix that permits NEW -> DLT and LKD -> SGN.
//
// Depending on this in production is a risk the design has to accept
// deliberately: it is Canvas's own front end talking to itself, and nothing
// obliges Canvas to keep it stable. It earns its place here because this
// harness exists to find out what the instance actually does.
//
// Two ids are needed and neither is the noteKey:
//   noteId   an integer, carried base64 in the note's permalink as Note:<x>:<id>
//   checksum an optimistic-concurrency guard, from GET /api/Note/{noteId};
//            a stale one is refused with 409 "This note is out of date"
async function noteStateChange(svc, noteKey, state) {
  // A missing or unknown key gets an HTML error page, not JSON, so parse
  // defensively rather than throwing something unreadable from deep in undici.
  const note = await fetch(`${NOTE_API}/${noteKey}`, { headers: bearer(svc) })
    .then((r) => r.json())
    .catch(() => null)
  if (!note?.permalink) return { noteKey, ok: false, status: 404, display: 'no such note' }
  const noteId = Number(
    Buffer.from((note.permalink ?? '').split('/').pop() ?? '', 'base64').toString().split(':').pop(),
  )
  if (!noteId) return { noteKey, ok: false, detail: 'no permalink, so no noteId to address' }

  // Read the checksum immediately before the write, as the UI does.
  const current = await fetch(`${AUTH}/api/Note/${noteId}`, { headers: bearer(svc) }).then((r) => r.json())
  const r = await fetch(`${AUTH}/api/NoteStateChangeEvent/`, {
    method: 'POST',
    headers: { ...bearer(svc), 'content-type': 'application/json' },
    body: JSON.stringify({ noteId, state, noteChecksum: current.checksum }),
  })
  const body = await r.json().catch(() => null)
  return {
    noteKey,
    noteId,
    ok: r.ok,
    status: r.status,
    // Canvas returns a sentence naming who did it, which is the most useful
    // single field it gives back.
    display: body?.display ?? body?.detail ?? null,
  }
}

async function attemptDelete(svc, noteKey) {
  const r = await noteStateChange(svc, noteKey, 'DLT')
  return { ...r, deleted: r.ok, restorableWith: r.ok ? 'UND' : undefined }
}

// The internal /api/ endpoints key on integer primary keys, not the uuids the
// FHIR and Note APIs use. A note carries its own pk base64 in its permalink.
const pkFromPermalink = (permalink) =>
  Number(Buffer.from((permalink ?? '').split('/').pop() ?? '', 'base64').toString().split(':').pop())

async function patientPk(svc, patientId) {
  const r = await fetch(`${AUTH}/api/Patient/?key=${patientId}`, { headers: bearer(svc) })
  const j = await r.json().catch(() => null)
  const pk = Number(j?.entry?.[0]?.resource?.id)
  return Number.isFinite(pk) ? pk : null
}

// Orders are documented as plugin-gated. They are not, on this instance: the
// UI's own /api/LabOrder/ takes a client_credentials token and returns 201.
// Undocumented, so this is a deliberate dependency rather than a supported one.
async function createLabOrder(svc, { patientId, providerKey, title }) {
  const [pr, loc] = await Promise.all([
    fetch(`${FHIR}/Practitioner?_count=1`, { headers: bearer(svc) }).then((r) => r.json()),
    fetch(`${FHIR}/Location?_count=1`, { headers: bearer(svc) }).then((r) => r.json()),
  ])
  // The order inherits orderingProvider from the note's provider, so the note
  // is where the physician's identity is decided. That is the one identity on
  // an order that Aleron controls.
  const note = await fetch(NOTE_API, {
    method: 'POST',
    headers: { ...bearer(svc), 'content-type': 'application/json' },
    body: JSON.stringify({
      patientKey: patientId,
      providerKey: providerKey || pr.entry?.[0]?.resource?.id,
      practiceLocationKey: loc.entry?.[0]?.resource?.id,
      noteTypeName: 'Office visit',
      encounterStartTime: new Date().toISOString(),
      title: title || `Aleron order test ${new Date().toISOString()} - sign or delete`,
    }),
  }).then((r) => r.json())
  if (!note?.permalink) return { error: `note create failed: ${JSON.stringify(note).slice(0, 200)}` }

  const pk = await patientPk(svc, patientId)
  if (!pk) return { error: 'could not resolve the patient primary key' }

  const r = await fetch(`${AUTH}/api/LabOrder/`, {
    method: 'POST',
    headers: { ...bearer(svc), 'content-type': 'application/json' },
    body: JSON.stringify({ patient: pk, note: pkFromPermalink(note.permalink) }),
  })
  const order = await r.json().catch(() => null)
  return {
    status: r.status,
    order,
    note: {
      noteKey: note.noteKey,
      id: pkFromPermalink(note.permalink),
      title: note.titleDisplay ?? note.title,
      permalink: AUTH + note.permalink,
      provider: note.providerKey,
    },
  }
}

// No hard delete: DELETE answers 405, and a chart wants a withdrawal recorded
// rather than a row removed. enteredInError first, then deleted, and the values
// come back on the PATCH response rather than a later read.
async function withdrawLabOrder(svc, id) {
  const patch = async (body) => {
    const r = await fetch(`${AUTH}/api/LabOrder/${id}`, {
      method: 'PATCH',
      headers: { ...bearer(svc), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const eie = await patch({ enteredInError: true })
  const del = await patch({ deleted: true })
  return {
    id,
    ok: eie.status < 300 && del.status < 300,
    enteredInError: eie.body?.enteredInError ?? null,
    deleted: del.body?.deleted ?? null,
  }
}

// Bulk acts are confined to the patients in created-patients.json. A mistyped
// or stale id should fail closed rather than retitle notes on a chart that is
// not ours to touch — the roster is the only list of subjects this harness
// created and is therefore the only list it may act on wholesale.
async function notesOnFixture(svc, patientId) {
  let roster = {}
  try {
    roster = JSON.parse(readFileSync(join(HERE, 'created-patients.json'), 'utf8'))
  } catch {
    throw new Error('created-patients.json is unreadable, so no patient can be confirmed as a fixture')
  }
  const ids = Object.values(roster).map((p) => p?.id)
  if (!ids.includes(patientId)) {
    // A refusal, not a crash: this is the guard doing its job, and it should
    // read that way to the caller.
    throw Object.assign(
      new Error(`${patientId} is not in created-patients.json; bulk acts are limited to fixture patients`),
      { status: 403 },
    )
  }
  const r = await fetch(`${NOTE_API}?patientKey=${patientId}&limit=100`, { headers: bearer(svc) })
  const body = await r.json().catch(() => null)
  // Even on a fixture patient, a bulk act touches only notes this harness
  // wrote. The rest is the fixture's own baseline — the Data import notes and
  // the seeded Home visit — and retitling those would destroy the setup the
  // other tests read from. The per-note buttons still act on anything, because
  // that is a deliberate choice about one named note.
  return (body?.results ?? [])
    .filter((n) => OURS.test(n.titleDisplay || n.title || ''))
    .map((n) => n.noteKey)
}

// The Canvas client is Confidential and PKCE is unsupported, so the secret is
// mandatory on the token call — which means the exchange has to happen here
// rather than in the browser.
// The attribution experiment itself, with no HTTP surface of its own so that
// both the JSON route and the server-rendered callback can call it directly.
// It writes two notes with an identical body and the same providerKey; only the
// bearer token differs, so any difference in recorded authorship is caused by
// the token.
async function runAttributionProbe({ token, patientId }) {
  const NOTE = NOTE_API

  // Create, lock, read back. Returns the reason rather than throwing, so one
  // token failing still leaves the other half of the comparison intact.
  async function writeNote(tk, body) {
    try {
      const mk = await fetch(NOTE, {
        method: 'POST',
        headers: { ...bearer(tk), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const made = await mk.json().catch(() => null)
      if (mk.status >= 300) return { error: `create ${mk.status}: ${JSON.stringify(made)}` }

      const key = made?.noteKey
      const lock = await fetch(`${NOTE}/${key}`, {
        method: 'PATCH',
        headers: { ...bearer(tk), 'content-type': 'application/json' },
        body: JSON.stringify({ stateChange: 'LKD' }),
      })
      const locked = await lock.json().catch(() => null)
      const permalink = locked?.permalink ?? made?.permalink
      return {
        noteKey: key,
        currentState: locked?.currentState ?? made?.currentState,
        // Canvas returns the permalink on the note, so the link that settles
        // this is its own rather than one we assembled by convention.
        permalink: permalink ? AUTH + permalink : null,
        lockStatus: lock.status,
      }
    } catch (err) {
      return { error: String(err?.cause?.message ?? err) }
    }
  }

  const svc = await serviceToken()

  // Ask Canvas whose token this is. Comparing the token strings does not work:
  // every mint returns a fresh string, so two tokens for the same identity
  // never compare equal, and an earlier version of this guard passed happily
  // while writing a pair of notes that misdescribed themselves.
  async function introspect(tk) {
    try {
      const r = await fetch(`${AUTH}/auth/introspect/`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...bearer(tk) },
        body: new URLSearchParams({ token: tk }),
      })
      const txt = await r.text()
      return txt ? JSON.parse(txt) : null
    } catch {
      return null
    }
  }

  const [who, whoSvc] = await Promise.all([introspect(token), introspect(svc)])
  // The scope Canvas actually granted, which is the difference between "the
  // write was refused for want of scope" and "the scope was there and the user
  // lacks the role". Those are very different findings.
  const suppliedScope = (who?.scope ?? '').split(/\s+/).filter((x) => /Note/i.test(x)).join(' ')
  if (who?.client_id && whoSvc?.client_id && who.client_id === whoSvc.client_id) {
    throw new Error(
      `the supplied token belongs to the same OAuth client as this app (${who.client_id}), ` +
      `so there are not two identities to compare`,
    )
  }
  const [pr, loc] = await Promise.all([
    fetch(`${FHIR}/Practitioner?_count=1`, { headers: bearer(svc) }).then((r) => r.json()),
    fetch(`${FHIR}/Location?_count=1`, { headers: bearer(svc) }).then((r) => r.json()),
  ])
  const providerKey = pr?.entry?.[0]?.resource?.id
  const practiceLocationKey = loc?.entry?.[0]?.resource?.id
  if (!providerKey || !practiceLocationKey) {
    throw new Error(`no Practitioner (${providerKey}) or Location (${practiceLocationKey}) to reference`)
  }

  const base = {
    patientKey: patientId,
    providerKey,
    practiceLocationKey,
    noteTypeName: 'Office visit',
    encounterStartTime: new Date().toISOString(),
  }
  const at = new Date().toISOString()
  // Titles name the grant, never the person. An earlier version titled the
  // first note "physician token" by position, so a test that passed the
  // service token for both put a note on a patient chart claiming an
  // authorship that never happened. A chart artefact must not assert what the
  // code cannot check: we know we minted the second token, and we know nothing
  // about the first beyond that the caller supplied it.
  const staff = await writeNote(token, {
    ...base,
    title: `Aleron test artefact ${at} - written with the SUPPLIED token`,
  })
  const service = await writeNote(svc, {
    ...base,
    title: `Aleron test artefact ${at} - written with this app's client_credentials token`,
  })

  // Provenance is read-only but searchable by patient. If Canvas records one
  // for a note lock it names the agent, which answers this without the UI.
  let provenance = []
  try {
    const pv = await fetch(`${FHIR}/Provenance?patient=${patientId}&_count=20`, { headers: bearer(svc) })
    const bundle = await pv.json()
    provenance = (bundle?.entry ?? []).map((e) => ({
      recorded: e.resource?.recorded,
      agent: e.resource?.agent?.[0]?.who?.display ?? e.resource?.agent?.[0]?.who?.reference,
      target: e.resource?.target?.[0]?.reference,
    }))
  } catch { /* a bonus, not the test */ }

  // Written to a file as well as returned. stdout does not survive Vite's own
  // config-change restart, and the browser that ran this may be one nobody else
  // can see, so the durable record is on disk.
  const record = {
    at,
    providerKey,
    suppliedTokenClient: who?.client_id ?? '(introspection unavailable)',
    suppliedTokenNoteScopes: suppliedScope || '(none granted)',
    staff,
    service,
    provenanceRows: provenance.length,
  }
  console.log('[attribution]', JSON.stringify(record))
  try {
    appendFileSync(join(HERE, 'attribution-log.jsonl'), JSON.stringify(record) + String.fromCharCode(10))
  } catch (err) {
    console.log('[attribution] could not write attribution-log.jsonl:', String(err))
  }

  return { providerKey, staff, service, provenance, supplied: record }
}

const canvasAuth = {
  name: 'canvas-auth',
  configureServer(server) {
    server.middlewares.use('/api/config', (_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ clientId: WEB_CLIENT_ID, authBase: AUTH, redirectUri: REDIRECT_URI }))
    })

    server.middlewares.use('/api/patient-token', async (req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end('{"error":"method_not_allowed"}')
      }
      try {
        const { patientId } = JSON.parse((await readBody(req)) || '{}')
        if (!patientId) {
          res.statusCode = 400
          return res.end('{"error":"missing_patient_id"}')
        }
        const upstream = await fetch(`${AUTH}/auth/token/`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: SCRIPT_CLIENT_ID,
            client_secret: SCRIPT_CLIENT_SECRET,
            patient: patientId,
            // Canvas rejects a `patient` request that omits scope.
            scope: PATIENT_SCOPE,
          }),
        })
        res.statusCode = upstream.status
        res.end(await upstream.text())
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'patient_token_failed', detail: String(err) }))
      }
    })

    // ---- note lifecycle ------------------------------------------------
    // create, lock, then look for the PDF Canvas is documented to generate on
    // the lock. Runs here rather than in the browser because the Note API lives
    // on the auth host, which sends no CORS headers for our origin.
    server.middlewares.use('/api/note', async (req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end('{"error":"method_not_allowed"}')
      }
      const send = (status, body) => {
        res.statusCode = status
        res.end(JSON.stringify(body, null, 2))
      }
      try {
        const { op, patientId, noteKey, title } = JSON.parse((await readBody(req)) || '{}')
        const svc = await serviceToken()

        if (op === 'create') {
          if (!patientId) return send(400, { error: 'need patientId' })
          // providerKey and practiceLocationKey are required and must name
          // records that already exist, so take the first of each rather than
          // inventing ids.
          const [pr, loc] = await Promise.all([
            fetch(`${FHIR}/Practitioner?_count=1`, { headers: bearer(svc) }).then((r) => r.json()),
            fetch(`${FHIR}/Location?_count=1`, { headers: bearer(svc) }).then((r) => r.json()),
          ])
          const providerKey = pr?.entry?.[0]?.resource?.id
          const practiceLocationKey = loc?.entry?.[0]?.resource?.id
          if (!providerKey || !practiceLocationKey) {
            return send(502, { error: 'no Practitioner or Location to reference', providerKey, practiceLocationKey })
          }
          const r = await fetch(NOTE_API, {
            method: 'POST',
            headers: { ...bearer(svc), 'content-type': 'application/json' },
            body: JSON.stringify({
              patientKey: patientId,
              providerKey,
              practiceLocationKey,
              noteTypeName: 'Office visit',
              encounterStartTime: new Date().toISOString(),
              title: title || `Aleron test note ${new Date().toISOString()}`,
            }),
          })
          const body = await r.json().catch(() => null)
          // providerKey is echoed back deliberately: it, not the token holder,
          // is what names the clinician on a note.
          return send(r.status, { op, status: r.status, providerKey, note: body })
        }

        if (op === 'lock') {
          if (!noteKey) return send(400, { error: 'need noteKey' })
          const r = await fetch(`${NOTE_API}/${noteKey}`, {
            method: 'PATCH',
            headers: { ...bearer(svc), 'content-type': 'application/json' },
            body: JSON.stringify({ stateChange: 'LKD' }),
          })
          const body = await r.json().catch(() => null)
          return send(r.status, { op, status: r.status, note: body })
        }

        if (op === 'pdf') {
          if (!noteKey) return send(400, { error: 'need noteKey' })
          const nr = await fetch(`${NOTE_API}/${noteKey}`, { headers: bearer(svc) })
          const note = await nr.json().catch(() => null)
          if (!nr.ok) return send(nr.status, { op, error: 'could not read the note', detail: note })

          // The Note read exposes no document or encounter id, so the only
          // correlation available is time: a note PDF's DocumentReference
          // carries context.period.start equal to the note's datetimeOfService.
          // Compared as instants, not as strings — the Note API renders that
          // moment as ...737000Z and FHIR renders it as ...737000+00:00, so
          // string equality reports "no PDF" for notes that plainly have one.
          const dr = await fetch(
            `${FHIR}/DocumentReference?patient=${note.patientKey}&category=clinical-note&_count=50`,
            { headers: bearer(svc) },
          )
          const bundle = await dr.json().catch(() => null)
          const docs = (bundle?.entry ?? []).map((e) => e.resource)
          const at = Date.parse(note.datetimeOfService)
          // Every match, never .find(): an amended note carries a second
          // DocumentReference with the SAME period.start (status: superseded
          // vs current), so .find() would return the original and hide the
          // amendment — reporting "nothing changed" in exactly the case where
          // the version chain worked. See INSTANCE-FINDINGS.md C6.
          const matches = docs
            .filter((d) => Date.parse(d.context?.period?.start ?? '') === at)
            .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
          const match = matches[matches.length - 1] ?? null

          return send(200, {
            op,
            note: { noteKey: note.noteKey, currentState: note.currentState, datetimeOfService: note.datetimeOfService },
            documentsOnPatient: bundle?.total ?? docs.length,
            found: Boolean(match),
            versionsForThisNote: matches.length,
            document: match
              ? {
                  id: match.id,
                  status: match.status,
                  contentType: match.content?.[0]?.attachment?.contentType,
                  // Served through this server: the attachment URL needs a
                  // bearer token the browser does not hold.
                  href: `/api/note-pdf?doc=${match.id}`,
                }
              : null,
            // Said here rather than left for the reader to infer, because the
            // empty result is the finding rather than a failure of the button.
            note_on_absence: match
              ? undefined
              : 'No DocumentReference matches this note. Locking over the API does not generate one on this instance; signing does. See docs/canvas/INSTANCE-FINDINGS.md in Meridian-Web, the note lifecycle over HTTP.',
          })
        }

        if (op === 'list') {
          if (!patientId) return send(400, { error: 'need patientId' })
          const r = await fetch(`${NOTE_API}?patientKey=${patientId}&limit=100`, { headers: bearer(svc) })
          const body = await r.json().catch(() => null)
          return send(r.status, {
            op,
            status: r.status,
            notes: (body?.results ?? []).map((n) => ({
              noteKey: n.noteKey,
              currentState: n.currentState,
              title: n.titleDisplay || n.title,
              datetimeOfService: n.datetimeOfService,
            })),
          })
        }

        if (op === 'delete' || op === 'deleteAll') {
          const keys = op === 'delete' ? [noteKey] : await notesOnFixture(svc, patientId)
          if (!keys?.length) return send(400, { error: op === 'delete' ? 'need noteKey' : 'nothing to delete' })
          const results = []
          for (const key of keys) results.push(await attemptDelete(svc, key))
          return send(200, {
            op,
            attempted: results.length,
            deleted: results.filter((r) => r.deleted).length,
            results,
            note_on_mechanism:
              'Deleted through POST /api/NoteStateChangeEvent/, which is undocumented as an HTTP ' +
              'endpoint. The v1 REST Note API cannot: DELETE is 405 and stateChange refuses DLT. ' +
              'DLT is a soft delete and is reversible with UND (Restore).',
          })
        }

        // Signing is the transition that actually produces the note PDF and its
        // DocumentReference. Locking does not, whichever endpoint performs it.
        if (op === 'sign') {
          if (!noteKey) return send(400, { error: 'need noteKey' })
          const r = await noteStateChange(svc, noteKey, 'SGN')
          return send(r.ok ? 200 : 400, {
            op,
            ...r,
            note_on_mechanism:
              'SGN generates the PDF and its DocumentReference, usually within a few seconds. ' +
              'A note must be locked first. Both Canvas doc pages attribute this to the lock; on ' +
              'this instance 14 locked notes produced none and one signature produced one.',
          })
        }

        // The only cleanup Canvas actually permits. It does not remove
        // anything; it retitles, so a chart reader can tell test artefacts from
        // real notes. PATCH of a title succeeds even on a locked note.
        if (op === 'void' || op === 'voidAll') {
          const keys = op === 'void' ? [noteKey] : await notesOnFixture(svc, patientId)
          if (!keys?.length) return send(400, { error: op === 'void' ? 'need noteKey' : 'nothing to void' })
          const results = []
          for (const key of keys) {
            const r = await fetch(`${NOTE_API}/${key}`, {
              method: 'PATCH',
              headers: { ...bearer(svc), 'content-type': 'application/json' },
              body: JSON.stringify({ title: VOID_TITLE }),
            })
            const b = await r.json().catch(() => null)
            results.push({ noteKey: key, status: r.status, title: b?.titleDisplay ?? b?.title, state: b?.currentState })
          }
          return send(200, { op, attempted: results.length, retitled: results.filter((r) => r.status < 300).length, results })
        }

        return send(400, { error: 'op must be create, lock, sign, pdf, list, delete, deleteAll, void or voidAll' })
      } catch (err) {
        res.statusCode = err?.status ?? 500
        res.end(JSON.stringify({
          error: err?.status === 403 ? 'refused' : 'note_route_failed',
          detail: err?.status ? err.message : String(err?.stack ?? err),
        }, null, 2))
      }
    })

    // Streams the PDF bytes, since the FHIR attachment URL needs a bearer token
    // the browser has no way to attach to a link or an iframe.
    // ---- orders -----------------------------------------------------------
    server.middlewares.use('/api/order', async (req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end('{"error":"method_not_allowed"}')
      }
      const send = (status, body) => {
        res.statusCode = status
        res.end(JSON.stringify(body, null, 2))
      }
      try {
        const { op, patientId, providerKey, orderId, title } = JSON.parse((await readBody(req)) || '{}')
        const svc = await serviceToken()

        if (op === 'list') {
          const r = await fetch(`${AUTH}/api/LabOrder/?limit=100`, { headers: bearer(svc) })
          const body = await r.json().catch(() => null)
          const rows = (body?.entry ?? []).map((e) => e.resource ?? e).map((o) => ({
            id: o.id,
            requisitionNumber: o.requisitionNumber,
            status: o.status,
            note: o.note,
            // The three identities, which is the whole point of this screen.
            originator: o.audit?.originator ?? null,
            committer: o.audit?.committer ?? null,
            enteredInError: o.audit?.enteredInError ?? null,
            orderingProvider: o.orderingProvider ?? null,
            tests: o.tests ?? [],
            permalink: o.permalink ? AUTH + o.permalink : null,
          }))
          return send(r.status, { op, status: r.status, total: body?.total ?? rows.length, orders: rows })
        }

        if (op === 'create') {
          if (!patientId) return send(400, { error: 'need patientId' })
          const made = await createLabOrder(svc, { patientId, providerKey, title })
          if (made.error) return send(502, { op, ...made })
          return send(made.status ?? 200, {
            op,
            ...made,
            note_on_mechanism:
              'Created through POST /api/LabOrder/, which Canvas does not document as an HTTP ' +
              'endpoint. F2/F3 say every order command is plugin-gated; this one is not. ' +
              'orderingProvider is inherited from the note provider, so that is where the ' +
              'physician on the order is decided.',
          })
        }

        if (op === 'withdraw') {
          if (!orderId) return send(400, { error: 'need orderId' })
          return send(200, { op, ...(await withdrawLabOrder(svc, orderId)) })
        }

        // Staff the note can be attributed to. Only some are FHIR
        // Practitioners, so this reads the internal list and says which.
        if (op === 'staff') {
          const prac = await fetch(`${FHIR}/Practitioner?_count=50`, { headers: bearer(svc) })
            .then((r) => r.json()).catch(() => null)
          const practitioners = (prac?.entry ?? []).map((e) => ({
            key: e.resource.id,
            name: e.resource.name?.[0]?.text ?? e.resource.id,
            isPractitioner: true,
          }))
          // Note providers seen in the chart catch staff who are not exposed as
          // Practitioners — Moosa Mohammed is one, and an order can name them.
          const notes = await fetch(`${NOTE_API}?limit=100`, { headers: bearer(svc) })
            .then((r) => r.json()).catch(() => null)
          const seen = new Map(practitioners.map((p) => [p.key, p]))
          for (const n of notes?.results ?? []) {
            if (n.providerKey && !seen.has(n.providerKey)) {
              // The Note API gives only the key. The internal note read carries
              // providerDisplay with a real name, and a dropdown of uuids is
              // useless for choosing a physician.
              let name = n.providerKey
              try {
                const full = await fetch(`${AUTH}/api/Note/${pkFromPermalink(n.permalink)}`, {
                  headers: bearer(svc),
                }).then((r) => r.json())
                name = full?.providerDisplay?.nameAndRoles || name
              } catch { /* fall back to the key */ }
              seen.set(n.providerKey, { key: n.providerKey, name, isPractitioner: false })
            }
          }
          return send(200, { op, staff: [...seen.values()] })
        }

        return send(400, { error: 'op must be list, create, withdraw or staff' })
      } catch (err) {
        res.statusCode = err?.status ?? 500
        res.end(JSON.stringify({ error: 'order_route_failed', detail: String(err?.stack ?? err) }, null, 2))
      }
    })

    server.middlewares.use('/api/note-pdf', async (req, res) => {
      const id = new URL(req.url, REDIRECT_URI).searchParams.get('doc')
      if (!id) {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        return res.end('{"error":"need doc"}')
      }
      try {
        const svc = await serviceToken()
        const r = await fetch(`${FHIR}/DocumentReference/${id}/files/content`, { headers: bearer(svc) })
        res.statusCode = r.status
        // Canvas serves the bytes as application/octet-stream, which makes the
        // browser download the file instead of showing it. The
        // DocumentReference says application/pdf and the bytes start %PDF, so
        // label it correctly and let the tab render it.
        res.setHeader('content-type', r.ok ? 'application/pdf' : 'application/json')
        res.setHeader('content-disposition', 'inline; filename="note.pdf"')
        res.end(Buffer.from(await r.arrayBuffer()))
      } catch (err) {
        res.statusCode = 502
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: 'pdf_fetch_failed', detail: String(err) }))
      }
    })

    // ---- Junction lab orders -------------------------------------------
    // The key stays here. This repo publishes to GitHub Pages, so anything
    // reachable from the browser bundle is public: a VITE_-prefixed Junction
    // key would be committed in effect even though web.env is gitignored.
    server.middlewares.use('/api/junction', async (req, res) => {
      res.setHeader('content-type', 'application/json')
      const send = (status, body) => {
        res.statusCode = status
        res.end(JSON.stringify(body, null, 2))
      }
      if (!JUNCTION_KEY) return send(500, { error: 'web.env has no JUNCTION_KEY' })
      if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' })

      const jcall = async (method, path, body) => {
        const r = await fetch(JUNCTION_BASE + path, {
          method,
          headers: { 'x-vital-api-key': JUNCTION_KEY, 'content-type': 'application/json' },
          body: body && JSON.stringify(body),
        })
        const text = await r.text()
        let json = null
        try { json = JSON.parse(text) } catch {}
        return { status: r.status, json, text }
      }

      try {
        const { op, physician, labTestId, skip = [], method, ids = [], query = {}, test } =
          JSON.parse((await readBody(req)) || '{}')

        // Full event history for orders already placed, so a later read can show
        // whether the simulator kept going after the page stopped looking.
        if (op === 'readOrders') {
          const orders = []
          for (const id of ids) {
            const o = (await jcall('GET', `/v3/order/${id}`)).json
            orders.push({
              id,
              status: o?.status ?? null,
              last: o?.last_event?.status ?? null,
              events: (o?.events ?? []).map((e) => `${e.created_at} ${e.status}${e.status_detail ? ` (${e.status_detail})` : ''}`),
            })
          }
          return send(200, { op, orders })
        }

        // Everything the delegation question turns on, in one call.
        if (op === 'context') {
          const accounts = await jcall('GET', '/v3/lab_test/lab_account')
          const users = await jcall('GET', '/v2/user?limit=1')
          const teamId = users.json?.users?.[0]?.team_id
          const team = teamId ? await jcall('GET', `/v2/team/${teamId}`) : null
          const roster = teamId ? await jcall('GET', `/v2/team/${teamId}/physicians`) : null
          const tests = await jcall('GET', '/v3/lab_tests')
          return send(200, {
            op,
            labAccounts: accounts.json?.data ?? [],
            teamDelegatedFlow: team?.json?.delegated_flow ?? null,
            roster: roster?.json ?? [],
            tests: (tests.json ?? []).map((t) => ({
              id: t.id, name: t.name, method: t.method, lab: t.lab?.slug,
            })),
          })
        }

        // Place one order and read the physician back. `physician: null` is the
        // control arm and is the whole point — see the note below.
        if (op === 'place') {
          const tag = `harness-${Date.now()}`
          const user = await jcall('POST', '/v2/user', { client_user_id: tag })
          if (!user.json?.user_id) return send(502, { op, error: 'user_create_failed', detail: user.text })

          const body = {
            user_id: user.json.user_id,
            lab_test_id: labTestId,
            patient_details: {
              first_name: 'Aleron', last_name: 'Harness', dob: '1980-01-01', gender: 'male',
              // Twilio's magic test number, and a domain that cannot receive
              // mail: this team has patient SMS and email switched on.
              phone_number: '+15005550006', email: `${tag}@example.com`,
            },
            patient_address: {
              receiver_name: 'Aleron Harness', first_line: '9500 Wilshire Blvd',
              city: 'Beverly Hills', state: 'CA', zip: '90210', country: 'US',
            },
          }
          if (physician) body.physician = physician

          // POST /v3/order 503s intermittently on sandbox with "the order
          // creation service is temporarily unavailable".
          let made
          for (let attempt = 1; attempt <= 4; attempt++) {
            made = await jcall('POST', '/v3/order', body)
            if (made.status !== 503) break
            await new Promise((r) => setTimeout(r, 1500 * attempt))
          }
          if (made.status !== 200) return send(made.status, { op, error: 'order_failed', detail: made.text })

          const id = made.json.order.id
          await jcall('POST', `/v3/order/${id}/test?final_status=received.at_home_phlebotomy.requisition_created&delay=0`)
          const read = await jcall('GET', `/v3/order/${id}`)
          return send(200, {
            op,
            orderId: id,
            sent: physician ?? null,
            readBack: read.json?.physician ?? null,
            status: read.json?.last_event?.status ?? read.json?.status,
            requisitionUrl: `/api/junction-pdf?order=${id}`,
          })
        }

        // "Which lab tests can the team order?" Junction has no per-physician or
        // dry-run catalog, so each probe below is one open question from the
        // research: what the list returns, and whether it agrees with what an
        // order accepts. Read-only; `tryOrders` is the one that writes.
        if (op === 'labs') {
          const list = async (qs) => {
            const rows = []
            let cursor = null
            let pages = 0
            do {
              const q = new URLSearchParams(qs)
              if (cursor) q.set('next_cursor', cursor)
              const r = await jcall('GET', `/v3/lab_test?${q}`)
              if (r.status !== 200) return { status: r.status, detail: r.text.slice(0, 300), rows }
              rows.push(...(r.json?.data ?? []))
              cursor = r.json?.next_cursor
              pages++
            } while (cursor && pages < 20)
            return { status: 200, pages, rows: rows.map(slimTest) }
          }
          const slimTest = (t) => ({
            id: t.id,
            name: t.name,
            method: t.method,
            lab: t.lab?.slug,
            status: t.status,
            auto: t.auto_generated,
            markers: t.markers?.length ?? 0,
            markersNotOrderable: (t.markers ?? []).filter((m) => m.is_orderable === false).length,
            requiredAoe: (t.markers ?? []).filter((m) => m.aoe?.questions?.some((q) => q.required)).length,
          })

          const accounts = await jcall('GET', '/v3/lab_test/lab_account')
          const platform = (accounts.json?.data ?? []).find((a) => a.owner === 'platform')
          const [active, anyStatus, withAuto, withAccount, big, deprecated, labs] = await Promise.all([
            list({ status: 'active', lab_test_limit: '100' }),
            list({ lab_test_limit: '100' }),
            list({ generation_method: 'all', lab_test_limit: '100' }),
            platform
              ? list({ status: 'active', lab_test_limit: '100', lab_account_id: platform.id })
              : Promise.resolve(null),
            jcall('GET', '/v3/lab_test?lab_test_limit=500'),
            jcall('GET', '/v3/lab_tests'),
            jcall('GET', '/v3/lab_tests/labs'),
          ])
          return send(200, {
            op,
            base: JUNCTION_BASE,
            accounts: { status: accounts.status, data: accounts.json?.data ?? accounts.text.slice(0, 300) },
            active,
            anyStatus,
            withAuto,
            withAccount,
            limit500: { status: big.status, detail: big.status === 200 ? null : big.text.slice(0, 300) },
            deprecated: { status: deprecated.status, detail: deprecated.text.slice(0, 200) },
            labs: { status: labs.status, count: Array.isArray(labs.json) ? labs.json.length : (labs.json?.data?.length ?? null) },
          })
        }

        // Side effect: places one real sandbox order per active test, under the
        // physician Aleron would send. Orders cannot be deleted on Junction, so
        // this is a button, not part of `labs`. The physician is fixed rather than
        // generated: it registers on the team roster once instead of once per run.
        if (op === 'tryOrders') {
          const active = []
          let cursor = null
          do {
            const q = new URLSearchParams({ status: 'active', lab_test_limit: '100' })
            if (cursor) q.set('next_cursor', cursor)
            const r = await jcall('GET', `/v3/lab_test?${q}`)
            if (r.status !== 200) return send(r.status, { op, error: 'list_failed', detail: r.text.slice(0, 300) })
            active.push(...(r.json?.data ?? []))
            cursor = r.json?.next_cursor
          } while (cursor)

          // One user for every order. Sandbox caps users at 50, and creating one
          // per order used the allowance up. Patient identity travels in
          // patient_details, so the user is only the owner of the order.
          let userId = (await jcall('GET', '/v2/user?limit=1')).json?.users?.[0]?.user_id
          if (!userId) {
            const made = await jcall('POST', '/v2/user', { client_user_id: `harness-${Date.now()}` })
            userId = made.json?.user_id
            if (!userId) return send(502, { op, error: 'user_create_failed', detail: made.text.slice(0, 300) })
          }

          const results = []
          for (const t of active.filter((t) => !skip.includes(t.id))) {
            const tag = `harness-${Date.now()}`
            const body = {
              user_id: userId,
              order_set: { lab_test_ids: [t.id] },
              physician: { first_name: 'Harness', last_name: 'Orderer', npi: '1234567893', licensed_states: ['CA'] },
              patient_details: {
                first_name: 'Aleron', last_name: 'Harness', dob: '1980-01-01', gender: 'male',
                phone_number: '+15005550006', email: `${tag}@example.com`,
              },
              patient_address: {
                receiver_name: 'Aleron Harness', first_line: '9500 Wilshire Blvd',
                city: 'Beverly Hills', state: 'CA', zip: '90210', country: 'US',
              },
            }
            let made
            for (let attempt = 1; attempt <= 3; attempt++) {
              made = await jcall('POST', '/v3/order', body)
              if (made.status !== 503) break
              await new Promise((r) => setTimeout(r, 1500 * attempt))
            }
            const order = made.json?.order
            results.push({
              id: t.id,
              name: t.name,
              method: t.method,
              status: made.status,
              orderId: order?.id ?? null,
              orderStatus: order?.status ?? null,
              statusDetail: order?.last_event?.status_detail ?? null,
              labAccountId: order?.lab_account_id ?? null,
              detail: made.status === 200 ? null : made.text.slice(0, 300),
            })
          }
          return send(200, { op, tried: results.length, accepted: results.filter((r) => r.status === 200).length, results })
        }

        // How cancellation behaves once an order exists, for one lab test. One row
        // per scenario, and each scenario places its own order because an order
        // cannot be un-cancelled or deleted: five orders per run. States are
        // driven with the sandbox simulator, which the docs do not describe for
        // cancelled targets, so a refused simulation is itself a result.
        // The order body below repeats tryOrders; kept separate so the tested
        // path is not touched.
        if (op === 'cancelScenarios') {
          const mid = {
            walk_in_test: 'sample_with_lab.walk_in_test.partial_results',
            at_home_phlebotomy: 'collecting_sample.at_home_phlebotomy.draw_completed',
            testkit: 'collecting_sample.testkit.transit_customer',
          }
          if (!labTestId || !mid[method]) return send(400, { op, error: 'need labTestId and a known method' })

          let userId = (await jcall('GET', '/v2/user?limit=1')).json?.users?.[0]?.user_id
          if (!userId) {
            const made = await jcall('POST', '/v2/user', { client_user_id: `harness-${Date.now()}` })
            userId = made.json?.user_id
            if (!userId) return send(502, { op, error: 'user_create_failed', detail: made.text.slice(0, 300) })
          }
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

          const place = async () => {
            const tag = `harness-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            const body = {
              user_id: userId,
              order_set: { lab_test_ids: [labTestId] },
              physician: { first_name: 'Harness', last_name: 'Orderer', npi: '1234567893', licensed_states: ['CA'] },
              patient_details: {
                first_name: 'Aleron', last_name: 'Harness', dob: '1980-01-01', gender: 'male',
                phone_number: '+15005550006', email: `${tag}@example.com`,
              },
              patient_address: {
                receiver_name: 'Aleron Harness', first_line: '9500 Wilshire Blvd',
                city: 'Beverly Hills', state: 'CA', zip: '90210', country: 'US',
              },
            }
            let made
            for (let attempt = 1; attempt <= 3; attempt++) {
              made = await jcall('POST', '/v3/order', body)
              if (made.status !== 503) break
              await sleep(1500 * attempt)
            }
            return made.status === 200 ? { id: made.json.order.id } : { detail: made.text.slice(0, 300) }
          }
          const read = async (id) => {
            const o = (await jcall('GET', `/v3/order/${id}`)).json
            return {
              status: o?.status ?? null,
              last: o?.last_event?.status ?? null,
              detail: o?.last_event?.status_detail ?? null,
              transaction: o?.order_transaction?.status ?? null,
            }
          }
          // Waits for the simulator to land on the target, since the docs do not
          // say whether it is synchronous or what `delay` is measured in.
          // One call did not reach the target on the first run (the order sat at
          // requisition_created after a 200), so repeat the call and record how
          // many it took: the simulator may advance one stage per call.
          const simulate = async (id, finalStatus) => {
            const trail = []
            let r
            let seen = null
            let calls = 0
            while (calls < 4 && seen?.last !== finalStatus) {
              r = await jcall('POST', `/v3/order/${id}/test?final_status=${finalStatus}&delay=0`)
              calls++
              if (r.status !== 200) break
              for (let i = 0; i < 4; i++) {
                seen = await read(id)
                if (trail[trail.length - 1] !== seen.last) trail.push(seen.last)
                if (seen.last === finalStatus) break
                await sleep(1000)
              }
            }
            return {
              target: finalStatus,
              http: r.status,
              detail: r.status === 200 ? null : r.text.slice(0, 200),
              reached: seen?.last === finalStatus,
              now: seen?.last ?? null,
              calls,
              trail,
            }
          }
          // The reference documents POST /v3/order/{id}/cancel; the guide shows
          // DELETE /v3/lab_test/{id}/cancel. Try the reference, and only fall
          // back if the route does not exist, so the result says which one is real.
          const cancel = async (id) => {
            const tried = []
            let r = await jcall('POST', `/v3/order/${id}/cancel`)
            tried.push(`POST /v3/order/{id}/cancel: ${r.status}`)
            if (r.status === 404 || r.status === 405) {
              r = await jcall('DELETE', `/v3/lab_test/${id}/cancel`)
              tried.push(`DELETE /v3/lab_test/{id}/cancel: ${r.status}`)
            }
            return { http: r.status, tried, body: r.text.slice(0, 300), after: await read(id) }
          }

          const rows = []
          let firstId = null
          const scenario = async (name, fn) => {
            const o = await place()
            if (!o.id) return rows.push({ scenario: name, error: 'place_failed', detail: o.detail })
            rows.push({ scenario: name, orderId: o.id, ...(await fn(o.id)) })
          }
          await scenario('Fresh order, cancel', async (id) => {
            firstId = id
            return { cancel: await cancel(id) }
          })
          if (firstId) rows.push({ scenario: 'Cancel the same order again', orderId: firstId, cancel: await cancel(firstId) })
          await scenario('Requisition created, cancel', async (id) => {
            const sim = await simulate(id, `received.${method}.requisition_created`)
            return { sim, cancel: await cancel(id) }
          })
          await scenario(`${mid[method].split('.').slice(-1)[0]}, cancel`, async (id) => {
            const sim = await simulate(id, mid[method])
            return { sim, cancel: await cancel(id) }
          })
          await scenario('Completed, cancel', async (id) => {
            const sim = await simulate(id, `completed.${method}.completed`)
            return { sim, cancel: await cancel(id) }
          })
          await scenario('Simulate straight to cancelled', async (id) => {
            const sim = await simulate(id, `cancelled.${method}.cancelled`)
            return { sim, after: await read(id) }
          })
          return send(200, { op, method, labTestId, rows })
        }

        // ---- creating our own lab tests ---------------------------------
        // The picker feeds from GET /v3/lab_tests/markers and the result is a
        // POST /v3/lab_tests. Sandbox only: every panel made here is permanent
        // apart from archiving, so the probe names them and archives them again.
        const slimMarker = (m) => ({
          id: m.id,
          name: m.name,
          type: m.type ?? null,
          providerId: m.provider_id ?? null,
          labId: m.lab_id ?? null,
          unit: m.unit ?? null,
          aLaCarte: m.a_la_carte_enabled,
          orderable: m.is_orderable,
          requiredQuestions: (m.aoe?.questions ?? []).filter((q) => q.required).length,
          expectedResults: m.expected_results?.length ?? 0,
          components: m.components?.length ?? 0,
        })
        const slimTest = (t) => ({
          id: t.id,
          version: t.version ?? null,
          name: t.name,
          method: t.method,
          status: t.status,
          isActive: t.is_active,
          lab: t.lab?.slug ?? null,
          markers: t.markers?.length ?? 0,
          fasting: t.fasting,
        })

        // Archive by id and show the whole reply, for panels the probe could not archive.
        if (op === 'archiveTests') {
          const out = []
          for (const id of ids) {
            const r = await jcall('PATCH', `/v3/lab_tests/${id}`, { active: false })
            out.push({ id, http: r.status, body: r.text.slice(0, 400) })
          }
          return send(200, { op, out })
        }

        if (op === 'labList') {
          const r = await jcall('GET', '/v3/lab_tests/labs')
          return send(r.status, {
            op,
            status: r.status,
            labs: (Array.isArray(r.json) ? r.json : []).map((l) => ({
              id: l.id, slug: l.slug, name: l.name, methods: l.collection_methods,
            })),
          })
        }

        if (op === 'markers') {
          const q = new URLSearchParams()
          for (const k of ['lab_slug', 'name', 'a_la_carte_enabled', 'page', 'size']) {
            if (query[k] !== undefined && query[k] !== '') q.set(k, query[k])
          }
          const r = await jcall('GET', `/v3/lab_tests/markers?${q}`)
          const list = r.json?.markers ?? []
          return send(200, {
            op,
            status: r.status,
            detail: r.status === 200 ? null : r.text.slice(0, 300),
            total: r.json?.total ?? null,
            page: r.json?.page ?? null,
            pages: r.json?.pages ?? null,
            markers: list.map(slimMarker),
            // The raw first marker, so the fields the docs promise can be checked by eye.
            sample: list[0] ?? null,
          })
        }

        if (op === 'createTest') {
          const r = await jcall('POST', '/v3/lab_tests', test)
          return send(200, {
            op,
            status: r.status,
            detail: r.status === 200 ? null : r.text.slice(0, 400),
            test: r.status === 200 ? slimTest(r.json) : null,
          })
        }

        // Each row answers one question the docs leave open or contradict.
        if (op === 'probeCreate') {
          const rows = []
          const created = []
          const stamp = Date.now()
          const rec = (name, r, note) =>
            rows.push({ name, http: r.status, note: note ?? (r.status === 200 ? '' : r.text.slice(0, 220)) })
          const get = (p) => jcall('GET', p)
          const create = async (name, body) => {
            const r = await jcall('POST', '/v3/lab_tests', {
              description: 'Aleron harness probe, sandbox only',
              fasting: false,
              name: `Aleron harness probe ${name} ${stamp}`,
              ...body,
            })
            if (r.status === 200) created.push(r.json.id)
            const t = r.json
            // Marker names are listed because a panel has come back with more
            // markers than were sent, and the picker has to explain that.
            rec(name, r, r.status === 200
              ? `${t.status}, lab ${t.lab?.slug}, ${t.markers?.length} markers: ${(t.markers ?? []).map((m) => `${m.name} (${m.id}, ${m.type})`).join('; ')}`
              : undefined)
            return r
          }

          const labs = (await get('/v3/lab_tests/labs')).json ?? []
          const lab = (slug) => labs.find((l) => l.slug === slug)
          const all = await get('/v3/lab_tests/markers?size=100')
          rec('markers: no lab filter, size=100', all,
            `total ${all.json?.total}, ${new Set((all.json?.markers ?? []).map((m) => m.lab_id)).size} lab(s) on this page`)
          rec('markers: size=101', await get('/v3/lab_tests/markers?size=101'))

          const lc = await get('/v3/lab_tests/markers?lab_slug=labcorp&a_la_carte_enabled=true&size=100')
          const [m1, m2] = (lc.json?.markers ?? []).filter((m) => m.type === 'biomarker' && m.provider_id)
          rec('markers: lab_slug=labcorp, a_la_carte', lc,
            `total ${lc.json?.total}, pages ${lc.json?.pages}, size ${lc.json?.size}. Using ${m1?.name} (${m1?.id}) and ${m2?.name} (${m2?.id})`)
          if (!m1 || !m2) return send(200, { op, rows, error: 'fewer than two labcorp biomarkers, stopping' })

          const both = await get(`/v3/lab_tests/markers?lab_slug=labcorp&lab_id=${lab('quest')?.id}&size=1`)
          rec('markers: lab_slug=labcorp AND lab_id=quest', both,
            `first marker lab_id ${both.json?.markers?.[0]?.lab_id} (labcorp is ${lab('labcorp')?.id}, quest is ${lab('quest')?.id})`)
          const byCode = await get(`/v3/lab_tests/markers?lab_slug=labcorp&name=${encodeURIComponent(m1.provider_id)}`)
          rec('markers: name = a provider_id', byCode,
            `${byCode.json?.total} match(es), includes it: ${(byCode.json?.markers ?? []).some((m) => m.id === m1.id)}`)
          const quest = (await get('/v3/lab_tests/markers?lab_slug=quest&size=1')).json?.markers?.[0]
          const plain = (await get('/v3/lab_tests/markers?lab_slug=labcorp&a_la_carte_enabled=false&size=1')).json?.markers?.[0]

          const made = await create('walk_in, marker_ids', { method: 'walk_in_test', marker_ids: [m1.id, m2.id], lab_slug: 'labcorp' })
          await create('at_home_phlebotomy', { method: 'at_home_phlebotomy', marker_ids: [m1.id, m2.id], lab_slug: 'labcorp' })
          await create('on_site_collection', { method: 'on_site_collection', marker_ids: [m1.id, m2.id], lab_slug: 'labcorp' })
          await create('single marker m1 only', { method: 'walk_in_test', marker_ids: [m1.id], lab_slug: 'labcorp' })
          await create('testkit, labcorp (not supported)', { method: 'testkit', marker_ids: [m1.id, m2.id], lab_slug: 'labcorp' })
          // No testkit panel here on purpose: one probe run made one (ussl, status
          // active), and the API refused to archive it ("Test kit panels cannot be
          // updated"), so it stays in the sandbox catalog until the dashboard archives it.
          await create('walk_in, provider_ids only, no lab_slug', { method: 'walk_in_test', provider_ids: [m1.provider_id] })
          await create('both marker_ids and provider_ids', { method: 'walk_in_test', marker_ids: [m1.id], provider_ids: [m1.provider_id] })
          await create('neither id list', { method: 'walk_in_test' })
          if (quest) await create('markers from two labs', { method: 'walk_in_test', marker_ids: [m1.id, quest.id] })
          await create('duplicate marker id', { method: 'walk_in_test', marker_ids: [m1.id, m1.id] })
          if (plain) await create('marker not a_la_carte, walk_in', { method: 'walk_in_test', marker_ids: [plain.id] })
          const unsupported = ['testkit', 'walk_in_test', 'at_home_phlebotomy', 'on_site_collection']
            .find((m) => !(lab('labcorp')?.collection_methods ?? []).includes(m))
          if (unsupported) await create(`method labcorp does not list: ${unsupported}`, { method: unsupported, marker_ids: [m1.id] })

          if (made.status === 200) {
            const id = made.json.id
            const v = await get(`/v3/lab_tests/${id}?version=1`)
            rec('GET lab test ?version=1', v, v.status === 200 ? `version ${v.json?.version}` : undefined)
            const p = await jcall('PATCH', `/v3/lab_tests/${id}`, { marker_ids: [m1.id] })
            rec('PATCH marker_ids (one marker)', p, p.status === 200 ? `version ${p.json?.version}, ${p.json?.markers?.length} markers` : undefined)
            const h = await get(`/v3/lab_tests/${id}/version?size=10`)
            rec('GET version history', h, h.status === 200 ? JSON.stringify(h.json).slice(0, 160) : undefined)
            const a = await jcall('PATCH', `/v3/lab_tests/${id}`, { active: false })
            rec('PATCH active:false', a, a.status === 200 ? `status ${a.json?.status}, is_active ${a.json?.is_active}` : undefined)
            const inactive = await get('/v3/lab_test?status=inactive&lab_test_limit=100')
            rec('list status=inactive', inactive, `contains it: ${(inactive.json?.data ?? []).some((t) => t.id === id)}`)
            rec('DELETE lab test', await jcall('DELETE', `/v3/lab_tests/${id}`))
          }

          // Leave the active catalog as it was: the catalog page orders every active test.
          const archived = []
          for (const id of created) {
            const r = await jcall('PATCH', `/v3/lab_tests/${id}`, { active: false })
            archived.push(r.status === 200 ? 200 : `${r.status} ${r.text.slice(0, 160)}`)
          }
          rows.push({
            name: 'archived the probe panels again',
            http: archived.every((s) => s === 200) ? 200 : 'mixed',
            note: `${archived.length} PATCH active:false. ${archived.filter((s) => s !== 200).join(' | ') || 'all 200'}`,
          })
          return send(200, { op, rows })
        }

        return send(400, { error: `unknown op ${op}` })
      } catch (err) {
        send(500, { error: 'junction_failed', detail: String(err) })
      }
    })

    server.middlewares.use('/api/junction-pdf', async (req, res) => {
      const id = new URL(req.url, REDIRECT_URI).searchParams.get('order')
      if (!id || !JUNCTION_KEY) {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        return res.end('{"error":"need order, and a JUNCTION_KEY"}')
      }
      try {
        const r = await fetch(`${JUNCTION_BASE}/v3/order/${id}/requisition/pdf`, {
          headers: { 'x-vital-api-key': JUNCTION_KEY },
        })
        res.statusCode = r.status
        res.setHeader('content-type', r.ok ? 'application/pdf' : 'application/json')
        res.setHeader('content-disposition', 'inline; filename="requisition.pdf"')
        res.end(Buffer.from(await r.arrayBuffer()))
      } catch (err) {
        res.statusCode = 502
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: 'requisition_fetch_failed', detail: String(err) }))
      }
    })

    // ---- no-JavaScript probe ------------------------------------------
    // Same experiment as /api/attribution-probe, driven entirely by redirects
    // and server-rendered HTML so it runs in a browser that refuses module
    // scripts. /probe starts the login; the callback below finishes it.

    const page = (title, body) =>
      `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<style>body{font:16px/1.6 system-ui,sans-serif;max-width:56rem;margin:3rem auto;padding:0 1.5rem;` +
      `background:#faf7f2;color:#1d1b18}code{background:#1d1b1810;padding:.1em .35em;border-radius:3px}` +
      `table{border-collapse:collapse;width:100%;margin:1.5rem 0}th,td{text-align:left;padding:.6rem .8rem;` +
      `border-bottom:1px solid #1d1b1824;vertical-align:top}th{font-size:.85em;text-transform:uppercase;` +
      `letter-spacing:.04em;color:#6e6a63}a.btn{display:inline-block;background:#1d1b18;color:#faf7f2;` +
      `padding:.7rem 1.2rem;border-radius:4px;text-decoration:none}.ok{color:#2f6b3f;font-weight:600}` +
      `.bad{color:#a4452c;font-weight:600}pre{background:#1d1b180a;padding:1rem;overflow:auto;` +
      `border-radius:4px;font-size:.85em}</style>${body}`

    server.middlewares.use('/probe', (req, res, next) => {
      // Only the bare route starts a login; anything deeper is not ours.
      if (req.url !== '/' && req.url !== '') return next()
      const state = 'probe:' + Math.random().toString(36).slice(2)
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: WEB_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: PROBE_SCOPE,
        state,
        launch: Buffer.from('{}').toString('base64'),
      })
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(page('Attribution probe', `
        <h1>Who does Canvas record as the author?</h1>
        <p>This writes <strong>two notes with an identical body and the same
        <code>providerKey</code></strong>. Only the bearer token differs, so any
        difference in authorship is caused by the token and nothing else.</p>
        <p>Scope requested: <code>${PROBE_SCOPE}</code></p>
        <p><a class="btn" href="${AUTH}/auth/authorize/?${query}">Log in to Canvas and run it</a></p>
        <p style="color:#6e6a63">No JavaScript on this page, so it works in a browser
        that blocks module scripts.</p>`))
    })

    server.middlewares.use('/api/attribution-probe', async (req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end('{"error":"method_not_allowed"}')
      }
      try {
        const { token, patientId } = JSON.parse((await readBody(req)) || '{}')
        if (!token || !patientId) {
          res.statusCode = 400
          return res.end('{"error":"need token and patientId"}')
        }
        res.statusCode = 200
        res.end(JSON.stringify(await runAttributionProbe({ token, patientId }), null, 2))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'attribution_probe_failed', detail: String(err) }))
      }
    })

    server.middlewares.use('/callback', async (req, res, next) => {
      const url = new URL(req.url, REDIRECT_URI)
      const state = url.searchParams.get('state') ?? ''
      if (!state.startsWith('probe:')) return next()

      res.setHeader('content-type', 'text/html; charset=utf-8')
      // Logged as well as rendered: the browser that ran this may not be one
      // anybody else can see, so the server keeps its own account of what
      // happened.
      const fail = (what, detail) => {
        console.log(`[attribution] FAILED — ${what}: ${String(detail).slice(0, 400)}`)
        return res.end(page('Probe failed', `<h1>${what}</h1><pre>${String(detail).replace(/</g, '&lt;')}</pre>
          <p><a class="btn" href="/probe">Start over</a></p>`))
      }

      console.log(`[attribution] callback hit, state ok, error=${url.searchParams.get('error') ?? 'none'}`)
      if (url.searchParams.get('error')) {
        return fail('Canvas refused the authorization',
          `${url.searchParams.get('error')}: ${url.searchParams.get('error_description') ?? ''}\n\n` +
          `Scope requested was ${PROBE_SCOPE}. If the error names the scope, a staff login on this ` +
          `instance cannot be granted write, which is a much bigger finding than a config line.`)
      }
      const code = url.searchParams.get('code')
      if (!code) return fail('No authorization code came back', req.url)

      try {
        const tk = await fetch(`${AUTH}/auth/token/`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: WEB_CLIENT_ID,
            client_secret: WEB_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code,
          }),
        })
        const token = await tk.json()
        if (!token.access_token) return fail('Token exchange failed', JSON.stringify(token, null, 2))
        console.log(`[attribution] granted scope: ${token.scope ?? '(none reported)'}`)

        const r = await runAttributionProbe({
          token: token.access_token,
          patientId: PROBE_PATIENT,
        })

        const row = (label, grant, d) => `<tr>
          <td>${label}</td><td><code>${grant}</code></td>
          <td>${d.error ? `<span class="bad">${String(d.error).replace(/</g, '&lt;')}</span>`
                        : `<code>${d.noteKey}</code> ${d.currentState ?? ''}`}</td>
          <td>${d.permalink ? `<a href="${d.permalink}" target="_blank">open &#8599;</a>` : '&mdash;'}</td></tr>`

        res.end(page('Attribution probe', `
          <h1>Who does Canvas record as the author?</h1>
          <p>Granted scope: <code>${(token.scope ?? '(none reported)').replace(/</g, '&lt;')}</code></p>
          <table><tr><th>Token</th><th>Grant</th><th>Note</th><th>Canvas</th></tr>
            ${row('The physician (you)', 'authorization_code', r.staff)}
            ${row('The app', 'client_credentials', r.service)}
          </table>
          <p>Open both. The expected result is that the first carries <strong>your name</strong>
          and the second says <strong>Canvas Bot</strong>. If both say Canvas Bot, attribution does
          not follow the token, and an order cannot be attributed to the logged-in physician from
          outside Canvas.</p>
          ${r.provenance?.length
            ? `<h2>Provenance</h2><pre>${r.provenance.map((p) => `${p.recorded ?? '?'}  ${p.agent ?? '?'}  ${p.target ?? ''}`).join('\n')}</pre>`
            : '<p style="color:#6e6a63">No <code>Provenance</code> rows, so authorship has to be read in the Canvas UI.</p>'}
        `))
      } catch (err) {
        fail('Probe threw', err?.stack ?? String(err))
      }
    })

    server.middlewares.use('/api/token', async (req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end('{"error":"method_not_allowed"}')
      }
      try {
        const { code } = JSON.parse((await readBody(req)) || '{}')
        const upstream = await fetch(`${AUTH}/auth/token/`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: WEB_CLIENT_ID,
            client_secret: WEB_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code,
          }),
        })
        res.statusCode = upstream.status
        res.end(await upstream.text())
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'exchange_failed', detail: String(err) }))
      }
    })
  },
}

// `vite --mode loopback` serves plain HTTP on loopback only, for the Junction
// screens, which need no TLS and no Canvas login. The Tailscale cert is issued
// for HOST alone, so https://localhost fails the name check, and the Canvas app's
// redirect URI is registered against HOST, so /physician and /probe still need
// the default mode. Loopback-only because these routes hold the Junction key.
// Not named `local`: Vite reads `.env.local` and `.env.[mode].local`, so that
// mode name collides with its own env-file suffix.
export default defineConfig(({ mode }) => {
  const local = mode === 'loopback'
  return {
  root: HERE,
  plugins: [react(), canvasAuth],
  server: {
    host: local ? 'localhost' : true,
    port: PORT,
    strictPort: true,
    allowedHosts: local ? ['localhost'] : [HOST],
    https: local ? undefined : {
      key: readFileSync(join(HERE, `${HOST}.key`)),
      cert: readFileSync(join(HERE, `${HOST}.crt`)),
    },
    // Proxy the FHIR calls so the browser never hits the fumage host directly:
    // it has no CORS headers for our origin.
    proxy: {
      '/fhir': {
        target: FHIR,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/fhir/, ''),
        // Without this a proxy-level failure is a bare 500 with an empty body,
        // which tells the page nothing. Forward the reason instead.
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[fhir proxy]', err.message)
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ error: 'proxy_error', detail: err.message }, null, 2))
            }
          })
        },
      },
    },
  },
  }
})
