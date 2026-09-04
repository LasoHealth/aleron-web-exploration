# v2/care-plan.html

**Screen purpose:** One problem-centred workbench where the physician edits a four-problem assessment and plan, sets each problem's disposition and each order's basis beside the document, then performs three separate commit acts: note lock, order authorization, patient release.

**Data points audited:** 212 — OK 136, GAP 52, WRONG 14, UNVERIFIED 10, NONE 0

Every `NONE` candidate on this screen turned out to have a metadata or redirect path, so the count is zero; the ones that would have been `NONE` without `UPSERT_NOTE_METADATA` are marked `GAP` and are all listed in **Alternative pathways**.

## Data points

### A. Chart chrome and patient identity
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 1 | `Ethan Park` | Canvas FHIR:Patient (read) | OK | `Patient.name`. |
| 2 | `AL-47M` | Aleron | GAP | Aleron member id, not a Canvas identifier. Needs `CREATE_PATIENT_EXTERNAL_IDENTIFIER` (SDK) to live in the chart, or an Aleron-side mapping table. Nothing on this screen shows the Canvas patient id. |
| 3 | `47M` | Derived | OK | From `Patient.birthDate` + `Patient.gender`. |
| 4 | `EP` avatar initials | Derived | OK | From `Patient.name`. |
| 5 | `Dr. A. Okafor` (rail actor) | Aleron | GAP | Entra session identity. Every command on this screen needs a *Canvas* practitioner id, and Canvas has **no just-in-time provisioning**: if Dr. Okafor has no pre-existing Canvas user, `ordering_provider_key` / `prescriber_id` have nothing to bind to and the whole commit sequence fails silently. |
| 6 | Route `aleron.md/chart/AL-47M/care-plan` | Aleron | OK | |
| 7 | `Open in Canvas ↗` destination | Canvas (redirect) | GAP | Canvas embedding *Aleron* is documented; Aleron deep-linking *into* a specific Canvas chart from outside is not. The return leg is undocumented. |

### B. Page header and document header
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 8 | `Plan editing` lifecycle state | Aleron | OK | Role and Release Matrix lifecycle, Aleron-owned. |
| 9 | `saved, revision 14` | Aleron | OK | Draft revision counter; nothing in Canvas holds a pre-signature revision count. |
| 10 | `Draft` document state | Aleron | OK | |
| 11 | `Baseline review, cycle 1` note title | Aleron | GAP | On write this becomes the Canvas note type. `CREATE_NOTE` takes a note type from the instance's configured set; an arbitrary title is not a note type. Someone must map Aleron cycle names onto configured Canvas note types. |
| 12 | `31 Aug 2026` document date | Aleron | OK | Becomes the note's clinical date. |
| 13 | `Dr. A. Okafor` document author | Canvas FHIR:Practitioner (read) | GAP | Same provisioning gap as #5. |

### C. Indication
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 14 | Indication body text | Aleron | GAP | No FHIR field and no dedicated command. Nearest command home is `ReasonForVisit` (which has no `commit`) or `HistoryOfPresentIllness.narrative`. Currently unassigned. |
| 15 | `Packet frozen 24 Jun 2026` | Aleron | OK | `patient_packet.v1` metadata. |
| 16 | `the 163-gene panel resulted` | Canvas FHIR:DiagnosticReport (read) | UNVERIFIED | Confirm the Canvas genetics integration surfaces panels as `DiagnosticReport` and not as an attachment only. Check a real genetics report payload on the target instance. |
| 17 | `AL-47M action-map state of 29 Aug 2026` | Aleron | OK | Engine artefact. |
| 18 | `membership programme · no diagnosis code required` | Aleron | OK | Programme rule, not an API fact. |

