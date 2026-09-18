# v2/orders.html

**Screen purpose:** One surface for authorizing every order type, tracking what came back and signing it, plus the forward screening schedule as the same act placed in future time.
**Data points audited:** 180 — OK 105, GAP 46, WRONG 14, UNVERIFIED 11, NONE 4

Route abbreviations used below: `LO` = the authorize card, `LG` = the orders ledger, `SC` = the screening half.

## Data points

### Rail and header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 1 | `Ethan Park` | Canvas FHIR:Patient (read) | OK | `Patient.name` |
| 2 | `AL-47M` program id | Canvas SDK:CREATE_PATIENT_EXTERNAL_IDENTIFIER (write) → Canvas FHIR:Patient.identifier (read) | GAP | Aleron's own id, not a Canvas id. Nothing writes it today; without the external-identifier effect at enrollment, every Aleron→Canvas lookup is by name/DOB. |
| 3 | `47M` | Derived — Patient.birthDate + Patient.gender | OK | |
| 4 | `EP` avatar initials | Derived — Patient.name | OK | |
| 5 | `Dr. A. Okafor` (rail actor) | Aleron (Entra session) | OK | Display only. The Canvas practitioner linkage is a separate fact, see #38. |
| 6 | `7 orders on this chart` | Derived — Junction orders ∪ Canvas ServiceRequest ∪ staged Prescribe commands | GAP | No single collection holds all seven. Three feeds must be unioned and de-duplicated by Aleron before this number can be printed. |
| 7 | `1 unsigned result` | Derived — Junction results minus Aleron/LabReview signature records | GAP | Depends on #23 existing at all. |
| 8 | `1 waiting on your signature in Canvas` | Derived — Canvas FHIR:MedicationRequest (search) vs staged commands | GAP | Requires polling; a staged, uncommitted Prescribe is not a MedicationRequest, so the "waiting" set is Aleron's own memory until it flips. |
| 9 | `9 screening protocols` | Aleron | GAP | No governed schedule source exists; the screen says so itself. |
| 10 | `As of 31 Aug 2026` | Aleron clock | OK | |

### Identity gate

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 11 | `2fa.recent` | Aleron (Entra) | GAP | Not a standard Entra claim. This is an Azure AD Conditional Access **authentication context** id that has to be created in the tenant and demanded with `acr_values`; the portal then reads `acrs`. Configuration work, not a field. |
| 12 | `423` | Aleron API | OK | Aleron's own status choice. |

