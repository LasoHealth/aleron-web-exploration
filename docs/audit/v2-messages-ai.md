# v2/messages.html and v2/aleron-ai.html

**Screen purpose:** `messages.html` is the physician's patient-facing message channel, thread list plus one open thread plus a composer whose reference picker is gated on the release lifecycle. `aleron-ai.html` is an isolated per-patient assistant that answers from the chart and emits adoptable clinical claims with evidence for and against.

**Data points audited:** 159 total — OK 95, GAP 36, WRONG 6, UNVERIFIED 17, NONE 5

Newly verified against live docs beyond `docs/canvas/API-GROUND-TRUTH.md` (in `Meridian-Web`) (all fetched 3 Sep 2026):

| Fact | Source |
|---|---|
| FHIR `Communication` create accepts only `status`, `sent`, `received`, `sender`, `recipient`, `payload` (**`contentString` only**). No `inResponseTo`, `partOf`, `basedOn`, `category`, `medium`, `topic`, `about`, `encounter`, `note`, no attachment payload. | https://docs.canvasmedical.com/api/communication/ |
| `Communication` search parameters are exactly `_id`, `patient`, `recipient`, `sender`. No date filter, no `_sort`, no status filter. | https://docs.canvasmedical.com/api/communication/ |
| `Communication` search **returns only practitioner↔patient messages, never practitioner↔practitioner**. | https://docs.canvasmedical.com/api/communication/ |
| Read state exists in exactly one form: a message to a practitioner with no `received` timestamp shows unread; the practitioner clears it **in the Canvas UI**. `Communication` has no update, so an external app cannot set it. | https://docs.canvasmedical.com/api/communication/ |
| No threading or conversation grouping concept anywhere in `Communication`. | https://docs.canvasmedical.com/api/communication/ |
| SDK Message effects: `CREATE_MESSAGE` (`content`, `sender_id`, `recipient_id`; `message_id` must be unset), `EDIT_MESSAGE` (`message_id` required, `content`/`sender_id`/`recipient_id` optional), `SEND_MESSAGE` (`message_id`; **Staff→Patient only**), `CREATE_AND_SEND_MESSAGE`. Sender and recipient must each be Patient or Staff; Patient↔Patient forbidden. | https://docs.canvasmedical.com/sdk/effect-messages/ |
| **The Message effect does not support attachments.** No thread field. Read state is a `read` timestamp that effects cannot set. | https://docs.canvasmedical.com/sdk/effect-messages/ |
| A Staff→Patient message can be created as a draft and sent later (`CREATE_MESSAGE` then `SEND_MESSAGE`); a Patient→Staff message cannot be drafted. Editing an already-created message is permitted. | https://docs.canvasmedical.com/sdk/effect-messages/ |
| SDK Task effects: `CREATE_TASK`, `UPDATE_TASK`, `CREATE_TASK_COMMENT`, `UPSERT_TASK_METADATA`. | https://docs.canvasmedical.com/sdk/effects/ |

**The single most consequential newly verified fact:** Canvas messaging is a flat, two-party, patient↔staff message list with no thread object, no attachments, no reference field, and a read flag only Canvas itself can clear. `messages.html` draws threads, attaches references, scopes by assignment, shows a clearable unread count, and claims an audit append. Four of those five are not in the API.

---

## Data points — messages

### Rail

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| M1 | `Dr. A. Okafor` (rail identity block) | `Canvas FHIR:Practitioner` (read) | OK | Also available from the Entra session. |
| M2 | `Physician · LASO Wellness` | `Canvas FHIR:Practitioner` + `Organization` (read) | UNVERIFIED | `PractitionerRole` is not in the read matrix; how a practitioner is bound to an organisation for display is not established. |
| M3 | Avatar initials `AO` | `Derived` | OK | From M1. |
| M4 | Inbox count `7` | `Canvas FHIR:Task` (search) | GAP | Aleron's inbox is not one Canvas resource; the count is a union of Tasks, unread Communications and Aleron review states. No single search returns it. |
| M5 | Panel count `146` | `Canvas FHIR:CareTeam` (search) | GAP | Canvas has no panel concept. CareTeam is read+update only and is per-patient, so a panel is N searches or an Aleron-held roster. |
| M6 | Reviews count `3` | `Aleron` | OK | Board-review engine state, no Canvas equivalent. |
| M7 | Messages count `2` (unread) | `Canvas FHIR:Communication` (search) | GAP | Computable only by fetching every Communication where `recipient` is this practitioner and counting those with no `received`. No unread filter, no count endpoint. Unbounded fetch. |
| M8 | `Practice standing orders` | `Aleron` | OK | |
| M9 | `Dr. A. Okafor` + `Log out` in rail foot | `Aleron` (Entra) | OK | |
| M10 | URL `aleron.md/messages/AL-47M` | `Aleron` | OK | |

### Header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| M11 | `6 assigned threads` | `Derived` | GAP | "Thread" is not a Canvas object. See M14. |
| M12 | `2 unread` | `Canvas FHIR:Communication.received` (search) | GAP | Readable, **not clearable**. Opening the thread in Aleron cannot mark it read: `Communication` has no update and SDK Message effects cannot set read state. The badge only clears when the physician opens Canvas. |
| M13 | `Only assigned threads appear here` | `Aleron` | GAP | Canvas has no assignment on a Communication and no thread-level scope. Search is scoped by `patient`/`sender`/`recipient` only. |

