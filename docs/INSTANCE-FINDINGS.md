# Live-instance findings — `aleronmd-dev`, 4–8 Sep 2026

Run against the real Canvas instance with `aleron-canvas-test/verify-api.mjs`.
**These override the documents where they conflict**, including
[API-GROUND-TRUTH.md](API-GROUND-TRUTH.md),
[API-IMPLEMENTATION-AUDIT.md](API-IMPLEMENTATION-AUDIT.md) and
[ORDERING-DESIGN-AND-INTEGRATION.md](ORDERING-DESIGN-AND-INTEGRATION.md).
Documentation describes Canvas in general; this describes the instance.

Reproduce, from the repo root: `cd aleron-canvas-test && node --env-file=script.env verify-api.mjs --write`

Each finding below is carried by a claim in that runner, so it can be re-checked
rather than taken on trust. **A `FAIL` there means a document is wrong, not that
Canvas is broken** — the note-lifecycle findings surface as `FAIL` on `W3` and
`W5`. The `/notes` page of the same app drives the lifecycle by hand: create,
lock, sign, retrieve the PDF, delete.

**Two things have no runner claim**, and re-checking them means repeating them
by hand: how a command renders in the signed PDF, and what the PDF omits. Both
were read off a real document, because neither is reachable from the API.

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
| **X1** | **`$create-lab-report` exists and is externally callable.** `POST /DiagnosticReport/$create-lab-report` returns `400 body -> parameter must contain at least 1 item` (a body complaint, not a missing route), and `user/DiagnosticReport.create-lab-report` is a granted scope. It is simply absent from the CapabilityStatement's `operation` array. | **Junction lab results can be written into the chart without a plugin**, so they are not blocked on [AL-100](https://lasohealth.atlassian.net/browse/AL-100). Still unproven: a *successful* write through the operation, and whether the `ATTACH_LAB_REPORT_RESULTS` half has a non-plugin route. |
| **X2** | **The Note API returns a real `permalink`.** A locked note came back with `"permalink": "/permalinks/v1/Tm90ZTo5Njo0"`, which resolves — `302 → /login?next=/permalinks/…`, a genuine UI route that lands on the note after auth. | **The prescription hand-off is a supported link, not a URL constructed by convention.** ORDERING §4.7 and Part 5 decision 9 both assume no contract and prescribe a 404 fallback. Use `note.permalink`. |
| **X3** | **`QuestionnaireResponse` has no create at `user` scope.** Granted scope is `user/QuestionnaireResponse.rs`, while `patient/QuestionnaireResponse.crus` has create and update. | Writing a patient-reported outcome may need a **patient-scoped** token, not a staff one. The documents call this "the cheapest fix in the audit" without accounting for the token. Still unconfirmed by a write test. |

## X4 — attribution has two mechanisms, and they are not the same one

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
2. **Notes are not a proxy for command attribution.** The question priority 1
   turns on — whose name is on an *order* — needs a deployed plugin to answer.
3. **Priority 2 gets cheaper.** Saving order history into the chart as notes
   needs `client_credentials` plus a correct `providerKey`, not per-physician
   OAuth enrolment. §2.2 of the ordering document gates priorities 1 *and* 2 on
   that enrolment; only priority 1 needs it, and only for commands.

What is still open: whether a plugin route authenticated with a physician's
token attributes a *command* to that physician. That is F1, it is the load-bearing
claim for priority 1, and nothing tested so far touches it.

## X5, X6, X7 — the note lifecycle over HTTP

Create, lock, sign, delete, and which act produces the legal-record PDF. Two
surfaces reach note state and they are not equivalent.

### Two surfaces, one of which reaches the states that matter

| Act | v1 REST — `PATCH /core/api/notes/v1/Note` `stateChange` | `POST /api/NoteStateChangeEvent/` |
|---|---|---|
| Lock `LKD` | **`200`** | **`201`** |
| Sign `SGN` | **`400` — *"This note state change is not allowed. NEW -> SGN"*** | **`201`** |
| Delete `DLT` | refused as a *transition* from `NEW`, `LKD` and `ULK` alike — **17 attempted, 0 deleted** | **`201`, 17 of 17**, soft and reversible via `UND` |

Both accept a **`client_credentials`** token. The v1 enum admits
`ULK`/`NEW`/`CVD` → `LKD` and `LKD` → `ULK` plus appointment states; **`SGN`
appears nowhere in it**. `DEL`, `DELETED`, `EIE`, `ERR`, `VOID` and `CAN` are
rejected as invalid choices, `DLT` as an unreachable transition.
`DELETE /Note/{key}` answers `405 Method "DELETE" not allowed.`

### Calling the undocumented endpoint

