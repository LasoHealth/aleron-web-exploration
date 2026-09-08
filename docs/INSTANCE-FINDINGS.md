# Live-instance findings — `aleronmd-dev`, 4 Sep 2026

Run against the real Canvas instance with `aleron-canvas-test/verify-api.mjs`.
**These override the documents where they conflict**, including
[API-GROUND-TRUTH.md](API-GROUND-TRUTH.md),
[API-IMPLEMENTATION-AUDIT.md](API-IMPLEMENTATION-AUDIT.md) and
[ORDERING-DESIGN-AND-INTEGRATION.md](ORDERING-DESIGN-AND-INTEGRATION.md).
Documentation describes Canvas in general; this describes the instance.

Reproduce, from the repo root: `cd aleron-canvas-test && node --env-file=script.env verify-api.mjs --write`

Each finding below is carried by a claim in that runner, so it can be re-checked
rather than taken on trust. **A `FAIL` there means a document is wrong, not that
Canvas is broken** — X5 and X7 both surface as `FAIL` on `W3`, and X6/X7 as
`FAIL` on `W5`. The `/notes` page of the same app drives the note lifecycle by
hand: create, lock, sign, retrieve the PDF, delete.

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

## X4 — attribution has two mechanisms, and they are not the same one

**Corrects a conflation in this project, including the probe built to test it.**

| Surface | Grant | How the physician gets named |
|---|---|---|
| **Note API** (`/core/api/notes/v1/Note`) | **`client_credentials`** — the documented example is `grant_type=client_credentials` | the **`providerKey` field**, *"the unique key of the Provider staff who is writing the Note"* |
| **Plugin effects and commands** | **`authorization_code`** access token | the **token holder**, per F1 |

Verified on the instance: a note written with the service token carries
`providerKey` naming a real, active practitioner. **"Canvas Bot" is the actor of
the API call, not the author of the note.** Those are different records and this
project treated them as one.

Consequences:

1. **The `403` on an `authorization_code` token was expected behaviour**, not a
   Canvas role to grant. The Note API is not built for per-user tokens.
2. **The attribution probe tested the wrong surface.** Notes are not a valid
   proxy for command attribution, and the question priority 1 actually turns on
   — whose name is on an *order* — remains untested. It cannot be tested without
   a deployed plugin, which was already the case before the probe was written.
3. **Priority 2 gets cheaper.** Saving order history into the chart as notes
   needs `client_credentials` plus a correct `providerKey`, not per-physician
   OAuth enrolment. §2.2 of the ordering document gates priorities 1 *and* 2 on
   that enrolment; only priority 1 needs it, and only for commands.

What is still open: whether a plugin route authenticated with a physician's
token attributes a *command* to that physician. That is F1, it is the load-bearing
claim for priority 1, and nothing tested so far touches it.

## X5 — locking over the API does not generate the PDF, and the API cannot reach the state that does

> **Half superseded by X7.** The measurements below stand: the v1 REST Note API
> cannot reach `SGN`, and locking generates nothing. The conclusion drawn from
> them — that Aleron cannot produce the PDF at all — is **wrong**. Signing does
> it, and `/api/NoteStateChangeEvent/` reaches `SGN`.

**Resolves U1. Corrects Canvas's own documentation for this instance.**