### Thread list

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| M14 | Thread count `6` | `Derived` | GAP | A thread is reconstructed client-side: search Communications per patient, group by `patient`, sort by `sent`. Nothing in Canvas persists the grouping. |
| M15 | Row name `Ethan Park` | `Canvas FHIR:Patient` (read) | OK | |
| M16 | Row time `08:52` | `Canvas FHIR:Communication.sent` (search) | OK | |
| M17 | Row preview, last message text, 2-line clamp | `Canvas FHIR:Communication.payload.contentString` | GAP | "Last message" requires the whole history per patient; search has no date filter and no sort. Six threads is six full-history fetches. |
| M18 | Row code `AL-47M` | `Canvas FHIR:Patient.identifier` | OK | |
| M19 | `review pending` | `Aleron` / `Canvas SDK:UPSERT_PATIENT_METADATA` | OK | Release lifecycle state; metadata is the right home. |
| M20 | Row `Joseph Ferreira` · `Yesterday` · preview | as M15–M17 | OK | Relative date is `Derived` from `sent`. |
| M21 | `AL-63M · plan released 19 Aug` | `Aleron` / `UPSERT_PATIENT_METADATA` | OK | |
| M22 | Row `Tomas Lindqvist` · `27 Aug` · preview | as M15–M17 | OK | |
| M23 | `AL-52M · hold copy released` | `Aleron` / `UPSERT_PATIENT_METADATA` | OK | |
| M24 | Row `Grace Okonjo` · `22 Aug` · preview | as M15–M17 | OK | |
| M25 | `AL-41F · action tracking active` | `Aleron` | OK | |
| M26 | Row `Marcus Bell` · `18 Aug` · preview | as M15–M17 | OK | |
| M27 | `AL-39M · ops also on thread` | `NONE` | WRONG | Canvas has no multi-participant thread, and Communication search **excludes practitioner↔practitioner entirely**. An ops staff member messaging this patient produces a separate two-party message list the physician's search cannot see as one conversation. |
| M28 | Row `Mara Chen` · `14 Aug` · preview | as M15–M17 | OK | |
| M29 | `AL-56F · plan editing` | `Aleron` | OK | |
| M30 | Selected-thread state (`aria-current="true"`) | `Derived` | OK | UI state. |
| M31 | List ordered most-recent first | `Derived` | GAP | No `_sort` on Communication; ordering is client-side over a full fetch. |

### Open thread header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| M32 | `Ethan Park` | `Canvas FHIR:Patient` (read) | OK | |
| M33 | `AL-47M · 47M` | `Canvas FHIR:Patient` (`identifier`, `birthDate`, `gender`) | OK | Age is `Derived`. |
| M34 | `thread opened 12 Jun 2026` | `Derived` (earliest `Communication.sent`) | GAP | Requires the complete history. Also asserts messages exist before 14 Aug that the log does not show, with no "earlier messages" affordance. |
| M35 | `Open chart` link | `Aleron` | OK | Internal route. |

### Message log

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| M36 | msg 1 sender `Dr. A. Okafor` | `Canvas FHIR:Communication.sender` → `Practitioner` | OK | |
| M37 | msg 1 role `Physician · LASO Wellness` | `Derived` from M2 | UNVERIFIED | Same organisation-binding gap. |
| M38 | msg 1 `NPI 1487520394` | `Canvas FHIR:Practitioner.identifier` (read) | GAP | Resolved at render from the sender reference, **not stored on the message**. So the NPI shown is current, not as-at-send; if the practitioner record changes, historical messages silently re-attribute. |
| M39 | msg 1 timestamp `14 Aug 2026, 10:20` | `Canvas FHIR:Communication.sent` | OK | |
| M40 | msg 1 body text | `Communication.payload.contentString` | OK | |
| M41 | msg 2 sender `Ethan Park` | `Communication.sender` → `Patient` | OK | |
| M42 | msg 2 role `Member` | `Derived` from sender resource type | OK | Aleron vocabulary over a Patient reference. |
| M43 | msg 2 timestamp and body | `Communication` | OK | |
| M44 | msg 3 body text | `Communication.payload.contentString` | OK | |
| M45 | msg 3 `No content referenced.` + explanation | `Aleron` | GAP | `Communication` has no `about`, `topic` or `payload.contentReference`. The reference state cannot ride on the message; it is Aleron-held metadata keyed to a message id Aleron must also hold. |
| M46 | msg 4 body text | `Communication.payload.contentString` | OK | |
| M47 | msg 4 `Referenced: order logistics, home blood pressure cuff, shipped 29 Aug` | `NONE` | NONE | No Canvas resource models device shipment. Junction has order status/events but only for lab test kits (`collection_method: testkit`); a BP cuff is not a Junction order. |
| M48 | msg 5 sender, timestamp, body | `Communication` | OK | |
| M49 | Physician vs patient authorship treatment | `Derived` from sender resource type | OK | |
| M50 | Log ordered oldest to newest | `Derived` | OK | Client sort on `sent`. |
| M51 | No edit or retract control on any sent message | n/a | OK | Correct: `Communication` has no update and the SDK's `EDIT_MESSAGE` is a pre-send draft affordance. The screen does not overpromise here. |
| M52 | No per-message delivery or read receipt | n/a | OK | Correct: no delivery receipt exists at all, and read state is one-directional (see M12). |

