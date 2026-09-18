# v2/journal.html and v2/reviews.html

**Screen purpose:** *journal* is the per-patient chronological record of every clinical act on one chart, one entry open at a time, with the locked-record block that names where each act physically lives. *reviews* is the cross-patient release audit for one physician: one row per release package, with both timestamps, what the patient can see, and the package hash.

**Data points audited:** 153 total — OK 61, GAP 44, WRONG 6, UNVERIFIED 9, NONE 33
(journal 93: OK 46, GAP 27, WRONG 5, UNVERIFIED 9, NONE 6 · reviews 60: OK 15, GAP 17, WRONG 1, UNVERIFIED 0, NONE 27)

Newly verified beyond `docs/canvas/API-GROUND-TRUTH.md` (in `Meridian-Web`) (all fetched 3 Sep 2026):

| Fact | URL |
|---|---|
| `Provenance` supports **read + search only**. Search params are `_id`, `agent`, `patient`, `target`, and **all four are marked Optional** — so `GET /Provenance?agent=Practitioner/{id}` is a legal cross-patient query. | `https://docs.canvasmedical.com/api/provenance/` |
| Provenance is auto-generated for: `AllergyIntolerance, CarePlan, CareTeamMembership, Condition, ConsolidatedImmunization, Coverage, Device, DiagnosticReport, DocumentReference, Encounter, Goal, Observation, Patient, Prescription, Procedure, ServiceRequest, UpdateGoal`. Activity is CREATE or UPDATE only. `recorded` is ISO 8601 with microsecond precision and offset (`2023-09-18T14:42:14.981528+00:00`). **The docs do not state whether UI-originated human acts generate Provenance or only API writes.** | same |
| **`AuditEvent` is not exposed.** It is absent from the 45-resource API reference. `Subscription` is also absent, and the FHIR reference documents **no webhook or event-notification mechanism of any kind.** | `https://docs.canvasmedical.com/api/` |
| `DocumentReference` search params: `_id`, `category`, `date`, `patient`/`subject`, `status`, `type`. Returns `author`, `custodian`, `date`, `type`, `category`, `status` (`current`/`superseded`/`entered-in-error`), `context.encounter`, `context.period`. **`relatesTo` is not documented** — there is no FHIR field for "this addendum amends that note". | `https://docs.canvasmedical.com/api/documentreference/` |
| Canvas custom **Note API** supports create, read, **update (PATCH)** and search, and a `stateChange` that includes **unlock** (`LKD` → `ULK`). Lock/sign timestamps are not documented as readable fields. `patient_key` filters search to one patient. | `https://docs.canvasmedical.com/api/note/` |
| Canvas **Plugin SDK events** include `PRE_/POST_COMMAND_COMMIT`, `PRESCRIPTION_CREATED / _SIGNED / _TRANSMITTED`, note state-change and lock/unlock events, `NOTE_OPENED/CLOSED`, `DOCUMENT_REVIEWER_ASSIGNED`. **Plugins do receive events for human acts performed natively in the Canvas UI**, but only for acts explicitly mapped in the event system. | `https://docs.canvasmedical.com/sdk/events/` |
| Junction `order.events[]` entries carry `id`, `created_at`, `status` (dotted modality sub-status, e.g. `received.testkit.requisition_created`), plus a new nullable `status_detail`. `last_event` is on the order body. `created_at` is second-precision UTC (`2022-01-01T00:00:00Z`). | `https://docs.junction.com/lab/workflow/lab-test-lifecycle`, `https://docs.junction.com/changelog/lab-testing/api` |

## What is the authoritative log, and can Aleron read it back?

There is no single authoritative log, and the journal as drawn is a three-source merge that cannot be ordered correctly. Canvas is authoritative for anything that reaches the chart, and its log is `Provenance` — read and search only, auto-generated for 17 resource types including `DocumentReference`, `ServiceRequest`, `Condition` and `Prescription`, carrying `agent`, `target`, `recorded` and a CREATE/UPDATE activity code. That is genuinely readable back, and readable cross-patient by `agent`, which is more than the ground-truth doc claimed. But `AuditEvent` does not exist on this API, `Subscription` does not exist, and there is **no webhook in the FHIR surface at all**, so Aleron only learns of a Canvas act by polling `GET /Provenance?patient={id}` on an interval. Junction is authoritative for lab orders and results, and its log is `order.events[]` — a separate, second-precision, vendor-clock event stream reachable only by webhook or poll. Aleron's own acts — release authorization, attestation against a preview hash, package generation, the package hash itself, visible/hidden action counts, read receipts, required-channel dispositions — exist in neither system and have **no resource anywhere**; every one of `reviews.html`'s 27 NONE rows is one of them. So the journal is a merge of a Canvas read, a Junction read, and an Aleron log that does not yet exist, and the reviews screen is almost entirely the third of those. The merge cannot be ordered reliably: three uncoordinated clocks, three timestamp precisions (Canvas microsecond, Junction second, Aleron display-minute), and a poll interval that means a Canvas act is inserted into the timeline at whatever position its `recorded` value claims, having been invisible to Aleron for up to one poll period. Worse, a physician acting natively in Canvas — signing a prescription, filing an amendment, marking a Condition entered-in-error — produces a Provenance entry Aleron will only see on the next poll and, for anything not on the 17-type list (`Task`, `MedicationRequest` as such, `Communication`), never at all. A journal that silently omits acts is the failure mode this screen was built to prevent, and as specified it has it. The one path that fixes the latency is a Canvas **plugin**, whose event stream does fire on native UI acts (`PRESCRIPTION_SIGNED`, `POST_COMMAND_COMMIT`, note lock/unlock) — but that inverts the architecture: the log then lives inside Canvas, not in Aleron, and whether a plugin can push outward to Aleron is not documented.

