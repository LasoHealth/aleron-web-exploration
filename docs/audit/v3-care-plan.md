# v3/care-plan.html

**Screen purpose:** An opt-in care plan where the physician adds engine suggestions into an empty note, then takes three separate commit acts (lock note, authorize orders, release to patient) presented as four tab-panes.
**Data points audited:** 205 — OK 116, GAP 53, WRONG 24, UNVERIFIED 8, NONE 4

## Does v3's four-step sequence hold as an API sequence?

**Half of it holds, and the half that fails is the half v3 advertises loudest.** Canvas SDK commands are inserted into a note by `note_uuid`, and a Canvas note carries a state machine with `LKD` (Locked) in it; only notes in `NEW`, `ULK`, `RST` or `UND` are editable, and locking generates the Note PDF (newly verified: `docs.canvasmedical.com/sdk/commands/`, `docs.canvasmedical.com/sdk/data-note/`, `docs.canvasmedical.com/api/note/`). So take v3's two directions separately. **Orders-then-lock works exactly as drawn**: the order commands originate into the still-editable note, `Refer` and `ImagingOrder` are signed individually, and the later lock captures a note that already contains them. **Lock-then-orders does not work at all** for anything that lands in Canvas: after step 2 the note is `LKD`, no new command can be inserted into it, and there are only three ways out, none of which the screen draws — unlock it (`LKD` → `ULK`, which regenerates the PDF and means the "immutable note snapshot" the physician attested to at step 2 was never immutable), open a second note to host the late commands (a chart document that is not the legal record anyone attested to), or route the order outside Canvas entirely. The third is the only clean one, and it is exactly what Junction labs already do — which is why v3's independence claim reads true in the one case its own fixture does not contain: **not one of the five queued orders is a lab.** Four of the five (`Refer`, `Task`, `Task`, `Goal`) are Canvas commands that must live inside an editable note, and the fifth is the prescription, which the screen itself removes from the set.

Two further consequences. First, the intermediate state the screen names, "5 intents, all unsent", has no clean representation: if the intents are staged commands in the note, then locking at step 2 bakes five uncommitted order commands into the immutable PDF and the legal record shows unsigned orders; if they are Aleron-side, Aleron is holding patient data it is meant to hold none of. The screen never says which, and it is the load-bearing question. Second, `originate(commit=True)` is silently ignored for order commands, so "Authorize" is never one call and its failure mode is a staged command with no error — a hazard on a card whose whole premise is that authorization is a discrete, attested act.

The correction is small and does not cost v3 its argument: keep the two acts independent, but state the one direction that is constrained. *Orders may be authorized before the note is locked, or with the note still open; once the note is locked, an order added afterwards opens a new note.* That is honest, it is enforceable, and it is still not the single Sign-and-release button v3 is arguing against. **This is the API consequence v2 does not have**: v2 sequences the acts, so it never asserts the reverse direction and never has to answer for it.

## Data points

### Chrome, patient identity, page state

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 1 | `Ethan Park` | `Canvas FHIR:Patient` (read) | OK | |
| 2 | `AL-47M · 47M` | `Canvas FHIR:Patient` (read) + Aleron member id | OK | Aleron id via `CREATE_PATIENT_EXTERNAL_IDENTIFIER`. |
| 3 | `Dr. A. Okafor` (rail actor) | `Canvas FHIR:Practitioner` (read) / Entra | OK | SAML SSO, no JIT provisioning: the Canvas user must pre-exist. |
| 4 | `Plan editing · saved, revision 14` | `Aleron` | GAP | Draft revision counter is Aleron-side state on an in-progress note. Aleron holds no patient data, and a draft plan is patient data. |
| 5 | `Baseline review, cycle 1` (note title) | `Canvas SDK:CREATE_NOTE.title` | OK | |
| 6 | `Draft` (note state) | `Canvas SDK:Note.current_state` | OK | Maps to `NEW`/`ULK`. |
| 7 | `31 Aug 2026 · Dr. A. Okafor` | `Canvas SDK:Note.datetime_of_service`, `.provider` | OK | |

### Step rail

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 8 | Step 1 `Plan` / `draft, revision 14` | `Aleron` | GAP | Same draft-state problem as #4. |
| 9 | `3 of 6 added` | `Derived` (count of included items) | OK | Aleron-side, ephemeral. |
| 10 | Step 2 `Note lock` / `open, ready to lock` | `Canvas SDK:Note.current_state` | OK | `NEW`/`ULK` → readable. |
| 11 | Step 3 `Order authorization` / `5 queued, unsent` | `Aleron` | WRONG | Five includes the prescription, which the same pane says "is not in this set". The authorizable set is four. |
| 12 | Step 3 `2 blockers` | `Derived` | OK | |
| 13 | Step 4 `Patient release` / `withheld, needs steps 2 and 3` | `Derived` | OK | |
| 14 | "Steps 2 and 3 are independent. An order can transmit before the note is locked and a note can be locked with orders still pending" | `Canvas SDK` | WRONG | Second clause only holds if the commands are already staged in the note. A *new* order after `LKD` cannot be inserted. See headline. |
| 15 | "Every step is reachable from here at any time" | `Aleron` (UI) | OK | Tablist, not a wizard. Correct as a UI claim. |

### Plan pane — Indication

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 16 | `membership programme · no diagnosis code required` | `Aleron` | OK | Programme fact, not an API claim. |
| 17 | Indication free text | `Canvas SDK:ReasonForVisit.comment` or `HistoryOfPresentIllness.narrative` | UNVERIFIED | Screen names no command for it. `ReasonForVisit` has no `commit`, which matters if it must survive the lock. |

