// Does amending a signed note mint a second DocumentReference, or replace the first?
//
//   node --env-file=script.env documentreference-amendment.mjs
//   node --env-file=script.env documentreference-amendment.mjs --verbose
//   node --env-file=script.env documentreference-amendment.mjs --patient <uuid>
//
// THE QUESTION
//
// Two things are already established and neither answers this.
//
//   1. Canvas's own stateTransitionMatrix, read off GET /api/Note/{noteId},
//      permits SGN -> ULK and names that transition "Amend". So the vendor
//      calls the round trip what we call it.
//   2. API-GROUND-TRUTH.md records that DocumentReference has no update: "A
//      locked note written as a DocumentReference is immutable; an amendment
//      is a new resource."
//
// Together those imply a version chain. They do not prove one. Nobody has run
// SGN -> ULK -> change -> LKD -> SGN and counted what came out. Canvas could
// mint a second document, or skip generation because one already exists for
// that note, or replace it. AL-92 models the legal record as a chain of
// documents where earlier versions stand as superseded, and that model lives
// or dies here.
//
// WHAT COUNTS AS THE ANSWER
//
// The document COUNT is the primary signal, as it was when signing was first
// measured (the count moved 2 -> 3 within five seconds of the first SGN).
// Bytes are secondary and weaker: the Note API exposes no field that edits a
// note's BODY -- title is the only mutable field on the allow-list -- so two
// renderings can legitimately be byte-identical while still being two
// documents. A byte comparison that came back equal would not, on its own,
// mean the amendment was lost.
//
// EVERY RESPONSE IS RECORDED
//
// An earlier version of this probe swallowed a non-JSON response and sent
// noteChecksum: undefined, which Canvas refused 400. From the outside that
// looked exactly like a finding about Canvas. It was a fault in this file.
// So every HTTP call now goes through one wrapper that records method, URL,
// request body and the RAW response text, and the run writes all of it out
// whether it succeeded or not. When something is refused, the refusal is the
// most valuable thing on the screen -- print it, do not summarise it.
//
// It writes to a chart. The patient must be in created-patients.json, the same
// fence the bulk acts use, and every note is titled so `OURS` in vite.config.js
// can reach it with Void all / Delete all.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

const HERE = import.meta.dirname
const AUTH = (process.env.CANVAS_URL ?? '').replace(/\/+$/, '')
const FHIR = AUTH.replace('https://', 'https://fumage-')
const NOTE_API = `${AUTH}/core/api/notes/v1/Note`
const { SCRIPT_CLIENT_ID, SCRIPT_CLIENT_SECRET } = process.env
const VERBOSE = process.argv.includes('--verbose')
// Skip the API path entirely and drive every transition by hand in Canvas.
// Worth a run of its own: it measures the SUPPORTED path rather than the
// undocumented endpoint, so the finding survives Canvas withdrawing the latter.
const FORCE_MANUAL = process.argv.includes('--manual')

if (!AUTH || !SCRIPT_CLIENT_ID || !SCRIPT_CLIENT_SECRET) {
  console.error('script.env needs CANVAS_URL, SCRIPT_CLIENT_ID and SCRIPT_CLIENT_SECRET.')
  console.error('Run with: node --env-file=script.env documentreference-amendment.mjs')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RUN = new Date().toISOString()

const log = { run: RUN, instance: AUTH, steps: [], phases: [], http: [], verdict: null }

// One wrapper, so nothing can fail silently. The raw response text is kept
// even on success: a 200 whose body is not what we assumed is the other way
// this goes wrong.
let TOKEN = null
async function http(label, method, url, body) {
  const started = Date.now()
  const headers = { accept: 'application/json' }
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  let status = 0
  let text = ''
  let transportError = null
  try {
    const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    status = r.status
    text = await r.text()
  } catch (err) {
    transportError = String(err?.cause?.message ?? err?.message ?? err)
  }

  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}

  const record = {
    label,
    method,
    url: url.replace(AUTH, '').replace(FHIR, '{fhir}'),
    requestBody: body ?? null,
    status,
    ok: status >= 200 && status < 300,
    ms: Date.now() - started,
    // The whole point. Trimmed only because an HTML error page can run to
    // kilobytes of Django template.
    responseRaw: transportError ? null : text.slice(0, 4000),
    transportError,
  }
  log.http.push(record)

  if (VERBOSE || !record.ok) {
    console.log(`      ${method} ${record.url} -> ${status || 'TRANSPORT FAIL'}`)
    const shown = transportError ?? (text ? text.slice(0, 700) : '(empty body)')
    for (const line of String(shown).split('\n').slice(0, 12)) console.log(`      | ${line}`)
  }

  return { ...record, json, text }
}