### Composer

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| M53 | `Reply to Ethan Park` | `Derived` | OK | |
| M54 | `Sends as Dr. A. Okafor` | `Canvas SDK:CREATE_MESSAGE.sender_id` (Staff) | GAP | Requires a Canvas Staff record for this physician. Canvas has **no just-in-time provisioning**, so an Aleron-authenticated physician with no pre-created Canvas user cannot be a `sender_id` and the send silently has no author. |
| M55 | Message body textarea, pre-filled draft | `Canvas SDK:CREATE_MESSAGE.content` | OK | |
| M56 | Ref option `Home blood pressure monitoring, 14 days · order logistics` | `Canvas FHIR:ServiceRequest` (read) | UNVERIFIED | Only readable if the monitoring instruction was placed in Canvas (`Instruct` command or the UI). If it is an Aleron plan action, it is `Aleron`. The screen does not say which. |
| M57 | Ref option `Home blood pressure cuff shipment · order logistics` | `NONE` | NONE | As M47. |
| M58 | Ref option `Intro call, 4 Sep 2026, 14:00 · scheduling state` | `Canvas FHIR:Appointment` (read) | OK | Calendly is the alternative source; either works. |
| M59 | Ref option `Wearable connection status · last sync 27 Aug` | `Junction:` device connections / last sync | UNVERIFIED | Junction has Devices/Wearables connection state; the exact field carrying "last sync" is not established in the ground truth and was not verified. |
| M60 | `4 items available.` | `Derived` | OK | |
| M61 | Withheld: `Raw lab values, 27 fields` | `Canvas FHIR:Observation` / `DiagnosticReport` (search) | OK | Count is `Derived`. |
| M62 | Withheld: `Genetic findings, ATM heterozygous P/LP` | `Canvas FHIR:DocumentReference` or `Observation` (read) | UNVERIFIED | The ground truth matrix has no genetics resource. Whether Canvas holds a P/LP finding as a structured Observation or only as a report PDF is unresolved, and it decides whether the label is readable or hand-entered. |
| M63 | Withheld: `Risk model scores, 5 domains` | `Aleron` | OK | Engine output; FHIR `Observation` has no update and restricted create, so scores stay Aleron-side. |
| M64 | Withheld: `Draft recommendations and draft physician notes, 4 problems` | `Aleron` | OK | Pre-signature drafts, correctly not in Canvas. |
| M65 | `Lifecycle state: Physician review pending` | `Canvas SDK:UPSERT_PATIENT_METADATA` | OK | |
| M66 | `Send message` | `Canvas SDK:CREATE_AND_SEND_MESSAGE` (or `Canvas FHIR:Communication` create) | OK | Two viable paths; the screen must pick one, because they land differently (see Data boundary crossings). |
| M67 | `Save draft` | `Canvas SDK:CREATE_MESSAGE` then `SEND_MESSAGE` | OK | Newly verified: Staff→Patient drafts are supported by the SDK. **Not** available on the FHIR path, where create is always `status: completed`. |
| M68 | The selected reference travels with the sent message | `NONE` | NONE | Neither `Communication.payload` (contentString only, no attachment, no contentReference) nor the SDK Message effect (no attachments, no fields beyond content/sender/recipient) can carry it. |
| M69 | `Routed and stored · appended to this patient's audit log` | `Canvas FHIR:Provenance` (read only) | WRONG | Aleron cannot append to a Canvas audit log. `Provenance` is read-only and there is no audit-write effect. |

### Release-gate disclosure

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| M70 | `Thread access — Physician: assigned threads. Ops: support threads. Both are scoped by role and context.` | `NONE` | WRONG | Canvas has no thread and no per-conversation scope. Communication search returns every message for a patient the token can read, and excludes practitioner↔practitioner outright, so "ops support threads" are invisible on this path rather than scoped. |
| M71 | `Send physician message: member yes, physician yes, ops support-scoped` | `Canvas SDK:` Message effect roles | GAP | The SDK permits Patient↔Staff in both directions and forbids Patient↔Patient. It has no notion of "support-scoped"; that scoping is Aleron's to enforce and Canvas will not enforce it. |
| M72 | `Actor id and licence identity on every physician-originated message` (stored on the record) | `Canvas FHIR:Communication` | GAP | `sender` is stored; licence identity is not a field. See M38. |
| M73 | `Send AI message` kept separate, AI channel lives in the chart rail | `Aleron` | OK | Correct separation, and it is what keeps model output out of `Communication`. |
| M74 | Source citation `docs/product/ROLE_AND_RELEASE_MATRIX_V1.md` sections 2, 3, 5 | `Aleron` | OK | Internal doc, not an API claim. |

### Footer

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| M75 | `the reference list is generated from the patient's release package, not from this screen` | `Aleron` | OK | |
| M76 | `a physician-originated message is stored with actor identity and appended to the audit log at send` | `Canvas FHIR:Communication` + `Provenance` | WRONG | Second statement of M69, on the product-adjacent footer. |

---

## Data points — Aleron AI

### Rail and header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A1 | `Ethan Park` · `AL-47M · 47M` in rail | `Canvas FHIR:Patient` (read) | OK | |
| A2 | `Open in Canvas ↗` | `Aleron` redirect | GAP | Deep-linking into a specific Canvas patient chart from outside is not documented; the return leg is undefined. Same known gap as the prescribe redirect. |
| A3 | `Dr. A. Okafor` + `Log out` | `Aleron` (Entra) | OK | |
| A4 | `2 open thoughts · 0 adopted` | `Aleron` | GAP | Requires durable per-patient assistant state. Aleron is meant to store no patient data, and no Canvas resource fits. |
| A5 | `An isolated patient-context agent. It answers from this patient's current state and nothing else.` | `Aleron` | GAP | An architectural assertion, not a readable value. Enforceable only by Aleron's own retrieval boundary; nothing in Canvas or Junction guarantees it. |

### Context strip

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A6 | `Patient: Ethan Park · AL-47M · 47M` | `Canvas FHIR:Patient` (read) | OK | |
| A7 | `Dominant lens: metabolic-risk phenotype · Metabolic 34 %` | `Aleron` | OK | Engine output. |
| A8 | `Required: Colorectal cancer screening` | `Canvas SDK:ADD_OR_UPDATE_PROTOCOL_CARD` (write side) / `Aleron` | UNVERIFIED | Canvas protocol cards are a write surface. Whether a due-screening obligation can be **read back** by an external app is not established; the ground truth has no care-gap read resource. |
| A9 | `Required: ATM P/LP guidance` | `Canvas FHIR:DocumentReference` or `Observation` | UNVERIFIED | As M62. |
| A10 | `Map: 28 library items · 4 candidate signals` | `Aleron` | OK | |
| A11 | `Top action: Tirzepatide · +1.90 QALY net` | `Aleron` | OK | |
| A12 | `Top gate: Home or ambulatory BP confirmation · 65 % odds` | `Aleron` | OK | |

### Conversation frame

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A13 | Thread id `thr-al47m-0114` | `Aleron` | GAP | A persistent identifier keyed to a patient. Storing it plus its turns is Aleron storing patient data. |
| A14 | `last activity 09:22, 31 Aug 2026` | `Aleron` | GAP | Same store. |
| A15 | Agent greeting turn text | model output | OK | |
| A16 | Fixed source line `Source: current chart, action map, genetics, vitality, and scored candidates. Limited to visible source fields.` | composite: `Canvas FHIR` reads + `Junction` + `Aleron` | GAP | One string standing for four different systems with four different read guarantees. "Genetics" and "vitality" in particular are unresolved (A9, A42). |
| A17 | User turn `What diagnostics matter most and why?` | `Aleron` | GAP | Persistence, as A13. |