### Plan pane — item 1, ATM pathogenic variant

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 18 | `ATM pathogenic variant, heterozygous` | `Canvas FHIR:DiagnosticReport` / `Observation` (read) | UNVERIFIED | Whether Canvas exposes discrete variant-level P/LP as an Observation is not established. |
| 19 | `Z15.09` | `Aleron` action library → `Canvas SDK:AssessCommand` | OK | |
| 20 | `required channel` | `Aleron` obligation library | GAP | Nearest Canvas analogue is a protocol card with `can_be_snoozed`; no FHIR field. |
| 21 | `must be dispositioned` / `deferred, reason recorded` / `exception documented` | `Aleron` | GAP | See #24. |
| 22 | `assess existing cnd-4471` | `Canvas FHIR:Condition` (search) | OK | Real Canvas condition id feeds `AssessCommand.condition_id`. |
| 23 | `2 orders` | `Derived` | OK | |
| 24 | Disposition select: Include / Defer with reason / Document exception | `Canvas FHIR:DetectedIssue` (create/update, `mitigation`) | OK | DetectedIssue has full CRUD in FHIR and `mitigation` takes accepted/deferred/refuted with author and date. Correct home for an *obligation*. |
| 25 | Deferral / exception reason textarea | `Canvas SDK:UPSERT_NOTE_METADATA` + `DetectedIssue.mitigation` | GAP | Screen elsewhere claims a Custom Data Model is required. Metadata is cheaper. See Alternatives. |
| 26 | "the item stays outstanding on the chart until someone acts on it" | `Canvas` protocol behaviour | UNVERIFIED | Plausible; not in ground truth. |
| 27 | "Required. Without it the note cannot be locked." | `Aleron` validation | OK | Aleron-enforced pre-lock check. Nothing in Canvas enforces it. |
| 28 | Assessment textarea, `maxlength=2048` | `Canvas SDK:AssessCommand.narrative` | OK | Cap matches the documented field. |
| 29 | Plan textarea | `Canvas SDK:PlanCommand.narrative` | OK | |
| 30 | Basis prose (MBTA 163-gene panel, resulted 23 Jun 2026) | `Canvas FHIR:DiagnosticReport` (read) | OK | Natural source for `background`. |
| 31 | "no counseling encounter on file" | `Canvas FHIR:Encounter` / `Appointment` (search) | OK | |
| 32 | Command on signature = `Assess existing` | `Canvas SDK:AssessCommand` | OK | |
| 33 | Command option `Diagnose · new problem-list entry` | `Canvas SDK:DiagnoseCommand` | OK | |
| 34 | Command option `Past medical history · resolved` | `Canvas SDK:MedicalHistory` | WRONG | `MedicalHistory` takes free-text `past_medical_history`, not an ICD-10 code. The screen presents it as a code-carrying alternative to Diagnose. |
| 35 | Command option `Encounter diagnosis only` | `Canvas FHIR:Condition` (create, `category: encounter-diagnosis`) | GAP | Needs an `encounter` reference; Encounter is read-only in FHIR, so Aleron cannot make one. Omitting it silently produces a data-import note. |
| 36 | Command option `Health concern · not a diagnosis` | `Canvas FHIR:Condition` (create, `category: health-concern`) | GAP | Same encounter problem as #35. |
| 37 | "Adds an Assess to ATM-associated cancer susceptibility, active since 12 Mar 2024" | `Canvas FHIR:Condition` (read) | OK | |
| 38 | "up to 2048 characters" | `Canvas SDK:AssessCommand.narrative` | OK | |
| 39 | "That entry is added to, never replaced" | `Canvas FHIR:Condition` (no revise op) | OK | Correct, and correctly said in the reader's vocabulary. |
| 40 | Status axis: Improved / Stable / Deteriorated | `Canvas SDK:AssessCommand.status` | OK | |
| 41 | Order o1 `Refer · Genetic counselling` | `Canvas SDK:Refer` (originate + sign) | OK | Refer supports `sign()`. |
| 42 | o1 `Priority routine` | `Canvas SDK:Refer` | WRONG | `Refer` has no priority field (`ImagingOrder` does). Must go in `comment`. |
| 43 | o1 `clinical question: ongoing management` | `Canvas SDK:Refer.comment` | OK | |
| 44 | o1 `Dx: Z15.09` | `Canvas SDK:Refer` | GAP | `Refer` has no `diagnosis_codes` field in the documented set; only `ImagingOrder` and `LabOrder` do. |
| 45 | o2 `Task · Family-history gate` | `Canvas SDK:Task` / `Canvas FHIR:Task` (create) | OK | |
| 46 | o2 `required` | `Aleron` | GAP | Same as #20. |
| 47 | o2 `Dx: Z15.09` | `Canvas SDK:Task` | NONE | Canvas `Task` carries no diagnosis association. |

### Plan pane — item 2, prediabetes with insulin resistance

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 48 | `Prediabetes with insulin resistance` / `R73.03` | `Canvas SDK:DiagnoseCommand.icd10_code` | OK | |
| 49 | `no existing match` | `Canvas FHIR:Condition` (search, no hit) | OK | |
| 50 | HbA1c `6.0 %` | `Junction:BiomarkerResult.value` + `.unit` | OK | Also `Canvas FHIR:Observation` (read). |
| 51 | Fasting glucose `110 mg/dL` | `Junction:BiomarkerResult.value` | OK | |
| 52 | HOMA-IR `4.3` | `Derived` (glucose × insulin / 405) | GAP | Not a lab result. Storing it back needs `CREATE_OBSERVATION`; FHIR Observation create is restricted to vitals/panel shapes. |
| 53 | Waist `105 cm` | `Canvas FHIR:Observation` (read) | OK | Vital-shaped, so `CREATE_OBSERVATION` also works. |
| 54 | "the highest-net lever the action map prices" | `Aleron` | OK | Physician-facing only. |
| 55 | Assessment textarea `maxlength=2048` | `Canvas SDK:DiagnoseCommand.today_assessment` | OK | |
| 56 | Plan textarea | `Canvas SDK:PlanCommand.narrative` | OK | |
| 57 | Command = `Diagnose` | `Canvas SDK:DiagnoseCommand` | OK | |
| 58 | `Assess existing` disabled, "no matched condition" | `Derived` from `Condition` search | OK | |
| 59 | `Approximate date of onset` = 2026-06-23 | `Canvas SDK:DiagnoseCommand.approximate_date_of_onset` | OK | Correctly shown only under Diagnose. |
| 60 | o3 `Rx · tirzepatide 2.5 mg/0.5 mL` | `Canvas SDK:Prescribe` (originate only) | OK | |
| 61 | o3 `Sig: inject 2.5 mg subcutaneously once weekly` | `Canvas SDK:Prescribe.sig` | OK | |
| 62 | o3 `days supply 28 · refills 2` | `Canvas SDK:Prescribe.days_supply`, `.refills` | OK | |
| 63 | o3 `Dx: E66.01 · R73.03` | `Canvas SDK:Prescribe.icd10_codes` | OK | |
| 64 | o3 implied fdb code | `Canvas FHIR:Medication` (read) / FDB | GAP | Screen shows a drug name; `Prescribe` needs `fdb_code`. No resolution step is drawn. |
| 65 | o4 `Goal · Supervised resistance training` | `Canvas SDK:Goal` command | OK | FHIR Goal is read-only; the command is the write. |
| 66 | o4 `2 sessions/wk for 12 weeks` | `Canvas SDK:Goal.goal_statement`, `.due_date` | OK | |
| 67 | o4 `Dx: not required for a Goal` | `Canvas SDK:Goal` | GAP | True but incomplete: the annotation at line 1822 claims this row now also says a Goal is set by a Goal command. It does not. Stale claim. |