### D1. Problem 1 — prediabetes with insulin resistance
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 19 | `1.` | Derived | OK | Document ordinal. |
| 20 | `Prediabetes with insulin resistance` | Canvas SDK:Diagnose | OK | Display for `icd10_code`. |
| 21 | `R73.03` | Canvas SDK:Diagnose (`icd10_code`) | OK | Also valid as FHIR `Condition.code` on create. |
| 22 | `confirmed` | Canvas FHIR:Condition | **WRONG** | `verificationStatus` is **not writable** through FHIR, and neither `Diagnose` nor `Assess` carries a certainty field. Aleron cannot set this. |
| 23 | `will add to problem list` | Canvas FHIR:Condition (create) | OK | `category: problem-list-item`, `clinicalStatus: active`. Also reachable as `Diagnose` inside the note. |
| 24 | `no Canvas match, new problem` | Canvas FHIR:Condition (search) | OK | Search by patient + code. |
| 25 | `HbA1c 6.0 %` | Canvas FHIR:Observation (read) | OK | Or the Junction result written in by `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS`. |
| 26 | `fasting glucose 110 mg/dL` | Canvas FHIR:Observation (read) | OK | Same. |
| 27 | `HOMA-IR 4.3` | Derived | GAP | Computed from glucose + fasting insulin. No Canvas home: `Observation` create is restricted to vitals/panel shapes and has **no update**. Recomputed per render or stored by Aleron. |
| 28 | `waist 105 cm` | Canvas FHIR:Observation (read) | UNVERIFIED | Waist circumference is not one of Canvas's standard vitals. Confirm it exists as a readable Observation on the target instance, or that `VitalSignReading` accepts it as a `vital_sign_type`. |
| 29 | Assessment prose, problem 1 | Canvas SDK:Diagnose (`background`) or `Assess` (`narrative`) | OK | |
| 30 | Plan prose, problem 1 | Canvas SDK:Plan (`narrative`) | OK | Per-problem plans collapse into one narrative; see change 9. |
| 31 | Order type tile `Rx` | Derived | OK | Aleron's own classification of the command it will originate. |
| 32 | `tirzepatide 2.5 mg/0.5 mL, subcutaneous auto-injector` | Canvas SDK:Prescribe (`fdb_code`) | GAP | Prescribe takes an FDB code, not a drug string. Aleron needs an FDB lookup it does not have on this screen. |
| 33 | `Sig: inject 2.5 mg subcutaneously once weekly` | Canvas SDK:Prescribe (`sig`) | OK | |
| 34 | `days supply 28` | Canvas SDK:Prescribe (`days_supply`) | OK | |
| 35 | `dispense 2 auto-injectors` | Canvas SDK:Prescribe (`quantity_to_dispense`, `type_to_dispense`) | OK | |
| 36 | `refills 2` | Canvas SDK:Prescribe (`refills`) | OK | |
| 37 | `substitutions allowed` | Canvas SDK:Prescribe (`substitutions`) | OK | |
| 38 | `Dx: E66.01 · R73.03` | Canvas SDK:Prescribe (`icd10_codes`) | OK | Prescribe is one of the few commands that genuinely takes diagnosis codes. |
| 39 | Order type tile `Goal` | Derived | OK | |
| 40 | `Supervised resistance training` | Canvas SDK:Goal (`goal_statement`) | OK | FHIR `Goal` is read-only; the command is the write path, as the screen already says. |
| 41 | `2 sessions/wk for 12 weeks` | Canvas SDK:Goal | GAP | Goal has `start_date` / `due_date` but no frequency or dose. The prescription lives only inside the free-text `goal_statement`, so it is unqueryable. |
| 42 | `lean-mass protection during weight loss` | Canvas SDK:Goal (`goal_statement`) | OK | |
| 43 | `tracked as a Canvas Goal` | Canvas SDK:Goal | OK | Correct as drawn. |
| 44 | `Dx: not required for a Goal` | Canvas SDK:Goal | OK | True; and it contradicts this screen's own annotation (see Contradictions). |

### D2. Problem 2 — hypertension, stage 2, unconfirmed
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 45 | `2.` | Derived | OK | |
| 46 | `Hypertension, stage 2, unconfirmed` | Aleron | OK | |
| 47 | `I10` | Aleron | OK | Never reaches Canvas as a code: this problem is note-only. |
| 48 | `provisional` | Canvas FHIR:Condition | **WRONG** | Same as #22. `provisional` is a real `verificationStatus` value but it is not writable, so Aleron cannot produce it. |
| 49 | `signed note only` | Derived | OK | Aleron's decision to originate no `Diagnose`. |
| 50 | `no Canvas match, new problem` | Canvas FHIR:Condition (search) | OK | |
| 51 | `edited` flag on the meta line | Aleron | GAP | Physician-edited-vs-engine-drafted has no FHIR field. Note metadata keyed by problem index. |
| 52 | `142/90 mmHg in clinic` | Canvas FHIR:Observation (read) | OK | BP is a standard vital. |
| 53 | Assessment prose, problem 2 | Canvas SDK:HistoryOfPresentIllness | GAP | A note-only problem originates no `Diagnose`, so its assessment has no structured home and drops into a shared free-text narrative. The per-problem structure the screen draws does not survive the write. |
| 54 | Plan prose, problem 2 | Canvas SDK:Plan (`narrative`) | GAP | Same collapse. |
| 55 | Order type tile `Task` | Derived | OK | |
| 56 | `Home blood pressure monitoring, 14 days` | Canvas SDK:Task | GAP | Task's `assignee_id` is a Canvas *staff* user. A patient-performed activity is not what a Canvas Task models; this becomes a staff follow-up task with the instruction in `comment`. |
| 57 | `Twice daily, morning and evening` | Canvas SDK:Task (`comment`) | GAP | Free text only; no structured schedule. |
| 58 | `patient device` | Aleron | GAP | Canvas `Device` is read-only and a patient-owned cuff is not in it. Junction covers wearables, not a generic BP cuff, unless the cuff is a connected Junction device. |
| 59 | `review next cycle` | Canvas SDK:Task (`due_date`) | OK | Needs resolving to a date. |
| 60 | `Dx: I10` on a Task row | Canvas SDK:Task | **WRONG** | Task has no diagnosis field (`task_type`, `assignee_id`, `due_date`, `comment`). The dx association is Aleron-side only and cannot be written. |

