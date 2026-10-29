// Bulk-create Canvas test patients from patients.csv.
//   node --env-file=script.env create-patients.mjs
//   node create-patients.mjs --selftest
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const IDENTIFIER_SYSTEM = 'aleron-test'
const USCORE = 'http://hl7.org/fhir/us/core/StructureDefinition/'
const CANVAS_EXT = 'http://schemas.canvasmedical.com/fhir/extensions/'
const OMB = 'urn:oid:2.16.840.1.113883.6.238'

// CDC Race & Ethnicity codes used by patients.csv. Canvas wants code + display.
const RACE = {
  '2106-3': 'White',
  '2054-5': 'Black or African American',
  '2028-9': 'Asian',
  '2131-1': 'Other Race',
}
const ETHNICITY = {
  '2186-5': 'Not Hispanic or Latino',
  '2135-2': 'Hispanic or Latino',
}

function ombExtension(url, code, display) {
  return {
    url,
    extension: [
      { url: 'ombCategory', valueCoding: { system: OMB, code, display } },
      { url: 'text', valueString: display }, // US Core requires text alongside ombCategory
    ],
  }
}

// has-consent marks the contact verified, which suppresses the verification
// email/SMS Canvas would otherwise send to these fake addresses.
function contactPoint(system, value, use) {
  return {
    system,
    value,
    use,
    rank: 1,
    extension: [{ url: `${CANVAS_EXT}has-consent`, valueBoolean: true }],
  }
}

function toPatient(r) {
  const extension = [{ url: `${USCORE}us-core-birthsex`, valueCode: r.birthsex }]
  if (RACE[r.race]) {
    extension.push(ombExtension(`${USCORE}us-core-race`, r.race, RACE[r.race]))
  }
  if (ETHNICITY[r.ethnicity]) {
    extension.push(ombExtension(`${USCORE}us-core-ethnicity`, r.ethnicity, ETHNICITY[r.ethnicity]))
  }

  return {
    resourceType: 'Patient',
    extension,
    // No MRN here: Canvas auto-issues it and rejects one on create. This is our
    // own correlation id, which also gives the script its search-before-create.
    identifier: [{ use: 'usual', system: IDENTIFIER_SYSTEM, value: r.identifier }],
    active: true,
    name: [{ use: 'official', family: r.last, given: [r.first, r.middle].filter(Boolean) }],
    telecom: [
      contactPoint('phone', r.phone, 'mobile'),
      contactPoint('email', r.email, 'home'),
    ],
    gender: r.gender,
    birthDate: r.birthDate,
    address: [{
      use: 'home',
      type: 'both',
      line: [r.line1],
      city: r.city,
      state: r.state,
      postalCode: r.postalCode,
      country: 'us',
    }],
    communication: [{
      language: { coding: [{ system: 'urn:ietf:bcp:47', code: 'en', display: 'English' }], text: 'English' },
    }],
  }
}

function parseCsv(text) {
  // ponytail: naive split — patients.csv has no quoted or embedded commas.
  // Swap in a real CSV parser if the fixture ever grows them.
  const [header, ...rows] = text.trim().split(/\r?\n/)
  const cols = header.split(',')
  return rows.map((line) => {
    const cells = line.split(',')
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()]))
  })
}

