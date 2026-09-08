# Canvas SAML SSO: findings, gaps, and what it enables

Draft, uncommitted. Investigated 2026-09-08 against `aleronmd-dev`.

Live-instance observations below outrank vendor documentation, per
`aleron-canvas-test/CLAUDE.md`. Where the two agree, both are cited.

---

## 1. Findings

### F1. The SAML SP is installed, but no IdP is bound

Measured against `aleronmd-dev`:

| Endpoint | Result | Reading |
|---|---|---|
| `GET /saml2/metadata/` | 200 | SP module healthy, serving valid metadata |
| `GET /saml2/login/?next=…` | **500** | Cannot start a login |
| `GET /saml2/acs/` | 405 on GET | Correct, the assertion consumer is POST-only |
| `GET /saml2/ls/` | 400 | Correct, logout needs parameters |
| `GET /login` | 200 | Canvas's native login works |
| `GET /patient/<uuid>` | 302 to `/login?next=/patient/<uuid>` | Native login honours a redirect target |

Published SP metadata:

* entityID `https://aleronmd-dev.canvasmedical.com/saml2/metadata/`
* ACS `https://aleronmd-dev.canvasmedical.com/saml2/acs/`
* SLO `/saml2/ls/` and `/saml2/ls/post`

A Django SAML SP that serves metadata but returns 500 on login initiation has no
usable IdP configured. The likely cause is `SSO_LOGIN_ENABLED` left unchecked with
an empty `SERVICE_PROVIDER_CONFIG`. See section 4.

### F2. `/saml2/login/` is the correct URL, so the 500 is a configuration fault

Canvas's documentation names `https://<org>.canvasmedical.com/saml2/login/` as the
Sign on URL to register in Azure, and gives entityID and ACS values that match our
measured metadata exactly. The endpoint our code targeted was right all along. It
is simply unconfigured.

### F3. There is no just-in-time provisioning, and emails must match

Canvas documents two hard requirements: "Users must be manually connected to Canvas,
and the email used to create the user must be unique", and "The email address
attached to the Canvas user must match the SSO email address."

`docs/API-GROUND-TRUTH.md` section 4 already recorded this: "There is no
just-in-time provisioning. A Canvas user must exist before SSO works. This is the
root cause of 'no Canvas practitioner id' failures, a command with no clinician to
attribute never runs."

Turning SSO on therefore admits nobody by itself. Each physician needs a
hand-created Canvas user whose email matches their Entra email. That is an
onboarding task rather than a runtime fallback, and it is the same root cause the
audit notes keep reaching in `audit/v2-emr.md` rows 10 and 44.

### F4. Deep-linking to a specific chart through SAML is undocumented

Canvas describes SP-initiated login as reachable "via login button on Canvas login
page". No part of the documentation describes a `?next=` parameter on
`/saml2/login/`.

`audit/v2-journal-reviews.md:38` had already flagged this as UNVERIFIED:
"Deep-linking from outside into a specific Canvas patient chart is not documented.
SSO to the Canvas root is."

So `/saml2/login/?next=/patient/{id}` may not carry a physician to a specific chart
even after SSO is configured. That premise remains unverified, and it is the premise
the original Aleron implementation was built on.

### F5. The direct chart link is verified and works today

An unauthenticated `GET /patient/<real-uuid>` returns 302 to
`/login?next=/patient/<uuid>`. Canvas's native login preserves the destination, so a
physician signs in once and lands on the correct chart. Verified against the live
instance with a real patient key.

This partly resolves the UNVERIFIED row in F4. The chart URL shape is real, and the
native login honours `next`. What stays unverified is whether the SAML entrypoint
does the same.

### F6. Aleron's EMR link was dead, and is now fixed

`EmrPageController` built `{chart_url}/saml2/login/?next=/patient/{id}`, which is the
endpoint that returns 500. The chart rail's only route into Canvas went nowhere.

Fixed in `Aleron-Web` commit `c09fadc`. `services.canvas.chart_login_path` now
defaults to empty, which links straight to the chart per F5. Setting
`CANVAS_CHART_LOGIN_PATH=/saml2/login/` restores the SSO hop once F4 is resolved and
SAML is configured. Tests cover both paths.

---

## 2. Missing information

### 2a. Entra details needed to make the local server work

`.env.example` documents a workforce block that is absent from the working `.env`,
which contains zero `WORKFORCE` entries. Only `ENTRA_API_*` and `ENTRA_MOBILE_*` are
set. That is why the local portal falls back to password login rather than Entra
OIDC.