`POST /api/NoteStateChangeEvent/` is Canvas's own front end calling itself. It
needs two ids, neither of them the `noteKey`:

- **`noteId`** — an integer, carried base64 in the note's own `permalink`:
  `Tm90ZTo5NjoxNg==` decodes to `Note:96:16`.
- **`noteChecksum`** — optimistic concurrency, readable at
  `GET /api/Note/{noteId}`. A stale one is refused `409 "This note is out of date."`
- `lastModifiedBySessionKey`, present in the captured UI payload, is **not required**.

`GET /api/Note/{noteId}` also returns the note type's own
**`stateTransitionMatrix`**, richer than the REST enum:

| From | Permitted |
|---|---|
| `NEW` / `ULK` / `PSH` / `CVD` / `UND` | Lock `LKD`, Push charges `PSH`, **Delete `DLT`** |
| `LKD` | Unlock `ULK`, **Sign `SGN`** |
| `SGN` | Amend `ULK`, Sign `SGN` |
| `DLT` | **Restore `UND`** |

### Signing generates the PDF; locking never does

[**Note → Update → `stateChange`**](https://docs.canvasmedical.com/api/note/#update)
states, attached directly to `"ULK" → "LKD"`, `"NEW" → "LKD"` and
`"CVD" → "LKD"`: *"Locking a note will result in the Note PDF being generated
along with it associated FHIR DocumentReference record."* **On this instance it
does not hold.**

| Measurement | Result |
|---|---|
| 11 notes at `LKD`, every one locked by `PATCH … {"stateChange":"LKD"}` → `200` | **0 `DocumentReference`s between them** |
| `LKD` via `/api/NoteStateChangeEvent/` | `201`, and **no document, ever** |
| First note taken to `SGN` | `DocumentReference` count **2 → 3 within 5 seconds**, `period.start` matching the note's `datetimeOfService` exactly |
| The instance's `DocumentReference`s | all `category: clinical-note`, `application/pdf`, one per note at `SGN` and none otherwise |

So it is the **transition**, not the endpoint, that generates the document.

**Only some note types are captured at all.** Canvas: *"Only encounter,
inpatient, and review note types are captured this way."* A `data`-category note
refuses the transition outright —
`400 {"state":["Signing is not required for this note type."]}` — so a
command-bearing `data` note never produces a PDF and its absence is not a
failure. The PDF hangs off a `DocumentReference` *"pointing back at the
`NoteStateChangeEvent` that recorded the lock"*, reached through
`note.state_history` rather than from the note.

### Signing does not settle the title

`PATCH {"title": …}` returned `200` on all 17 test notes, **including both at
`SGN`** and the 13 at `LKD`. The note *body* has no field on the Note API that
edits it, so signed text is safe by omission rather than by rule — which is all
`journal.html` now claims.

**Untested and load-bearing:** `providerKey`, the field naming the author, sits
on the same `PATCH` allow-list as `title`. Whether a signed note's author can be
reassigned could not be established — the instance exposes exactly one
`Practitioner`, so there is no second identity to move a note to. If it is
mutable, signing does not settle attribution either.

### Attribution differs by surface, on one identical token

State history of a note created, locked and signed with the *same*
`client_credentials` token:

```
NEW | Canvas Bot created this note
LKD | Canvas Bot locked this note
SGN | Kaede Ito signed this note
```

The v1 Note API records **Canvas Bot**; `/api/NoteStateChangeEvent/` records a
**named human** — the OAuth application's owner. Neither is "the physician
logged into Aleron"; the two supported mechanisms are in
[X4](#x4--attribution-has-two-mechanisms-and-they-are-not-the-same-one).

### Where `NoteStateChangeEvent` is documented — SDK only, never as HTTP

| Page | What it says |
|---|---|
| [SDK data — Note](https://docs.canvasmedical.com/sdk/data-note/) | It is the note's audit history, reachable as `note.state_history`; `CurrentNoteStateEvent` holds the present state |
| [SDK events](https://docs.canvasmedical.com/sdk/events/) | `NOTE_STATE_CHANGE_EVENT_PRE_CREATE`, `_CREATED`, `_UPDATED`. Pre-create **can block a transition** by returning an `EventValidationError` effect |
| [SDK action buttons](https://docs.canvasmedical.com/sdk/handlers-action-buttons/) | `NoteStateActionButton`, with `LockNoteActionButton` and `SignNoteActionButton`; its transition table includes **`NoteStates.DELETED`** and **`NoteStates.SIGNED`** |
| [Release notes](https://docs.canvasmedical.com/product-updates/release-notes/) | *"Adds NoteStateChangeEvent to the data module for improved note event tracking."* |

### Consequences for the design

1. **Aleron can produce the legal-record PDF headlessly: lock, then sign** —
   over an endpoint Canvas has not promised to keep. Priority 2 rests on it, and
   that is a deliberate risk. Vendor questions 9–11 ask Canvas to support it or
   name the supported equivalent.
2. **The supported alternative is not headless:** a plugin
   `NoteStateActionButton` with `STATE_ACTION = NoteStates.SIGNED` / `DELETED`
   puts a button in the Canvas note footer for a physician to click.
3. **A mistaken note is recoverable, but only through that endpoint.** `DLT`
   then `UND`. Aleron still needs its own guard before writing, in the confirm
   surface rather than after the fact.
4. **`NOTE_STATE_CHANGE_EVENT_PRE_CREATE` lets Aleron refuse a transition from
   inside Canvas** — for example a lock whose orders are inconsistent.
5. **`DocumentReference` has `create`** (`user/DocumentReference.crs`, C5) and
   Canvas supports [writing a PDF to it directly](https://docs.canvasmedical.com/release-notes/docref-create/).
   That files an *Aleron-authored* document rather than Canvas's rendering of the
   note, and the screen should say which it is showing.
6. The harness at `aleron-canvas-test`'s `/notes` drives all of it by hand —
   create, lock, sign, retrieve the PDF, delete, and `Void` (retitle).

## X8, X9, X10 — orders end to end

What the API can create, what a refresh can read back, and how an order renders
in the signed PDF. Reproduced by `O2` and `O3` in the runner and drivable at
`aleron-canvas-test`'s `/orders`.

### A row is reachable; a signable order is not

`POST /api/LabOrder/ {patient, note}` returns **`201`** with a
`client_credentials` token and no plugin, on the same undocumented `/api/`
surface as [X5–X7](#x5-x6-x7--the-note-lifecycle-over-http). It comes back with
a requisition number and reads back as a
FHIR `ServiceRequest`. `/api/ImagingOrder/` and `/api/ChartSectionReview/`
answer the same way.

**The `/api/` surface is keyed on model names, not command names.**
`/api/Prescribe/`, `/api/Refer/`, `/api/Command/` and `/api/ServiceRequest/` all
`404`, while `/api/Referral/`, `/api/Prescription/` and `/api/ImagingOrder/`
return `200` with a `{links, total, entry}` envelope. All three are `total: 0`
here, so **whether they expose a transmission field is unknown** until something
creates one.

Both create endpoints key on **integer primary keys**, not the uuids the rest of
the API uses. A note's pk is carried base64 in its own permalink
(`TGFiT3JkZXI6MTY4OjE=` is `LabOrder:168:1`); the patient's comes from
`GET /api/Patient/?key=<uuid>`.

**But the order never becomes a command in the note.**

| Measurement | Result |
|---|---|
| non-text items in the note body | **0** — the order is not in it |
| `audit.committer` | **`null`**, `modified` unchanged since creation |
| `POST /api/LabOrder/{id}/commit` | `404` |
| `PATCH /api/LabOrder/{id} {"committer": 1}` | **`200`, and the field stays `null`** |
| `tests` set through this endpoint | `200`, stays `[]` |

Canvas opens an **empty note** with nothing to sign. **F2/F3 hold for the layer
that matters:** the signable command layer is plugin-gated exactly as
documented. A record is reachable; an order a physician can sign is not.

### What a refresh can read

**FHIR `ServiceRequest.status` tracks the commit**, so detecting a signature
needs no plugin and no undocumented endpoint. Correlated by `created` timestamp
to the microsecond:

| `LabOrder` | `audit.committer` | FHIR `ServiceRequest.status` |
|---|---|---|
| 19 | `null` | **`draft`** |
| 21 | `null` | **`draft`** |
| 20 | `"5"` | **`active`** |

So `draft` = staged, `active` = signed, `entered_in_error` = withdrawn, from
`GET /ServiceRequest?patient=…`. **`requester` is the `orderingProvider`** —
`Practitioner/e766816672f34a5b866771c773e38f3c` for the order under Youta Priti,
`…/eae30f55e67740a1b26d3e6e9e6def54` for the two under Kaede Ito — so
attribution is readable over FHIR too.

**Transmission is not.** The field union across all 21 `ServiceRequest`s on the
instance is `resourceType, id, status, intent, category, subject, authoredOn,
requester, reasonReference, code`. Nothing about sending. Transmission state
exists only on `/api/LabOrder/{id}` — `transmissionType`,
`manualProcessingStatus`, `electronicLabIntegrationTask`, `hgRequestResult`,
`healthgorillaId` — which is the undocumented surface again. **"Is it signed?"
is answerable over documented FHIR; "did it actually transmit?" is not.**

**`externallyExposableId` is not the FHIR id.** `GET /ServiceRequest/{that}`
answered `404` for all three orders. Whatever correlates a command row to its
FHIR resource, it is not that field — do not build a join on it.

### Who is named on the order

For an order created through `/api/LabOrder/`, **`orderingProvider` is inherited
from the note's `providerKey`**. Proven by controlled comparison — two orders
identical but for the note's provider:

| Note `providerKey` | Order's `orderingProvider` |
|---|---|
| `e766816672f34a5b866771c773e38f3c` | Youta Priti |
| `5eede137ecfe4124b8b773040e33be14` | Canvas Bot |

**The source is origin-dependent:** an order placed through the Canvas UI took
the **acting user** (Kaede Ito), not the note's provider (Youta Priti MD). Note
provider for API-created, acting user for UI-created; only the first is a lever
Aleron holds. An order can also name **staff who are not FHIR `Practitioner`s** —
the instance exposes one Practitioner and at least three staff.

| Field | Who | Settable by Aleron |
|---|---|---|
| `audit.originator` | the API caller — the OAuth app's owner | no |
| `orderingProvider` | the note's provider when API-created, the acting user when UI-created | **yes, for the API path** |
| `audit.committer` | set when the note is signed, which commits its staged commands — no plugin involved | not directly |

**Consequence for priority 1.** The *naming* half is satisfiable without a
plugin: set the note's provider and the order carries that physician. The
*signing* half is not — and the gap is **origination, not commit**. Signing the
note commits whatever is staged in it; getting a command staged there is what
the `/api/LabOrder/` row never achieves. The vendor question is therefore
whether anything other than `CommandAPI` in a plugin can originate a command.

### How an order reaches the signed PDF

Signing the note commits its staged commands — both notes below hold a
`labOrder` command and only the state differs:

| Note | State | Order | `audit.committer` |
|---|---|---|---|
| 64 | `NEW` | 19 | **`null`** |
| 66 | `SGN` | 20 | **`"5"`** |

> **Caveat.** `committer` and `originator` are both `"5"` here, because the same
> person created the order and signed the note, so this does not prove the two
> fields track different people. A clean test needs one person to originate and
> another to sign — T2 of [AL-100](https://lasohealth.atlassian.net/browse/AL-100).

The signed PDF renders it under **`PLAN`**, labelled with the command's schema
key, not under an "Orders" heading. Sections appear only where content exists —
an empty note produced `SIGNATURES` alone.

```
PLAN
LabOrder:
CMV IGG AVIDITY INDEX  (Last Modified on 9/8/26 at 6:45 PM PDT)
FASTING: NO
INDICATIONS: Prediabetes (R73.03)
LAB PARTNER: Generic Lab

SIGNATURES
Electronically signed by Kaede Ito on 9/8/26 at 6:46 PM PDT
```

**No ordering physician is printed.** The only clinician names in the legal
document are the header — *"seen by Youta Priti MD"*, the note's provider — and
`SIGNATURES`, the signer. Per-order attribution is stored and never printed, so
a requirement that the chart *show* who ordered what is not met by this artefact.

**Committing did not transmit.** `transmissionType: null`,
`manualProcessingStatus: "NEEDS_REVIEW"`. `Generic Lab` is a configured partner
and nothing reached it — a configuration fact about this instance, not a
guarantee.

**Canvas mints its own requisition and asserts a lab partner.** The order
carried Canvas requisition `B232B1844E2` and printed `LAB PARTNER: Generic Lab`.
For an order placed through Junction both are false in the record: a second
requisition competing with Junction's, and a lab that never touched the
specimen. **That is the argument for `CustomCommand` over `LabOrder` for the
Junction artefact** — it renders under its own declared section with our
content, inventing neither. Whether a `CustomCommand` survives into the signed
PDF is AL-100's T5 and is not yet proven.

### Withdrawal

`PATCH {enteredInError: true}` then `{deleted: true}`. `DELETE` answers `405`,
and the FHIR `ServiceRequest` then reads `status: entered_in_error` rather than
vanishing.

## Still untestable without more setup

- **Every command** (`ImagingOrder`, `Refer`, `LabOrder`, `Prescribe`) and every **effect**
  (`UPSERT_NOTE_METADATA`, `CREATE_OBSERVATION`, Custom Data Models,
  `CustomCommand`) are plugin-gated. A Canvas plugin is a prerequisite for
  *testing* the ordering architecture, not only for shipping it.
- **Junction**: no API key yet. `J1`/`J2` in the runner are written and skip
  cleanly; they decide whether priority 1 already works.
- **OAuth attribution on a write** needs the `authorization_code` browser login
  in `aleron-canvas-test`, not the service token the runner uses.