### Plan pane — item 3, hypertension stage 2 unconfirmed

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 68 | `Hypertension, stage 2, unconfirmed` / `I10` | `Canvas FHIR:Condition` (create, encounter-diagnosis) | GAP | Encounter problem, #35. |
| 69 | `match not checked` | `Aleron` (search not run) | OK | P7 done properly. |
| 70 | BP `142/90 mmHg` | `Canvas FHIR:Observation` (read) | OK | |
| 71 | "untreated, with no home series" | `Canvas FHIR:MedicationStatement` / `Observation` (search) | OK | |
| 72 | "reclassifies at about `65 %`" | `Aleron` action library | OK | Physician-facing derived figure. |
| 73 | Assessment / Plan textareas | `Canvas FHIR:Condition` + note body | GAP | An encounter-diagnosis Condition has no narrative field; the prose lives in the note, not with the code. |
| 74 | Command = `Encounter diagnosis only` | `Canvas FHIR:Condition` (create) | GAP | #35. |
| 75 | "The list was never searched for this problem" | `Aleron` | OK | |
| 76 | o5 `Task · Home blood pressure monitoring, 14 days` | `Canvas FHIR:Task` (create) | UNVERIFIED | Canvas SDK `Task.assignee_id` is a staff member. Whether a patient-owned Task is accepted is not established. |
| 77 | o5 `Twice daily · patient device` | `Canvas SDK:Task.comment` | OK | |
| 78 | o5 `Dx: I10` | `Canvas SDK:Task` | NONE | No diagnosis association on Task. |

### Plan pane — items 4 to 6, not added

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 79 | `Health maintenance` / `Z12.11` | `Canvas FHIR:Condition` (create, health-concern) | GAP | #36. |
| 80 | `not added · deferred: no modality chosen` | `Canvas FHIR:DetectedIssue.mitigation` | WRONG | Screen classes this as a scored suggestion with no Canvas home, but the release table calls the same item a *required* preventive-care rule. It is an obligation and DetectedIssue takes it. |
| 81 | Reason not carried textarea (Z12.11) | `Canvas SDK:UPSERT_NOTE_METADATA` | GAP | Also persists as prose in the note body. |
| 82 | "The reason above has no field in Canvas FHIR; it needs a Custom Data Model to persist" | — | WRONG | Contradicts the screen's own annotation and the ground truth. Metadata effects exist; for this item DetectedIssue exists. |
| 83 | "would queue 1 order: colonoscopy or FIT" | `Canvas SDK:Refer` / `Junction:POST /v3/order` | OK | Correct split, and correctly named as a blocker. |
| 84 | `MASLD risk, metabolic context` / `K76.0` | `Canvas FHIR:Condition` (create) | GAP | Not added, so no write yet. |
| 85 | "FIB-4 has not been calculated" | `Derived` (AST, ALT, platelets, age) | OK | |
| 86 | "no imaging is on file" | `Canvas FHIR:DiagnosticReport` (search) | OK | |
| 87 | Reason not carried textarea (K76.0) | `Canvas SDK:UPSERT_NOTE_METADATA` | GAP | |
| 88 | "would queue 1 order: FIB-4, then FibroScan" | `Junction` / `Canvas SDK:ImagingOrder` | WRONG | FIB-4 is a calculation, not an orderable test. The order is a CMP plus CBC; FIB-4 is computed from them. FibroScan → `ImagingOrder` is right. |
| 89 | `Nocturnal bradycardia, incidental` / `R00.1` | `Canvas FHIR:Condition` (create) | GAP | Not added. |
| 90 | Overnight RHR `38 bpm` | `Junction:` device data / Junction Sense | OK | |
| 91 | VO₂max `28 mL/kg/min` | `Junction:` device data | UNVERIFIED | Wearable-estimated VO₂max exposure through Junction Sense is not confirmed in the ground truth. |
| 92 | `unscored` | `Aleron` (library gap) | OK | P7. Correctly carries no invented value. |
| 93 | Reason not carried textarea (R00.1) | `Canvas SDK:UPSERT_NOTE_METADATA` | GAP | |
| 94 | "would queue 1 order: 12-lead ECG, then patch or Holter" | `Canvas SDK:Perform` (cpt) or `Refer` | UNVERIFIED | No diagnostic-order command covers an ECG. Junction is labs only, so Junction is not the route. |
| 95 | "A problem you add carries no score" | `Aleron` | OK | Physician acts on it. Correct per BRIEF. |

### Narrative and document signature line

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 96 | Narrative textarea | `Canvas SDK:HistoryOfPresentIllness.narrative` or note body | UNVERIFIED | Screen names no command. |
| 97 | "Three problems carried into this note from six suggestions" | `Derived` | OK | |
| 98 | `Unsigned.` | `Canvas SDK:Note.current_state` | OK | |
| 99 | "On signature Canvas runs `3 commands`" | `Canvas SDK` | WRONG | Three problems, but one of them (encounter-diagnosis) is a FHIR Condition create, not a command. Two commands and one FHIR write. |
| 100 | "one Diagnose, one Assess against cnd-4471" | `Canvas SDK:DiagnoseCommand`, `AssessCommand` | OK | |
| 101 | "one encounter-diagnosis Condition that stays off the problem list" | `Canvas FHIR:Condition` (create) | GAP | #35. Also not a "command", per #99. |
| 102 | "`5 orders` release through their own channels" | mixed | WRONG | One of the five is the prescription, which explicitly does not release. Four. |
| 103 | "their reasons have no field in Canvas FHIR" | — | WRONG | Same stale claim as #82; one of the three is an obligation with a DetectedIssue home. |
| 104 | "The prescription is written into the note from Orders and signed in Canvas" | `Canvas SDK:Prescribe` (originate, no sign) | OK | Matches ground truth exactly. Return leg is the open gap. |