### Agent answer

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A18 | `65 % reclassification odds` | `Aleron` | OK | Engine value-of-information output. |
| A19 | `+0.63 QALY if reclassified` | `Aleron` | OK | |
| A20 | `systolic pressure is the largest movable term in the PREVENT predictor` | `Aleron` | OK | Statement about Aleron's own model. |
| A21 | `the only reading on file comes from a single clinic setting` | `Canvas FHIR:Observation` (search) | UNVERIFIED | Distinguishing office BP from home BP requires distinct LOINC codes on the Observations. Whether Canvas carries home-BP-coded Observations for this patient is not established, and the claim is a **completeness** claim, which is only as good as the read covering every source. |
| A22 | `A home sleep apnea test is second at 35 % odds and +0.45 QALY` | `Aleron` | OK | |
| A23 | `FIB-4 with AST, ALT and platelets at 20 % odds and +0.70 QALY` | `Aleron` | OK | Implies AST/ALT/platelets are absent; `Observation` search supports that. |
| A24 | `no domain model stages the liver` | `Aleron` | OK | |
| A25 | `the result gates resmetirom` | `Aleron` | OK | Action-library relation. |
| A26 | `Two clinical thoughts came out of assembling that answer. Neither has entered the Care Plan and neither will until you adopt it.` | `Aleron` | OK | Consistent with "no chart writes". |

### Clinical thought 1, expanded

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A27 | Type `Hypothesis` | `Aleron` | GAP | Persistence, as A13. |
| A28 | State `Open` | `Aleron` | GAP | Open/adopted/dismissed is durable state with no home. |
| A29 | Confidence, 3 of 5 bars | `Aleron` | OK | |
| A30 | `Moderate confidence, estimated 55 %, uncalibrated` | model self-report | OK | Correctly labelled uncalibrated; the screen does not claim it is a probability. |
| A31 | Claim text (sleep-disordered breathing as upstream driver) | model output | OK | |
| A32 | `no sleep study has been performed` | `Canvas FHIR:DiagnosticReport` / `Procedure` / `ServiceRequest` (search) | UNVERIFIED | An absence claim across three resources. Canvas holds only what was imported, so "not performed" is really "not in Canvas". |
| A33 | `rests on one oximetry nadir` | `Junction:` wearables | UNVERIFIED | See A37. |
| A34 | Clinical basis paragraph (nocturnal hypoxia mechanism) | model general knowledge | OK | Not a patient-data claim; no source needed. |
| A35 | `Four findings in this packet are each explained by that mechanism` | `Derived` | OK | Count over A37–A42. |
| A36 | `none of the five domain models has a sleep input` | `Aleron` | OK | |
| A37 | Support: `SpO₂ nadir 89 % across the trailing 30 nights` | `Junction:` device data / Junction Sense aggregate | UNVERIFIED | Two claims: the nadir value, and the 30-night window. The fixture in `BRIEF.md` carries the value with no window, so the window is added by the screen. Also: wearable data is **not** in Canvas; the documented Junction→Canvas write is `CREATE_LAB_REPORT` for labs only. |
| A38 | Support: `BP 142/90 mmHg untreated, stage 2` | `Canvas FHIR:Observation` + `MedicationRequest` (read) | OK | "Untreated" is `Derived` from an antihypertensive-free medication list. |
| A39 | Support: `Waist 105 cm` | `Canvas FHIR:Observation` (read) | UNVERIFIED | Canvas vitals are a fixed set; whether waist circumference is one of them is not established. If not, this is an Aleron intake field. |
| A40 | Support: `waist-to-height 0.59` | `Derived` | OK | From A39 and height. |
| A41 | Support: `HOMA-IR 4.3` | `Derived` (glucose x insulin / 405) | WRONG | The provenance disclosure cites it as `packet.labs.homa_ir`, i.e. as a reported lab result. It is not one; no lab reports HOMA-IR and Junction's `BiomarkerResult` set does not carry it. A computed index presented as a retrieved lab value is a false provenance claim. |
| A42 | Support: `Energy 4 of 10` and `clarity 4 of 10` | `Canvas FHIR:QuestionnaireResponse` (read) or `Aleron` | UNVERIFIED | Where Aleron's PRO instrument lives is unresolved. `QuestionnaireResponse` is create/read/update, so Canvas is viable, but the screen does not say. |
| A43 | Contra: `Overnight RHR 38 bpm` | `Junction:` device data | UNVERIFIED | As A37. |
| A44 | Contra: `No snoring and no witnessed apnea recorded in the intake history` | `Canvas FHIR:QuestionnaireResponse` (search) | UNVERIFIED | Correctly worded as "recorded", not "absent". Depends on the intake living somewhere readable. |
| A45 | Contra: `Never smoked` | `Canvas FHIR:Observation` (social history, LOINC 72166-2) | OK | |
| A46 | Contra: `no reported daytime sleepiness score on file` | `Canvas FHIR:QuestionnaireResponse` (search) | UNVERIFIED | Absence of an Epworth-type instrument; as A44. |
| A47 | Missing: `STOP-BANG score` | `Canvas FHIR:QuestionnaireResponse` (search) | OK | Absence claim, cheaply supportable. |
| A48 | Missing: `Home sleep apnea test` | `Canvas FHIR:DiagnosticReport` (search) | OK | |
| A49 | Missing: `Neck circumference` | `NONE` | NONE | No Canvas vital, no Junction biomarker. The absence is trivially true but nothing can ever fill it, so the row is permanently unsatisfiable. |
| A50 | Missing: `Bed-partner report` | `NONE` | NONE | No structured field anywhere; it is free text in a note at best. |
| A51 | Missing: `Alcohol intake in drinks per day` | `Canvas FHIR:Observation` (social history) / `QuestionnaireResponse` | UNVERIFIED | Canvas carries SDOH-category data; whether alcohol quantity is a readable coded Observation was not verified. |