The blunt version: **make Canvas `Provenance` the authoritative spine, render Aleron acts as a clearly-marked second track rather than interleaving them, and stop claiming a single ordered timeline.**

## Data points — journal

### A. Rail and window chrome

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 1 | `Ethan Park` | Canvas FHIR:Patient (read by id) | OK | |
| 2 | `AL-47M` | Aleron | OK | Aleron-issued member code, not a Canvas id. If it must round-trip, SDK `CREATE_PATIENT_EXTERNAL_IDENTIFIER` or `Patient.identifier`. |
| 3 | `47M` | Canvas FHIR:Patient (`birthDate`, `gender`) | OK | |
| 4 | Avatar `EP` | Derived | OK | |
| 5 | Session actor `Dr. A. Okafor` | Aleron (Entra/Azure AD) | OK | Needs a matching Canvas `Practitioner` id to attribute any write; **no JIT provisioning**, the Canvas user must pre-exist. |
| 6 | `Log out` | Aleron | OK | |
| 7 | `Open in Canvas ↗` (rail foot) | Canvas SAML SSO | UNVERIFIED | Deep-linking from outside into a specific Canvas patient chart is not documented. SSO to the Canvas root is. |
| 8 | Route `aleron.md/chart/AL-47M/journal` | Aleron | OK | |

### B. Header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 9 | `5 entries` | Derived (Canvas FHIR:DocumentReference search + Aleron drafts) | GAP | Count over a merged set that is only as complete as the last poll. Correct at best eventually. |
| 10 | `1 unsigned` | Aleron | GAP | A draft has no Canvas resource. `DocumentReference` create requires `status: current`. |
| 11 | "signed entries never change, and a changed decision is a new entry" | Canvas FHIR:DocumentReference (no update) / Canvas API:Note (`stateChange` includes unlock) | **WRONG** | True if the entry is a `DocumentReference`. **False if it is a Canvas Note**, where `LKD → ULK` is a documented transition and PATCH exists. The screen asserts a platform guarantee that only one of the two storage choices provides. |

### C. Canvas mirror boundary

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 12 | "last confirmed at 06:40 today" | Aleron (integration health check) | OK | |
| 13 | "two DocumentReference writes are unreconciled" | Aleron | GAP | A `DocumentReference` create either succeeded or did not; FHIR has no pending state. "Unreconciled" means Aleron is **buffering signed clinical documents at rest** — patient data Aleron is chartered not to hold. |
| 14 | "Order statuses below still read live from the ledger" | Junction:`order.status` | OK | Live for labs. Not live for the two Device rows (see 51–55). |
| 15 | "the Canvas links may 404 until the mirror catches up" | Aleron | UNVERIFIED | Presumes a working deep link in the healthy case; see 7 and 86. |

### D. Time spine — five entries

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 16 | `7/1` | Aleron | OK | Aleron's own clock; not comparable to 20/24/28/32 below at better than day precision. |
| 17 | `Synthesis & plan · Cycle 1` | Aleron | GAP | Unsigned draft, no Canvas resource. |
| 18 | `draft` (open-dot node) | Aleron | GAP | |
| 19 | `cycle synthesis · non-visit encounter` | Canvas SDK:`CREATE_NOTE` (note type) | GAP | Encounter class for a not-yet-created note. Nothing exists in Canvas to read this from. |
| 20 | `6/24` | Canvas FHIR:DocumentReference.`date` | OK | |
| 21 | `Baseline results & genetics review` | Canvas FHIR:DocumentReference (`type` / description) | GAP | FHIR `type` is a LOINC code, not a free-text entry title. The human title needs `UPSERT_NOTE_METADATA` or an Aleron-side map. |
| 22 | `signed` (filled node) | Canvas FHIR:DocumentReference.`status = current` | GAP | `status` distinguishes current/superseded/entered-in-error, **not signed vs draft**. Signature state is not readable from DocumentReference. |
| 23 | `lab review · non-visit encounter` | Canvas FHIR:DocumentReference.`category` + Encounter (read) | GAP | Two facts flattened into one string; the encounter class comes from a second resource. |
| 24 | `6/16` | Canvas FHIR:DocumentReference.`date` | OK | |
| 25 | `Cardiology consult · Pacific Heart (2024)` | Canvas FHIR:DocumentReference (description) | OK | |
| 26 | `imported` (square node) | Canvas FHIR:DocumentReference.`author` / `custodian` | GAP | "Imported" is inferred from author not being an Aleron practitioner. No field says so. |
| 27 | `external document · read-only` | Derived | OK | |
| 28 | `6/14` | Canvas FHIR:DocumentReference.`date` | OK | |
| 29 | `CGM declined · shared decision` | Canvas FHIR:DocumentReference | GAP | As 21. |
| 30 | `signed` (6/14) | as 22 | GAP | |
| 31 | `portal encounter · change of direction` | Canvas FHIR:Encounter (read) + Aleron | GAP | Encounter class is readable; "change of direction" is an Aleron classification with no home. |
| 32 | `6/8` | Canvas FHIR:DocumentReference.`date` | OK | |
| 33 | `Intake · history, exam & baseline acquisition` | Canvas FHIR:DocumentReference | GAP | As 21. |
| 34 | `signed` (6/8) | as 22 | GAP | |
| 35 | `intake visit · comprehensive` | Canvas FHIR:Encounter.`class` / DocumentReference.`type` | GAP | |
| 36 | Spine ordering, "Newest first", one axis | Derived | **WRONG** | Entries 16 and 17/18 are Aleron-clocked; 20–35 are Canvas-clocked; the order statuses inside them are Junction-clocked. One monotonic axis across three uncoordinated clocks at day precision is not a sound ordering. See **Timeline merge risks**. |

