# Canvas EMR access tests

Two things: a script that bulk-creates 5 test patients, and a web app that checks
whether a token scoped to one patient can reach another.

## Canvas gotchas this codebase already handles

- **Two hosts.** Tokens come from `https://<instance>.canvasmedical.com/auth/token/`;
  FHIR lives on `https://fumage-<instance>.canvasmedical.com`. Trailing slashes on
  the auth paths are required (Canvas is Django).
- **One grant type per Canvas app**, so client_credentials and authorization_code
  need two separate registrations — hence `script.env` and `web.env`.
- `us-core-birthsex` is required on patient create. `POST /Patient` returns `201`
  with an **empty body**; the uuid is in the `Location` header.
- Don't send an MRN — Canvas auto-issues it.
- Staff authorization needs a `launch` parameter or it fails with `access_denied`.
- **Send `launch` as base64 `{}` for staff, not `{"patient":""}`.** The docs use the
  latter as their staff example, but it mints a token whose patient key is present
  and empty, and every FHIR read then fails with
  `Patient key from introspected token must be defined if provided`. Absent is fine;
  empty is not.
- The client is Confidential and PKCE is unsupported, so the code→token exchange
  runs in the Vite dev server, not the browser.

## Node version

Requires Node `^22.21.1 || >=24.9.0` (enforced by `engines` in `package.json`).

Node **22.21.0 specifically** crashes this server on the first browser load with
`TypeError: server.shouldUpgradeCallback is not a function`. That release backported
the `shouldUpgradeCallback` hook to `http.Server` but not to `Http2SecureServer`,
which is what Vite uses whenever `server.https` is set — so the first request
carrying an `Upgrade` header (the `/@vite/client` WebSocket handshake) kills the
process. See [nodejs/node#59924](https://github.com/nodejs/node/pull/59924).

```bash
nvm use 24.15.0
```

## Setup

Register two apps at `https://aleronmd-dev.canvasmedical.com/auth/applications/`,
both **Confidential**, Algorithm "No OIDC support":

| App | Grant type | Scopes | Redirect URI |
| --- | --- | --- | --- |
| script | Client credentials | `user/*.read user/*.write` | — |
| web | Authorization code | `user/*.read patient/*.read` | `https://maple-desktop.tailfc79a9.ts.net:5173/callback` |

Then fill the env files:

```
script.env   SCRIPT_CLIENT_ID, SCRIPT_CLIENT_SECRET, CANVAS_URL
web.env      WEB_CLIENT_ID, WEB_CLIENT_SECRET
```

## Create the patients

Edit `patients.csv` if you want different fixtures, then:

```bash
npm run create-patients
```

Writes `created-patients.json` (identifier → name + uuid), which the web app reads.
Re-runs are idempotent: the script searches `?identifier=aleron-test|<id>` first.

`npm run selftest` checks the CSV against the documented value sets and the FHIR
body builder, without touching the network.

## Run the app

```bash
npm run dev
```

HTTPS comes from the Tailscale cert files in this folder. Open
`https://maple-desktop.tailfc79a9.ts.net:5173`.

- **`/physician`** — `authorization_code`, `user/*.read`, `launch` = base64 `{}`.
  A real staff login. Expected to read all 5 patients.
- **`/patient`** — `client_credentials` + `patient=<id>` + `patient/Patient.read`,
  minted server-side via `/api/patient-token`. No login, so you pick the subject.
  Expected to read that patient and be refused on the other 4.
- **`/notes`** — create a note, lock it, sign it, then retrieve the PDF. Four
  buttons, all going through `/api/note` with the app's `client_credentials` token, which
  is the grant [the Note API documents](https://docs.canvasmedical.com/api/note/);
  a physician's `authorization_code` token is answered `403` there, and the
  clinician is named by `providerKey` instead.

  The order matters: **signing is what produces the PDF, not locking**, and
  signing needs the note locked first.

  The same page lists every note on the patient with **Delete** and **Void** per
  row, plus **Delete all** and **Void all**. **Void** retitles, which is all the
  documented API allows, and works even on a signed note.

  **Why signing and deleting need an undocumented endpoint, and how the ids for
  it are derived, is [INSTANCE-FINDINGS X7](../docs/INSTANCE-FINDINGS.md).**
  That finding has already been revised twice, so it is not restated here.

  Bulk acts are doubly fenced: the patient must appear in
  `created-patients.json`, and only notes this harness wrote are touched — the
  fixture's own `Data import` and `Home visit` notes are left alone.

- **`/orders`** — create a lab order and name the ordering physician.
  `POST /api/LabOrder/` takes this app's `client_credentials` token and returns
  `201` with no plugin; the FHIR route really is closed (`ServiceRequest`
  `POST` → `405`).

  **An order made this way cannot be signed.** It never reaches the note as a
  command, so Canvas opens an empty note with nothing to sign, `committer`
  stays null, there is no commit route, and `PATCH {committer}` answers `200`
  while changing nothing. A record is reachable from outside Canvas; a signable
  order is not, so ORDERING F2/F3 hold for the layer that matters.

  What *is* ours: **for orders created here, `orderingProvider` is inherited
  from the note's `providerKey`**, proven by placing two otherwise identical
  orders under different providers. The dropdown decides who is named on the
  order. (An order created in the Canvas UI takes the acting user instead —
  INSTANCE-FINDINGS X9.) The table shows all three identities —
  `originator` (the API caller), `orderingProvider` (ours), `committer` (set
  when the note is signed, which commits its staged commands).

  Nothing here signs or sends. **Withdraw** marks the order entered-in-error and
  deleted; there is no hard delete.

### Why the patient route has no login

Canvas has a patient portal (`/app/login-form`) but it is a Canvas-hosted app, not
an OAuth identity provider. `/auth/authorize/` always redirects to `/login`
regardless of whether `launch` is sent, and staff-vs-patient is decided by who
authenticates. Patients created through the API also have no portal account —
activation needs an invite to a *verified* email or phone, and `patients.csv` uses
fake `@example.com` addresses.

Since the question here is read scoping, a server-minted patient-scoped token
answers it directly and without that setup.

Note `patient/*.read` is rejected as an unauthorized scope; use
`patient/Patient.read` unless the wildcard is added to the app.

Each route shows a per-patient table of `GET /Patient/{id}` statuses plus the
`GET /Patient` search count, and a PASS/FAIL verdict. FAIL on the patient route
means data crossed a scope boundary.

## Documents

`docs/` holds the ordering design and its API reference, kept here because this
is what reproduces their claims. **[CLAUDE.md](CLAUDE.md) is the guide to them** —
which document answers what, the precedence order that settles conflicts, and
the rules that came from getting them wrong. Start at
[docs/ORDERING-DESIGN-AND-INTEGRATION.md](../docs/ORDERING-DESIGN-AND-INTEGRATION.md).

## Regenerating the Tailscale cert

```bash
tailscale cert maple-desktop.tailfc79a9.ts.net
```