### Confidence conditions and provenance disclosure

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A52 | `Would raise it` conditions | model output | OK | Hypothetical, not a data claim. |
| A53 | `Would lower it` conditions | model output | OK | |
| A54 | `Patient-data provenance: packet.wearables.spo2_nadir · packet.vitals.bp · packet.anthro.waist_cm · packet.labs.homa_ir · packet.pro.energy` | `Aleron` (`patient_packet.v1`) | WRONG | Two defects. (a) These are Aleron packet paths, not system-of-record paths, so the citation stops one hop short of Canvas or Junction and the physician cannot trace a value to its source. (b) `packet.labs.homa_ir` asserts a lab origin for a computed index (A41). Separately, `BRIEF.md` forbids field names on a product surface. |
| A55 | `Alternatives considered` (visceral adiposity; primary conduction disease) | model output | OK | |
| A56 | `Consultations: None run. A Sleep Medicine specialist lens and a challenge pass are both available and neither has been used.` | `Aleron` (board-review engine) | GAP | Each consultation is another model run over the same patient context. Durable "which lenses were run" state has no home. |

### Thought controls

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A57 | `Adopt` | `Aleron` | GAP | Adoption must persist. See Required changes 8. |
| A58 | `Dismiss` | `Aleron` | GAP | Same. |
| A59 | `Discuss` | `Aleron` | OK | Another turn in the same thread; ephemeral either way. |
| A60 | `Consult` | `Aleron` | GAP | Reads as a specialty referral on a clinical surface. It is a second model pass. Copy risk, and the persistence gap of A56. |
| A61 | `No claim enters the Care Plan until you adopt it.` | `Aleron` | OK | True and consistent with A80. |

### Clinical thought 2, collapsed

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A62 | Type `Pattern`, state `Open` | `Aleron` | GAP | As A27/A28. |
| A63 | Confidence 4 of 5, `High confidence, estimated 78 %, uncalibrated` | `Aleron` | OK | |
| A64 | Claim values: `Waist 105 cm`, `triglycerides 180 mg/dL`, `HOMA-IR 4.3`, `hs-CRP 3.0 mg/L` | `Canvas FHIR:Observation` (read) / `Junction:BiomarkerResult` | OK | Triglycerides and hs-CRP are readable from either. HOMA-IR carries the A41 defect. |
| A65 | `a hepatic steatosis pattern that no domain model stages` | `Aleron` | OK | |
| A66 | `Review clinical thought` control | `Aleron` | OK | |

### Adoption confirmation

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A67 | Blockquote of the exact claim | `Aleron` | OK | Quoting what is adopted is the right shape. |
| A68 | `Moderate confidence, estimated 55 % and uncalibrated` restated + bars | `Aleron` | OK | |
| A69 | `Consultations considered (0)` | `Aleron` | GAP | As A56. |
| A70 | `A Sleep Medicine specialist lens, a challenge pass and a blind second opinion were all available and none was run.` | `Aleron` | GAP | Names a third option the card above does not offer, so the two surfaces disagree about what was available. |
| A71 | `Adopting without one is permitted and is recorded.` | `Aleron` | GAP | "Recorded" where? No Canvas write happens by the screen's own admission (A73, A80), so this record is Aleron-held or does not exist. |
| A72 | `Unresolved contradictions (3)` and the three items | `Derived` | OK | Count from A43/A44/A46. |
| A73 | `This confirmation promotes only the quoted claim into an adopted conclusion. It does not write to the chart.` | `Aleron` | OK | Honest and API-consistent. |
| A74 | `Adopt for drafting` | `Aleron` | GAP | The act that needs a store. |
| A75 | `Cancel` | `Aleron` | OK | |

### Boundary disclosure and footer

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A76 | `One patient. ... There is no cohort context and no cross-patient memory.` | `Aleron` | OK | Architectural claim, enforceable Aleron-side. |
| A77 | `Not in scope: Literature search, guideline lookup, and any source outside this chart.` | `Aleron` | OK | |
| A78 | `A claim the agent cannot ground in a visible source field is not emitted.` | `Aleron` | GAP | An unenforceable guarantee about a generative model. The card itself contains ungrounded content: A34 is general clinical knowledge, and A41 is a computed value cited as a lab field. |
| A79 | `An adopted conclusion becomes available for drafting. A structured Care Plan proposal may then be generated from it` | `Aleron` | GAP | The drafting handoff needs the adopted claim to exist somewhere the Care Plan surface can read. |
| A80 | `Chart writes: None from this surface, in any state. ... only Care Plan writes, and only on release.` | n/a | OK | Correct, and it is why this screen has no unbuildable write. |
| A81 | `A dismissed claim cannot be adopted or used for drafting. It stays visible in the thread` | `Aleron` | GAP | Requires durable dismissal state and a durable thread. |
| A82 | `Every agent turn carries the same source line. It is fixed text, not a per-answer claim` | `Aleron` | OK | Honest about A16 being boilerplate. Note it sits beside A54, which **is** a per-answer claim, so the two provenance mechanisms coexist without the screen saying so. |
| A83 | Footer restating scope and the adoption boundary | `Aleron` | OK | |

---

## Citation provenance (Aleron AI)