### E. Open document — head and body

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 37 | `6/8/26` | Canvas FHIR:DocumentReference.`date` | OK | |
| 38 | `Dr. A. Okafor` (document author) | Canvas FHIR:DocumentReference.`author` → Practitioner | OK | |
| 39 | Triggered by: "New-member intake, in person." | Aleron / DocumentReference content | GAP | Not a FHIR field. Either frozen inside the document body or an Aleron field. |
| 40 | BMI `29.4 kg/m²` | Frozen note text (DocumentReference.`content`) | OK | Correctly frozen: this is signed text, **not** a live re-render of Canvas Observations. The screen is right to freeze it. |
| 41 | Waist `105 cm` | as 40 | OK | |
| 42 | BP `142/90 mmHg` untreated | as 40 | OK | |
| 43 | "low activity" | as 40 | OK | |
| 44 | "family history of T2D and hypertension" | as 40 | OK | |
| 45 | "acquire the baseline packet before any therapy decision" | as 40 | OK | |

### F. Orders in this note

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 46 | `Lab` · Baseline metabolic & lipid panel | Junction:`order.lab_test.name` | OK | |
| 47 | "resulted 6/22" | Junction:`order.events[]` where `status` reaches `completed`, `created_at` | OK | Second-precision UTC; the screen shows a date, which is safe. |
| 48 | "reviewed 6/24 review" (jump) | Aleron | GAP | A cross-entry link between two journal entries. No Canvas linkage field; `DocumentReference` has no documented `relatesTo`. |
| 49 | `Lab` · MBTA 163-gene panel | Junction:`order_set.lab_test_ids[]` | UNVERIFIED | Junction is **labs only**. Whether a 163-gene hereditary panel is orderable as a Junction lab test, versus going through Canvas's genetics integration, is not established. |
| 50 | "resulted 6/23, ATM P/LP, required channel" | Junction:`BiomarkerResult` / Canvas genetics | UNVERIFIED | `BiomarkerResult` is a numeric/reference-range shape. A P/LP variant call does not fit it. |
| 51 | `Device` · Overnight pulse oximetry | — | **NONE** | Junction places **lab** orders. There is no order object for a device. Canvas `ServiceRequest` has no create in FHIR; a Canvas `ImagingOrder`/`Refer` command does not cover an overnight oximetry device either. |
| 52 | "resulted, SpO₂ nadir `89 %`" | Junction Sense (device data) / Canvas SDK:`CREATE_OBSERVATION` | GAP | The value is reachable via wearables/device data; the **order** it is shown under is not. |
| 53 | "feeds the sleep-apnea candidate → Cycle 1 draft" (jump) | Aleron | GAP | As 48. |
| 54 | `Device` · CGM 14-day trial | — | **NONE** | As 51. |
| 55 | "canceled 6/14 → portal encounter" (jump) | — | **NONE** | Junction has a cancel-order path, but not for a device order that never existed. Canvas `ServiceRequest` is read-only in FHIR — Aleron cannot mark one cancelled either. |
| 56 | Column header "Status · live from the ledger" | Junction + Canvas (mixed) | GAP | "The ledger" is one word for two vendor systems on two clocks plus two rows with no system at all. |

### G. Signature line

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 57 | "Orders authorized & released `6/8 11:02`" | Aleron | **NONE** | Order authorization as a distinct Aleron act has no Canvas or Junction resource. Junction records `physician` on the order but no authorization timestamp attributable to Aleron. |
| 58 | "Note signed `6/8 18:47`" | Canvas API:Note `stateChange` → LKD / SDK `SIGN_NOTE` | GAP | Canvas Note API does **not document a readable lock/sign timestamp**. The nearest readable value is `Provenance.recorded` for the DocumentReference (see 64). |
| 59 | Signer `Dr. A. Okafor` | Canvas FHIR:Provenance.`agent` | OK | Readable. |
| 60 | "Statuses above are live reads…; the signed text below them never changes" | Derived | OK | The distinction is correct and is the best sentence on the screen. |

### H. Locked-record block

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 61 | "Orders signed `6/8/26 11:02`" | Aleron | **NONE** | As 57. |
| 62 | "4 orders released to Junction" | Junction | **WRONG** | Two of the four are Devices. Junction is labs-only. At most 2 orders went to Junction, and one of those (49) is unverified. |
| 63 | "Order record: `ServiceRequest` in Canvas, placed by command and read back" | Canvas FHIR:ServiceRequest (read/search) | **WRONG** | Direct contradiction with 62 on the same four orders. Ground truth §6.4: for Junction-placed labs, **"Canvas holds no order record for these, by design."** A row cannot be both a Junction order and a Canvas ServiceRequest. |
| 64 | "Note locked `6/8/26 18:47` · by Dr. A. Okafor" | Canvas FHIR:Provenance (`recorded` + `agent`, target = the DocumentReference) | OK | This is the one row on the screen that maps cleanly to the Canvas audit log. |
| 65 | "Note record: `DocumentReference cnv-doc-4471a9`" | Canvas FHIR:DocumentReference | OK | Real Canvas ids are 32-char hex; the fixture's short form is cosmetic. |
| 66 | "2 Conditions pushed to Canvas" | Canvas FHIR:Condition (create) | OK | |
| 67 | "1 push pending reconciliation" | Aleron | GAP | As 13 — implies an Aleron-side write queue holding a diagnosis. |
| 68 | "Addenda: None. An addendum would appear here as a linked, separately signed entry." | Canvas FHIR:DocumentReference | GAP | **`relatesTo` is not documented.** There is no FHIR field to record "this document amends that one". The link would have to live in `UPSERT_NOTE_METADATA` or an Aleron map. |
| 69 | `Append addendum` (button) | Canvas FHIR:DocumentReference (create a second document) | GAP | The create is fine; the *link* is the gap (68). Without it, an addendum is an unrelated document sharing a patient. |
| 70 | `Export PDF` | Aleron render / Canvas custom Letter API | OK | `DocumentReference.content` takes base64 `application/pdf`. |
| 71 | "The original note is never altered. This is the HIPAA amendment path." | Derived | OK | Correct for DocumentReference; see 11 for the Note-API caveat. |