[**Note → Update → `stateChange`**](https://docs.canvasmedical.com/api/note/#update)
states plainly, as the second sentence of the first allowed transition and
nowhere else on the page: *"Locking a note will result in the Note PDF being
generated along with it associated FHIR DocumentReference record."* It is
attached directly to `"ULK" → "LKD"`, `"NEW" → "LKD"`, `"CVD" → "LKD"` — so it
describes exactly the transition tested below, not some other path. On
`aleronmd-dev` it does not hold. Three measurements, all reproducible:

| Measurement | Result |
|---|---|
| **11 notes at `currentState: LKD`**, every one locked by `PATCH … {"stateChange":"LKD"}` returning `200` | **0 `DocumentReference`s between them** |
| The instance holds **exactly 2 `DocumentReference`s**, both `category: clinical-note`, both `application/pdf`, `period.start` matching a note's `datetimeOfService` exactly | they are the **only 2 notes at `SGN`** |
| `PATCH … {"stateChange":"SGN"}` | **`400 — "This note state change is not allowed. NEW -> SGN"`** |

The documented transition table confirms the refusal is by design: `stateChange`
admits `ULK/NEW/CVD → LKD` and `LKD → ULK`, plus appointment states. **`SGN`
appears nowhere in it.** Both documents were generated at `01:17`, minutes after
the API had locked those notes at `01:15`–`01:16`, and while a human was signed
into the Canvas UI — so the generating act was a UI action, not our `PATCH`.

**Consequence, and it is a real constraint on priority 2.** Aleron can create a
note, fill it and lock it, and the chart will hold that note — but Aleron
**cannot cause the legal-record PDF or the `DocumentReference` from outside
Canvas**, because the state that produces them is unreachable over the API. Any
screen promising a filed legal document as a consequence of an Aleron act is
promising something Aleron cannot perform.

Alternative pathway, since the document is what the chart wants:
**`DocumentReference` has `create`** (`user/DocumentReference.crs`, C5) and
Canvas supports [writing a PDF to it directly](https://docs.canvasmedical.com/release-notes/docref-create/).
Aleron can compose its own order-history PDF and file it. That is an
Aleron-authored document rather than Canvas's rendering of the note, and the
difference should be visible on the screen rather than glossed.

Still open: **which UI act generated them** — the sign action, or the `Create PDF`
menu item. Both are UI-only, so the constraint above holds either way; it decides
only whether the PDF rides along with a signature the physician is already
giving, or is a separate step nobody will remember.

## X6 — a note cannot be removed, and a signed note's title can still be changed

> **Half superseded by X7.** The title finding stands. "Nothing is removable"
> is **wrong**: it is unreachable over the v1 REST API, but
> `/api/NoteStateChangeEvent/` deletes with `DLT`, reversibly.

Two halves of one question: **what does the Note API let you undo?**

**Nothing is removable.** `DELETE /Note/{key}` answers
`405 Method "DELETE" not allowed.` The `stateChange` enum *does* accept `DLT` —
`DEL`, `DELETED`, `EIE`, `ERR`, `VOID` and `CAN` are all refused as invalid
choices, while `DLT` is refused as a *transition* — but it is unreachable from
`NEW`, `LKD` and `ULK` alike, which is every state a partner application can put
a note in. Attempted across all 17 test notes on the fixture patient: **17
attempted, 0 deleted.** So a note Aleron writes is permanent, and a wrong one can
only be marked, never withdrawn.

**But the title is not fixed by signing.** `PATCH {"title": …}` returned `200` on
all 17, including **both notes at `SGN`** and the 13 at `LKD`. This extends the
earlier locked-note observation to signed notes: the state that is supposed to
settle a record does not settle its title.

Consequences:

1. **`journal.html` asserted *"signed entries never change"* in three places,
   and for the title that is false.** Corrected: the note body has no field on
   the Note API that edits it, so the signed *text* is safe by omission rather
   than by rule, and the screen now claims only that.
   **Untested, and it matters:** `providerKey` — the field that names the
   author — is on the same `PATCH` allow-list as `title`. Whether a signed
   note's author can be reassigned could not be established, because the
   instance holds **exactly one `Practitioner`** and there is no second
   identity to move a note to. If it is mutable, attribution is not settled by
   signing, which bears directly on priority 1.
2. **Aleron needs its own guard against writing a note it did not mean to.**
   There is no cleanup path, so a mistaken note is a permanent chart artefact.
   This belongs in the confirm surface, before the write, not after it.
3. The harness at `aleron-canvas-test/notes` makes all of this pressable —
   `Delete` attempts both routes and shows what Canvas said; `Void` retitles,
   which is the only cleanup that works.

## X7 — `NoteStateChangeEvent`: signing makes the PDF, and delete exists after all

**Overturns the "unreachable" halves of X5 and X6.** Found by watching the
Canvas UI delete a note in the browser's network tab:
`POST /api/NoteStateChangeEvent/` with `{noteId, state: "DLT", noteChecksum,
lastModifiedBySessionKey}`.

### Where it is documented

`NoteStateChangeEvent` is documented, but **only as a plugin SDK concept, never
as an HTTP endpoint**:

| Where | What it says |
|---|---|
| [SDK data — Note](https://docs.canvasmedical.com/sdk/data-note/) | `NoteStateChangeEvent` is the note's audit history, reachable as `note.state_history`. `CurrentNoteStateEvent` holds the present state. |
| [SDK events](https://docs.canvasmedical.com/sdk/events/) | `NOTE_STATE_CHANGE_EVENT_PRE_CREATE`, `_CREATED`, `_UPDATED`. The pre-create event **can block a transition** by returning an `EventValidationError` effect. |
| [SDK action buttons](https://docs.canvasmedical.com/sdk/handlers-action-buttons/) | `NoteStateActionButton`, with `LockNoteActionButton` and `SignNoteActionButton`. Its transition table includes **`NoteStates.DELETED`** and **`NoteStates.SIGNED`**. |
| [Release notes](https://docs.canvasmedical.com/product-updates/release-notes/) | *"Adds NoteStateChangeEvent to the data module for improved note event tracking."* |

The SDK page also says the locked note's PDF is *"stored on a
`DocumentReference` pointing back at the `NoteStateChangeEvent` that recorded
the lock"* — a generic foreign key, reached through `note.state_history`, not
from the note. And: *"Only encounter, inpatient, and review note types are
captured this way."*

### What the endpoint actually does

`POST /api/NoteStateChangeEvent/` is **undocumented**, and it **accepts a
`client_credentials` bearer token**. It needs two ids, neither of them the
`noteKey`:

- **`noteId`** — an integer, carried base64 in the note's own `permalink`:
  `Tm90ZTo5NjoxNg==` decodes to `Note:96:16`.
- **`noteChecksum`** — optimistic concurrency, readable at `GET /api/Note/{noteId}`.
  A stale one is refused `409 "This note is out of date."`
- `lastModifiedBySessionKey`, present in the captured UI payload, is **not required**.

`GET /api/Note/{noteId}` also returns the note type's own
**`stateTransitionMatrix`**, which is far richer than the REST API's:

| From | Permitted |
|---|---|
| `NEW` / `ULK` / `PSH` / `CVD` / `UND` | Lock `LKD`, Push charges `PSH`, **Delete `DLT`** |
| `LKD` | Unlock `ULK`, **Sign `SGN`** |
| `SGN` | Amend `ULK`, Sign `SGN` |
| `DLT` | **Restore `UND`** |

### Measured on the instance

| Act | Result |
|---|---|
| `DLT` via the endpoint | **`201`**, note reaches `DLT`. **17 of 17 test notes deleted.** Soft and reversible via `UND`. |
| `SGN` via the endpoint | **`201`**, note reaches `SGN` |
| `DocumentReference` after that `SGN` | **`2 → 3` within 5 seconds**, `period.start` matching the note's `datetimeOfService` exactly |
| `LKD` via the **same** endpoint | `201`, and **no document, ever** |

**So signing generates the PDF, not locking** — and it is the transition, not
the endpoint. Both Canvas pages attribute it to the lock; on this instance 14
locked notes produced none and the first signature produced one.

### Attribution differs by surface, on one identical token

State history of a note created, locked and signed with the *same*
`client_credentials` token:

```
NEW | Canvas Bot created this note
LKD | Canvas Bot locked this note
SGN | Kaede Ito signed this note
```

The v1 Note API records **Canvas Bot**; `/api/NoteStateChangeEvent/` records a
**named human** — the OAuth application's owner. A third attribution mechanism,
after the two in X4, and still not "the physician who is logged into Aleron".

### What this means for the design

1. **X5's "Aleron cannot produce the legal-record PDF" is wrong.** It can:
   lock, then sign. §4.5 and the EMR screen need revising again.
2. **X6's "a note cannot be withdrawn" is wrong.** `DLT` works and `UND`
   reverses it, so a mistaken note is recoverable.
3. **Both depend on an undocumented endpoint.** Canvas's own front end calls
   it and nothing obliges Canvas to keep it stable. Building priority 2 on it
   is a deliberate risk, not a free win — **vendor question 9 should now ask
   Canvas to support it, or to say what the supported equivalent is.**
4. **A plugin reaches the same transitions supported:** `NoteStateActionButton`
   with `STATE_ACTION = NoteStates.SIGNED` / `DELETED`. That is a physician
   clicking a button Aleron placed in the Canvas note footer — documented,
   stable, but not headless.
5. **`NOTE_STATE_CHANGE_EVENT_PRE_CREATE` can block a transition.** Aleron
   could refuse a lock whose orders are inconsistent, from inside Canvas.

## Still untestable without more setup

- **Every command** (`ImagingOrder`, `Refer`, `LabOrder`, `Prescribe`) and every **effect**
  (`UPSERT_NOTE_METADATA`, `CREATE_OBSERVATION`, Custom Data Models,
  `CustomCommand`) are plugin-gated. A Canvas plugin is a prerequisite for
  *testing* the ordering architecture, not only for shipping it.
- **Junction**: no API key yet. `J1`/`J2` in the runner are written and skip
  cleanly; they decide whether priority 1 already works.
- **OAuth attribution on a write** needs the `authorization_code` browser login
  in `aleron-canvas-test`, not the service token the runner uses.