### Workbench rail — `CARE_PLAN` fixture (script)

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 105 | o1 `source`: "Required channel, from the genetics library" | `Aleron` | GAP | Obligation provenance has no Canvas field. |
| 106 | o1 `dxAssoc`: "problem 1, Z15.09" | `Aleron` | GAP | #44. |
| 107 | o1 `body`: "An obligation triggered by the P/LP result" | `Aleron` | OK | |
| 108 | o1 `obligation`: "it cannot be rejected" | — | WRONG | Contradicts the disposition control three panes up, which offers defer and except. Stale carve-out language. |
| 109 | o2 `source` / `dxAssoc` / `body` | `Aleron` | GAP | As #105 to #107. |
| 110 | o2 `obligation`: "it cannot be rejected" | — | WRONG | Same as #108. |
| 111 | o3 `source`: "Aleron-scored, from the final action-map state of 29 Aug 2026" | `Aleron` | OK | |
| 112 | o3 `dxAssoc`: "E66.01 and R73.03" | `Canvas SDK:Prescribe.icd10_codes` | OK | |
| 113 | o3 `body`: "about `+1.9 QALY`, prevention plus capacity" | `Aleron` engine | OK | Physician-facing only; never released. |
| 114 | o3 `carveOut`: "prescriber-only ... Surescripts identifier ... EPCS for a controlled substance" | `Canvas SDK:Prescribe` (no sign) | OK | Matches ground truth. Note tirzepatide is not a controlled substance, so only the SPI half binds this fixture. |
| 115 | o3 `carveOut`: "no screen here signs it" | `Canvas SDK` | OK | Correct. `send()` on an unsigned Prescribe is unverified and should not be relied on. |
| 116 | o4 `source` | `Aleron` | OK | |
| 117 | o4 `dxAssoc`: "problem 2, R73.03" | `Canvas SDK:Goal` | NONE | Goal command carries no diagnosis. |
| 118 | o4 `body`: "About `+1.1 QALY`" | `Aleron` engine | OK | |
| 119 | o4 `body`: "Tracked as a Goal, so it produces no lab or referral traffic" | `Canvas SDK:Goal` | OK | |
| 120 | o5 `source`: "Gate, from the action map. Reclassification about `65 %`" | `Aleron` engine | OK | |
| 121 | o5 `dxAssoc`: "problem 3, I10" | `Canvas SDK:Task` | NONE | #78. |
| 122 | o5 `body`: "why problem 3 stays provisional until this returns" | — | WRONG | `Condition.verificationStatus` is not writable and the screen elsewhere deleted every reference to provisional. Nothing marks this problem provisional; it stays off the problem list instead. |
| 123 | Rail buttons `Document exception` / `Reject` / `Modify` | `Canvas FHIR:DetectedIssue` (except) / `NONE` (reject) | GAP | Reject on a scored suggestion has no Canvas home. Modify re-enters the command draft, fine. |

### Workbench rail — other cards

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 124 | "A physician-added order needs a diagnosis association" | `Aleron` validation | OK | |
| 125 | "If nothing matches, adding the order creates the problem" | `Canvas SDK:DiagnoseCommand` | OK | |
| 126 | OGTT "reclassification about `4 %` ... low value of information" | `Aleron` engine | OK | |
| 127 | "Your call stands; the context rides along" | `Aleron` | GAP | The rejection itself has no Canvas home. #123. |
| 128 | ECG "no reclassification probability, no burden model ... `unscored`" | `Aleron` | OK | P7. |

### Step 2 — Note lock

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 129 | `Problems: 4 included, 0 removed` | `Derived` | WRONG | Three items are included. The dock, the step rail and the section header all say three of six. |
| 130 | `Problem list: 1 add to active list, 1 update existing, 2 note only` | `Derived` | WRONG | Sums to four against three included, and the commands chosen are one Diagnose, one Assess, one encounter-diagnosis — so one note-only, not two. "Update existing" is also the retired name for `Assess existing`. |
| 131 | `Orders: 5 intents, all unsent` | `Aleron` | GAP | The load-bearing ambiguity: staged Canvas commands, or Aleron-side rows? Staged commands get baked into the locked PDF; Aleron-side rows are patient data Aleron must not hold. |
| 132 | "Authorizing them is step 3, and it neither waits on this act nor follows from it" | `Canvas SDK` | WRONG | See headline. After `LKD` no new command enters this note. |
| 133 | `Preview note: Current with the fields above` | `Aleron` | OK | |
| 134 | `hash note 7a41 c0d9 be52 3f8e` | `Derived` (Aleron hash of its own preview) | GAP | No Canvas field. `UPSERT_NOTE_METADATA` is the home. |
| 135 | `On lock: Immutable note snapshot` | `Canvas API:Note` `stateChange` → `LKD` | OK | Newly verified: `docs.canvasmedical.com/api/note/`. |
| 136 | `On lock: Note PDF` | `Canvas API:Note` (lock generates the PDF) | OK | Newly verified, same URL. Canvas generates it; Aleron does not. |
| 137 | `On lock: the legal-record DocumentReference in Canvas` | `Canvas FHIR:DocumentReference` (create) | GAP | Redundant with the Note PDF, and DocumentReference has **no update**: if the note is ever unlocked and relocked, the DocumentReference is permanently stale. |
| 138 | Attestation: "I reviewed the exact Preview note and the problem-list mutation set" | `Aleron` | OK | |
| 139 | Attestation: "`5 pending orders remain unsent` after this act" | `Derived` | WRONG | Four authorizable; the fifth is the prescription. |
| 140 | "the 5 queued orders are unaffected either way" | `Canvas SDK` | WRONG | Staged commands inside the note are very much affected by locking it. |

### Step 3 — Order authorization

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 141 | "Authorizes the exact enumerated order set" | `Canvas SDK:Refer.sign()`, `Task`, `Goal`, `ImagingOrder.sign()` | GAP | `LabOrder` has no `sign()`, and `originate(commit=True)` is silently ignored for order commands. Authorization is not one call and its failure is silent. |
| 142 | "The state of the note is not one of its conditions. Step 2 can be open, locked, or never taken" | `Canvas SDK` | WRONG | The headline finding. Locked is not a state in which a new order command can be created. |
| 143 | Blocker: "Colorectal screening has no modality chosen, so no catalog entry resolves" | `Canvas SDK:Refer` / `Junction:lab_test_id` | OK | Genuinely correct and well observed. |
| 144 | Blocker: "Entra step-up re-authentication is older than 15 minutes" | `Aleron` / Entra | OK | Aleron-owned gate. |
| 145 | Missing blocker: Canvas practitioner id | `Canvas FHIR:Practitioner` | GAP | Ground truth names "no Canvas practitioner id" as the root cause of command failure. `ordering_provider_key` is required on Refer, ImagingOrder and LabOrder, and Canvas has no JIT provisioning. Not listed here. |
| 146 | "CLIA asks for an authenticated request from an authorized person, not a locked document" | `Aleron` (regulatory) | OK | Sound as a *clinical* argument. It does not make the API sequence work. |
| 147 | "Tirzepatide is not in this set ... composed and written into the note on Orders, and signed in Canvas" | `Canvas SDK:Prescribe` | OK | Matches ground truth. The return leg from Canvas is undocumented. |