### I. Imported entry

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 72 | `external document · read-only` | Derived | OK | |
| 73 | `Cardiology consult · Pacific Heart (2024)` | Canvas FHIR:DocumentReference (description) | OK | |
| 74 | `6/16/26` | Canvas FHIR:DocumentReference.`date` | OK | |
| 75 | `L. Ferreira, MD` | Canvas FHIR:DocumentReference.`author` | UNVERIFIED | For a fax intake, `author` is plausibly the Canvas user who indexed the fax, not the external clinician who wrote it. |
| 76 | `fax import` | Canvas FHIR:DocumentReference.`category` | UNVERIFIED | Canvas categories are a documented enum; whether an intake-channel value exists is not established. |
| 77 | "Filed to chart 6/16 through the Canvas document integration" | Derived | OK | |
| 78 | Stress echo body, `91 % predicted max HR` | Canvas FHIR:DocumentReference.`content` | OK | Frozen text, correct. |
| 79 | "None carried in this system. External orders live with their external author." | Derived | OK | |
| 80 | "Custodian: Canvas EMR · system of record for the full chart" | Canvas FHIR:DocumentReference.`custodian` | **WRONG** | `custodian` is the Organization that maintains the record. For a faxed external consult that is Pacific Heart, not Canvas. The screen has substituted the hosting system for the custodial organization — which is precisely the distinction the entry's own copy ("Aleron is not its custodian") is making. |
| 81 | `DocumentReference cnv-doc-2f81c4` | Canvas FHIR:DocumentReference.`id` | OK | |
| 82 | `Canvas patient cnv-pt-9d20` | Canvas FHIR:Patient.`id` | OK | |
| 83 | "Received `16 Jun 2026 07:22`" | Canvas FHIR:DocumentReference.`date` | OK | Canvas clock. Compare 57's `11:02` on Aleron's clock — see merge risks. |
| 84 | "fax intake, indexed by the document integration" | Canvas | OK | |
| 85 | "Mirror state: last confirmed 06:40 today" | Aleron | OK | |
| 86 | `Open in EMR tab` + SSO caveat | Canvas SAML SSO | UNVERIFIED | Deep link to a specific DocumentReference inside Canvas is not documented. Ground truth calls the return leg "a sentence, not a mechanism". |

### J. Disclosure — "What a signature does"

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 87 | "Two clocks": signing orders vs locking the note | Canvas SDK + Aleron | GAP | The two clocks are real but they are also two *systems'* clocks, which the copy does not say. |
| 88 | "an order can transmit from a note that is not yet locked" | Canvas SDK:`send()` on Prescribe/Refill/AdjustPrescription | UNVERIFIED | Ground-truth open question: whether `send()` works on an unsigned command is not established. `originate(commit=True)` is silently ignored for order commands. |
| 89 | "Locking freezes the note and generates the archival PDF and the Canvas DocumentReference" | Canvas FHIR:DocumentReference (create, base64 PDF) | OK | |
| 90 | "amends by appending a linked, separately signed addendum" | Canvas FHIR:DocumentReference | GAP | "Linked" is the unimplementable word. See 68. |
| 91 | "A changed decision is a new entry, never an edit." | Derived | OK | |
| 92 | "Release is a third, separate act and it happens in Care Plan." | Aleron | **NONE** | No Canvas or Junction resource for release. |
| 93 | "One authenticated signature covers every order enumerated in it." | Junction:`physician` / Canvas command `sign()` | UNVERIFIED | Junction takes a `physician` block (`npi`, `licensed_states`, `signature_image`) per order, not one signature over a set. Canvas `sign()` is per command. The one-signature-many-orders model is an Aleron construct neither vendor represents. |

## Data points — reviews

### A. Rail

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 1 | `Dr. A. Okafor` | Aleron (Entra) | OK | |
| 2 | `Physician · LASO Wellness` | Aleron | OK | |
| 3 | Inbox `7` | Derived (cross-patient) | GAP | Cross-patient aggregate; no single call. See 24. |
| 4 | Panel `146` | Canvas FHIR:Group (read/search) or CareTeam search | GAP | Nearest surface is `CareTeam?participant=Practitioner/{id}` or a `Group`. Neither is verified to produce a physician's panel roster. |
| 5 | Reviews `3` | Derived (Aleron) | GAP | 2 pending + 1 blocked. Depends on the Aleron log existing. |
| 6 | Messages `2` | Canvas FHIR:Communication (search) | GAP | Cross-patient `Communication` search is permitted, but "unread for this physician" is not a FHIR concept. |
| 7 | `Practice standing orders` (rail foot) | Aleron | GAP | Practice-wide registry, no Canvas resource. |
| 8 | Route `aleron.md/reviews` | Aleron | OK | |