const step = (name, data) => {
  log.steps.push({ name, at: new Date().toISOString(), ...data })
  console.log(`  ${name.padEnd(36)} ${String(data.status ?? '')} ${data.detail ?? ''}`.trimEnd())
  return data
}

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
  const j = await r.json().catch(() => null)
  if (!j?.access_token) throw new Error(`no service token (${r.status}): ${JSON.stringify(j)}`)
  log.grantedScope = j.scope ?? null
  return j.access_token
}

const pkFromPermalink = (permalink) =>
  Number(Buffer.from((permalink ?? '').split('/').pop() ?? '', 'base64').toString().split(':').pop())

const readNote = (noteKey) => http('note read', 'GET', `${NOTE_API}/${noteKey}`)

// The internal read carries the checksum, the state history and the note
// type's own stateTransitionMatrix -- richer than the REST enum.
const readInternal = (noteId) => http('internal note read', 'GET', `${AUTH}/api/Note/${noteId}`)

// Locking is the DOCUMENTED route and the measured one: 11 notes locked by
// PATCH {"stateChange":"LKD"} answered 200. Use it rather than the
// undocumented endpoint, which is only needed for the states the REST enum
// cannot reach.
async function lock(noteKey) {
  const r = await http('lock LKD', 'PATCH', `${NOTE_API}/${noteKey}`, { stateChange: 'LKD' })
  return { ok: r.ok, status: r.status, state: 'LKD', detail: r.json?.currentState ?? (r.ok ? null : r.text.slice(0, 200)) }
}

// POST /api/NoteStateChangeEvent/ is undocumented as an HTTP endpoint. It is
// how the Canvas UI moves a note, it accepts this token, and the v1 REST API
// reaches neither SGN nor ULK. The checksum is read immediately before the
// write because a stale one is refused 409 "This note is out of date".
async function stateChange(noteKey, state) {
  const note = await readNote(noteKey)
  if (!note.json?.permalink) {
    return { ok: false, status: note.status, state, detail: `no permalink on the note read (${note.status}), so no noteId to address` }
  }
  const noteId = pkFromPermalink(note.json.permalink)
  if (!Number.isFinite(noteId)) {
    return { ok: false, status: 0, state, detail: `could not derive a noteId from permalink ${note.json.permalink}` }
  }

  const current = await readInternal(noteId)
  if (!current.json) {
    return { ok: false, status: current.status, state, detail: `GET /api/Note/${noteId} returned no JSON (${current.status}); see the http log for the body` }
  }
  // MEASURED 15 Sep 2026: on a note created through the Note API, `checksum`
  // is present and is an EMPTY STRING, and both transition routes reject a
  // blank one -- PATCH {stateChange} answers
  // 400 {"noteChecksum":["This field may not be blank."]}.
  // Recorded here rather than worked around: sending a guessed value would
  // either be refused or, worse, accepted against a checksum that means
  // nothing. The manual path is the way through until this is understood.
  if (current.json.checksum === '') {
    log.emptyChecksum = true
    return {
      ok: false,
      status: current.status,
      state,
      detail: `/api/Note/${noteId} carries checksum:"" (empty). Both state-change routes reject a blank checksum, so neither can move this note over HTTP.`,
    }
  }
  if (!current.json.checksum) {
    return { ok: false, status: current.status, state, detail: `no checksum field on /api/Note/${noteId}. Keys present: ${Object.keys(current.json).join(', ').slice(0, 300)}` }
  }

  const r = await http(`stateChange ${state}`, 'POST', `${AUTH}/api/NoteStateChangeEvent/`, {
    noteId, state, noteChecksum: current.json.checksum,
  })
  return { ok: r.ok, status: r.status, state, detail: r.json?.display ?? r.json?.detail ?? (r.ok ? null : r.text.slice(0, 300)) }
}