| Citation as shown | What it claims | Sourceable? | Note |
|---|---|---|---|
| `Source: current chart, action map, genetics, vitality, and scored candidates. Limited to visible source fields.` | Every agent turn drew only from five named stores | Partly | Four systems behind one string. "Chart" is Canvas FHIR reads, "action map" and "scored candidates" are Aleron, "vitality" is Junction plus Aleron PROs, "genetics" is unresolved (A9). "Visible source fields" is undefined on the surface. |
| `SpO₂ nadir 89 % across the trailing 30 nights` | A wearable-derived aggregate over a stated window | Junction, path unverified | Not in Canvas. The 30-night window is not in the fixture. If the physician clicks through, there is no Canvas record to land on. |
| `BP 142/90 mmHg untreated, stage 2` | A vital sign plus a medication-list negative | Yes | `Canvas FHIR:Observation` read + `MedicationRequest` read. The cleanest citation on the card. |
| `Waist 105 cm`, `waist-to-height 0.59` | An anthropometric measurement plus a ratio | Unverified / Derived | Waist may not be a Canvas vital; if it is an Aleron intake field, the citation crosses back to Aleron. |
| `HOMA-IR 4.3` cited as `packet.labs.homa_ir` | A reported laboratory result | **No** | Computed from fasting glucose and insulin. Presenting it as a lab field misstates its provenance and hides that its precision is inherited from two other assays. |
| `Energy 4 of 10`, `clarity 4 of 10` cited as `packet.pro.energy` | Patient-reported outcome scores | Unverified | `QuestionnaireResponse` would make it Canvas-native; otherwise Aleron-held PHI. |
| `Overnight RHR 38 bpm` | A wearable nocturnal heart rate | Junction, path unverified | Same as SpO₂. |
| `No snoring and no witnessed apnea recorded in the intake history` | A negative from a specific document | Unverified | Correctly scoped to "recorded", which is the right way to state an absence. Depends on the intake being readable. |
| `Never smoked` | Coded social history | Yes | `Canvas FHIR:Observation`, smoking status. |
| `no reported daytime sleepiness score on file` | Absence of an instrument | Unverified | Needs `QuestionnaireResponse` search to be exhaustive. |
| `the only reading on file comes from a single clinic setting` | A completeness claim over all BP readings | Unverified | The strongest claim on the screen and the least verifiable: it asserts the agent saw every BP reading that exists, across Canvas and Junction and any home device. |
| `no sleep study has been performed` | A completeness claim over diagnostics | Unverified | Really "no sleep study is in Canvas". An outside sleep study the patient had elsewhere would not appear. |
| `none of the five domain models has a sleep input` | A fact about Aleron's own engine | Yes | `Aleron`. The one citation that is fully self-owned and checkable. |
| `Four findings in this packet are each explained by that mechanism` | A count over the support list | Yes | `Derived`. |
| `packet.wearables.spo2_nadir` etc., five paths | Named field-level provenance | Partly | Points at Aleron's packet, not the system of record. Traceable one hop, then stops. |
| `triglycerides 180 mg/dL`, `hs-CRP 3.0 mg/L` | Lipid and inflammatory labs | Yes | `Canvas FHIR:Observation` read, or `Junction:BiomarkerResult` if Junction placed the panel. |
| `28 library items · 4 candidate signals` | Sizes of Aleron's own structures | Yes | `Aleron`. |
| `Colorectal cancer screening · ATM P/LP guidance` | Two outstanding obligations | Unverified | Screening due-status read-back and genetics read are both open (A8, A9). |
| `Consultations: None run` | A negative about the agent's own history | Aleron-held | Needs the run log the screen has no home for. |

---

## Data boundary crossings

| What crosses | From | To | Note |
|---|---|---|---|
| Patient demographics, vitals, labs, medications, social history, questionnaire responses | Canvas (system of record) | Aleron `patient_packet.v1` | Every AI answer and every risk score depends on this. Aleron is meant to store no patient data, so the packet must be request-scoped and not persisted; nothing on the screen says it is. |
| Wearable SpO₂, overnight RHR, sync state | Junction | Aleron | Never touches Canvas. The documented Junction→Canvas write is `CREATE_LAB_REPORT` for lab results only, so wearable-derived citations (A37, A43, M59) have no chart counterpart to click through to. |
| Genetics P/LP finding (`ATM heterozygous`) | Canvas or the genetics vendor | Aleron, then the model | The most sensitive field on the screen, cited in the context strip, and the one whose read path is least established. |
| The assembled packet plus the physician's free-text question | Aleron | Third-party LLM provider | The dropped-annotation admits the app build named the provider on screen (`Waiting for Codex`). PHI leaving Aleron for an external model requires a BAA and a stated retention position. The screen removes the vendor name but not the crossing. |
| The same packet again, per consultation | Aleron | The same or another model provider (`Sleep Medicine specialist lens`, `challenge pass`, `blind second opinion`) | Each consultation is an additional PHI transmission. The screen counts them (`Consultations considered (0)`) without saying that is what it is counting. |
| Assistant thread id, turns, thoughts, adoption and dismissal state | Aleron | Aleron's own store | Clinical claims about a named patient, held outside the system of record. Contradicts "Aleron stores none". |
| Physician message content and reference selection | Aleron | Canvas `Communication` / SDK Message | The message body lands in Canvas; the reference selection cannot (M68), so it lands only in Aleron. |
| Physician message | Canvas | The patient | **Undeclared.** A message sent via the SDK Message effect reaches the patient in the Canvas patient portal, not in the Aleron member app. The screen says only "Routed and stored" and never names the channel. |

---

## Required changes