### Step 4 — Release gating and progress

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 148 | `Needs steps 2 and 3, in either order` | `Aleron` | GAP | Enforceable as an Aleron precondition, but "either order" inherits #142. |
| 149 | "The note locked and the orders authorized ... and a preview generated" | `Canvas SDK:Note.current_state` + `Aleron` | OK | The note-locked half is readable from Canvas. |
| 150 | "Reaches the patient: the package below, exactly as shown" | `Aleron` member app | GAP | Aleron must hold the package to serve it. Direct conflict with "Aleron stores no patient data". |
| 151 | Release stepper 1 `Review` / `started 30 Aug` | `Aleron` | OK | |
| 152 | Release stepper 2 `Exact preview` / `generated and hashed` | `Derived` | OK | |
| 153 | Release stepper 3 `Attest` / `pending` | `Aleron` | OK | |
| 154 | Release stepper 4 `Release` / `pending` | `Aleron` | OK | |

### Step 4 — release package content

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 155 | `package REL-47M-0001` | `Aleron` | GAP | No FHIR field. `UPSERT_PATIENT_METADATA` or the DocumentReference id. |
| 156 | `not yet released` | `Aleron` | OK | |
| 157 | Patient-safe doctor message (full prose) | `Canvas FHIR:Communication` (create) | GAP | Communication is create/read/search, no update — which suits an immutable released message, but the screen names no resource at all. |
| 158 | Action 1 `Start the weekly injection` | `Aleron` release package | GAP | Derived from `Prescribe`, but the prescription is unsigned at this point. The patient is told to start a drug not yet transmitted. |
| 159 | Action 1 `Why it matters` | `Aleron` action library | OK | |
| 160 | Action 1 `What to do: 2.5 mg once a week` | `Canvas SDK:Prescribe.sig` | OK | |
| 161 | Action 1 "The pharmacy will call you" | `Canvas SDK:Prescribe.pharmacy` | WRONG | No pharmacy will call: the prescription is not signed and not sent. This is a patient-facing statement about an act that has not happened. |
| 162 | Action 2 `Two strength sessions a week` | `Canvas SDK:Goal` | OK | |
| 163 | Action 3 `Fourteen days of home BP readings` | `Canvas FHIR:Task` | UNVERIFIED | #76. |
| 164 | Action 4 `Choose how you want your bowel screening done` | `Aleron` | OK | Correctly says nothing is ordered until the patient picks. |
| 165 | `Provenance: Aleron action library v2.4.1` ×4 | `Aleron` | GAP | No FHIR field. `Provenance` is read-only in Canvas FHIR. |
| 166 | `scored against your packet of 24 Jun 2026` | `Aleron` | GAP | |
| 167 | `Evidence: Randomised trial evidence, high certainty` ×4 | `Aleron` action library | GAP | No FHIR field. |
| 168 | `Next step: Repeat HbA1c and fasting insulin at 12 weeks` | `Aleron` / `Junction:POST /v3/order` (future) | OK | |
| 169 | `Status: not_started` ×4 | `Aleron` member app | GAP | Patient action state is Aleron-side patient data by construction. |
| 170 | `gate with reclassification probability 65 %` | `Aleron` engine | OK | |

### Step 4 — disposition and exclusion tables

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 171 | Required item `Genetic counselling referral` / `Referred 31 Aug 2026, appointment pending` | `Canvas FHIR:ServiceRequest` (read) + `Appointment` (read) | OK | Refer command writes it; ServiceRequest reads it back. |
| 172 | Required item `Family-history gate` / `Documented 31 Aug 2026, cascade pending` | `Canvas FHIR:Task` (read) | OK | |
| 173 | Required item `Colorectal cancer screening` / `Offered as a choice, no modality selected` | `Canvas FHIR:DetectedIssue.mitigation` | GAP | Deferred-pending-patient-choice is a state DetectedIssue can carry but the screen does not use it. |
| 174 | `Patient sees` column ×3 | `Aleron` release policy | GAP | Per-item patient-visibility decision has no Canvas field. |
| 175 | `3 of 3 required items disposed` | `Derived` | OK | |
| 176 | "An undisposed required item fails release validation" | `Aleron` | OK | |
| 177 | Hidden: `ATM heterozygous P/LP, named finding` / genetics display policy | `Aleron` policy | GAP | No Canvas field for a per-finding disclosure policy. |
| 178 | Hidden: `Oral glucose tolerance test` / "override reason is stored for audit" | `NONE` | GAP | The scored-suggestion rejection reason. This is the real Custom-Data-Model-or-metadata gap. |
| 179 | Hidden: `Sleep apnea concern, SpO2 nadir 89 %` | `Junction:` device data | OK | Value source fine; the hold policy is Aleron. |
| 180 | Hidden: `Action map coordinates and QALY derivation` | `Aleron` engine | OK | Correctly never patient-facing. |
| 181 | Hidden: `Raw lab values, 27 fields` | `Canvas FHIR:Observation` (read) / `Junction:BiomarkerResult` | OK | |
| 182 | `5 items withheld, each with a stored reason` | `NONE` | GAP | Stored where? Same as #178. |