### D3. Problem 3 — ATM pathogenic variant, heterozygous
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 61 | `3.` | Derived | OK | |
| 62 | `ATM pathogenic variant, heterozygous` | Canvas FHIR:Condition (read) | OK | Existing genetics condition. |
| 63 | `Z15.09` | Canvas FHIR:Condition (read) | OK | |
| 64 | `confirmed` | Canvas FHIR:Condition | **WRONG** | As #22. Here it is also *readable* from the existing condition, so the display is fine but the segmented control that lets the physician change it is not. |
| 65 | `will update existing problem` | Canvas FHIR:Condition (update) | **WRONG** | The **only** supported Condition update is marking it `entered-in-error`. There is no revise operation. The screen's whole "update existing" disposition has no FHIR path. |
| 66 | `matches existing genetics condition` | Canvas FHIR:Condition (search) | OK | |
| 67 | `Confirmed P/LP on the 163-gene panel` | Canvas FHIR:DiagnosticReport (read) | UNVERIFIED | As #16. |
| 68 | `MBTA 163-gene panel` (rail fixture) | Canvas FHIR:DiagnosticReport (read) | UNVERIFIED | Panel name and vendor; confirm the genetics feed carries a panel identifier. |
| 69 | `resulted 23 Jun 2026` (rail fixture) | Canvas FHIR:DiagnosticReport (`issued`) | OK | |
| 70 | Assessment / Plan prose, problem 3 | Canvas SDK:Assess (`narrative`) + `Plan` | OK | `Assess` takes `condition_id`, which is exactly the matched-condition case. |
| 71 | Order type tile `Refer` | Derived | OK | |
| 72 | `Genetic counselling` | Canvas SDK:Refer (`specialty`) | OK | `Refer` supports `sign()`, so this one really is authorizable from Aleron. |
| 73 | `required` qualifier | Aleron | GAP | No field on `Refer` and none in FHIR. Note metadata. |
| 74 | `Priority routine` | Canvas SDK:Refer | UNVERIFIED | The ground-truth field list for `Refer` has no `priority` (unlike `ImagingOrder`, which does). Confirm against `docs.canvasmedical.com/sdk/commands/` before drawing it. |
| 75 | `clinical question: ongoing management` | Canvas SDK:Refer (`comment`) | OK | |
| 76 | `visit note attached` | Canvas SDK:Refer | UNVERIFIED | A `Refer` originated inside the note is in the note by construction, but whether the signed note travels with the referral is not established. |
| 77 | `Dx: Z15.09` on a Refer row | Canvas SDK:Refer | UNVERIFIED | `Refer` has no `diagnosis_codes` in the ground-truth field list, unlike `ImagingOrder` and `LabOrder`. Same doc check as #74. |
| 78 | Order type tile `Task` (family-history gate) | Derived | OK | |
| 79 | `Family-history gate: breast, pancreatic, prostate` | Canvas SDK:Task | GAP | A gate is a conditional obligation, not a task. `FamilyHistory` is the command that would hold the *answers*; nothing holds the gate itself. |
| 80 | `required` qualifier | Aleron | GAP | As #73. |
| 81 | `Cascade documentation · pancreatic surveillance conditional on first-degree history` | Canvas SDK:Task (`comment`) | OK | |
| 82 | `Dx: Z15.09` on a Task row | Canvas SDK:Task | **WRONG** | As #60. |

### D4. Problem 4 — health maintenance
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 83 | `4.` | Derived | OK | |
| 84 | `Health maintenance` | Aleron | OK | |
| 85 | `Z12.11` | Aleron | OK | Note-only, so it never reaches Canvas. |
| 86 | `monitoring` certainty | Canvas FHIR:Condition | **WRONG** | Worse than #22: `monitoring` is not a Canvas `verificationStatus` value at all. Canvas carries `confirmed`, `provisional`, `entered-in-error` and none of them is writable. |
| 87 | `signed note only` | Derived | OK | |
| 88 | `no Canvas match, preventive gap` | Canvas FHIR:Condition (search) | OK | |
| 89 | `Age 47` | Derived | OK | From `Patient.birthDate`. |
| 90 | `colorectal screening never done` | Derived | GAP | Asserts a negative across `Procedure` (read-only), `DiagnosticReport` and outside-records. Absence in Canvas is not absence in the world; needs an explicit "no record found in Canvas since <date>" framing. |
| 91 | Plan prose, problem 4 | Canvas SDK:Plan | OK | |
| 92 | Order type tile `Order` | Aleron | OK | The one row whose type is deliberately unresolved. |
| 93 | `Colorectal cancer screening: colonoscopy or FIT` | Aleron | GAP | No API on either side models an order with an unchosen modality. It is an Aleron-held intent until resolved, then it forks to Canvas `Refer` or Junction `POST /v3/order`. |
| 94 | `required · modality not chosen` | Aleron | GAP | As #73. |
| 95 | `colonoscopy is a referral every 10 years, FIT is a lab every year` | Aleron | OK | Aleron catalog. Consistent with the split: referrals to Canvas, labs to Junction. |
| 96 | `Dx: Z12.11` | Aleron | OK | Carries once the modality resolves to a command that takes codes. |

### E. Narrative
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 97 | Narrative body, three paragraphs | Canvas SDK:HistoryOfPresentIllness (`narrative`) | GAP | No command is named for it. It duplicates every assessment above it, so on write it either double-posts or the per-problem structure is discarded in its favour. Pick one. |
| 98 | `47-year-old man` | Derived | OK | |
| 99 | `SpO2 nadir of 89 %` | Junction (device data) | UNVERIFIED | The ground-truth file covers Junction lab results field-by-field but only names the device/wearable group. Confirm the sleep-summary field path at `docs.junction.com`. |
| 100 | `overnight resting heart rate of 38 bpm` | Junction (device data) | UNVERIFIED | Same. |
| 101 | `redrafts from assessment and plan · not manually edited` | Aleron | OK | Draft state, Aleron-owned. |

### F. Document signature line
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 102 | `Unsigned.` | Aleron | OK | |
| 103 | `4 problems in the signed note` | Derived | OK | |
| 104 | `1 add to active list` | Derived | OK | |
| 105 | `1 update existing` | Derived | **WRONG** | Counts an operation Canvas does not support. See #65. |
| 106 | `2 note only` | Derived | OK | |
| 107 | `6 order intents remain unsent` | Derived | OK | |
| 108 | `the prescription is written into the note from Orders and signed in Canvas` | Canvas SDK:Prescribe | OK | Correct and correctly reasoned: `originate` yes, `sign` no. |