async function setTitle(noteKey, title) {
  const r = await http('set title', 'PATCH', `${NOTE_API}/${noteKey}`, { title })
  return { ok: r.ok, status: r.status, title: r.json?.titleDisplay ?? r.json?.title ?? null, state: r.json?.currentState }
}

// ---- getting a note into a state, by API or by hand ---------------------
//
// The API path leans on POST /api/NoteStateChangeEvent/, which Canvas has not
// promised to keep. The question this probe asks is about Canvas's behaviour,
// not about which endpoint triggers it, so a refusal there must not end the
// run: it should hand the transition to a human and carry on measuring.
//
// That also makes the finding stronger. A result obtained by clicking Sign in
// the Canvas UI is a result on the SUPPORTED path, and is worth more than one
// that only holds while an undocumented endpoint keeps working.

const rl = () => createInterface({ input: process.stdin, output: process.stdout })

async function pause(question) {
  const i = rl()
  try { await i.question(`\n${question}\n      press Enter when done > `) } finally { i.close() }
}

// currentState lives on the Note API read. The internal /api/Note/{id} read
// has `state` instead, which is a human sentence ("Canvas Bot created this
// note on ..."), and `isLocked`. Reading the wrong one reports "?" forever.
async function currentState(noteKey) {
  const r = await readNote(noteKey)
  return r.json?.currentState ?? null
}

// LKD is a rung on a ladder, not a destination. A note at SGN has been locked
// -- signing requires it -- so a step that wanted LKD is satisfied. An earlier
// version compared for equality and reported a successful manual sign as a
// failure to lock. ULK and SGN are exact: ULK is a step backwards from SGN, so
// "at least ULK" would mean nothing.
function satisfies(current, target) {
  if (current === target) return true
  if (target === 'LKD') return current === 'SGN'
  return false
}

// Try the API, fall back to the UI, then VERIFY. Never take either path's word
// for it: re-read the note and confirm the state actually moved, because a
// 200 that changed nothing and a click that did not land look identical from
// here otherwise.
async function ensureState(noteKey, target, { apiCall, uiAction }) {
  const before = await currentState(noteKey)
  if (satisfies(before, target)) {
    return { ok: true, path: 'already', state: before, detail: `already ${before}${before === target ? '' : `, which satisfies ${target}`}` }
  }

  let attempt = null
  if (!FORCE_MANUAL) {
    attempt = await apiCall()
    if (attempt.ok) {
      const after = await currentState(noteKey)
      if (satisfies(after, target)) return { ok: true, status: attempt.status, path: 'api', detail: `${before} -> ${after} over the API` }
      // A 2xx that did not move the note is its own finding, and the one this
      // probe would otherwise mistake for success.
      return { ok: false, status: attempt.status, path: 'api', detail: `the API answered ${attempt.status} but the note is still ${after}` }
    }
  }

  const why = FORCE_MANUAL ? '--manual was passed' : `the API refused it (${attempt.status}: ${attempt.detail ?? 'no detail'})`
  await pause(
    `  MANUAL STEP - ${why}.\n` +
    `      Open:   ${log.permalink ?? '(no permalink)'}\n` +
    `      Do:     ${uiAction}\n` +
    `      Note is ${before} and needs to reach ${target}.` +
    (target === 'LKD' ? '\n      (SGN also satisfies this step: signing requires the lock.)' : ''),
  )

  const after = await currentState(noteKey)
  if (satisfies(after, target)) {
    return { ok: true, status: 'manual', path: 'manual', detail: `${before} -> ${after} in the Canvas UI` }
  }
  return { ok: false, status: 'manual', path: 'manual', detail: `still ${after} after the manual step; needed ${target}` }
}