| Variable | Needed for | Where to get it |
|---|---|---|
| `ENTRA_WORKFORCE_TENANT_ID` | Aleron's own Entra login. Must be the workforce GUID, not `common` | Entra, Overview, Tenant ID |
| `ENTRA_WORKFORCE_CLIENT_ID` | The portal's OIDC app registration | The Aleron portal app in Entra |
| `ENTRA_WORKFORCE_CLIENT_SECRET` | Same | Certificates and secrets |
| `ENTRA_WORKFORCE_REDIRECT_URI` | OIDC callback | Must be registered in Entra and match the URL actually served |

One trap worth naming: `.env.example` assumes
`http://localhost:8000/auth/entra/callback`, but local testing has been running on
port 8123, and Entra matches redirect URIs exactly. Either serve on 8000 or register
the 8123 callback as well.

These variables are needed for Aleron's own login and are independent of Canvas
SAML. Without them the seamless story cannot be demonstrated end to end, because
there is no live Entra session for Canvas to reuse.

### 2b. Not yet obtainable

| Missing | Why it cannot be supplied yet |
|---|---|
| Entra App Federation Metadata URL | Exists only once the Canvas SAML app is registered in Entra (section 3) |
| Canvas admin access | Needed to reach Constance config (section 4) |
| Per-physician Canvas users | Manual creation, emails matched to Entra (F3) |

### 2c. Open questions for Canvas

1. Is `?next=` supported on `/saml2/login/`, or is SP-initiated SSO only reachable
   through the button on Canvas's own login page? This decides whether seamless
   per-chart deep-linking is achievable at all (F4).
2. Is `/login?next=/patient/<id>` a supported, stable contract? Our shipped fix
   depends on it (F5, F6).
3. Does the OAuth `/auth/authorize/` staff login use SSO once configured? This
   decides section 6, and therefore whether we must store long-lived per-physician
   tokens.
4. Is SSO gated by plan or feature flag, or purely self-service?
5. Is `/saml2/login/` returning 500 rather than a graceful error a fault worth
   reporting, or expected when unconfigured?

---

## 3. Steps inside Azure and Entra

1. Entra admin centre, Enterprise applications, New application, Create your own
   application. Choose non-gallery, "Integrate any other application you don't find
   in the gallery".
2. Open the app, then Single sign-on, then SAML.
3. Under Basic SAML Configuration, set:

   | Field | Value |
   |---|---|
   | Identifier (Entity ID) | `https://aleronmd-dev.canvasmedical.com/saml2/metadata/` |
   | Reply URL (ACS) | `https://aleronmd-dev.canvasmedical.com/saml2/acs/` |
   | Sign on URL | `https://aleronmd-dev.canvasmedical.com/saml2/login/` |

   The first two are confirmed against live SP metadata (F1). The third is Canvas's
   documented value (F2).

4. Under Attributes and Claims, confirm the claim carrying email is `user.mail`, and
   that it matches the email on each physician's Canvas user (F3).
5. Under SAML Certificates, click Copy next to App Federation Metadata URL. Section
   4 needs this value. It takes the form
   `https://login.microsoftonline.com/<tenant-guid>/federationmetadata/2007-06/federationmetadata.xml?appid=<app-guid>`.
6. Under Users and groups, assign the physicians who should reach Canvas.
7. Confirm whether Conditional Access and MFA apply to this app. MFA on the Aleron
   portal app does not automatically cover a second app.

---

## 4. Steps inside Canvas

All of these live under Constance: Config, SSO Configuration.

1. `SERVICE_PROVIDER_CONFIG`, the Azure variant, verbatim from Canvas's docs:

   ```json
   {
       "service": {
           "sp": {
               "allow_unsolicited": true,
               "want_response_signed": false
           }
       },
       "metadata": {"remote": [{"url": "<your url>"}]}
   }
   ```

   Replace `<your url>` with the App Federation Metadata URL from section 3 step 5.
   This differs from the Okta variant, which omits `want_response_signed`, so take
   care not to copy the wrong snippet.

2. `SSO_LOGIN_ENABLED`. Check it. This is most likely the switch currently off (F1).
3. `SSO_PRIVATE_KEY`, `SSO_PUBLIC_CERT` and `IDP_METADATA_XML` all stay blank for
   Azure. `IDP_METADATA_XML` applies to Google and JumpCloud only.
4. `SSO_IDP_INFO` sets the button's display name and icon. Cosmetic.
5. Create a Canvas user per physician, with the email matched to Entra (F3). Record
   each `Practitioner` id, because Aleron needs it in `User.canvas_practitioner_id`
   for attribution.

`want_response_signed: false` is Canvas's own prescribed setting for Azure rather
than a local choice. The assertion stays signed; the response envelope does not. If
security review asks why response signing is disabled, that is the answer, and the
source is Canvas's documentation.