### Step 4 — provenance, hash, linkage, blocked specimen

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 183 | `Action library v2.4.1 · hash lib 3ce8 55f1 a904 7b2d` | `Aleron` | GAP | Lineage ids have no FHIR home; `UPSERT_NOTE_METADATA` is the escape hatch. |
| 184 | `Packet PKT-47M-0001 · frozen 24 Jun 2026 · hash pkt 08bb ...` | `Aleron` | GAP | As above. |
| 185 | `Engine run RUN-47M-0003` / `Action map state AMS-47M-0003` | `Aleron` | GAP | As above. |
| 186 | `Source plan PLAN-47M-0001 · signed 31 Aug 2026, 11:48` | `Aleron` | GAP | As above. |
| 187 | `Physician actor Dr. A. Okafor · NPI 1487520394 · signature SIG-47M-0001` | `Canvas FHIR:Practitioner` (read, NPI) + `Aleron` (signature id) | OK | NPI also feeds `Junction:physician.npi`. |
| 188 | `Validation: 6 checks passed, 0 failed` | `Aleron` | OK | Aleron-side validator. |
| 189 | `Preview hash prev b6d4 2a17 e80c 5931` and its coverage list | `Derived` | GAP | `UPSERT_NOTE_METADATA`. |
| 190 | "On release: the package hash is appended to the audit log and linked to the Canvas note id" | `Canvas SDK:UPSERT_NOTE_METADATA` | OK | Correct mechanism, wrong direction of dependency — see #192. |
| 191 | Canvas linkage `Note: Locked 31 Aug, 11:48` | `Canvas SDK:Note.current_state` | OK | |
| 192 | Canvas linkage `Canvas note: links on release` | `Canvas SDK:CREATE_NOTE` / `Canvas API:Note` | WRONG | The Canvas note id exists from note creation and certainly by lock. Nothing about it "links on release". What happens on release is Aleron writing *its* package id back onto the note. Say that. |
| 193 | Canvas linkage `Signing path: Aleron authorization, Canvas linkage` | mixed | GAP | Vague. Names neither resource nor operation, which BRIEF requires. |
| 194 | "the DocumentReference is written; the Canvas note id links back on release" | `Canvas FHIR:DocumentReference` | WRONG | DocumentReference cannot be updated, so nothing can be linked *back* onto it after the fact. |
| 195 | Ten required package parts (list) | `Aleron` Role and Release Matrix | OK | Aleron-owned spec. Parts 1, 2, 8, 9, 10 have no Canvas home. |
| 196 | Blocked specimen `Priya Raghunathan · AL-44F` | `Canvas FHIR:Patient` (read) | GAP | Third fixture patient. BRIEF fixes two and forbids inventing a third. |
| 197 | Blocked: "2 of 3 required items have no disposition" | `Canvas FHIR:DetectedIssue` (search) | OK | Readable from DetectedIssue once dispositions live there. |
| 198 | Blocked: "2 visible recommendations carry no provenance summary" | `Aleron` | OK | |
| 199 | Blocked: "a draft override reason is present in the visible copy" | `Aleron` | OK | |
| 200 | Blocked: `source_action_map_state_id` is `not emitted` | `Aleron` | OK | P7. |
| 201 | Six release-validation conditions | `Aleron` matrix | OK | |

### Dock

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 202 | `3 of 6 added` | `Derived` | OK | |
| 203 | `5 orders will queue` | `Derived` | WRONG | Four are authorizable here; the fifth is the prescription. |
| 204 | `2 required and not declinable` | — | WRONG | Contradicts the disposition control, which permits defer and except with a reason. Stale carve-out language. |
| 205 | `Clear all` / `Next: Note lock` | `Aleron` (UI) | OK | |

## Step-by-step API sequence

| Step | API acts it performs | Depends on | Enforceable as drawn? | Note |
|---|---|---|---|---|
| 1 · Plan | Reads only: `Canvas FHIR:Patient`, `Condition` (search), `Observation`, `DiagnosticReport`, `Junction:BiomarkerResult` + device data. Writes nothing. Draft state is Aleron-held. | Canvas practitioner exists (SAML, no JIT) | Yes, for the reads | The draft itself is patient data Aleron is not supposed to hold. Unresolved. |
| 1 → 2 boundary | `Canvas SDK:CREATE_NOTE` must happen *here*, not at lock: every command needs a `note_uuid` before it can be originated. | — | **Not drawn at all** | The screen never says when the Canvas note is created. It has to be before any command, therefore before both step 2 and step 3. |
| 2 · Note lock | `DiagnoseCommand.originate + commit`; `AssessCommand.originate + commit`; `PlanCommand`; `Canvas FHIR:Condition` create for encounter-diagnosis and health-concern; `Canvas API:Note` `stateChange` → `LKD` (or `SIGN_NOTE`); Canvas generates the PDF; optional `DocumentReference` create; `UPSERT_NOTE_METADATA` for the preview hash. | The note from the boundary step; an Encounter for the FHIR Condition writes | Mostly. Two gaps: no Encounter exists for the encounter-diagnosis write, and the extra DocumentReference duplicates the Canvas-generated PDF with no update path. | `SIGN_NOTE` exists, so the old "can an embedded app sign a note" spike is resolved. |
| 3 · Order authorization | `Refer.originate` then `.sign`; `Task.originate + commit` ×2; `Goal.originate + commit`; (`Prescribe.originate` only, excluded from this act); for the deferred colorectal item, `Junction:POST /v3/order` or `Refer` once a modality is picked. | An **editable** note; `ordering_provider_key`; fresh Entra step-up | **No, in one direction.** Before or alongside step 2: yes. After step 2's lock: no — the note is `LKD` and no command can be inserted. | Also `originate(commit=True)` is silently ignored for order commands, so authorization is a two-call sequence whose first failure mode is silent. |
| 4 · Patient release | Reads `Note.current_state` and `ServiceRequest`/`Task`/`Appointment` for order status; `UPSERT_NOTE_METADATA` to write the package id and hash onto the note; `Communication` create for the doctor message; Aleron publishes the package to the member app. | Steps 2 and 3 both complete | Yes as an Aleron gate, no as a Canvas gate — Canvas enforces none of it. | The Canvas note id is available from step 2, so "links on release" is backwards. |

## Required changes