### B. Header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 9 | "Newest release first" | Aleron | **NONE** | Sort key is the release timestamp, an Aleron-only value. |
| 10 | "Every package you signed and every package you released, across your panel" | Aleron | OK | Scope statement, correct. |
| 11 | "nothing on this screen can be changed from it" | Aleron | OK | |

### C. Counts

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 12 | Released this month `14 packages` | Aleron | **NONE** | Canvas has no release concept. `Provenance?agent=` returns Canvas acts, not Aleron releases. |
| 13 | Signed, release pending `2 packages` | Aleron | **NONE** | |
| 14 | Awaiting Canvas linkage `1 package` | Derived (Aleron package + Canvas FHIR:DocumentReference search) | GAP | Implementable as a poll: does a DocumentReference exist for this plan? Latency = poll interval. |
| 15 | "patient visibility withheld" | Aleron | **NONE** | |
| 16 | Validation failures `1 package` | Aleron (engine) | **NONE** | |
| 17 | `blocked` tile | Aleron | **NONE** | |

### D. Slice tabs

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 18 | All acts `41` | Aleron | **NONE** | |
| 19 | Released `37` | Aleron | **NONE** | |
| 20 | Signed only `3` | Aleron | **NONE** | |
| 21 | Blocked `1` | Aleron | **NONE** | |
| 22 | "Retention: append-only, no expiry" | Aleron | GAP | A promise about a store that does not exist yet, and whose existence contradicts the no-patient-data charter. |
| 23 | Slice note: "*N* of 6 packages on this screen are carried as fixtures" | Fixture / reviewer copy | **WRONG** | This string is rendered into the **product surface** (`#rv-slicenote`, `role="status"`, inside `.pwrap`, not inside a `wf-scaffold`). It is reviewer chrome talking about fixtures, shown to a physician. BRIEF: reviewer chrome stays in `wf-*`. |

### E. Audit table

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 24 | Patient names ×6 (Ferreira, Okonjo, Lindqvist, Vasquez, Raghunathan) | Canvas FHIR:Patient (read by id, per row) | GAP | Cross-patient. `Patient` search is permitted, but this is N reads fanned out from an Aleron row set; Canvas OAuth is **tenant-scoped, not physician-scoped**, so "relevant patient" (52) is enforced by Aleron alone. |
| 25 | `AL-63M` … `AL-44F` codes ×6 | Aleron | OK | |
| 26 | Age/sex `63M` … `44F` ×6 | Canvas FHIR:Patient | GAP | As 24. |
| 27 | Package names ×6 ("Cardiometabolic plan, cycle 3" etc.) | Aleron | **NONE** | |
| 28 | `PLAN-63M-0007` … ×6 | Aleron | **NONE** | Nearest Canvas home: `UPSERT_NOTE_METADATA` on the signed note. |
| 29 | `RUN-63M-0011` … ×5 | Aleron (engine run id) | **NONE** | As 28. |
| 30 | "hold copy only, no actions" | Aleron | **NONE** | |
| 31 | "superseded by cycle 3, still readable" | Aleron | GAP | **Nearest real mapping exists**: `DocumentReference.status = superseded`. If each released package writes a DocumentReference, supersession is readable from Canvas. |
| 32 | Signed dates ×5 (`19 Aug 2026` …) | Canvas FHIR:Provenance.`recorded` **or** Aleron | GAP | The screen does not say which act "Signed" is. If it is the note lock, Provenance gives it. If it is an Aleron attestation over a preview hash (see 45), Canvas has nothing. |
| 33 | Signed times ×5 (`14:22`, `09:04`, `16:40`, `11:12`, `08:55`) | as 32 | GAP | Minute precision against Canvas microsecond and Junction second. See merge risks. |
| 34 | Signed actor `Dr. A. Okafor` ×5 | Canvas FHIR:Provenance.`agent` | OK | Readable, cross-patient, by `agent`. |
| 35 | `not signed` (Raghunathan) | Aleron | OK | Absence of an act. |
| 36 | Released dates + times ×4 (`19 Aug 14:31` …) | Aleron | **NONE** | |
| 37 | Released actor ×4 | Aleron | **NONE** | |
| 38 | `not released` + "Awaiting Canvas note linkage, per section 7" | Derived (Aleron + Canvas read) | GAP | As 14. |
| 39 | `blocked` + "Two visible recommendations lack provenance" | Aleron (engine validation) | **NONE** | Note the word collision: this "provenance" is **model** provenance, in a product that also reads FHIR `Provenance`. Two different things, one word, on an audit screen. |
| 40 | Visible/hidden counts ×6 (`6 visible · 2 hidden` …) | Aleron | **NONE** | Package contents. Nothing in Canvas or Junction models patient visibility. |
| 41 | "1 required item, disposed." | Aleron | **NONE** | Required-channel disposition. Nearest home: `UPSERT_NOTE_METADATA`. |
| 42 | "Read receipt 26 Aug." | Aleron (patient app) | **NONE** | |
| 43 | "Genetics not ordered, no genetics policy attached." | Derived (absence across Junction + Canvas) | GAP | Absence-detection across two systems. Only as reliable as the poll of both. |
| 44 | "Physician-approved hold copy released so the wait is not silent." | Aleron | **NONE** | |
| 45 | "Preview hashed and attested. Patient visibility stays closed until both authorizations are satisfied." | Aleron | **NONE** | Attestation against a hash is the single most audit-critical act on this screen and has no resource anywhere. |
| 46 | "Release validation failed, so no package was produced and nothing reached the patient app." | Aleron | **NONE** | |
| 47 | "Superseding a package does not delete it. Both rows stand." | Aleron | OK | |
| 48 | Package hashes ×4 (`pkg 4c9e a7f2 1d06 b358` …) | Aleron | **NONE** | |
| 49 | Preview hash ×1 (`preview d5a2 1e88 47cc 90f4`) | Aleron | **NONE** | |
| 50 | `no package emitted` | Aleron | OK | Absence, correctly recorded. |
| 51 | "The hash is the package the patient app received, not a rendering of it." | Aleron | OK | |