---

## 5. What this enables

A physician signed into the Aleron portal clicks "Open in Canvas" and arrives in the
Canvas chart without a second login. Canvas sends them to Entra, Entra recognises the
session already established for Aleron, signs an assertion, and Canvas admits them.

Secondary gains:

* One credential to govern. Deactivating a leaver in Entra removes Canvas access too,
  with no separate Canvas password to rotate, audit, or forget.
* MFA and Conditional Access reach Canvas, if the policy is applied to the new app
  (section 3 step 7).
* Less friction at the point of care, which is the clinical argument. The chart is
  where a physician verifies before authorising, and a login prompt at that moment is
  where people stop checking.

Two limits are worth stating plainly. Per-chart deep-linking is unverified (F4), so
"seamless" may mean landing in Canvas authenticated at the chart, or it may mean
landing at the Canvas root and navigating from there. Question 1 in section 2c
settles it. And none of this works until every physician has a matching Canvas user
(F3).

---

## 6. Does this remove the need to store an access token per physician?

Not on its own. It can, however, remove the need to store the part that carries the
risk.

SAML SSO and the OAuth work in AL-99 operate on different channels:

| | SAML SSO | OAuth `authorization_code` (AL-99) |
|---|---|---|
| Who is authenticated | a human, in a browser | Aleron's server, acting for a physician |
| What you hold afterwards | a session cookie in the physician's browser, scoped to `canvasmedical.com` | an access token Aleron's server can send to the FHIR API |
| What it can do | render Canvas's web UI to that person | make attributed API writes |
| Usable by Aleron's server | no | yes |

A browser session cannot be used for server-side API calls. SSO therefore gives
Aleron no way to write to Canvas as the physician, and AL-99 stays necessary for
AL-90, AL-91 and AL-92, whose purpose is that a legal record names the clinician
instead of Canvas Bot.

### Where the security concern can genuinely be reduced

The concern is not that a token exists, but that a long-lived refresh token would sit
at rest in a system holding PHI. That part may be avoidable:

Session-scoped tokens with no database persistence. Every write in AL-90, AL-91 and
AL-92 is a physician-initiated interactive act. If the Canvas access token lives in
the physician's server-side session rather than a table, it dies at logout and no
long-lived credential is stored at all. The limit is that background work, such as a
queued job or a webhook-driven result sync, has no session to draw on, so any
deferred write needs another mechanism.

Dropping the refresh token and re-authorising instead. Canvas access tokens last
3600 seconds. Without a refresh token the exposure window shrinks to an hour, at the
cost of periodic re-consent.

SSO is what makes either option practical, and this is the real interaction between
the two pieces of work. If `/auth/authorize/` is SSO-backed once SAML is configured
(section 2c, question 3), re-authorising becomes a silent redirect for a physician
with a live Entra session, with no prompt and no friction. That turns "short-lived
token, no refresh token, re-mint on demand" from an annoyance into a reasonable
default.

The accurate answer, then: SAML SSO does not remove the need for a per-physician
Canvas token, but it can remove the need to persist one, which is the actual security
concern. Confirming question 3 turns that from a plausible design into a decided one,
and it should be answered before AL-99 is specced, because it changes the storage
design from encrypted refresh tokens in a table to nothing at rest.

---

## 7. Suggested `INSTANCE-FINDINGS.md` entries

Two observations here are instance facts worth recording under the existing
convention:

* `/saml2/login/` returns 500 rather than a graceful error when SSO is unconfigured,
  while `/saml2/metadata/` still serves valid metadata. Anything built on the SAML
  entrypoint fails hard instead of degrading.
* `GET /patient/{id}` returning 302 to `/login?next=/patient/{id}` is verified on the
  live instance. For the native-login path this resolves the UNVERIFIED deep-link row
  in `audit/v2-journal-reviews.md:38`. The SAML path stays unverified.

---

## Sources

* [Configuring Single Sign-On (SSO), Canvas Medical Help Center](https://help.canvasmedical.com/articles/6984866654-sso-single-sign-on)
* [Customer Authentication, Canvas docs](https://docs.canvasmedical.com/api/customer-authentication/)
* [Authentication Best Practices, Canvas docs](https://docs.canvasmedical.com/api/authentication-best-practices/)
* `docs/API-GROUND-TRUTH.md` section 4, Canvas auth and identity
* `docs/audit/v2-emr.md` rows 10 and 44, SSO with no JIT
* `docs/audit/v2-journal-reviews.md:38`, chart deep-linking UNVERIFIED
* `aleron-canvas-test/src/canvas.js` and `vite.config.js`, the working OAuth reference flow
* Live probes against `aleronmd-dev`, 2026-09-08