### Authorize a new order — route strip (five states)

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 13 | Placed through: `Junction` (blood) | Junction:`POST /v3/order` | OK | |
| 14 | Placed through: `Junction` (genetic) | Junction:`order_set.lab_test_ids[]` | UNVERIFIED | Junction is labs-only, confirmed. Whether a 160-gene germline panel exists as a Junction `lab_test_id` in this team's catalog is not established. |
| 15 | Placed through: `Canvas` (imaging) | Canvas SDK:ImagingOrder | OK | `originate()` then `sign()`. |
| 16 | Placed through: `Canvas` (referral) | Canvas SDK:Refer | OK | |
| 17 | Placed through: `Canvas, written unsigned` (rx) | Canvas SDK:Prescribe `originate()` | OK | Do **not** pass `commit=True`; it is silently ignored on order commands. |
| 18 | Comes back as: values with units, reference ranges and abnormal flags, copy filed to chart | Junction:`BiomarkerResult.value/unit/min_range_value/max_range_value/is_above_max_range/interpretation` → Canvas SDK:CREATE_LAB_REPORT + ATTACH_LAB_REPORT_RESULTS | OK | The claim is sound. The screen never renders any of it, see #120. |
| 19 | Comes back as: `A panel report ... routed to the required channel if a pathogenic variant is found` (genetic) | Junction:`BiomarkerResult` | WRONG | `BiomarkerResult` is a numeric-with-range shape. A germline P/LP variant call has no representation in it. Junction returns the lab's PDF; the structured variant does not come back. |
| 20 | Comes back as: radiologist's report in the chart | Canvas FHIR:DiagnosticReport (read) / DocumentReference (read) | OK | Readable, contrary to the screen's "nothing returns to this screen" — that is a product choice, not a limit. |
| 21 | Comes back as: consulting clinician's note in the chart | Canvas FHIR:DocumentReference (read) | OK | Linking it to the referral is the problem, see #113. |
| 22 | Comes back as: pharmacy fill, in the chart | Canvas FHIR:MedicationDispense (read) | OK | Readable but not drawn anywhere. |
| 23 | Ends with: `Your signature on the returned result` | Canvas SDK:LabReview (`originate` + `commit`) | GAP | A result signature has no FHIR resource. `LabReview` is the right carrier (report_ids, comment) but needs a note, and `sign` is `✗` on it, so the durable signature is the note signature via `SIGN_NOTE`. Two-step, undrawn. |
| 24 | Ends with: `Your signature here, which is also what sends it` (imaging) | Canvas SDK:ImagingOrder `sign()` + `send()` | GAP | Two separate operations, not one. Copy implies one atomic act. |
| 25 | Ends with: same string (referral) | Canvas SDK:Refer | WRONG | `Refer` has `sign` ✓ but **`send` ✗**. Aleron can sign a referral and cannot transmit it. What happens next is a Canvas-side workflow Aleron has no handle on. |
| 26 | Ends with: `Your signature, given in Canvas` (rx) | Canvas SDK:Prescribe (originate only) | OK | Correct, and the only honest one of the five. |
| 27 | Act label `Authorize order` / `Sign and send` / `Stage in the chart` | Derived from type | GAP | `Sign and send` is wrong for referral (#25) and is two calls for imaging (#24). |
| 28 | rx hazard: `Open the chart and come back; the plan holds its place` | Canvas | NONE | No documented deep link into a specific Canvas note or command from outside, and no documented return. See Alternative pathways. |

### Authorize a new order — blood test menu

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 29 | Twelve test display names | Junction lab-test catalog | UNVERIFIED | The order contract is verified; a catalog-listing endpoint is not in the ground truth. Confirm against docs.junction.com Lab Testing → tests listing. |
| 30 | `(Quest)` on every entry | Junction | UNVERIFIED | `lab_test` exposes `name`, `description`, `method`. Whether the performing lab is exposed per test, or is a property of `lab_account_id`, is unconfirmed. If the latter, twelve repetitions of `(Quest)` are noise. |
| 31 | `12-week repeat against 6.0 %` (HbA1c) | Derived — prior result value + Aleron cadence rule | GAP | Requires a catalog-entry → LOINC → latest-result join that nothing on this path provides. `BiomarkerResult.loinc` is the hinge; the Junction catalog entry must carry the same code. |
| 32 | `12-week repeat against 16 µIU/mL` (insulin) | Derived | GAP | Same join. |
| 33 | `Measured once at 25 nmol/L. Genetically set, no repeat indicated.` | Derived + Aleron clinical rule | GAP | Value is sourceable; the "no repeat indicated" assertion is an Aleron-owned per-test rule with nowhere to live yet. |
| 34 | `2` selected | Aleron UI state | OK | |
| 35 | `16` entries in the blood catalog | Junction catalog | UNVERIFIED | Same as #29. |
| 36 | `14` orderable in this environment | Derived — catalog ∩ Aleron config | OK | |
| 37 | `p-tau217 and Neurofilament Light have no test id configured here` | Derived | OK | Good pattern: names the gap rather than hiding the rows. |

### Authorize a new order — ordering physician

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 38 | `Dr. A. Okafor` on the order | Junction:`physician.first_name`/`last_name`; Canvas SDK:`ordering_provider_key` | OK | Canvas needs a practitioner key that exists; there is **no just-in-time provisioning**, so an Aleron user with no pre-created Canvas user cannot originate any command. |
| 39 | `NPI 1487520394` | Canvas FHIR:Practitioner.identifier (read) → Junction:`physician.npi` | OK | |
| 40 | `licensed in CA, NY, TX` | Junction:`physician.licensed_states` | NONE | That field is **write-only input on the order**. Junction is not a source of truth for it and Canvas FHIR `Practitioner.qualification` is not populated with state licensure in any documented way. Nothing can be read to render this line. |
| 41 | Implied check "patient's state must be one you are licensed in" | Derived — Patient.address.state + licence roster | GAP | Depends entirely on #40 having a home. |

### Authorize a new order — type-specific fields

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 42 | Collection method options (four) | Junction:`collection_method` enum | OK | Exactly matches `testkit \| walk_in_test \| at_home_phlebotomy \| on_site_collection`. |
| 43 | `At-home phlebotomy` selected | Junction | OK | |
| 44 | Genetic panel list (five) | Junction:`lab_test_ids` | UNVERIFIED | Same catalog question as #14. |
| 45 | `Invitae 160-Gene Panel` selected | Junction | UNVERIFIED | |
| 46 | Counseling attestation checked/unchecked | Junction:`consents[]` + Canvas SDK:UPSERT_NOTE_METADATA | GAP | `consents[]` carries it to the lab; it does not make it durable in Canvas. Both are needed, neither is drawn. |
| 47 | Imaging study list (five) | Canvas SDK:ImagingOrder `image_code` | GAP | The command takes a code, not a label. Nothing on this screen or in the ground truth provides an imaging-code lookup, so the five options are a hardcoded map Aleron must maintain. |
| 48 | `MRI abdomen, without contrast` selected | Canvas SDK:ImagingOrder `image_code` | GAP | Same. |
| 49 | Clinical indication textarea | Canvas SDK:ImagingOrder `additional_details` / `comment` | OK | |
| 50 | **(absent)** imaging diagnosis code | Canvas SDK:ImagingOrder `diagnosis_codes` | GAP | Real field, no control on the form. The screen's own annotation dismisses the diagnosis-code gap as "filed against the wrong system" — true for the Junction lab path, false for this one. |
| 51 | Referral specialty list (five) | Canvas SDK:Refer `specialty` | UNVERIFIED | Whether `specialty` is a free string or a closed Canvas vocabulary is not established; `referral_type` is a separate required-looking field with no control. |
| 52 | `Genetic counselling` selected | Canvas SDK:Refer `specialty` | UNVERIFIED | |
| 53 | Reason for referral textarea | Canvas SDK:Refer `comment` | OK | |
| 54 | **(absent)** referral service provider | Canvas SDK:Refer `service_provider` | GAP | Refer takes a service provider; the form picks a specialty and stops. The SDK has a Service Providers effect group to search from. |
| 55 | Medication `tirzepatide 2.5 mg/0.5 mL, subcutaneous auto-injector` in a free-text input | Canvas SDK:Prescribe `fdb_code` | WRONG | Prescribe takes an FDB code (or compound id). A free-text medication field cannot produce one. Needs an FDB search control. |
| 56 | Sig text | Canvas SDK:Prescribe `sig` | OK | |
| 57 | Quantity `4 pens` in one free-text input | Canvas SDK:Prescribe `quantity_to_dispense` + `type_to_dispense` | WRONG | Two fields, one numeric and one coded form. `4 pens` is neither. |
| 58 | Refills `0` | Canvas SDK:Prescribe `refills` | OK | |
| 59 | Pharmacy `Walgreens, 2400 W Alabama St, Houston TX` in a free-text input | Canvas SDK:Prescribe `pharmacy` | WRONG | Pharmacy is a directory reference (Surescripts/NCPDP), not an address string. `CREATE_PATIENT_PREFERRED_PHARMACIES` exists on the SDK side. |
| 60 | **(absent)** `days_supply`, `icd10_codes`, `prescriber_id` | Canvas SDK:Prescribe | GAP | Three real fields with no control. `prescriber_id` is the one that decides whether the staged Rx is attributable at all. |
| 61 | Receiver name `Ethan Park` | Junction:`patient_address.receiver_name` ← Canvas FHIR:Patient | OK | |
| 62 | Street `1408 Waugh Drive, Apt 6` | Junction:`patient_address.first_line` / `second_line` | GAP | One input for two fields; the apartment belongs in `second_line`. Junction validates the shape, so the split has to happen before the call. |
| 63 | City `Houston` | Junction:`patient_address.city` | OK | |
| 64 | State `TX` | Junction:`patient_address.state` | OK | |
| 65 | ZIP `77019` | Junction:`patient_address.zip` | OK | Matches `^\d{5}(-\d{4})?$`. |
| 66 | Country `US` | Junction:`patient_address.country` | OK | |
| 67 | **(absent)** `patient_details` block | Junction:`patient_details` (first_name, last_name, dob, gender, phone_number, email — all required) | GAP | The order will not create without these six. All six are readable from Canvas FHIR:Patient, but nothing on the screen tells the physician whether they are present, so a missing email fails at submit with no forewarning. |
| 68 | Note textarea, ~101 characters | Junction:`clinical_notes` (max 120) | GAP | No `maxlength` on the control and no counter. The screen's own annotation flags the 120-char cap against the *indication*; the field that actually hits it is this one. |
| 69 | Authorize button disabled state | Aleron | OK | |
| 70 | `2 tests, at-home phlebotomy, under SO-BLOOD-2026-01` | Derived | OK | |
| 71 | `SO-BLOOD-2026-01` / `SO-GEN-2026-02` | Aleron → Junction:`passthrough` | GAP | Aleron-owned. `passthrough` is the field that carries it to Junction and back on every event, which is the cheap answer; nothing states this today. |

### Orders ledger

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 72 | Order numbers `4471`–`4523` | Aleron | GAP | One monotonic sequence spanning Junction orders, Canvas commands and staged prescriptions. That means Aleron keeps its own order ledger keyed to three foreign ids. This is the largest unstated architectural commitment on the screen. |
| 73 | Row 1 type `Prescription` | Derived | OK | |
| 74 | Row 1 `tirzepatide 2.5 mg/0.5 mL, 4 pens, no refills` | Aleron echo of what it staged | GAP | A staged, uncommitted Prescribe command is not a `MedicationRequest`, so FHIR cannot read it back. Aleron must store what it sent, or re-read the command through CommandAPI. |
| 75 | Row 1 route `· Canvas` | Derived | OK | |
| 76 | Row 1 Placed `31 Aug 2026` | Aleron (own call timestamp) | OK | |
| 77 | Row 1 Status `written to the chart, unsigned` | Derived | GAP | Nothing tells Aleron when it stops being true. Polling `MedicationRequest` search per patient is the only outside-in signal; `PRESCRIBE_COMMAND__POST_COMMIT` needs a plugin inside Canvas. |
| 78 | Row 1 Results `no result to return` | Derived | OK | |
| 79 | Row 1 Review `waiting on you, in Canvas` | Derived | GAP | Same detection problem as #77. |
| 80 | Row 1 `Open the chart to sign ↗` | Canvas | NONE | No documented deep link to a note or command from outside Canvas. The link can only land the physician on a chart, at best. |
| 81 | Row 2 `Imaging order 4522` | Aleron | OK | |
| 82 | Row 2 `MRI abdomen, without contrast · Canvas` | Canvas FHIR:ServiceRequest (read) | OK | Readable once the command is committed and signed. |
| 83 | Row 2 Placed `28 Aug 2026` | Canvas FHIR:ServiceRequest.authoredOn | OK | |
| 84 | Row 2 Status `signed and sent 28 Aug` | Canvas SDK:ImagingOrder `sign()` + `send()` | UNVERIFIED | Both operations exist. Whether `send()` returns anything that constitutes a transmission receipt, and what "sent" means for a study the practice faxes, is not documented. |
| 85 | Row 2 Results `Report returns to the chart` | Static assertion | OK | |
| 86 | Row 2 Review `nothing to sign` | Derived | OK | |
| 87 | Row 3 `Blood order 4520` | Aleron | OK | |
| 88 | Row 3 `Liver Function Panel / LFTs, Creatine Kinase` | Junction:`lab_test.name` | OK | |
| 89 | Row 3 `walk-in / PSC` | Junction:`collection_method` = `walk_in_test` | OK | |
| 90 | Row 3 `SO-BLOOD-2026-01` | Aleron | OK | |
| 91 | Row 3 `· Junction` | Derived | OK | |
| 92 | Row 3 Placed `26 Aug 2026` | Junction:`order.created_at` | OK | |
| 93 | Row 3 Status `resulted` | Junction:`order.status` | GAP | Junction's vocabulary is `received \| collecting_sample \| sample_with_lab \| completed \| cancelled \| failed`. The screen shows five different words across seven rows. A mapping table is required and no row is `cancelled` or `failed`, so two real states are undesigned. |
| 94 | Row 3 Results `Available 30 Aug` | Junction webhook receipt time | GAP | `BiomarkerResult.timestamp` is the specimen/result time, not availability. Aleron must record when `labtest.order.updated` arrived. |
| 95 | Row 3 Review `unsigned` | Aleron / Canvas SDK:LabReview | GAP | Depends on #23. |
| 96 | Row 4 `Blood order 4521` · `Hemoglobin A1c, Fasting Insulin` · `at-home phlebotomy` · `SO-BLOOD-2026-01` · `Junction` | Junction | OK | |
| 97 | Row 4 Placed `30 Aug 2026` | Junction:`order.created_at` | OK | |
| 98 | Row 4 Status `collection scheduled, 4 Sep` | Junction lab-test appointment | GAP | Not `order.status` — there is no such value. The date comes from a separate appointment object surfaced by `labtest.appointment.created`/`updated`. A second fetch and a second webhook nothing on this screen accounts for. |
| 99 | Row 4 Results `pending` | Derived | OK | |
| 100 | Row 4 Review `nothing to sign` | Derived | OK | |
| 101 | Row 5 `Genetic order 4472` · `Invitae 160-Gene Panel` · `test kit` · `SO-GEN-2026-02` · `Junction` | Junction | UNVERIFIED | Catalog question, #14. |
| 102 | Row 5 `counseling attested 6 Jun` | Aleron / Junction:`consents[]` | GAP | The attestation date must survive a note lock and be provable years later. Note metadata keyed by order id is the cheap durable home; `consents[]` alone lives at the vendor. |
| 103 | Row 5 Placed `8 Jun 2026` | Junction:`order.created_at` | OK | |
| 104 | Row 5 Status `resulted` | Junction:`order.status` = `completed` | GAP | Mapping, #93. |
| 105 | Row 5 Results `Available 23 Jun` | Aleron receipt time | GAP | #94. |
| 106 | Row 5 Review `Signed 24 Jun` | Aleron / Canvas SDK:LabReview | GAP | #23. |
| 107 | Row 5 signer `Dr. A. Okafor` | Aleron | OK | |
| 108 | Row 5 `ATM heterozygous P/LP` | — | NONE | A germline variant call is not a `BiomarkerResult` and not a Canvas FHIR resource Aleron can write. Nothing in the verified surface produces this string from data. |
| 109 | Row 5 `routed to the required channel` | Aleron | OK | Aleron's own routing, once #108 is solved. |
| 110 | Row 6 `Referral 4473` · `Genetic counselling · Canvas` | Canvas FHIR:ServiceRequest (read) | OK | |
| 111 | Row 6 Placed `24 Jun 2026` | Canvas FHIR:ServiceRequest.authoredOn | OK | |
| 112 | Row 6 Status `signed and sent 24 Jun` | Canvas SDK:Refer | WRONG | `Refer` publishes no `send()`. Aleron signed it; it did not send it and cannot know that it was sent. |
| 113 | Row 6 Results `Consult note 14 Jul, in the chart` | Canvas FHIR:DocumentReference (search) | GAP | Readable, but nothing keys the note to referral 4473. There is no `basedOn` from an SDK-created Refer to a returned document, so the association is a date-and-specialty guess. |
| 114 | Row 6 Review `nothing to sign` | Derived | OK | |
| 115 | Row 7 `Blood order 4471` · eight test names · `walk-in / PSC` · `SO-BLOOD-2026-01` · `Junction` | Junction | OK | |
| 116 | Row 7 Placed `8 Jun 2026` | Junction:`order.created_at` | OK | |
| 117 | Row 7 `resulted` / `Available 22 Jun` | Junction / Aleron | GAP | #93, #94. |
| 118 | Row 7 `Signed 22 Jun` · `Dr. A. Okafor` | Aleron / Canvas SDK:LabReview | GAP | #23. |
| 119 | Row 7 `8 of 8 tests returned` | Derived | GAP | Junction returns biomarkers, not tests. A Lipid Panel is one ordered test and four-plus `BiomarkerResult` rows. Producing "8 of 8" needs a biomarker→ordered-test-id rollup that `source_markers` may or may not support. |

### Sign-in-row flow

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 120 | `ALT 46 U/L, AST 31 U/L, CK 148 U/L` inside the note textarea | Junction:`BiomarkerResult.value` + `.unit` | WRONG | Sourceable as data, wrong as a shape. These are the only result values anywhere on the screen and they appear as prose the physician supposedly typed. The route strip promises values "on this screen, with units, reference ranges and abnormal flags" and no such display exists. |
| 121 | `All within range for baseline` | Derived — `min_range_value` / `max_range_value` / `is_above_max_range` | WRONG | Same: the abnormal determination the API returns is being retyped by hand. |
| 122 | Sign button disabled state | Aleron | OK | |
| 123 | `appends the act to the audit log` | Aleron | OK | |

### Disclosure — "What authorizing an order actually does"

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 124 | `Junction carries no imaging, no radiology and no referrals` | Junction | OK | Confirmed. |
| 125 | `Imaging and referrals: signed on this screen and held in Canvas` | Canvas SDK | OK | True for imaging; for referral see #112 on "and sent". |
| 126 | `Prescriptions written into the chart unsigned` | Canvas SDK:Prescribe | OK | |
| 127 | `An order for a test with no configured id is refused, fail closed` | Aleron | OK | |
| 128 | `The mobile standing-order rail does not enforce it yet` | Aleron | OK | |
| 129 | `order state is logistics visible, results hidden until release` | Aleron | OK | |
| 130 | `Aleron MD Role and Release Matrix v1` | Aleron | OK | |

### Screening — counts

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 131 | `Nine protocols · three overdue` | Aleron | GAP | No governed source, stated on the screen. |
| 132 | `3 overdue` | Derived | OK | |
| 133 | `1 within 90 days` | Derived | OK | |
| 134 | `3 scheduled` | Derived | OK | |
| 135 | `2 one-time protocols` | Derived | OK | 3+1+3+2 = 9, consistent with #131. |

### Screening — protocol rows

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 136 | HbA1c: `Prediabetes phenotype` · `Annual` | Aleron | GAP | Cadence and basis are Aleron's, with no artifact behind them yet. |
| 137 | HbA1c Last `Aug 2024` | Junction:`BiomarkerResult.timestamp` / Canvas FHIR:Observation | GAP | Sourceable in principle; contradicted in fact, see #147. |
| 138 | HbA1c Next `Aug 2025` + `overdue` tile | Derived | WRONG | Order 4471 (8 Jun 2026, resulted 22 Jun) included HbA1c, and order 4521 is an HbA1c placed 30 Aug 2026. HbA1c cannot be overdue since Aug 2025 on a screen whose own ledger shows it resulted ten weeks ago. |
| 139 | CAC: `PREVENT intermediate risk` · `Once, risk refinement` | Aleron | OK | |
| 140 | CAC `scored on the action map at 25 % reclassification odds` | Aleron SPAR engine | OK | |
| 141 | CAC Last `never` | Canvas FHIR:Procedure / DiagnosticReport (absence) | GAP | Absence of a resource in Canvas is not absence of the study. Rendering `never` asserts more than a read can support; `no record in this chart` is what is true. |
| 142 | CAC Next `Aug 2026` + `overdue` | Derived | OK | |
| 143 | PHQ-2: `USPSTF B` · `Annual` | Aleron | OK | |
| 144 | PHQ-2 Last `Jun 2025` | Canvas FHIR:QuestionnaireResponse (read) | OK | |
| 145 | PHQ-2 Next `Jun 2026` + `overdue` | Derived | OK | |
| 146 | Lipid panel: `Risk management` · `Annual` | Aleron | OK | |
| 147 | Lipid Last `Nov 2025` | Junction:`BiomarkerResult.timestamp` | WRONG | Order 4471 in the ledger above included a Lipid Panel, placed 8 Jun 2026, available 22 Jun 2026. Last cannot be Nov 2025. The two halves of the screen are fed by the same results feed and disagree. |
| 148 | Lipid Next `Nov 2026` + `in 75 days` | Derived | WRONG | Follows from #147; the real next date is Jun 2027 and the row does not belong in Due soon. |
| 149 | BP: `USPSTF A` · `Annual` | Aleron | OK | |
| 150 | BP `a clinic reading of 142/90 mmHg is on file and unconfirmed` | Canvas FHIR:Observation (vitals) | OK | Vitals are the one Observation category that reliably reads and writes. |
| 151 | BP Last `Jan 2026` | Canvas FHIR:Observation | OK | |
| 152 | BP Next `Jan 2027` | Derived | OK | |
| 153 | Sleep apnea: `Wearable phenotype` · `Every 2 years` | Aleron + Junction devices | OK | |
| 154 | Sleep apnea `the action map prices the home test separately at 35 % reclassification odds` | Aleron SPAR engine | OK | |
| 155 | Sleep apnea Last `Mar 2025` | — | UNVERIFIED | No resource named. A home sleep test is neither a Junction lab test nor a Canvas vitals Observation; it is a DiagnosticReport if it was ever imported. Nothing establishes it was. |
| 156 | Sleep apnea Next `Mar 2027` | Derived | OK | |
| 157 | Colonoscopy: `USPSTF A` · `Every 10 years` | Aleron | OK | |
| 158 | Colonoscopy Last `Apr 2021` | Canvas FHIR:Procedure (read) | GAP | Five years before enrollment. Procedure is read-only in FHIR, so a historical colonoscopy has to arrive by CCDA import or be entered in the Canvas UI; Aleron cannot put it there. |
| 159 | Colonoscopy Next `Apr 2031` | Derived | OK | |
| 160 | Hepatitis C: `USPSTF B` · `Once` | Aleron | OK | |
| 161 | Hepatitis C Last `May 2023` | Canvas FHIR:DiagnosticReport / Observation (read) | GAP | #158. |
| 162 | Hepatitis C Next `not scheduled` | Derived | OK | |
| 163 | HIV: `USPSTF A` · `Once` | Aleron | OK | |
| 164 | HIV Last `May 2023` | Canvas FHIR:DiagnosticReport / Observation (read) | GAP | #158. |
| 165 | HIV Next `not scheduled` | Derived | OK | |

### Screening — timeline

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 166 | Year `2026` | Aleron | OK | |
| 167 | `today` marker at 66.58 % | Derived | OK | Day 243 of 2026 = 31 Aug, consistent with #10. |
| 168 | HbA1c dot, hazard, pinned to today, `Aug 2025` | Derived | WRONG | Inherits #138. |
| 169 | CAC dot 62.19 %, `Aug 2026` | Derived | OK | Mid-Aug, correct. |
| 170 | PHQ-2 dot 45.48 %, `Jun 2026` | Derived | OK | |
| 171 | Lipid dot 87.12 %, forward, `Nov 2026` | Derived | WRONG | Inherits #147. |
| 172 | `2027` (BP, sleep apnea) · `2031` (colonoscopy) | Derived | OK | |
| 173 | `done 2023` (HCV, HIV) | Derived | OK | |
| 174 | `Five of the nine have nothing scheduled inside this year` | Derived | OK | Verified: BP, sleep apnea, colonoscopy, HCV, HIV. |
| 175 | Dot tooltips (`Overdue since Aug 2025. Pinned to today.` etc.) | Derived | OK | |

### Screening — disclosure

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 176 | Status rule: overdue / 90 days / upcoming / completed | Aleron | OK | |
| 177 | `Prototype schedule ... placeholders pending the governed screening-schedule artifact` | Aleron | OK | Honest and correct. |
| 178 | `ordered from Care Plan, which is the one place an order is authorised` | Aleron | WRONG | This screen carries the Authorize control. The sentence was true when Screening was its own file and survived the merge. |
| 179 | `The ATM heterozygous P/LP finding routes to the genetic must-do pipeline, not here` | Aleron | OK | |
| 180 | `Coronary artery calcium and the sleep apnea screen appear in both places` | Aleron | OK | |

## Required changes

1. **The route strip promises result values the screen never shows.** #18 vs #120/#121. The only ALT/AST/CK values on the surface are inside a note textarea as prose. Add a result display to the expanded row: name, value, unit, reference range, abnormal flag, all of which `BiomarkerResult` returns. *Architectural for the row, but the data is already in hand.*
2. **`Refer` has no `send()`.** #25, #112. Change "signed and sent 24 Jun" to "signed 24 Jun" and the referral act label from "Sign and send" to "Sign". Say in the route strip that transmission is the practice's, in Canvas. *Copy fix, two strings and one route entry.*
3. **Imaging "sign is also what sends it" is two calls.** #24, #84. Either keep the copy and accept that a failed `send()` after a successful `sign()` leaves the row lying, or split the status into signed / sent. *Copy fix plus error-state design.*
4. **Prescription fields cannot produce a Prescribe command.** #55, #57, #59, #60. Medication needs an FDB search, quantity splits into number plus dispense form, pharmacy is a directory pick, and `days_supply`, `icd10_codes` and `prescriber_id` have no controls. *Field additions, five controls.*
5. **Imaging has no diagnosis-code control and referral has no service-provider control.** #50, #54. Both are real command fields. The screen's own annotation dismisses the first as a gap filed against the wrong system; that dismissal is correct for the Junction path and wrong for this one. *Field additions.*
6. **Junction requires a `patient_details` block the screen never shows.** #67. dob, gender, phone and email are all required and all readable from Canvas Patient, but a missing email fails at submit with no warning. Add a resolved-patient summary line with a "missing, fix in Canvas" state. *Field addition plus a new failure state.*
7. **The note field is capped at 120 characters and does not say so.** #68. Add `maxlength` and a counter. *Copy and attribute fix.*
8. **The status column mixes three vocabularies and covers none of the failure states.** #93, #98. Build the Junction-status → screen-word mapping explicitly, add `cancelled` and `failed` rows, and source "collection scheduled, 4 Sep" from the appointment object rather than implying it is an order status. *New integration: a second Junction fetch and two more webhooks.*
9. **`licensed in CA, NY, TX` has no read source.** #40. Aleron must own a clinician licensure roster. *New storage, small, and defensibly Aleron's since credentialing is Aleron's.*
10. **The screening half contradicts the ledger above it.** #138, #147, #148, #168, #171. HbA1c and Lipid both resulted in Jun 2026 per order 4471. Fix the fixture so both halves read from one results feed. *Fixture fix now, but it is evidence that the schedule's "Last" column must be computed from results rather than authored.*
11. **"the one place an order is authorised" is now false.** #178. *Copy fix, one sentence.*
12. **`Last: never` overstates a read.** #141. Use "no record in this chart". *Copy fix.*
13. **Aleron is keeping its own cross-system order ledger and the screen never says so.** #6, #72, #74. Numbers 4471 to 4523 span Junction, Canvas commands and staged prescriptions. Decide and document that Aleron stores order id, foreign id, type, route, standing order, attestation and signature per order. *Architectural, and it is the change that breaks "Canvas is the system of record" most visibly.*
14. **Result signature has no home.** #23, #95, #106, #118. `LabReview` committed in a note plus `SIGN_NOTE` is the path; it needs a note id, which the screen also lacks. *New integration.*
15. **API vocabulary is on the product surface.** `2fa.recent`, `423`, `ServiceRequest`, `LabOrderCommand`, `Aleron MD Role and Release Matrix v1` all render inside `.pbound` and `.pdisc`, which are product, not `wf-scaffold`. BRIEF forbids this explicitly. *Copy fix.*
16. **The timeline's stated pinning rule does not match its own dots.** #168 vs #169. "Overdue items pin to today" is true only of items due before this year; CAC and PHQ-2 are overdue and plot at their real dates. *Copy fix.*

## Alternative pathways

**#19 — genetic result "routed to the required channel if a pathogenic variant is found."**
Junction returns biomarkers and a PDF; a P/LP call is neither. Nearest workable: take the structured report from the genetics lab directly (Invitae/Labcorp has its own result API) rather than through Junction, and write the finding into Canvas as a `Condition` via FHIR create (`category: genomics`-adjacent, `clinicalStatus: active`) so it lands on the problem list where a second clinician sees it. If a Condition is too strong a claim, `UPSERT_PATIENT_METADATA` keyed `genetics.atm.plp` carries the fact without asserting a diagnosis, at the cost that nothing but Aleron can read it. Cost: a fourth integration, or the finding stays a PDF a human reads.

**#25 / #112 — "signed and sent" on a referral.**
No alternative exists; `Refer` publishes `sign()` and `delegate()` and no `send()`. Drop "and sent" and state that the practice transmits from Canvas. If Aleron must show delivery, the only surface is `ServiceRequest.status` read back after Canvas's own workflow moves it, which is a poll with an unknown cadence.

**#28 / #80 — the prescription return leg.**
Ranked:
1. Invert the embed. Canvas documents a layout effect that iframes an Aleron URL into the Canvas UI with the URL declared in the plugin manifest, plus app-drawer entries, chart tabs, note tabs and action buttons. If Aleron lives inside Canvas as a chart tab, "go sign it" is a tab switch and the return leg disappears. This is the only path that actually solves it, and it is a different product shape than a standalone portal.
2. `SHOW_ACTION_BUTTON` with `LaunchModalEffect` on the Canvas side, so the physician signs from a button Aleron placed, and `PRESCRIBE_COMMAND__POST_COMMIT` fires back into the plugin, which calls Aleron. The physician never leaves.
3. Keep the link out, and make return unnecessary: after staging, put the chart into a "prescription staged, unsigned" state that clears on the next `MedicationRequest` poll. The physician comes back whenever, and the screen is correct in the meantime. Cheapest, and it means the row is stale for up to one poll interval.
4. Drop the deep link and link to the patient's Canvas chart root, telling the physician what to look for. Honest, worse.
Return leg for all of 1 and 2: none needed. For 3 and 4: none exists; say so on the surface rather than "come back; the plan holds its place", which promises a mechanism.

**#40 — `licensed in CA, NY, TX`.**
`physician.licensed_states` is order input only. Alternatives: (a) Aleron stores the licensure roster, which is right because credentialing is Aleron's business function, not Canvas's clinical record; (b) Canvas SDK `UPSERT_PATIENT_METADATA` is the wrong shape here since this is a clinician fact, not a patient fact, and there is no practitioner-metadata effect in the verified surface, so (a) is the answer. Cost: one small Aleron-owned table, and Aleron becomes responsible for keeping it current against real licence renewals.

**#55 / #57 / #59 — free-text prescription fields.**
No API accepts them. `Prescribe` needs `fdb_code`, a numeric `quantity_to_dispense` with `type_to_dispense`, and a pharmacy reference. Alternative to building three lookups: drop the Prescription type from this screen entirely and send the physician to Canvas to compose as well as sign. That loses the staging benefit the screen argues for, but it removes three integrations and the one route that already ends elsewhere. Worth a decision rather than an assumption.

**#108 — `ATM heterozygous P/LP` in the ledger.**
Same as #19. Until a structured genomics feed exists, the honest render is "panel report available, 23 Jun" with the finding stated only where a human entered it. The current string implies Aleron parsed a variant call it has no way to receive.

**#178 — "the one place an order is authorised."**
Not an API problem. Delete the clause.

## Contradictions with what the screen already claims

- The screen says: *"Values on this screen, with units, reference ranges and abnormal flags, and a copy filed to the chart."* No values, units, ranges or flags are rendered anywhere. The only result data on the surface is `ALT 46 U/L, AST 31 U/L, CK 148 U/L` typed into a note textarea. The claim is API-supportable and the screen does not honour it.
- The screen says: *"sign() is published for imaging and referral, so those two are signed from here and need nothing else."* Referral needs one thing else it cannot have: transmission. `Refer` has no `send()`, so `signed and sent 24 Jun` in row 6 asserts an act Aleron cannot perform.
- The screen says: *"The diagnosis-code gap was filed against the wrong system... So the missing field was never missing here."* True of Junction's optional `icd_codes`. Not true of `ImagingOrder`, which takes `diagnosis_codes` and now sits on this same form with no control for it. The annotation retires a gap that the screen's own expansion reopened.
- The screen says: *"A note id is needed for anything that lands in Canvas and no note appears on this screen."* Confirmed, and it is worse than the annotation implies: it blocks imaging, referral, prescription **and** the result signature (`LabReview`), which is four of the five routes, not the three the annotation is thinking of.
- The screen says: *"Nothing on this screen places an order. A screening that becomes action-changing is priced on the action map and ordered from Care Plan, which is the one place an order is authorised."* The Active half of this same file has an Authorize control for five order types.
- The screen says: *"Overdue items pin to today."* HbA1c pins at 66.58 %; coronary artery calcium (overdue) plots at 62.19 % and PHQ-2 (overdue) at 45.48 %. The rule as implemented is "items due before this year pin to today."
- The screen's screening half says HbA1c last resulted Aug 2024 and Lipid panel Nov 2025. The ledger three sections above shows both inside order 4471, placed 8 Jun 2026 and available 22 Jun 2026, and an HbA1c re-order placed 30 Aug 2026. Both halves read the same feed and disagree.
- The screen's own annotation confirms the two open items I could not close: whether a plugin-created lab report enters the clinician review queue, and whether the plugin sandbox permits outbound network egress. Both remain open after this pass; neither is contradicted.

## Open questions for the humans

1. **Does Aleron run a Canvas plugin, or only call Canvas from outside?** Everything hard on this screen (staging detection, the prescription return leg, the note id, `LabReview`, `SIGN_NOTE`) is easy inside a plugin and impossible or expensive outside one. The screen is drawn as an outside caller and its annotations argue for a plugin. Pick one.
2. **Is the Prescription type worth keeping here?** It needs three lookups Aleron does not have (FDB, dispense form, pharmacy directory) and it is the one route that ends somewhere else. Composing in Canvas costs one link and removes all of it.
3. **Does the Junction catalog carry germline panels?** #14, #44. If not, the genetic route has no vendor and the design's "Junction places labs and genetics" premise breaks in half.
4. **Which physician network validates results?** The ground truth notes Junction offers its own network, the customer's, or a hybrid, and that critical results notify Junction's network regardless. This set assumes the customer's everywhere, which puts every abnormal on Dr. Okafor. The screen never tells her the critical-result backstop exists.
5. **Where does the Aleron order ledger live, and is that acceptable?** #72. One sequence across three systems means Aleron stores order state, which is the clearest break in "Canvas is the system of record" on any screen in this set.
6. **Who owns the governed screening schedule, and does it read `Last` from results or from an authored list?** #177 says the artifact is pending. #147 shows what happens when it is authored.