### G. Workbench rail
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 109 | `Certainty` prose, per problem | Aleron | GAP | Reasoning for a value Aleron cannot write. Note metadata at best. |
| 110 | `On signature` prose, per problem | Derived | OK | |
| 111 | `Canvas match` prose, per problem | Canvas FHIR:Condition (search) | OK | |
| 112 | `Provenance: framing edited from the engine draft` (p2) | Aleron | GAP | As #51. |
| 113 | `Diagnostic certainty` segmented value | Canvas FHIR:Condition | **WRONG** | A three-state writable control over a field Canvas does not let Aleron write, one of whose states Canvas does not have. |
| 114 | `Problem-list disposition` segmented value | Canvas FHIR:Condition / SDK:Diagnose | **WRONG** | `Add` and `Note only` are fine; `Update existing` is not, per #65. |
| 115 | `Aleron-scored, from the final action-map state of 29 Aug 2026` | Aleron | OK | |
| 116 | `Dx association: problem 1 ... E66.01 and R73.03` | Derived | OK | |
| 117 | `about +1.9 QALY` (tirzepatide) | Derived (Aleron engine) | GAP | No Canvas home. `Observation` create is restricted to vitals/panel shapes and has no update; `Goal` and `CarePlan` are read-only in FHIR. Only `UPSERT_PATIENT_METADATA` or Aleron storage. |
| 118 | `about +1.1 QALY` (resistance training) | Derived | GAP | Same. |
| 119 | `Reclassification about 65 %` (home BP) | Derived | GAP | Same. |
| 120 | `prevention plus capacity` value framing | Aleron | OK | |
| 121 | Prescription carve-out prose (Surescripts, EPCS) | Canvas SDK:Prescribe | OK | Accurate: identity gates attach to the prescriber, not the calling application. |
| 122 | `Required channel: obligation, cannot be rejected` (o4, o5, o6) | Aleron | GAP | As #73. |
| 123 | `A physician-added order needs a diagnosis association before it can join the draft` | Aleron | **WRONG** | Asserts a Canvas rule that does not hold: `Goal` and `Task` take no diagnosis, and the screen says so two rows earlier. This is an Aleron product rule stated as an API constraint. |
| 124 | `Oral glucose tolerance test, 75 g, 2-hour` | Aleron | OK | Library item. |
| 125 | `reclassification about 4 %` | Derived | GAP | As #117. |
| 126 | `low value of information` | Aleron | OK | |
| 127 | `12-lead ECG, then patch or Holter if persistent` | Aleron | OK | |
| 128 | `unscored` state | Aleron | OK | P7 done right; nothing invented. |

### H. Commit act 1 — note lock
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 129 | `Ready physician act` state | Aleron | OK | |
| 130 | `4 included, 0 removed` | Derived | OK | |
| 131 | `1 add to active list, 1 update existing, 2 note only` | Derived | **WRONG** | As #105. |
| 132 | `6 intents, all unsent` | Derived | OK | |
| 133 | `Current with the fields above` | Aleron | OK | |
| 134 | `hash note 7a41 c0d9 be52 3f8e` | Aleron | OK | Aleron's own hash of its own draft. |
| 135 | `Immutable note snapshot, Note PDF, and the legal-record DocumentReference in Canvas` | Canvas FHIR:DocumentReference (create) | **WRONG** | DocumentReference is an attached document, not a Canvas note. Every command on this screen (`Diagnose`, `Assess`, `Prescribe`, `Goal`, `Task`, `Refer`, `Plan`) must be originated **inside a note**, and a note is created and locked by `CREATE_NOTE` + `SIGN_NOTE`, not by posting a PDF. As drawn, the problem-list decisions have nothing to crystallize into. |
| 136 | Attestation 1 checked state | Aleron | OK | |
| 137 | Attestation 2 `6 pending orders remain unsent` | Derived | OK | |
| 138 | `Both attestations required` | Aleron | OK | |

### I. Commit act 2 — order authorization
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 139 | `Revealed when ready` state | Aleron | OK | |
| 140 | Blocker: `the Preview note is not locked` | Aleron | OK | |
| 141 | Blocker: `Colorectal screening has no modality chosen, so no catalog entry resolves` | Aleron | OK | |
| 142 | Blocker: `Entra step-up re-authentication is older than 15 minutes` | Aleron | OK | Entra is Aleron's own auth; nothing Canvas-side. |
| 143 | `Authorizes the exact enumerated order set` as one act over 6 intents | Canvas SDK (mixed commands) | **WRONG** | The six intents are not one authorizable set. `Refer` signs; `Goal` and `Task` only commit and have nothing to transmit; the Rx cannot be signed at all; the screening order does not resolve to a command. One button over six different lifecycles. |
| 144 | `Tirzepatide is not in this set` | Canvas SDK:Prescribe | OK | |
| 145 | `the prescriber needs a Surescripts identifier on file, and a controlled substance needs them enrolled in EPCS` | Canvas SDK:Prescribe | OK | Accurate. See Open questions on whether the EPCS clause belongs next to tirzepatide. |
| 146 | `composed and written into the note on Orders, and signed in Canvas` | Canvas SDK:Prescribe (`originate`) | OK | Correct; the return leg is the gap, not the claim. |