### F. Disclosure — "Why nothing on this screen has an edit control"

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 52 | "Read relevant patient" grant | Aleron | GAP | Canvas OAuth credentials are tenant-wide. Canvas cannot enforce per-physician patient relevance; Aleron must, and the screen's cross-patient reads (24, 26) go through Aleron's own filter. |
| 53 | "immutable append-only" | Aleron | GAP | True of Canvas `Provenance` (no create, no update, auto-generated). Not yet true of anything Aleron owns. |
| 54 | Source `Aleron MD Role and Release Matrix v1` §§2, 6 | Aleron doc | OK | Scaffold, correctly inside `wf-scaffold`. |
| 55 | "Physician: Read, relevant patients only. No write path exists." | Aleron | OK | |
| 56 | "Admin: Read and export. Still no write path." | Aleron | OK | |
| 57 | "Recorded per act: Actor id, signature or release authorization id, timestamp, package hash" | Aleron | **NONE** | This is the schema of the log that does not exist. Canvas `Provenance` records `agent`, `target`, `recorded`, activity — no signature id, no hash. |
| 58 | "Validation failure recorded with its failure reason. No package id." | Aleron | **NONE** | |
| 59 | "Section 7: patient visibility opens only after both the Aleron release authorization and the required Canvas linkage are satisfied." | Canvas FHIR:DocumentReference (search, to confirm linkage) | OK | The Canvas half is a legitimate read. |
| 60 | "a row is appended by the service worker at the moment of the act and is never rewritten" | Aleron | GAP | "At the moment of the act" is false for any Canvas-originated act, which Aleron learns about at the next poll. |

## Timeline merge risks

| Risk | What breaks | Mitigation |
|---|---|---|
| **Three uncoordinated clocks.** Canvas `Provenance.recorded` (Canvas server), Junction `events[].created_at` (Junction server), Aleron release/authorization timestamps (Aleron server). | Same-day interleaving on the journal spine is arbitrary. Journal 57 (`6/8 11:02`, Aleron) and 83 (`16 Jun 07:22`, Canvas) are drawn on one axis with no indication they came from different clocks. Reviews 33's `14:22` vs `14:31` nine-minute sign→release gap is only meaningful if both came from the same clock; if "Signed" is a Canvas Provenance value and "Released" is Aleron's, the interval can be negative. | Store the source clock alongside every timestamp. Render Aleron acts as a visually distinct second track. Where two acts are within the skew window, show the day only. |
| **Differing precision.** Canvas microsecond (`…14.981528+00:00`), Junction second (`…T00:00:00Z`), Aleron display minute. | Ties at the displayed precision are resolved by insertion order, which is poll order, which is not act order. | Sort on full-precision UTC internally; never sort on the rendered string. |
| **No Canvas push.** `Subscription` absent, no webhook in the FHIR API, `AuditEvent` absent. Provenance is poll-only. | A second physician signing a prescription in Canvas at 09:00 appears in the journal only after the next poll, then inserts *backwards* into the timeline. A physician who read the journal at 09:05 saw an incomplete record and had no signal that it was incomplete. | Poll `GET /Provenance?patient={id}` on a fixed interval; **show the last-poll time on the spine** (the screen already has this pattern in the mirror boundary, 12). Or run a Canvas plugin subscribing to `POST_COMMAND_COMMIT` / `PRESCRIPTION_SIGNED` / note lock events for near-real-time — but that inverts where the log lives. |
| **Provenance does not cover everything.** The 17-type list omits `Task`, `Communication`, `MedicationRequest` as such (it lists `Prescription`), `Media`, `MedicationStatement`. | Acts on those resources are invisible to Aleron entirely, at any poll frequency. The journal silently omits them. | Enumerate covered vs uncovered types and put the uncovered list in front of clinical review before the journal is called a record. |
| **UI-vs-API origin undocumented.** Canvas docs do not state whether Provenance fires for human UI acts or only API writes. | If it is API-only, the entire "acts Aleron never sees" story has no read path at all and the journal is Aleron's acts plus imported documents, nothing more. | **Spike this first.** It is the single highest-leverage unknown on both screens. Test: perform a UI act in a Canvas sandbox, then `GET /Provenance?patient=`. |
| **Aleron's write queue.** Journal 13 and 67 assert unreconciled DocumentReference and Condition writes. | Aleron holds signed clinical documents and diagnoses at rest while the queue drains. That is patient data in Aleron, which the charter forbids. | Either accept a bounded, encrypted outbox as an explicit charter exception, or fail the write synchronously and show the act as *not recorded* rather than *pending*. |
| **Junction has its own log, not merged.** `order.events[]` is a per-order event stream with its own ids and clock. | The journal shows one status string per order (47, 52, 55), collapsing a multi-event history. An order that went `received → collecting_sample → cancelled → …` reads as one word. | Render `order.events[]` as the order's own sub-timeline on expand; keep it out of the main spine. |