// Returns BOTH the patient-wide total and the subset correlated to this note.
// Correlation is time: a note PDF's DocumentReference carries
// context.period.start equal to the note's datetimeOfService, compared as
// instants (the Note API renders ...737000Z, FHIR renders ...737000+00:00).
//
// Every match, never .find(). A second document for the same note carries the
// SAME period.start, so .find() would return the original and hide the new one
// -- reporting "nothing changed" in exactly the case where the chain worked.
// The /api/note pdf op in vite.config.js has that bug today.
async function documents(note) {
  const r = await http('documents', 'GET',
    `${FHIR}/DocumentReference?patient=${note.patientKey}&category=clinical-note&_count=200`)
  const all = (r.json?.entry ?? []).map((e) => e.resource)
  const at = Date.parse(note.datetimeOfService)
  const mine = all
    .filter((d) => Date.parse(d.context?.period?.start ?? '') === at)
    .map((d) => ({
      id: d.id,
      status: d.status,
      docStatus: d.docStatus,
      date: d.date,
      lastUpdated: d.meta?.lastUpdated,
      versionId: d.meta?.versionId,
      contentType: d.content?.[0]?.attachment?.contentType,
      creation: d.content?.[0]?.attachment?.creation,
    }))
    .sort((a, b) => String(a.date ?? a.lastUpdated).localeCompare(String(b.date ?? b.lastUpdated)))
  return { patientTotal: r.json?.total ?? all.length, mine, readOk: r.ok }
}

async function waitFor(note, atLeast, seconds = 60) {
  const started = Date.now()
  for (;;) {
    const d = await documents(note)
    if (d.mine.length >= atLeast) return { ...d, waitedMs: Date.now() - started }
    if (Date.now() - started > seconds * 1000) return { ...d, waitedMs: Date.now() - started, timedOut: true }
    await sleep(2500)
  }
}