1. **Say which system carries the message, and where the patient reads it.** The screen sends into a void: "Routed and stored" names no channel. Pick `Canvas SDK:CREATE_AND_SEND_MESSAGE` (Staff→Patient, supports the `Save draft` the screen already shows) or `Canvas FHIR:Communication` create (no drafts, `status` always completed). Either way the patient reads it in the Canvas patient portal, not the Aleron member app, and the screen must be honest about that or Aleron must run its own channel and stop claiming Canvas storage. **Large** — it decides the whole screen's backend.
2. **Remove or requalify the audit-log claim** (M69, M76). `Provenance` is read-only and there is no audit-write effect. The message create *is* the record. Replace with what is true: the message is stored on the patient's record with the sender. **Small** — two strings.
3. **Fix the unread count** (M12, M7). Aleron can read unread but can never clear it. Either drop the count, or state that read state is cleared in Canvas, or make Aleron own read state entirely (Aleron-side, per physician, per message id) and stop reading Canvas's. **Medium** — the badge appears on the rail of every inbox screen.
4. **Drop or rewrite `ops also on thread`** (M27) and the thread-scoping disclosure (M70). Canvas Communication search excludes practitioner↔practitioner outright and has no thread object. **Medium** — one fixture row and one disclosure paragraph, but it removes a stated capability.
5. **Decide where a message's reference lives** (M45, M47, M57, M68). No Canvas field carries it. Either fold the reference into the message text at send (lossy but buildable today), or hold it as Aleron metadata keyed to the returned message id (needs Aleron to store a patient-linked record), or drop the picker. **Medium**.
6. **Drop the cuff-shipment data points** (M47, M57) or source them. There is no shipment resource in Canvas and Junction covers only lab kits. **Small**.
7. **State that the NPI is resolved live, not stamped at send** (M38, M72), or stop claiming licence identity is on the stored record. **Small**.
8. **Give adopted and dismissed claims a home** (A27, A28, A57, A58, A74, A79, A81). This is the largest AI finding. `UPSERT_PATIENT_METADATA` will hold a claim id, its text, its state and its timestamp, at the cost of putting free-text clinical reasoning into a non-clinical key/value store that no Canvas view surfaces. The alternative is Aleron storing it, which breaks the no-patient-data rule. **Large**.
9. **Fix the HOMA-IR provenance** (A41). It is `Derived` from fasting glucose and insulin, not `packet.labs.homa_ir`. Cite the two inputs. **Small**, and it is the clearest correctness defect on the AI screen.
10. **Replace the `packet.*` paths with source-of-record citations** (A54). The physician needs "Canvas vitals, 12 Aug 2026" and "wearable, trailing 30 nights", not an internal field path. `BRIEF.md` already forbids field names on a product surface. **Small to medium**.
11. **Qualify the completeness claims** (A21, A32). "The only reading on file" and "no sleep study has been performed" should read "the only reading in the chart" and "no sleep study is in the chart". P7 language, and it is what the API can actually support. **Small**.
12. **Reconcile the two consultation lists** (A56 vs A70). The card offers a specialist lens and a challenge pass; the confirmation names three including a blind second opinion. **Small**.
13. **Rename or requalify `Consult`** (A60). On a clinical surface beside Adopt and Dismiss it reads as a referral. It is a second model pass over the same patient. **Small**.
14. **Declare the model-provider crossing somewhere reviewable.** The screen correctly keeps the vendor off the product surface, but the annotation list should say PHI leaves Aleron for an external model and that each consultation repeats the transmission. **Small**, annotation only.
15. **Resolve the genetics read path** (M62, A9). It gates two data points on messages and one on AI, and it is the most sensitive field in the set. **Medium**, and it is a spike, not an edit.

---

## Alternative pathways

**M27 `ops also on thread` (WRONG).** Ops messages exist as their own Patient↔Staff message list; Canvas will never return them alongside the physician's. Workaround: Aleron queries Communications by `patient` rather than by `recipient`, which returns every message that patient exchanged with any practitioner, and renders them as one conversation. That is buildable and is arguably more honest than "ops also on thread". Redirect alternative: link to the patient in Canvas, where the full message list is native; the return leg is undocumented, so the physician lands there and navigates back by browser history. Cost of dropping: the physician cannot see that ops already answered, and duplicates the reply.

**M47 / M57 cuff shipment (NONE).** No resource, in either system. Nearest workable: `UPSERT_PATIENT_METADATA` with a `bp_cuff_shipped_on` key written by whichever fulfilment system actually ships it, then read back for the picker. Cost: metadata is invisible in the Canvas UI, so the shipment exists only where Aleron looks. Cheaper alternative: drop the picker entry and let the physician type "a cuff is on its way", which is what the fixture message already does. Recommend dropping.

**M68 reference travels with the message (NONE).** `Communication.payload` is `contentString` only and the SDK effect has no attachments. Three options: (a) serialise the reference into the message text at send, which is buildable today and survives in Canvas, but the patient sees a machine-shaped line; (b) `UPSERT_PATIENT_METADATA` keyed by the returned message id, which keeps the message clean but puts the link outside Canvas's view of the conversation; (c) drop the picker and let the reference be prose. (a) is the lazy correct answer.

