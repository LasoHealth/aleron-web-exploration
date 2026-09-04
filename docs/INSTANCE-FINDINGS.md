# Live-instance findings — `aleronmd-dev`, 4 Sep 2026

Run against the real Canvas instance with `aleron-canvas-test/verify-api.mjs`.
**These override the documents where they conflict**, including
[API-GROUND-TRUTH.md](API-GROUND-TRUTH.md),
[API-IMPLEMENTATION-AUDIT.md](API-IMPLEMENTATION-AUDIT.md) and
[ORDERING-DESIGN-AND-INTEGRATION.md](ORDERING-DESIGN-AND-INTEGRATION.md).
Documentation describes Canvas in general; this describes the instance.

Reproduce: `cd ../aleron-canvas-test && node --env-file=script.env verify-api.mjs --write`

## Confirmed — the design can rely on these

| # | Finding | Evidence |
|---|---|---|
| **C1** | **An engine risk score cannot be an Observation.** A vital (weight, LOINC 29463-7) was accepted `201`; a cardiovascular 10-year risk score (LOINC 99055-6) was refused `422 Requested Sign does not exist`. | W1 |
| **C2** | **Condition update really is entered-in-error only.** `PUT` with a changed `onsetDateTime` returned `422` and the value did not persist. So "update existing problem" has no FHIR path; the SDK `Assess` command is the route. | W2 |
| **C3** | **`ServiceRequest` has no create** — `POST` returns `405 Method Not Allowed`. The FHIR route to orders is closed. | W4 |
| **C4** | **`RiskAssessment`, `FamilyMemberHistory`, `AuditEvent` and `Subscription` all return `404`.** No push mechanism of any kind; Aleron learns of Canvas acts by reading. | A1–A3 |
| **C5** | **The capability matrix is right.** Granted scopes carry a CRUS form that confirms it exactly: `Observation.crs`, `DocumentReference.crs` (both create-no-update), `Goal.rs`, `CarePlan.rs`, `ServiceRequest.rs`, `MedicationRequest.rs`, `CareTeam.rus` (update, no create), `Condition.crus`. | M1 |

## Corrections — documents are wrong on these

| # | Finding | Consequence |
|---|---|---|
| **X1** | **`$create-lab-report` exists and is externally callable.** `POST /DiagnosticReport/$create-lab-report` returns `400 body -> parameter must contain at least 1 item` (a body complaint, not a missing route), and `user/DiagnosticReport.create-lab-report` is a granted scope. It is simply absent from the CapabilityStatement's `operation` array. | **Junction lab results can be written into the chart without a plugin.** ORDERING §5.4 and audit Part 1 step 5 both say to use the plugin `CREATE_LAB_REPORT` effect. Results are no longer plugin-gated. |
| **X2** | **The Note API returns a real `permalink`.** A locked note came back with `"permalink": "/permalinks/v1/Tm90ZTo5Njo0"`, which resolves — `302 → /login?next=/permalinks/…`, a genuine UI route that lands on the note after auth. | **The prescription hand-off is a supported link, not a URL constructed by convention.** ORDERING §4.7 and Part 5 decision 9 both assume no contract and prescribe a 404 fallback. Use `note.permalink`. |
| **X3** | **`QuestionnaireResponse` has no create at `user` scope.** Granted scope is `user/QuestionnaireResponse.rs`, while `patient/QuestionnaireResponse.crus` has create and update. | Writing a patient-reported outcome may need a **patient-scoped** token, not a staff one. The documents call this "the cheapest fix in the audit" without accounting for the token. Still unconfirmed by a write test. |

## Unconfirmed — do not present as settled

| # | Finding | Status |
|---|---|---|
| **U1** | **Locking a note did not generate a `DocumentReference`.** The note reached `currentState: LKD` cleanly, but the patient's `DocumentReference` count stayed `0` and the instance-wide total is `0`. | The audit's **verdict 1** — that locking generates the PDF and the DocumentReference, and that six screens have this backwards — is documented by Canvas but **did not reproduce here**. Possible causes: async generation, a note needs content or commands, `SGN` rather than `LKD`, or a note type that produces one. **Any screen copy asserting this must hedge until it reproduces.** |

## Still untestable without more setup

- **Every command** (`ImagingOrder`, `Refer`, `LabOrder`, `Prescribe`) and every **effect**
  (`UPSERT_NOTE_METADATA`, `CREATE_OBSERVATION`, Custom Data Models,
  `CustomCommand`) are plugin-gated. A Canvas plugin is a prerequisite for
  *testing* the ordering architecture, not only for shipping it.
- **Junction**: no API key yet. `J1`/`J2` in the runner are written and skip
  cleanly; they decide whether priority 1 already works.
- **OAuth attribution on a write** needs the `authorization_code` browser login
  in `aleron-canvas-test`, not the service token the runner uses.