async function getToken(auth, id, secret) {
  const res = await fetch(`${auth}/auth/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
      // read is needed for search-before-create; write is needed for POST.
      scope: 'user/*.read user/*.write',
    }),
  })
  if (!res.ok) throw new Error(`token request failed ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

async function findExisting(fhir, token, identifier) {
  const q = encodeURIComponent(`${IDENTIFIER_SYSTEM}|${identifier}`)
  const res = await fetch(`${fhir}/Patient?identifier=${q}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  // A 403 here just means the app has no read scope — fall through and create.
  if (!res.ok) return null
  const bundle = await res.json()
  return bundle.entry?.[0]?.resource?.id ?? null
}

async function main() {
  const { SCRIPT_CLIENT_ID, SCRIPT_CLIENT_SECRET, CANVAS_URL } = process.env
  if (!SCRIPT_CLIENT_ID || !SCRIPT_CLIENT_SECRET || !CANVAS_URL) {
    throw new Error('script.env must set SCRIPT_CLIENT_ID, SCRIPT_CLIENT_SECRET and CANVAS_URL')
  }

  // Tokens come from the EMR host; FHIR lives on the fumage- host.
  const auth = CANVAS_URL.replace(/\/+$/, '')
  const fhir = auth.replace('https://', 'https://fumage-')

  const records = parseCsv(readFileSync(new URL('patients.csv', import.meta.url), 'utf8'))
  const token = await getToken(auth, SCRIPT_CLIENT_ID, SCRIPT_CLIENT_SECRET)

  const created = {}
  for (const r of records) {
    const label = `${r.first} ${r.last}`

    const existing = await findExisting(fhir, token, r.identifier)
    if (existing) {
      console.log(`= ${label} already exists — ${existing}`)
      created[r.identifier] = { name: label, id: existing }
      continue
    }

    const res = await fetch(`${fhir}/Patient`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(toPatient(r)),
    })
    if (res.status !== 201) {
      console.error(`x ${label} failed ${res.status}: ${await res.text()}`)
      continue
    }
    // 201 comes back with an empty body; the new uuid is in the Location header.
    const id = res.headers.get('location').split('/').filter(Boolean).pop()
    console.log(`+ ${label} created — ${id}`)
    created[r.identifier] = { name: label, id }
  }

  const out = new URL('created-patients.json', import.meta.url)
  writeFileSync(out, `${JSON.stringify(created, null, 2)}\n`)
  console.log(`\n${Object.keys(created).length}/${records.length} patients in created-patients.json`)
}

function selftest() {
  const rows = parseCsv(readFileSync(new URL('patients.csv', import.meta.url), 'utf8'))
  assert.equal(rows.length, 5, 'expected 5 fixture patients')

  const priya = rows.find((r) => r.first === 'Priya')
  assert.equal(priya.middle, '', 'Priya row has an empty middle name')
  assert.equal(
    toPatient(priya).name[0].given.length,
    1,
    'an empty middle name must not produce a blank given entry',
  )

  const p = toPatient(rows[0])
  assert.equal(p.name[0].given.length, 2, 'first + middle become two given names')
  assert.equal(p.name.filter((n) => n.use === 'official').length, 1, 'exactly one official name')
  assert.ok(
    p.extension.some((e) => e.url.endsWith('us-core-birthsex') && e.valueCode === 'F'),
    'us-core-birthsex is required on create',
  )
  assert.ok(
    !p.identifier.some((i) => /mrn/i.test(i.system)),
    'must not send an MRN — Canvas auto-issues it',
  )
  assert.ok(
    p.telecom.every((t) => t.extension[0].url.endsWith('has-consent')),
    'has-consent suppresses verification messages to fake contacts',
  )
  assert.match(p.birthDate, /^\d{4}-\d{2}-\d{2}$/, 'birthDate must be YYYY-MM-DD')
  assert.ok(rows.every((r) => /^\d{10}$/.test(r.phone)), 'phones must be bare 10 digits')
  assert.ok(rows.every((r) => /^[A-Z]{2}$/.test(r.state)), 'state must be a 2-letter abbreviation')
  assert.ok(rows.every((r) => /^\d{5}$/.test(r.postalCode)), 'postalCode must be 5 digits')
  assert.ok(
    rows.every((r) => ['male', 'female', 'other', 'unknown'].includes(r.gender)),
    'gender must be in the FHIR value set',
  )
  assert.ok(
    rows.every((r) => ['M', 'F', 'OTH', 'UNK'].includes(r.birthsex)),
    'birthsex must be in the US Core value set',
  )
  assert.ok(rows.every((r) => RACE[r.race] && ETHNICITY[r.ethnicity]), 'race/ethnicity codes must be known')

  console.log('selftest ok')
}

if (process.argv.includes('--selftest')) selftest()
else await main()