### J. Commit act 3 — patient release
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 147 | Stepper states: complete / complete / current / pending | Aleron | OK | |
| 148 | `started 30 Aug`, `generated and hashed`, `pending`, `pending` | Aleron | OK | |
| 149 | `package REL-47M-0001` | Aleron | GAP | Package id must survive the note lock and be linked to the Canvas note. `UPSERT_NOTE_METADATA` is the cheap home. |
| 150 | `not yet released` | Aleron | OK | |
| 151 | Patient-safe doctor message body | Aleron | OK | Composed by the physician, released by Aleron. Never enters Canvas as a message unless `Communication` (create ✓) is used. |
| 152 | `Why it matters` prose × 4 actions | Aleron | OK | |
| 153 | Action 1 `2.5 mg` once a week | Derived | OK | From `Prescribe.sig`. |
| 154 | Action 1 `The pharmacy will call you` | Canvas SDK:Prescribe (`pharmacy`) | GAP | Asserts a transmission that has not happened and whose confirmation never returns to Aleron. `MedicationRequest` is read-only, so Aleron can read the request back but not its Surescripts delivery state. |
| 155 | Action 2 `Two supervised sessions a week for 12 weeks` | Canvas SDK:Goal | OK | Free text; see #41. |
| 156 | Action 3 `Twice a day, morning and evening, for 14 days` | Aleron | OK | |
| 157 | Action 4 `a colonoscopy every 10 years, or a stool test every year` | Aleron | OK | |
| 158 | `Provenance: Aleron action library v2.4.1` × 4 | Aleron | OK | |
| 159 | `scored against your packet of 24 Jun 2026` | Aleron | OK | |
| 160 | `sequenced with action 1` | Aleron | OK | |
| 161 | `gate with reclassification probability 65 %` | Derived | GAP | As #117. |
| 162 | `Preventive-care rule, USPSTF age threshold. Required channel, not ranked` | Aleron | OK | |
| 163 | `Evidence` labels × 4 (randomised high / randomised moderate / guideline high / guideline high) | Aleron | OK | Aleron evidence grading. |
| 164 | `Next step` × 4 | Aleron | OK | |
| 165 | `Repeat HbA1c and fasting insulin at 12 weeks` | Aleron | GAP | Draws a future lab. If it becomes a real order it is a Junction `POST /v3/order`, not a Canvas record: Canvas holds no order for Junction labs by design. |
| 166 | `Status: not_started` × 4 | Aleron | OK | Patient-app state, Aleron-owned. |
| 167 | Required-item names × 3 | Aleron | OK | |
| 168 | Required-item provenance smalls (`Genetics library obligation · Z15.09`, `Cascade documentation · Z15.09`, `Preventive-care rule · Z12.11`) | Aleron | OK | |
| 169 | `Referred 31 Aug 2026, appointment pending` | Canvas FHIR:ServiceRequest + Appointment (read) | GAP | The referral date is Aleron's, but "appointment pending" is a Canvas fact Aleron must poll for: `ServiceRequest` is read/search only and `Appointment` is readable. Nothing pushes it back. Until that read exists the phrase is a guess. |
| 170 | `Documented 31 Aug 2026, cascade pending` | Aleron | GAP | "Cascade pending" is an Aleron workflow state with no Canvas representation. |
| 171 | `Offered as a choice, no modality selected` | Aleron | OK | |
| 172 | `Patient sees` column × 3 | Aleron | OK | |
| 173 | `3 of 3 required items disposed` | Derived | OK | |
| 174 | `ATM heterozygous P/LP, named finding` / `Hidden` | Aleron | GAP | The hide decision is Aleron's; the finding is Canvas's. The policy pairing has no Canvas field. |
| 175 | Genetics visibility reason: `counselled first` | Aleron | GAP | Must survive the note lock and be auditable. Note metadata. |
| 176 | `Oral glucose tolerance test, 75 g` / `Excluded` | Aleron | GAP | |
| 177 | `Physician rejected, low value of information ... override reason is stored for audit` | Aleron | GAP | **The deferral/override reason the screen itself flags.** There is no FHIR field for it anywhere. `UPSERT_NOTE_METADATA` keyed by order id is the concrete answer; see Alternative pathways. |
| 178 | `Sleep apnea concern, SpO2 nadir 89 %` / `Hidden` | Junction + Aleron | UNVERIFIED | Value as #99; the hide decision is Aleron's. |
| 179 | `Action map coordinates and QALY derivation` / `Never patient-facing` | Aleron | GAP | As #117: it has no Canvas home either, so "never patient-facing" is currently also "never anywhere durable". |
| 180 | `Raw lab values, 27 fields` / `Hidden` | Derived | OK | Count over the Canvas Observations / lab report in the packet. |
| 181 | `5 items withheld, each with a stored reason` | Derived | GAP | Depends on #177's storage existing. |
| 182 | `Action library v2.4.1 · hash lib 3ce8 55f1 a904 7b2d` | Aleron | OK | |
| 183 | `PKT-47M-0001 · frozen 24 Jun 2026 · hash pkt 08bb 41d7 c26a 9f30` | Aleron | OK | |
| 184 | `Engine run RUN-47M-0003 · 29 Aug 2026` | Aleron | GAP | Must be linkable from the chart later. Note metadata. |
| 185 | `Action map state AMS-47M-0003` | Aleron | GAP | Same. |
| 186 | `Source plan PLAN-47M-0001 · signed 31 Aug 2026, 11:48` | Aleron | GAP | Same, and the timestamp must agree with the Canvas note's own signature time, which Aleron does not control. |
| 187 | `Dr. A. Okafor · NPI 1487520394` | Canvas FHIR:Practitioner (read) | OK | Also the field Junction's `physician.npi` needs on a lab order. |
| 188 | `signature SIG-47M-0001` | Aleron | GAP | An Aleron signature id, not a Canvas one. Two signature semantics in one lineage block with no stated relationship. |
| 189 | `Genetics policy: ATM heterozygous P/LP: counselled first, then released` | Aleron | GAP | As #175. |
| 190 | `Validation 6 checks passed, 0 failed` | Derived | OK | Aleron's own validator. |
| 191 | `Preview hash prev b6d4 2a17 e80c 5931` | Aleron | OK | |
| 192 | `Generated 31 Aug 2026, 11:52 · Dr. A. Okafor` | Aleron | OK | |
| 193 | `Covers` list (package, plan, run, map state, actor, message, actions, required, hidden, genetics policy) | Aleron | OK | |
| 194 | `Excludes: the release timestamp` | Aleron | OK | |
| 195 | `On release: the package hash is appended to the audit log and linked to the Canvas note id` | Canvas SDK:CREATE_NOTE (id) | GAP | Requires the note id from act 1, which as drawn produces a DocumentReference id instead. See #135. |
| 196 | `Done at 11:52` | Aleron | OK | |
| 197 | `Authorize release` disabled state | Aleron | OK | |
| 198 | `Release to patient` disabled state | Aleron | OK | |
| 199 | `Attesting binds your actor id to preview hash prev b6d4 ...` | Aleron | OK | |
| 200 | Canvas linkage: `Note — locked 31 Aug, 11:48` | Aleron | GAP | This is Aleron's lock time, not Canvas's signature time. |
| 201 | Canvas linkage: `Canvas note — links on release` | Canvas SDK:CREATE_NOTE / FHIR:DocumentReference | GAP | The id exists at note creation, not at release. The screen defers a link it already has, or does not have the one it thinks. |
| 202 | Canvas linkage: `Signing path — Aleron authorization, Canvas linkage` | Canvas SDK:SIGN_NOTE | GAP | Under-specified. `SIGN_NOTE` exists; the screen should name which act performs it. |
| 203 | `Role and Release Matrix v1 section 6 lists ten required parts` (the ten) | Aleron | OK | Aleron's own contract, correctly not claimed as a Canvas fact. |