## Required changes

1. **Resolve orders 62/63 — the same four orders cannot be both Junction orders and Canvas ServiceRequests.** Pick one per order type: labs and genetics go to Junction and have **no** Canvas order record (ground truth §6.4); imaging and referrals go to Canvas as `ImagingOrder`/`Refer` commands and *do* produce a readable `ServiceRequest`. Rewrite the locked-record rows to be per-order, not one blanket row. *Medium — two dl rows and the four table rows.*
2. **Remove or re-source the two Device orders (51, 54, 55).** Neither Junction nor Canvas takes an order for an overnight oximetry study or a CGM trial as drawn. Either replace them with a lab (which both systems support) or annotate them `gap` and say the ordering path does not exist. *Medium — the fixture and the two status strings.*
3. **Fix `custodian` (80).** For an external faxed consult the custodian is Pacific Heart, not Canvas EMR. Add a separate row for the hosting system if that is what is meant. *Small — one dl row.*
4. **Qualify the immutability claim (11).** "Signed entries never change" holds for `DocumentReference` and not for a Canvas Note, which has a documented unlock transition. Either commit the design to DocumentReference storage and say so, or soften the claim. *Small — one sentence, but it decides a storage choice.*
5. **Name the addendum-link gap (68, 69, 90).** `DocumentReference` has no documented `relatesTo`. Add a `gap` annotation and pick a carrier — `UPSERT_NOTE_METADATA` is the cheap one. As drawn, `Append addendum` produces an unlinked document. *Medium.*
6. **Move the slice note out of the product surface (reviews 23).** "carried as fixtures" is reviewer copy inside `.pwrap`. Wrap it in `wf-scaffold` or move it into `wf-annotations`; keep an `aria-live` count that says something a physician acts on. *Small.*
7. **Split the timeline into two tracks, or stamp the clock.** Journal 36 orders three clocks on one axis. At minimum, mark Aleron-originated entries distinctly (the spine already uses shape for state, so use a second channel) and show the last Canvas poll time on the spine. *Large — it is a layout decision.*
8. **Decide where the Aleron log lives, and write down the charter exception.** 33 of 153 data points have no home in Canvas or Junction. Section E of reviews is almost entirely them. *Large — an architecture decision, not a screen fix.*
9. **Spike whether Canvas Provenance fires on UI-originated acts.** Everything in "acts Aleron never sees" depends on it. *Small to run, large in consequence.*
10. **Verify the genetics path (49, 50).** Junction is labs-only and `BiomarkerResult` has no shape for a variant call. If genetics goes through Canvas's genetics integration instead, the journal row is sourced wrong. *Medium.*

## Alternative pathways

**Journal 51 / 54 / 55 — Device orders (NONE).** No API takes them. Options, cheapest first: (a) **drop** them from the fixture and use a second Junction lab, which costs nothing and loses only the visual variety of the `Device` badge; (b) **redirect into Canvas** — the physician places the sleep study natively as a Canvas order and Aleron reads back the resulting `ServiceRequest`, which is the honest model and matches the prescription redirect already in the design; (c) record them as Aleron-only intents with `UPSERT_PATIENT_METADATA` carrying the device, the date and the status, accepting that the status is then Aleron's assertion and not a live read — which directly contradicts the column header "live from the ledger".

**Journal 57 / 61 / 92 — release and order-authorization acts (NONE).** (a) `UPSERT_NOTE_METADATA` on the signed note, keyed `aleron.release.authorized_at`, `aleron.release.actor`, `aleron.release.package_hash` — Canvas becomes the durable home, the value is readable back, and Aleron stores nothing. Cost: requires the Plugin SDK, so it only works where a Canvas plugin is deployed; metadata is not searchable cross-patient, so it feeds the journal but **not** reviews. (b) Canvas FHIR `Communication` create — a real resource, cross-patient searchable, and semantically close ("a plan was released to the patient"). Cost: `Communication` has no update, and its payload is a message body, so the hash rides as text. This is the strongest option for reviews. (c) Aleron's own append-only log. Cost, stated plainly: an audit log of clinical acts keyed to patient id, carrying package hashes over clinical content, **is patient data**. The charter says Aleron stores none. Choosing (c) is choosing to amend the charter, and it should be written as an exception with a retention policy, not arrived at by default.

**Journal 68 / 69 / 90 — addendum linkage (GAP).** (a) `UPSERT_NOTE_METADATA` with `amends: <original DocumentReference id>` on the addendum. Cheapest, SDK-only, readable back. (b) Put the reference in the addendum's own body text as a human-readable line — zero API cost, unqueryable. (c) Drop the word "linked" and say an addendum is a new entry that names the note it amends in its first line, which is what a paper chart does.

**Journal 7 / 15 / 86 — Canvas deep links (UNVERIFIED).** The only documented path is SAML SSO to Canvas. Nearest workable: link to the Canvas patient chart root rather than a specific document, and say so ("opens the chart, not this note"). Cost: one extra click and a small loss of precision, in exchange for a link that does not 404 by design. Verify the per-note URL shape against a real tenant before promising it.

**Reviews 12–21, 27–30, 36–37, 40–42, 44–46, 48–49, 57–58 — the entire package model (NONE).** There is no partial workaround: either Aleron keeps a log (see above, with its charter cost) or the screen does not exist. The middle option worth costing: keep the **log** in Canvas as one `Communication` per release (create is permitted, cross-patient search is permitted) and have reviews read Canvas rather than Aleron. Aleron then stores nothing, the record is in the system of record where an auditor would look for it, and supersession maps to a second Communication. Cost: `Communication` is not designed for this, the visible/hidden counts and read receipts still have no field, and the physician-scoping (52) still has to be Aleron's.