1. **Fix the direction claim on step 3. (Small — copy, one blocker row.)** "The state of the note is not one of its conditions. Step 2 can be open, locked, or never taken this cycle, and this act reads the same in all three cases" is false for the locked case. Replace with: orders may be authorized before or while the note is open; an order added after the note is locked opens a new note. Add "note is locked" as a *conditional* blocker rather than deleting it entirely, which is what the last pass did.
2. **Say when the Canvas note is created. (Small — one fact row, large in consequence.)** Every command needs a `note_uuid`. The screen has four steps and none of them creates a note. Put `CREATE_NOTE` at the start of step 1 and state the note id on the plan pane, which also removes the "links on release" confusion.
3. **Decide what "5 intents, all unsent" means. (Medium.)** Staged commands in the note, or Aleron-held rows? If staged, locking bakes unsigned orders into the immutable PDF and the note-lock card must say so. If Aleron-held, Aleron holds patient data. Pick one and draw it.
4. **Fix the counts. (Small.)** Note-lock card says 4 problems included against 3 everywhere else, and "1 add, 1 update existing, 2 note only" sums to 4 with the wrong split. "5 orders" appears in six places while one of the five is the excluded prescription; the authorizable set is four.
5. **Retire the "cannot be rejected" language. (Small.)** Three surfaces still carry it — the two obligation entries in the JS fixture, and the dock's "2 required and not declinable" — while the disposition control four panes up offers defer and except. The annotation at line 1760 already declares this fixed.
6. **Correct the deferral-reason gap. (Small.)** The on-surface scaffold string and the doc signature line both say the reasons "have no field in Canvas FHIR" and need a Custom Data Model. `UPSERT_NOTE_METADATA` and `UPSERT_PATIENT_METADATA` exist, and for the Z12.11 item — which the release table itself calls a required preventive-care item — `DetectedIssue.mitigation` exists with full FHIR CRUD. Scope the claim to declining a *scored* suggestion, which the annotations already do and the surface does not.
7. **Fix "links on release". (Small.)** The Canvas note id exists at lock. What happens on release is Aleron writing its package id and hash onto the note via `UPSERT_NOTE_METADATA`. Also drop or justify the second DocumentReference: Canvas already generates the PDF on lock, and DocumentReference has no update, so it can never be corrected.
8. **Remove "The pharmacy will call you" from action 1. (Small, and it is a patient-safety line.)** At release time the prescription is originated and unsigned. No pharmacy has it. This is the only line in the release package that promises an act that has not occurred.
9. **Add the missing order blocker. (Small.)** No Canvas practitioner id is the ground truth's named root cause of command failure, and Canvas has no just-in-time provisioning. It belongs beside the Entra freshness blocker.
10. **Fix `Priority routine` on the Refer, `Dx:` on Task and Goal rows, and `Past medical history · resolved`. (Small, four rows.)** `Refer` has no priority and no diagnosis field; `Task` and `Goal` carry no diagnosis association; `MedicalHistory` takes free text, not an ICD-10 code.
11. **Replace the third fixture patient. (Small.)** The blocked specimen invents `Priya Raghunathan · AL-44F`. BRIEF fixes two patients and forbids a third; AL-56F Mara Chen is available.
12. **Fix "FIB-4" as an order. (Small.)** FIB-4 is computed from AST, ALT, platelets and age. The order is a CMP plus CBC through Junction; FIB-4 rides on the result, which the reason text already says correctly.

## Alternative pathways

- **#82, #103, #178, #182 — scored-suggestion rejection reasons and the audit store for withheld items (NONE / WRONG).** Use `UPSERT_NOTE_METADATA` keyed by suggestion id on the note that declined it. Cost: one metadata write per declined item, readable back through the SDK Data module. It is cheaper than a Custom Data Model and it is Canvas-resident, so Aleron still stores nothing. Note that the human-readable half already persists for free: the reason is typed into a textarea inside the note body, so it is note prose the moment the note locks. Only the machine-readable key needs metadata. The one thing metadata does *not* give you is cross-cycle suppression, because that is a patient-level fact — use `UPSERT_PATIENT_METADATA` for the suppression key alone.
- **#80, #173 — the Z12.11 disposition (WRONG).** `DetectedIssue` create then update, with `mitigation` carrying `deferred`, the author and the date. Full FHIR CRUD, no plugin required. The screen already argues this in its own annotations; the surface has not caught up.
- **#108, #110, #204 — "cannot be rejected" (WRONG).** No API change needed; this is stale copy. The correct model is already built: nothing in Canvas disables a clinician, an obligation simply stays outstanding until dispositioned.
- **#161 — "The pharmacy will call you" (WRONG).** Two options. Either drop the sentence and say the prescription is with the physician to sign, or hold action 1 out of the release package until the `Prescribe` command is signed, read back through `MedicationRequest` (read-only, but readable). The second is better and costs a re-release.
- **#192, #194 — Canvas linkage (WRONG).** `UPSERT_NOTE_METADATA` writes `aleron_release_package_id` and `aleron_preview_hash` onto the note, at any time, including after lock — metadata is not note body. Do not attempt this on the DocumentReference; it has no update.
- **#99, #102 — command counts (WRONG).** Editorial.
- **#122 — "problem 3 stays provisional" (WRONG).** `verificationStatus` is not writable. The screen's own correct formulation is three panes away: the problem states its uncertainty by staying off the problem list. Reuse that sentence.
- **#42, #44 — Refer priority and diagnosis (WRONG).** Fold both into `Refer.comment`, which is the only free-text field the command has. Cost: they stop being structured and cannot be queried back.
- **#34 — "Past medical history · resolved" (WRONG).** Either relabel it as free-text past medical history and drop the code from that branch, or replace the option with `Canvas FHIR:Condition` create at `clinicalStatus: resolved`, which does take a code. The second matches what the screen means.
- **#88 — FIB-4 as an order (WRONG).** Order the constituent panel through `Junction:POST /v3/order` with an `order_set`; compute FIB-4 from the returned `BiomarkerResult` values. Junction's `clinical_notes` caps at 120 characters, so the indication text will truncate.
- **#47, #78, #117, #121 — `Dx:` on Task and Goal rows (NONE).** Drop the row. Neither command carries a diagnosis association, and the Goal row already has the right idea. If the association must survive, put the ICD-10 code in `Task.comment` / `Goal.goal_statement` as prose, or hold it only in the release package.
- **#123, #127 — "Reject" on a scored suggestion (NONE).** Same store as #178. Alternatively drop the button and let the checkbox plus the reason textarea be the whole mechanism, which is what the opt-in model already gives you.
- **#150, #157, #169 — the release package and patient action status (GAP, and the structural one).** Three routes. (a) `Canvas FHIR:Communication` create for the doctor message plus `DocumentReference` create for the package body — both immutable, which suits a hashed package, and both Canvas-resident so Aleron stores nothing; the member app then reads them back through Canvas. Cost: the member app becomes a Canvas client, and per-action `not_started` status still has nowhere to live. (b) Canvas Custom Data Model in a plugin namespace, which holds the package and the action statuses. Cost: a plugin, and it is the path the annotations already name. (c) Aleron holds it. Cost: Aleron's "no patient data" premise ends, and it ends on the one surface the patient reads. Pick (b); the release package is not a clinical document and does not belong in a chart resource.
- **#165, #183 to #189 — provenance and lineage ids (GAP).** `Provenance` is read-only in Canvas FHIR, so it is not the answer despite the name. `UPSERT_NOTE_METADATA` on the locked note holds every lineage id and hash, and they are exactly the "engine run ids and package ids" the ground truth names as the metadata escape hatch's intended use.
- **#35, #36, #68, #74, #79, #101 — encounter-diagnosis and health-concern Conditions (GAP).** These need an `encounter` reference and `Encounter` is read-only in FHIR. Two routes: use the encounter Canvas creates for the note the commands live in (requires the write to come from inside the plugin, not from the outside FHIR API), or omit `encounter` and accept a data-import note, which means the Condition is not attached to this visit and the "recorded in the signed note" claim on the surface becomes false. The first is right and pushes both writes from FHIR onto the SDK.
- **#145 — no Canvas practitioner id (GAP).** No workaround exists. Canvas has no just-in-time provisioning, so the Canvas user must be created before the physician's first order. This is an onboarding step, not an API call, and it should be a named prerequisite rather than a runtime blocker.
- **The Canvas return leg (GAP, unsolved).** The prescription redirect lands the physician in Canvas to sign. Deep-linking into Canvas to a specific note from outside is not documented, and neither is anything that brings them back. The screen says "signed in Canvas" and stops, which is honest. The nearest workable mechanism is inverting it: `SHOW_ACTION_BUTTON` with `LaunchModalEffect` puts Aleron *inside* Canvas, so the physician never leaves and there is no return leg to solve. That is Canvas embedding Aleron, which is documented, rather than Aleron embedding Canvas, which is not.