**M69 / M76 audit-log append (WRONG).** `Provenance` is read-only; there is no audit effect. The nearest real thing: the `Communication` or Message record itself, with `sender` and `sent`, is the audit trail, and Canvas keeps its own internal audit of API writes. Redirect: send the physician to Canvas's own record view for the patient. Change the copy to `Stored on this patient's record, with your name and the time.` No engineering cost.

**M70 thread access scoping (WRONG).** Canvas enforces none of this. Aleron must enforce assignment scoping itself, before the Communication search, using an Aleron-held assignment map keyed by patient and practitioner. Cost: that map is a patient-linked record Aleron holds. Cheaper: derive assignment from `Canvas FHIR:CareTeam` (read, and update is supported), which is per-patient and already models who is responsible. That is the right home and needs no Aleron store.

**A41 HOMA-IR (WRONG).** Cite the two inputs it is computed from, both of which are real reads: fasting glucose 110 mg/dL and fasting insulin 16 µIU/mL, `Canvas FHIR:Observation`. Render as `HOMA-IR 4.3, computed from fasting glucose and insulin`. Cost: one more line in the support list. Dropping it is not an option; it is load-bearing for both clinical thoughts.

**A54 `packet.*` provenance paths (WRONG).** Replace with the source and the date: `Canvas vitals · 12 Aug 2026`, `wearable · trailing 30 nights`, `Canvas labs · 8 Aug 2026`, `intake questionnaire · 2 Jun 2026`. Cost: Aleron's packet must carry the origin and timestamp of each field, which it should anyway. This is also the fix for the `BRIEF.md` "never put the API on the product surface" violation.

**A49 neck circumference (NONE).** No Canvas vital, no Junction biomarker. Options: capture it as a `Canvas FHIR:QuestionnaireResponse` item on the intake, which is create+read+update and is the cheapest real home; or `UPSERT_PATIENT_METADATA`; or drop the row. Dropping is defensible only if the missing-information list is meant to be actionable, and this one currently is not.

**A50 bed-partner report (NONE).** Free text with no structured home. Nearest: a `QuestionnaireResponse` item, same as A49, or leave it as a prompt to the physician rather than a field the system expects to fill. Recommend rewording it as a question to ask rather than a data point that is missing.

**Persistence for the whole AI screen (the GAP behind A4, A13, A14, A17, A27, A28, A57, A58, A74, A81).** Three routes. (1) `UPSERT_PATIENT_METADATA`: buildable now, arbitrary key/value, survives in Canvas, but it is not clinical data, no Canvas view shows it, and free-text clinical claims sitting in metadata are PHI in a field designed for identifiers. (2) `UPSERT_NOTE_METADATA` on the working note: better scoping, ties the reasoning to the encounter it belongs to, same objections. (3) Aleron stores the thread: breaks the "Aleron stores no patient data" rule outright, and the thread is the most clinically loaded content on the surface. (4) Drop persistence: the conversation is ephemeral, `2 open thoughts · 0 adopted` and `thr-al47m-0114` come off the screen, and adoption hands straight to the Care Plan drafting surface in the same session or is lost. (4) is the only option that needs no new storage, and it is a real product decision, not a shortcut.

**A2 `Open in Canvas ↗` (GAP).** Deep-linking to a specific patient chart from outside is not documented. Workable today: link to the Canvas tenant root and let the physician search. Cost: the physician re-finds the patient. The return leg is the known undrawn gap from the ground truth and is unchanged here.

---

## Contradictions with what the screens already claim

**messages.html**

> "a physician-originated message is stored with actor identity and appended to the audit log at send."

Nothing appends to a Canvas audit log from outside. `Provenance` is read-only and no SDK effect writes an audit entry.

> "Attribution — Actor id and licence identity on every physician-originated message. A message is a clinical communication, not a chat bubble."

`Communication` stores `sender` and nothing else about the sender. The NPI on screen is resolved live from `Practitioner`, so the licence identity is not on the message, and a change to the practitioner record silently rewrites the attribution on every historical message.

> "Thread access — Physician: assigned threads. Ops: support threads. Both are scoped by role and context."

Canvas has no thread and no per-conversation scope. `Communication` search takes `_id`, `patient`, `recipient`, `sender`, and returns only practitioner↔patient messages, so ops conversations are invisible on this path rather than scoped.

> "AL-39M · ops also on thread"

Contradicts the line immediately above and the API underneath both.

> "Only assigned threads appear here, and a message can reference released content only."

The first clause has no API basis; the second is enforceable only in Aleron, and the reference cannot be stored on the message at all.

> "Reference an item from this chart" / "4 items available."

One of the four (`Home blood pressure cuff shipment`) has no source in either system, and the picked reference cannot travel with the message.

The annotation says the screen has no canonical thread component because "a physician message and an AI message have different provenance obligations". That is correct reasoning, and it is also the reason the AI screen must not reach for `Communication`.

**aleron-ai.html**

> "A claim the agent cannot ground in a visible source field is not emitted."

The clinical-basis paragraph is general physiology with no source field, and `HOMA-IR 4.3` is cited as `packet.labs.homa_ir`, a field that does not hold a lab result. The guarantee is not kept on this card.

> "Patient-data provenance: `packet.wearables.spo2_nadir` · `packet.vitals.bp` · `packet.anthro.waist_cm` · `packet.labs.homa_ir` · `packet.pro.energy`"

`BRIEF.md`: "Never put the API on the product surface. Name the resource and the path in an annotation, in this file, or in a `wf-scaffold` note. Do not put a field name, its writability, or its permitted values in front of a physician." Five field names, inside a physician-facing disclosure, in a clinical card.

> "Provenance — Every agent turn carries the same source line. It is fixed text, not a per-answer claim, because the boundary does not vary by question."

The card two blocks above carries a per-answer, per-field provenance list. Both mechanisms are on the screen and it explains only one.

> "Chart writes: None from this surface, in any state."

True, and the screen is right to say it. But paired with `BRIEF.md`'s "Canvas holds all patient data; Aleron stores none", the thread, the two thoughts, their open state, and the adoption record have nowhere legal to live.

> "Adopting without one is permitted and is recorded."

Recorded where. The same disclosure says nothing is written to the chart.

> "Consultations — A Sleep Medicine specialist lens and a challenge pass are both available"

versus, on the confirmation panel: "A Sleep Medicine specialist lens, a challenge pass and a blind second opinion were all available". Two counts of what was available, on the same claim.

---

## Open questions for the humans

1. **Which channel does a physician message actually use?** Canvas SDK Message effect, Canvas FHIR `Communication`, or an Aleron-owned channel. If Canvas, the patient reads it in the Canvas patient portal and the Aleron member app never shows it. Is that the intent?
2. **Does the physician have a Canvas Staff record?** Canvas has no just-in-time provisioning. Without one there is no `sender_id` and no message can be sent at all.
3. **Can a due-screening obligation be read back from Canvas?** `ADD_OR_UPDATE_PROTOCOL_CARD` is a write. The context strip's `Required: Colorectal cancer screening` needs a read, and none is documented.
4. **Where does a genetics P/LP finding live in Canvas, and is it structured?** It gates `ATM heterozygous P/LP` on both screens and is the most sensitive field in the set.
5. **Is waist circumference a Canvas vital?** If not, `Waist 105 cm` and `waist-to-height 0.59` are Aleron intake fields, and the AI is citing Aleron to itself.
6. **Where do the vitality PROs live?** `QuestionnaireResponse` is create/read/update and would make them Canvas-native. If they are Aleron-held, that is patient data Aleron stores.
7. **Which model provider, under what BAA, with what retention?** Every question, every consultation and every thought re-transmits the packet.
8. **Is the AI conversation persistent or ephemeral?** This single answer settles ten data points. If ephemeral, `thr-al47m-0114`, `last activity`, `2 open thoughts · 0 adopted` and the dismissal-stays-visible rule all come off the screen.
9. **Is `Consult` meant to read as a referral?** On a clinical surface next to Adopt and Dismiss, physicians will read it that way.
10. **Does anyone clear the unread badge?** Today only Canvas can. Should Aleron own read state instead, and accept that Canvas and Aleron will disagree about what has been read?
11. **How many Communications does a mature patient have?** With no date filter, no sort and no unread filter on search, every thread-list render is a full-history fetch per patient. At what panel size does that stop working?
12. **Does the reference picker survive?** It is the screen's stated point, and nothing in either API can store what it produces.