**Reviews 31 — supersession (GAP).** Real mapping available: write each released package as a `DocumentReference` and set the prior one to `status: superseded`. That is the field's actual meaning and it is readable back. Do this rather than tracking supersession in an Aleron column.

**Reviews 4 — Panel 146 (GAP).** Nearest: `CareTeam?participant=Practitioner/{id}` (CareTeam is read/search, and uniquely also update) or a Canvas `Group`. Neither is verified to be a physician panel. Alternative: the count is Aleron's own membership roster, which Aleron legitimately owns, and the screen should not imply it came from the chart.

**Reviews 23 — fixture copy on the product surface (WRONG).** Delete it or move it into `wf-scaffold`. No API involved; this is a BRIEF violation.

**Journal 80 — custodian (WRONG).** Read `DocumentReference.custodian` and render it. If the fixture wants to say Canvas hosts the document, that is a second row labelled as the hosting system.

**Journal 11 / 36, Reviews 60 — claims about ordering and immutability (WRONG/GAP).** No API alternative; these are copy changes that make the screen tell the truth about the merge.

## Contradictions with what the screens already claim

> "Orders signed 6/8/26 11:02 · **4 orders released to Junction**" … "Order record: **`ServiceRequest` in Canvas**, placed by command and read back"

Two rows of the same `dl`, about the same four orders. Junction-placed labs leave no Canvas `ServiceRequest`; Canvas-placed imaging and referrals never go to Junction. Both rows cannot be true of the same set.

> "The order record named a resource that does not exist. `Lab Order Authorization, mirrored to Canvas` is now `ServiceRequest`, placed by command and read back, because the Canvas FHIR API has no create for it."

The fix corrected the resource name but kept the wrong routing: for the two **lab** orders in this note, the correct answer is not "ServiceRequest placed by command" but "no Canvas order record exists, by design."

> "signed entries never change, and a changed decision is a new entry"

True of `DocumentReference`, which has no update. The Canvas **Note API** documents PATCH and a `stateChange` that unlocks a locked note (`LKD → ULK`). The screen asserts a platform guarantee that depends on a storage choice the screen never makes.

> "An addendum would appear here as a **linked**, separately signed entry."

`DocumentReference` does not document `relatesTo`. There is no field for the link.

> "Custodian: **Canvas EMR** · system of record for the full chart" — on an entry whose own copy says "Aleron is not its custodian."

The entry correctly reasons about custody and then names the hosting system as the custodian of a document authored at Pacific Heart.

> "two **DocumentReference writes are unreconciled**"

FHIR has no unreconciled state. This says Aleron is holding signed clinical documents in a local queue — against "Canvas holds all patient data; Aleron stores none."

> "Order statuses below still read **live from the ledger**"

Two of the four orders have no ledger in any system, and the other two are on Junction's clock, not "the ledger's".

> "a row is appended by the service worker **at the moment of the act** and is never rewritten"

For any Canvas-originated act, the row is appended at the moment of the **next poll**. There is no Canvas push.

> "*N* of 6 packages on this screen are carried as **fixtures**."

Reviewer language rendered into the product surface at `#rv-slicenote`, outside `wf-scaffold`.

> "Retention: append-only, no expiry" / "The service worker appends; nobody edits."

Both are promises about an Aleron store that does not exist and whose existence is in tension with the no-patient-data charter. Canvas `Provenance` genuinely is append-only-by-construction; Aleron's log is append-only by policy.

## Open questions for the humans

1. **Does Canvas `Provenance` fire for acts a human performs in the Canvas UI, or only for API writes?** The docs do not say. Everything in "acts Aleron never sees" hangs on this. Highest priority.
2. **Is the journal entry a `DocumentReference` or a Canvas Note?** They have different immutability guarantees (no update vs PATCH + unlock) and different search shapes. The screen assumes DocumentReference in one row and Note-like signing in another.
3. **Will a Canvas plugin be deployed?** If yes, `UPSERT_NOTE_METADATA` and the real-time event stream solve most of the GAP rows and the poll-latency risk, and Aleron stores nothing. If no, the only surface is FHIR polling and the Aleron log is unavoidable.
4. **Can a Canvas plugin make outbound HTTP calls to Aleron?** `SimpleAPIRoute` is inbound. If outbound is possible, the event stream can push; if not, the plugin can only write metadata Aleron later polls.
5. **What is the poll interval, and what is the acceptable staleness for a clinical audit trail?** The mirror boundary already shows a last-confirmed time, so the design has anticipated this; the number has not been chosen.
6. **Does the charter permit an Aleron-owned audit log of clinical acts?** 33 data points require it. Name the exception or delete the reviews screen.
7. **Is the 163-gene panel a Junction lab test or a Canvas genetics integration?** `BiomarkerResult` has no shape for a P/LP variant call.
8. **What actually places an overnight oximetry order and a CGM trial?** Neither vendor has a path as drawn.
9. **Does `send()` work on an unsigned Canvas order command?** Journal 88 asserts an order can transmit from an unlocked note.
10. **How is "relevant patient" enforced?** Canvas OAuth is tenant-scoped. Reviews reads six patients cross-chart; the filter is Aleron's, and the matrix grant is therefore an Aleron promise, not a Canvas control.
11. **Should "provenance" keep two meanings?** The reviews screen says "lack provenance" (model provenance) on the same product that reads FHIR `Provenance` as its audit log.