async function pdfDigest(docId) {
  // Bytes, not JSON, so this one does not use the wrapper.
  const r = await fetch(`${FHIR}/DocumentReference/${docId}/files/content`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  log.http.push({ label: 'pdf bytes', method: 'GET', url: `{fhir}/DocumentReference/${docId}/files/content`, status: r.status, ok: r.ok, responseRaw: '(binary)' })
  if (!r.ok) return { retrievable: false, status: r.status }
  const bytes = Buffer.from(await r.arrayBuffer())
  return {
    retrievable: true,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
    looksLikePdf: bytes.subarray(0, 4).toString() === '%PDF',
  }
}

function fixturePatient(explicit) {
  let roster
  try {
    roster = JSON.parse(readFileSync(join(HERE, 'created-patients.json'), 'utf8'))
  } catch {
    throw new Error('created-patients.json is unreadable, so no patient can be confirmed as a fixture. Run: npm run create-patients')
  }
  const ids = Object.values(roster).map((p) => p?.id).filter(Boolean)
  if (explicit) {
    if (!ids.includes(explicit)) throw new Error(`${explicit} is not in created-patients.json; this script only writes to fixture patients`)
    return explicit
  }
  if (!ids.length) throw new Error('created-patients.json has no patients')
  return ids[0]
}

async function main() {
  const patientId = fixturePatient(process.argv.includes('--patient') ? process.argv[process.argv.indexOf('--patient') + 1] : null)
  log.patient = patientId

  console.log('\nDocumentReference amendment probe')
  console.log(`instance ${AUTH}`)
  console.log(`patient  ${patientId}`)
  console.log(VERBOSE ? 'verbose: every response body is printed\n' : 'every response is recorded; failures print inline. --verbose prints all.\n')

  TOKEN = await serviceToken()
  step('0 service token', { status: 'ok', detail: `scope ${log.grantedScope ?? '(not reported)'}` })

  const [pr, loc] = await Promise.all([
    http('practitioner', 'GET', `${FHIR}/Practitioner?_count=1`),
    http('location', 'GET', `${FHIR}/Location?_count=1`),
  ])
  const providerKey = pr.json?.entry?.[0]?.resource?.id
  const practiceLocationKey = loc.json?.entry?.[0]?.resource?.id
  if (!providerKey || !practiceLocationKey) throw new Error(`no Practitioner (${providerKey}) or Location (${practiceLocationKey}) to reference`)

  const ORIGINAL = `Aleron amendment probe ${RUN} - ORIGINAL`
  const AMENDED = `Aleron amendment probe ${RUN} - AMENDED, the original must survive`

  const created = await http('create note', 'POST', NOTE_API, {
    patientKey: patientId, providerKey, practiceLocationKey,
    noteTypeName: 'Office visit',
    encounterStartTime: new Date().toISOString(),
    title: ORIGINAL,
  })
  if (!created.json?.noteKey) throw new Error(`note create failed (${created.status}): ${created.text.slice(0, 400)}`)
  const noteKey = created.json.noteKey
  const noteId = pkFromPermalink(created.json.permalink)
  Object.assign(log, { noteKey, noteId, permalink: created.json.permalink ? AUTH + created.json.permalink : null })
  step('1 create', { status: created.status, detail: `${noteKey} (id ${noteId})` })

  // Read the internal note BEFORE any transition. If this is not JSON, or
  // carries no checksum, every state change below will fail and the reason is
  // here rather than in Canvas.
  // The matrix is nested under noteTypeVersionInfo, not at the top level.
  const pre = await readInternal(noteId)
  const matrix = pre.json?.noteTypeVersionInfo?.stateTransitionMatrix ?? null
  log.stateTransitionMatrix = matrix
  log.checksumOnFreshNote = pre.json ? JSON.stringify(pre.json.checksum) : null
  step('2 internal note read', {
    status: pre.status,
    detail: pre.json
      ? `checksum=${JSON.stringify(pre.json.checksum)}, isLocked=${pre.json.isLocked}, matrix ${matrix ? 'present' : 'absent'}`
      : 'NOT JSON - see the body above',
  })
  if (pre.json && pre.json.checksum === '') {
    console.log('      note: an empty checksum blocks BOTH state-change routes. Expect the manual path.')
  }
  if (matrix?.SGN) {
    step('   matrix: from SGN', { status: matrix.SGN.map((t) => `${t.label}->${t.state}`).join(', ') })
  }

  const baselineNote = (await readNote(noteKey)).json
  const baseline = await documents(baselineNote)
  step('3 baseline documents', { status: `${baseline.mine.length} for this note`, detail: `${baseline.patientTotal} on the patient` })

  const lock1 = await ensureState(noteKey, 'LKD', {
    apiCall: () => lock(noteKey),
    uiAction: 'click Lock on the note',
  })
  step('4 lock -> LKD', { status: lock1.path, detail: lock1.detail })
  if (!lock1.ok) {
    log.verdict = `CANNOT PROCEED - the note would not reach LKD (${lock1.detail}). Nothing downstream is measurable.`
    return finish()
  }

  const sign1 = await ensureState(noteKey, 'SGN', {
    apiCall: () => stateChange(noteKey, 'SGN'),
    uiAction: 'click Sign on the note',
  })
  step('5 sign -> SGN', { status: sign1.path, detail: sign1.detail })
  log.firstSignPath = sign1.path
  if (!sign1.ok) {
    log.verdict = `CANNOT PROCEED - the note would not reach SGN (${sign1.detail}). Without a signature there is no document to amend. Response bodies are in the http log.`
    return finish()
  }

  const afterSign = await readInternal(noteId)
  log.checksumAfterSign = afterSign.json ? JSON.stringify(afterSign.json.checksum) : null
  log.stateHistory = afterSign.json?.stateHistory?.map((h) => ({ state: h.state, display: h.display, created: h.created })) ?? null
  step('6 after signing', {
    status: afterSign.status,
    detail: `checksum=${log.checksumAfterSign}, isLocked=${afterSign.json?.isLocked}, ${log.stateHistory?.length ?? 0} history rows`,
  })

  const note = (await readNote(noteKey)).json
  const first = await waitFor(note, baseline.mine.length + 1)
  step('7 documents after first sign', {
    status: `${first.mine.length} for this note`,
    detail: `${first.patientTotal} on patient, waited ${Math.round(first.waitedMs / 1000)}s${first.timedOut ? ', TIMED OUT' : ''}`,
  })
  log.phases.push({ phase: 'after first sign', patientTotal: first.patientTotal, documents: first.mine })

  if (!first.mine.length) {
    log.verdict = 'INCONCLUSIVE - the first signature succeeded but produced no DocumentReference within the wait, so there is nothing to amend. That contradicts the recorded measurement that signing generates the PDF; re-run before believing it.'
    return finish()
  }
  const doc1 = first.mine[first.mine.length - 1]
  const doc1Bytes = await pdfDigest(doc1.id)
  log.firstDocument = { ...doc1, ...doc1Bytes }
  step('   first document', { status: doc1.id, detail: `status=${doc1.status} sha=${doc1Bytes.sha256 ?? 'n/a'}` })

  // Regression check on a recorded finding, not a discovery: PATCH {title}
  // already answered 200 on 17 notes including two at SGN.
  const sneak = await setTitle(noteKey, `${ORIGINAL} [edited while SGN]`)
  log.editWhileSigned = sneak
  step('8 PATCH title while SGN', {
    status: sneak.status,
    detail: sneak.ok ? 'accepted - matches the recorded finding that signing does not settle the title' : 'REFUSED - the recorded finding has changed',
  })

  const unlock = await ensureState(noteKey, 'ULK', {
    apiCall: () => stateChange(noteKey, 'ULK'),
    uiAction: 'click Amend on the note (Canvas names the SGN -> ULK transition "Amend")',
  })
  step('9 amend -> ULK', { status: unlock.path, detail: unlock.detail })
  log.amendPath = unlock.path
  if (!unlock.ok) {
    log.verdict = `REFUTED AT THE FIRST STEP - the note would not reach ULK from SGN (${unlock.detail}), though Canvas's own stateTransitionMatrix lists that transition as Amend. Unlock-change-relock is unavailable${unlock.path === 'manual' ? ' even in the Canvas UI' : ' over HTTP'}, so AL-92 needs a different mechanism.`
    return finish()
  }

  step('10 change the title', await setTitle(noteKey, AMENDED))

  const lock2 = await ensureState(noteKey, 'LKD', {
    apiCall: () => lock(noteKey),
    uiAction: 'click Lock on the note again',
  })
  step('11 relock -> LKD', { status: lock2.path, detail: lock2.detail })
  if (!lock2.ok) {
    log.verdict = `PARTIAL - the note unlocked and took the change, then would not relock (${lock2.detail}). An amended note that cannot be re-frozen is a worse record than one never amended.`
    return finish()
  }

  const sign2 = await ensureState(noteKey, 'SGN', {
    apiCall: () => stateChange(noteKey, 'SGN'),
    uiAction: 'click Sign on the note again',
  })
  step('12 re-sign -> SGN', { status: sign2.path, detail: sign2.detail })
  log.reSignPath = sign2.path
  if (!sign2.ok) {
    log.verdict = `PARTIAL - the note unlocked, took the change and relocked, but the RE-SIGN failed (${sign2.detail}). The record is left locked and unsigned, which is worse than not amending at all.`
    return finish()
  }

  const note2 = (await readNote(noteKey)).json
  const second = await waitFor(note2, first.mine.length + 1)
  step('13 documents after re-sign', {
    status: `${second.mine.length} for this note`,
    detail: `${second.patientTotal} on patient, waited ${Math.round(second.waitedMs / 1000)}s${second.timedOut ? ', TIMED OUT' : ''}`,
  })
  for (const d of second.mine) Object.assign(d, await pdfDigest(d.id))
  log.phases.push({ phase: 'after re-sign', patientTotal: second.patientTotal, documents: second.mine })

  const survivor = second.mine.find((d) => d.id === doc1.id)
  log.originalStillListed = Boolean(survivor)
  log.originalStillRetrievable = survivor?.retrievable ?? false
  log.originalBytesUnchanged = survivor?.retrievable ? survivor.sha256 === doc1Bytes.sha256 : null
  log.documentDelta = second.mine.length - first.mine.length
  log.patientTotalDelta = second.patientTotal - first.patientTotal

  const newOnes = second.mine.filter((d) => d.id !== doc1.id)
  const distinctBytes = newOnes.some((d) => d.retrievable && d.sha256 !== doc1Bytes.sha256)

  if (log.documentDelta >= 1 && survivor && log.originalStillRetrievable && log.originalBytesUnchanged) {
    log.verdict = `CONFIRMED - a version chain. The re-sign minted ${log.documentDelta} further DocumentReference(s); the original ${doc1.id} is still listed, still retrievable and byte-identical. AL-92's amendment model holds.` +
      (distinctBytes
        ? ' The new document differs from the original in its bytes.'
        : ' NOTE: the new document is byte-identical, which is expected - the Note API exposes no field that edits a note body, so only the title changed and it may not be rendered. The COUNT is the finding; the bytes are not evidence either way.')
  } else if (log.documentDelta >= 1 && survivor && log.originalStillRetrievable && log.originalBytesUnchanged === false) {
    log.verdict = `PARTIAL - ${log.documentDelta} further document(s) exist and the original id survives, but the original's BYTES CHANGED. The id is stable while the content is not, so an earlier version is not a faithful record of what was signed at the time. AL-92 needs the content pinned, not only the id.`
  } else if (log.documentDelta >= 1 && !survivor) {
    log.verdict = `REFUTED - the re-sign REPLACED the document. The original ${doc1.id} is gone; ${newOnes.map((d) => d.id).join(', ')} stands in its place. Unlock-change-relock destroys the earlier version, so AL-92 cannot be built on it.`
  } else if (log.documentDelta === 0 && survivor) {
    log.verdict = `REFUTED - the re-sign produced NO second document. One id (${doc1.id}), bytes ${log.originalBytesUnchanged ? 'unchanged' : 'CHANGED IN PLACE'}. There is no version chain: ${log.originalBytesUnchanged ? 'the amendment left no trace in the legal record at all' : 'the amendment silently overwrote the record of what was signed'}.`
  } else if (!second.mine.length) {
    log.verdict = 'REFUTED - no documents at all after the re-sign, including the one that existed before it. The amendment removed the record.'
  } else {
    log.verdict = `UNEXPECTED - ${second.mine.length} documents, delta ${log.documentDelta}, original ${survivor ? 'present' : 'absent'}. Read the phases array and decide by hand.`
  }

  finish()
}

function finish() {
  const out = join(HERE, 'documentreference-amendment.json')
  writeFileSync(out, JSON.stringify(log, null, 2))

  const failures = log.http.filter((h) => !h.ok)
  if (failures.length) {
    console.log(`\n--- ${failures.length} call(s) were refused ---`)
    for (const f of failures) {
      console.log(`\n${f.method} ${f.url} -> ${f.status || 'TRANSPORT FAIL'}`)
      if (f.requestBody) console.log(`sent: ${JSON.stringify(f.requestBody).slice(0, 300)}`)
      console.log(f.transportError ?? (f.responseRaw ? f.responseRaw.slice(0, 900) : '(empty body)'))
    }
  }

  console.log(`\n${'='.repeat(74)}`)
  console.log(log.verdict)
  console.log('='.repeat(74))
  if (log.noteKey) {
    console.log(`\nNote ${log.noteKey}${log.permalink ? `\n${log.permalink}` : ''}`)
    console.log('Titled "Aleron amendment probe ...", so Void all / Delete all on /notes will reach it.')
  }
  const paths = [log.firstSignPath, log.amendPath, log.reSignPath].filter(Boolean)
  if (paths.length) {
    console.log(`\nTransitions taken: first sign ${log.firstSignPath ?? '-'}, amend ${log.amendPath ?? '-'}, re-sign ${log.reSignPath ?? '-'}.`)
    if (paths.includes('manual')) {
      console.log('At least one ran in the Canvas UI, so this result holds on the supported path,')
      console.log('not only on the undocumented endpoint. Worth saying in the finding.')
    }
  }
  console.log(`\n${log.http.length} calls recorded in ${out}\n`)
}

main().catch((err) => {
  log.verdict = `ERROR - ${String(err?.message ?? err)}`
  console.error(`\n${log.verdict}`)
  if (err?.stack) console.error(err.stack)
  finish()
  process.exit(1)
})