## Contradictions with what the screen already claims

- **The screen contradicts Canvas on its own headline claim.** Step 3: *"The state of the note is not one of its conditions. Step 2 can be open, locked, or never taken this cycle, and this act reads the same in all three cases."* A locked note is not editable and commands are inserted by `note_uuid`. It does not read the same in all three cases.
- **The screen contradicts itself on obligations.** The JS fixture: *"Obligation. Address it or document why not; it cannot be rejected"* (twice), and the dock: *"2 required and not declinable"* — against the annotation at line 1760: *"The obligation's checkbox was `aria-disabled` and labelled *cannot be declined*, which claimed an authority over clinical judgement that the system of record does not itself claim ... The item now offers include, defer with a reason, or document an exception."* The markup was fixed; the fixture and the dock were not.
- **The screen contradicts itself on the deferral gap.** On surface: *"The reason above has no field in Canvas FHIR; it needs a Custom Data Model to persist"* and *"their reasons have no field in Canvas FHIR"* — against the annotation at line 1771: *"The Custom Data Model gap was overstated and is now scoped ... `DetectedIssue` is one of the few resources with full create, read, update and search over the FHIR API."* And the item carrying the string, Z12.11, is listed in the release table as a required preventive-care item, so it is precisely the case DetectedIssue covers.
- **An annotation claims a fix that is not in the markup.** Line 1822: *"`Dx: not required for a Goal` now also says the Goal is set by a Goal command."* Line 870 still reads `Dx: not required for a Goal` and nothing else.
- **Stale annotations v2 has already corrected.** Line 1935: *"So each problem now states the verification status as a fact and says who owns it"* — against line 1784, *"Verification status is gone from all three problems"*, which matches the markup. Line 1990: *"The fourth certainty value, not applicable, is missing and this screen needs it"* — the certainty control no longer exists. Lines 1977 to 1989 argue about *"Update existing"*, a control renamed to `Assess existing` and flagged as renamed at line 1606. Four annotations describing a screen two revisions back.
- **The JS fixture carries a claim the screen deleted.** o5: *"which is why problem 3 stays provisional until this returns."* `verificationStatus` is not writable and every visible reference to provisional was removed; the surface's own correct sentence is that the problem states its uncertainty by staying off the problem list.
- **The counts disagree with each other.** *"4 included, 0 removed"* and *"1 add to active list, 1 update existing, 2 note only"* against *"3 of 6 added"* on the dock, the step rail and the section header. The annotation at line 1874 caught the same class of error for orders (6 → 5) and stopped there.
- **What v3 gets right that is worth protecting.** The prescription carve-out is correct against the ground truth in every particular: `Prescribe` originates but does not sign, SPI gates the signature, EPCS gates controlled substances, and the identity attaches to the prescriber and not to Aleron. The colorectal blocker is correct and well observed: colonoscopy is a `Refer` and FIT is a Junction lab, so no catalog entry resolves until the patient picks. And the three-acts argument survives the API check — it is only the *unordered* claim between two of them that does not.

## Open questions for the humans

1. Can a Canvas command be `sign()`ed or `commit()`ed in a note that is already `LKD`? The docs establish that a locked note is not editable and that `originate` needs a `note_uuid`, but they do not say whether the CommandAPI enforces the note state on the later verbs. If signing a staged command in a locked note works, v3's independence claim is recoverable for orders that were staged before the lock.
2. What is a "queued, unsent order" concretely — a staged Canvas command, or an Aleron row? Everything downstream turns on this, including whether locking the note captures unsigned orders into the legal PDF.
3. Is unlock-and-relock (`LKD` → `ULK` → `LKD`) an acceptable operational path? If yes, most of the lock-then-orders problem goes away at the cost of the word "immutable" on step 2's attestation. If no, late orders need a second note and the screen must draw it.
4. Where does the release package live? Canvas Custom Data Model, Canvas `Communication` plus `DocumentReference`, or Aleron? This is the largest open decision on the screen and the only one that touches the "Aleron stores no patient data" premise directly.
5. Is `ProtocolOverride` a real Canvas write surface, and through which API? The annotations lean on it; it is not in the ground truth and it is not a FHIR resource. `DetectedIssue` covers the same need and is verified, so the safe answer is to stop citing ProtocolOverride.
6. Does Canvas accept a patient as the owner of a `Task`? Two of the five orders (home BP monitoring, family-history gate) are patient activities modelled as Tasks, and the SDK command's `assignee_id` is a staff member.
7. Does Canvas expose variant-level P/LP genetics findings as discrete `Observation` resources, or only as a `DiagnosticReport` PDF? The ATM item's whole obligation chain reads from it.
8. If the encounter-diagnosis and health-concern writes move from FHIR to the SDK to get an encounter, does that make the whole plan a plugin rather than an external app? That is an architecture decision, not a screen decision, and it is implied by two rows on this screen.