### K. Blocked specimen (AL-44F)
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 204 | `Priya Raghunathan · AL-44F` | Aleron | OK | API-clean, but it is a third patient fixture the brief forbids. See Contradictions. |
| 205 | Blocked stepper: `started 28 Aug`, `not ready`, `pending`, `pending` | Aleron | OK | |
| 206 | `2 of 3 required items have no disposition` | Derived | GAP | Depends on #177's storage. |
| 207 | `2 visible recommendations carry no provenance` | Derived | OK | |
| 208 | `a draft override reason is present in the visible copy` | Aleron | OK | |
| 209 | `source_action_map_state_id` is `not emitted` | Aleron | OK | Value is honest; the raw field name on a product surface violates the brief's own rule. |
| 210 | The six release-validation conditions | Aleron | OK | |

### L. Footer
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 211 | `problems, dispositions and order intents come from the AL-47M action-map state` | Aleron | OK | |
| 212 | `every field records its own lineage, and a physician edit replaces the drafted value without erasing where the draft came from` | Aleron | GAP | Per-field draft-vs-edited provenance is asserted for the whole document but only surfaces on problem 2 (#51), and it has no storage anywhere. |

## Required changes

1. **The `Update existing` disposition has no API path.** Canvas FHIR `Condition` supports exactly one update: marking it `entered-in-error`. Rewire problem 3's disposition to the SDK `Assess` command (`condition_id`, `background`, `status`, `narrative`), which is built for exactly this: adding to an existing condition inside a note. Rows #65, #105, #114, #131. **Architectural** — it moves problem-list writes off FHIR and onto the note/command path.
2. **The diagnostic-certainty axis is not writable and one of its values does not exist.** `verificationStatus` is not writable through FHIR, and `monitoring` is not a Canvas value. Either drop the control and render certainty as read-only prose inside the assessment, or keep it as an Aleron-owned label stored in note metadata and stop implying it lands in the chart. Rows #22, #48, #64, #86, #113. **Field addition + copy fix.**
3. **Act 1 names the wrong Canvas object.** `DocumentReference` is an attached document with no update; it cannot host commands and it is not a signed note. Act 1 must be `CREATE_NOTE` → batch-originate the commands → `SIGN_NOTE`, with a DocumentReference optionally added afterwards as the PDF legal record. Row #135. **Architectural.**
4. **Act 2 authorizes six things with four different lifecycles.** Split the enumerated set by what it actually does: `Refer` signs (genetic counselling); `Goal` and `Task` commit with nothing to transmit; the Rx cannot be signed here at all; the screening order does not resolve to a command. The attestation should enumerate what will actually transmit. Row #143. **New integration work + copy fix.**
5. **The deferral / override reason has no field anywhere.** Store it as note metadata keyed by order id via `UPSERT_NOTE_METADATA`, written before `SIGN_NOTE` so it survives the lock, since note metadata is the only Aleron-owned fact that stays attached to the immutable note. Rows #177, #181, #206. **Field addition.**
6. **Dx associations on Task rows cannot be written.** `Task` has no diagnosis field. Either drop `Dx:` from Task rows, or fold the code into `comment` and stop presenting it as structured. Rows #60, #82. **Copy fix.**
7. **The rail's order-grammar claim is false.** "A physician-added order needs a diagnosis association before it can join the draft" is an Aleron rule, not a Canvas one, and the same screen says "Dx: not required for a Goal". Restate it as Aleron's rule or delete it. Rows #44, #123, and the matching annotation. **Copy fix.**
8. **QALY, reclassification probability and action-map coordinates have no Canvas home.** Observation create is restricted and has no update; Goal and CarePlan are read-only in FHIR. Decide now between `UPSERT_PATIENT_METADATA` (keeps Canvas as system of record, unqueryable) and Aleron storage (breaks it). Rows #117, #118, #119, #125, #161, #179. **Architectural.**
9. **Per-problem plans and the auto-drafted narrative both write to the same place.** `Plan` and `HistoryOfPresentIllness` each take one `narrative`. Four per-problem plans plus a three-paragraph narrative cannot both survive as drawn. Rows #30, #53, #54, #97. **Architectural.**
10. **Every command needs a Canvas practitioner id and Canvas has no just-in-time provisioning.** Nothing on this screen surfaces whether Dr. Okafor is provisioned. Add the precondition to act 1's gating list alongside the Entra step-up check. Rows #5, #13. **New integration.**
11. **`Refer` priority and diagnosis codes are drawn but unconfirmed.** Verify against `docs.canvasmedical.com/sdk/commands/` and drop whichever field does not exist. Rows #74, #77. **Copy fix or field removal.**
12. **"The pharmacy will call you" is patient-facing copy for a transmission that has not happened.** The Rx is staged, unsigned, and `MedicationRequest` is read-only so no delivery state returns. Reword to what is true at release time. Row #154. **Copy fix.**
13. **Canvas note id is available at note creation, not at release.** `Canvas note: links on release` defers a link act 1 already produced. Row #201. **Copy fix, once change 3 lands.**

## Alternative pathways

**#65, #105, #114, #131 — `Update existing` (WRONG).**
Use the Plugin SDK `Assess` command with the matched `condition_id`, originated into the same note as everything else and committed by `SIGN_NOTE`. This is a better fit than the FHIR update the screen implies: Canvas's model is that an existing entry is added to, never replaced, and `Assess` is that addition. Cost: nothing extra, the note path is already required by change 3. No redirect needed. If Aleron ever needs a genuine replacement of the condition code, there is no path at all and the only honest option is a redirect into the Canvas chart's problem list, which has no documented return leg.

**#22, #48, #64, #86, #113 — diagnostic certainty (WRONG).**
Three options, in order of preference. (a) Drop the control; render the certainty word as prose the physician writes into the assessment, where it reads identically to a clinician and costs nothing. (b) Keep the three-state control and store the value with `UPSERT_NOTE_METADATA` under a key like `aleron.problem.<index>.certainty`, accepting that it is invisible to any other Canvas surface and to any Canvas report. (c) Redirect: the physician sets verification status inside Canvas's own problem list. Where they land: the patient chart's conditions section. What they do: change the status on one condition. How they get back: they do not, without an undocumented deep link. (c) is not viable today.

**#60, #82 — `Dx:` on Task rows (WRONG).**
Nothing carries it. Either fold the code into `Task.comment` as free text (cheap, unqueryable, honest) or change the row's type: if the follow-up genuinely needs a diagnosis association, it is a `FollowUp` command (`coding`, `comment`, `requested_date`) rather than a `Task`. `FollowUp` is the closer fit for "review next cycle" anyway.

**#123 — the order-grammar claim (WRONG).**
Delete or restate. No API workaround is needed because the constraint is Aleron's own; the fix is to stop attributing it to Canvas.

**#135 — the note lock (WRONG).**
`CREATE_NOTE` → originate every command into it (`Diagnose`, `Assess`, `Plan`, `Goal`, `Task`, `Refer`, `Prescribe`) → `UPSERT_NOTE_METADATA` for the Aleron-owned facts → `SIGN_NOTE`. This resolves three things at once: it gives the problem-list decisions something to crystallize into, it makes "changes crystallize only when the note is signed" literally true rather than a design metaphor, and it produces the Canvas note id the release package needs. Keep `DocumentReference` create as the *additional* PDF legal record if the programme requires one, but it is not the lock. Cost: the whole commit sequence moves from a FHIR client to a Plugin SDK plugin running inside Canvas, which is a larger deployment surface than an outside API caller.

**#143 — one authorization over six intents (WRONG).**
Split by lifecycle rather than by screen region. `Refer` signs from Aleron. `Goal` and `Task` commit and have nothing to send. The Rx stages only. The screening order is not yet a command. The honest act-2 attestation enumerates the one referral that transmits and names the rest as committed-not-sent. For the Rx specifically, the redirect is the known path: the physician lands in the Canvas note where the staged `Prescribe` command is waiting, signs and sends it there, and **there is no documented return leg** — no deep link back to the Aleron care plan and no callback telling Aleron the signature happened. Aleron can only detect it afterwards by reading `MedicationRequest` (read-only) and polling. That polling loop is the concrete cost of the redirect and it is not drawn anywhere on this screen.

**#177, #181, #206 — deferral and override reasons (GAP that would otherwise be NONE).**
Store the reason as note metadata keyed by order id (`aleron.order.<id>.deferral_reason`) via `UPSERT_NOTE_METADATA`, written before `SIGN_NOTE`, because FHIR has no field for it anywhere and it must survive the note lock to be auditable. This is cheaper and better-scoped than a Custom Data Model: the reason belongs to one note and one order, it is never queried across patients, and metadata keeps Canvas as the system of record. The same key shape covers #73/#80/#94 (`required`), #51/#112 (edited-vs-drafted) and #175/#189 (genetics display policy).

**#117, #118, #119, #125, #161, #179 — QALY and reclassification figures (GAP).**
Canvas has three near-misses and no fit. `Observation` create exists but is restricted in practice to vitals and panel shapes and has no update, so a re-scored QALY would append a second Observation forever. `Goal` and `CarePlan` are read-only in FHIR. `CREATE_OBSERVATION` / `UPDATE_OBSERVATION` in the SDK do have an update, which is the only path that survives re-scoring — worth verifying whether the SDK effect accepts a non-vital category, because if it does this is the answer. Otherwise `UPSERT_PATIENT_METADATA` holds the current score per patient and `UPSERT_NOTE_METADATA` holds the score as of a signed note, which is what an audit actually needs. Aleron storing them itself is the fallback and it breaks "Canvas is the system of record" for exactly the numbers that drive every recommendation on this screen.

**#149, #184, #185, #186, #188, #195, #201 — package, run, plan and signature ids (GAP).**
All are Aleron-owned facts that must be findable from the chart later. One `UPSERT_NOTE_METADATA` call carrying the whole lineage block, keyed on the note the ids describe. Do not split them across patient and note metadata: the lineage is only meaningful as a set.

**#169 — `appointment pending` on the genetic counselling referral (GAP).**
`Refer` sends the referral and nothing returns to Aleron. Read it back: `ServiceRequest` is read/search only and `Appointment` is readable and searchable, so Aleron can poll for a scheduled appointment against that patient. Until the poll exists, replace "appointment pending" with what Aleron actually knows: "referred 31 Aug 2026; scheduling happens outside Aleron."

**#154 — `The pharmacy will call you` (GAP).**
No transmission has occurred at release time and none is confirmable. `MedicationRequest` read-only lets Aleron see the request exists but not its Surescripts state. Reword the patient copy to describe the prescription being sent, not having been sent, or hold action 1 out of the release package until the Rx read-back shows a signed request.

**#7 — `Open in Canvas ↗` (GAP).**
Canvas embedding Aleron is documented; the reverse is not. If the redirect is load-bearing for the Rx signature (it is, per #143), the return leg is the single most important undrawn thing on this screen. The nearest workable inversion is to stop redirecting out: run the whole commit sequence as a Canvas plugin with `SHOW_ACTION_BUTTON` + `LaunchModalEffect`, so Aleron is the modal inside Canvas and the physician never leaves. That is a different product shape than this wireframe draws.

## Contradictions with what the screen already claims

1. The screen asserts a constraint that does not exist. Annotation: *"ICD codes on every problem and a dx association on every order. Canvas's order grammar requires a diagnosis, so an order with no problem is not a thing that can exist."* False for `Goal` and `Task`, and the screen contradicts itself twelve lines earlier in its own markup: *"Dx: not required for a Goal."*

2. The screen understates one command and overstates another. Annotation: *"Prescribe has no COMMIT action at all: its actions are sign, sign and send, print and make changes while the command is in review, and send once it is committed."* The verified command matrix lists `commit` as available on `Prescribe`. What is true is the trap the ground truth records: `originate(commit=True)` is silently ignored for order commands, so a caller gets a staged command with no error. That is a different fact from "there is no commit action", and the annotation's own hedge ("two readings of the same page disagreed") should be resolved before it ships as a design rationale.

3. The screen's `Goal` correction is right and its `Condition` reasoning is not. Annotation: *"A Goal is not an API write ... `Goal` is read and search only in the Canvas FHIR API and is created by the Goals command."* Correct. But the same discipline was never applied to `Condition`: the screen still draws *"will update existing problem"* and counts *"1 update existing"* twice, and Condition's only supported update is marking it entered-in-error.

4. The screen asserts the prescription carve-out is not a design choice, and it is right about that but for one wrong reason. Annotation: *"the command has no sign method available from outside."* True. The accompanying claim that a prescription *"can be staged into a note from outside"* is also true and is the design option worth taking, per the screen's own `new` note. Nothing in the audit contradicts either; flagging it only because the two notes read as if they disagree.

5. Stale annotations describe a screen that no longer exists. Three notes reference *"the onset date"*, *".ap-flabel"* and *"Screening is a seventh rail item"*; the file has no onset field, no `.ap-flabel`, and six rail items. The onset one matters for this audit: `Diagnose.approximate_date_of_onset` exists and is exactly the field a problem-list decision should carry, and the screen dropped the control that would populate it. That is a capability the API supports and the screen no longer uses.

6. The blocked specimen invents a third patient. `Priya Raghunathan · AL-44F` is not one of the two ratified fixtures, and the brief says do not invent a third.

7. The screen puts a raw API-style field name on the product surface: `source_action_map_state_id` renders inside a physician-facing failure list, which the brief's own `api-on-product-surface` rule forbids. It is Aleron's field, not Canvas's, but the rule is about what a physician reads, not about whose API it is.

## Open questions for the humans

1. **Does the whole commit sequence become a Canvas plugin?** Every write this screen needs — note, note lock, problem-list decisions, goals, tasks, referral, staged prescription, and the metadata that carries deferral reasons and QALYs — is on the Plugin SDK, not FHIR. If yes, the "Open in Canvas" redirect and its missing return leg largely disappear because Aleron runs inside Canvas. If no, act 1 cannot work as drawn. This is one decision and it determines eight rows above.

2. **Which hash and which signature are authoritative?** The lineage block carries `SIG-47M-0001` (Aleron), a note hash, and a preview hash, and act 3 also links a Canvas note. Canvas's own `SIGN_NOTE` produces its own signature semantics at its own timestamp. If a regulator asks when this plan was signed, which record answers, and what happens when the two timestamps differ?

3. **Do QALY figures need to be queryable, or only auditable?** Auditable is note metadata and costs nothing. Queryable across a panel means either an SDK Observation (if it accepts a non-vital category, which needs one doc check) or Aleron storage, which breaks the system-of-record premise.

4. **Should the EPCS clause sit next to tirzepatide at all?** Tirzepatide is not a controlled substance. The copy is a correct conditional, but placing it in the paragraph that names tirzepatide invites the reading that it applies to this drug.

5. **Is "certainty" a clinical axis the physician sets, or a display of what the chart already holds?** If it is a control, it needs a home Canvas will not give it. If it is a display, problem 3 reads it from the existing condition and problems 1, 2 and 4 have nothing to read.

6. **What happens to a note-only problem's assessment text?** Four per-problem assessments plus a three-paragraph narrative that restates all of them, writing into commands that take one narrative each. Which one is the record?
