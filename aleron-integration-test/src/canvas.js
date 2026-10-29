// All Canvas API talk lives here, so the components stay pure view code.

// Canvas requires a launch context on /auth/authorize/. Include the patient key
// ONLY when there is a real patient: a token minted from {"patient":""} fails
// every FHIR read with
//   "Patient key from introspected token must be defined if provided"
// An absent key is fine; an empty one is not. (Canvas's docs use {"patient":""}
// as the staff example, which produces exactly that broken token.)
const launchContext = (patientId) =>
  btoa(JSON.stringify(patientId ? { patient: patientId } : {}))

// The two routes get their tokens in different ways:
//   physician  authorization_code, user/*.read, launch {}  — a real staff login
//   patient    client_credentials + patient=<id>           — no browser login exists
//
// Canvas has a patient portal (/app/login-form) but it is a closed Canvas-hosted
// app, not an OAuth identity provider: there is no patient-facing authorize
// endpoint to redirect to. Patient-scoped tokens come from client_credentials
// with a patient id instead.
export const ROLES = {
  physician: {
    title: 'Physician app',
    blurb: 'Staff token via authorization_code. Expected to read every patient in the instance.',
    // Write is here for the attribution probe, which asks the question this
    // whole integration rests on: a note written with this token should be
    // recorded as the physician, where the app's own client_credentials token
    // is recorded as Canvas Bot. Canvas must have the scope registered on the
    // web app first, or /auth/authorize/ refuses the whole request.
    scope: 'user/*.read user/Note.write',
    launch: launchContext,
  },
  patient: {
    title: 'Patient scoping test',
    blurb: 'Patient-scoped token. Expected to read only its own subject and be refused on everyone else.',
  },
}

export const fetchConfig = () => fetch('/api/config').then((r) => r.json())

export async function fetchRoster() {
  const res = await fetch('/created-patients.json')
  // When the file is missing, Vite's SPA fallback answers 200 with index.html,
  // so a failed parse is the real "not created yet" signal.
  if (!res.ok) return []
  const json = await res.json().catch(() => null)
  return Object.values(json ?? {})
}

// Only the physician route redirects: patient-scoped tokens are minted
// server-side instead.
export function beginLogin(role, cfg) {
  const state = crypto.randomUUID()
  sessionStorage.setItem('state', state)
  sessionStorage.setItem('role', role)

  const query = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: ROLES[role].scope,
    state,
    launch: ROLES[role].launch(),
  })
  location.href = `${cfg.authBase}/auth/authorize/?${query}`
}

// Returns the whole token response so the caller can show the scope Canvas
// actually granted rather than the one we asked for.
export async function mintPatientToken(patientId) {
  const res = await fetch('/api/patient-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ patientId }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(`Patient token request failed:\n${JSON.stringify(body, null, 2)}`)
  }
  return body
}

export async function exchangeCode(code) {
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(`Token exchange failed:\n${JSON.stringify(body, null, 2)}`)
  }
  // The whole body, not just the token: `patient` tells us which patient the
  // token is bound to, which on a patient login is decided by who logged in.
  return body
}

const authed = (token) => ({ authorization: `Bearer ${token}`, accept: 'application/json' })

// Whatever came back on a non-OK response, in the most readable form available.
// A refusal is expected on the patient route, but a 4xx/5xx we did not predict
// is the whole reason to look, so keep the body rather than just the status.
async function errorDetail(res) {
  const text = await res.text().catch(() => '')
  if (!text) return `${res.status} ${res.statusText} (empty body)`
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

// Read every patient one at a time, then the collection, and judge each result
// against what this token is supposed to be able to see.
export async function probe(token, patients, subject) {
  const rows = []
  for (const patient of patients) {
    const res = await fetch(`/fhir/Patient/${patient.id}`, { headers: authed(token) })
    const readable = res.ok
    // A scoped token should reach its subject and nothing else.
    // An unscoped staff token should reach everything.
    const expected = subject ? patient.id === subject : true
    rows.push({
      ...patient,
      status: res.status,
      readable,
      ok: readable === expected,
      detail: readable ? null : await errorDetail(res),
    })
  }

  const res = await fetch('/fhir/Patient', { headers: authed(token) })
  const bundle = res.ok ? await res.json() : null

  return {
    rows,
    search: {
      status: res.status,
      total: bundle?.total ?? bundle?.entry?.length ?? null,
      detail: res.ok ? null : await errorDetail(res),
    },
  }
}
