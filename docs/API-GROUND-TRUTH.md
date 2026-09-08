# API ground truth — Canvas + Junction

> ## Source of record
>
> **The Canvas half of this document is now pinned to a live CapabilityStatement
> from `aleronmd-dev`, not to `docs.canvasmedical.com`.** The docs describe Canvas
> in general; the CapabilityStatement describes the instance we integrate with.
> 142 planned changes depend on this matrix, so it is checkable rather than
> trusted:
>
> ```bash
> node scripts/verify-canvas.js
> ```
>
> That diffs the live instance against `docs/canvas-capability-snapshot.json` and
> exits non-zero on drift. The endpoint is unauthenticated, so it needs no
> credentials. Snapshot taken 1 Sep 2026, FHIR 4.0.1, `instantiates:
> us-core-server`, 40 resources.
>
> ### Verified absences that carry design weight
>
> Confirmed against the instance, not inferred from a docs index:
>
> | Resource | Consequence |
> |---|---|
> | **`RiskAssessment`** | The resource FHIR built for engine risk output does not exist. Not in USCDI either, so no certification pressure will bring it. Engine output goes to a plugin Custom Data Model instead. |
> | **`FamilyMemberHistory`** | Structured family history cannot be read. Group D of the risk model cannot assert a family-history negative; those rows must read `not assessed`, not `not fired`. |
> | **`AuditEvent`** | No audit-event resource. `Provenance` is the only audit surface, and it is read/search only. |
> | **`Subscription`** | **There is no FHIR webhook mechanism of any kind.** Aleron learns of a Canvas act by reading, never by being told. |
>
> `Allergen` is documented but is **not** present on this instance.
>
> ### Corrections to earlier versions of this file
>
> 1. **`Task` is not a Canvas command.** It was listed in the commands table
>    below. It is a FHIR resource (create/read/update/search) and the SDK has
>    Task *effects*, but there is no Task command. Row removed.
> 2. **CommandAPI is not an HTTP API Canvas exposes.** It is a Python base class
>    in the plugin SDK that you subclass to *create* an endpoint at
>    `/plugin-io/api/<plugin>/`. Auth is by mixin, not OAuth. **Every command and
>    every effect in sections 2 and 3 is therefore plugin-gated.**
> 3. **No external metadata write exists.** Neither `UPSERT_NOTE_METADATA` nor
>    `UPSERT_PATIENT_METADATA` has a non-effect equivalent, and FHIR `Patient`
>    accepts only a closed list of extension URLs. The one externally-writable
>    custom-key store is `Patient.identifier`, which is per-patient and not
>    surfaced on the chart.
> 4. **`POST /DiagnosticReport/$create-lab-report` is not declared on this
>    instance.** The only operation in the whole CapabilityStatement is
>    `Group/$group-export`. It may exist undeclared; treat it as untested and
>    write Junction results through the plugin's `CREATE_LAB_REPORT` effect.
> 5. **`send()` on a prescription does not bypass the signature.** Resolved, not
>    open: `sign_action` "transitions it from staged to committed", and Canvas's
>    own example filters for `committer__isnull=False` before sending. Sign *is*
>    the commit for Prescribe.


Verified 3 Sep 2026 against `docs.canvasmedical.com/api/`,
`docs.canvasmedical.com/sdk/commands/`, `docs.canvasmedical.com/sdk/effects/`
and `docs.junction.com`. **Use this instead of re-deriving. If your screen
depends on something not covered here, verify it against the live docs and say
so explicitly in your report, flagging it as newly verified.**

The single most common error in prior passes: **conflating Canvas FHIR with the
Canvas Plugin SDK.** They are two different write surfaces with different
capabilities. Always say which one you mean.

---

> **The machine-checked copy of this is
> [`canvas-capability-snapshot.json`](canvas-capability-snapshot.json),
> not the tables below.** `scripts/verify-canvas.js` in that repo compares the
> JSON against the live instance and fails on drift; nothing compares the JSON
> against this prose. When they disagree, the JSON is right and this file is
> stale.

## 1. Canvas FHIR API — read/write matrix

| Resource | Create | Read | Update | Search |
|---|---|---|---|---|
| Allergen | ✗ | ✓ | ✗ | ✓ |
| AllergyIntolerance | ✓ | ✓ | ✓ | ✓ |
| Appointment | ✓ | ✓ | ✓ | ✓ |
| CarePlan | ✗ | ✓ | ✗ | ✓ |
| CareTeam | ✗ | ✓ | **✓** | ✓ |
| Claim | ✓ | ✓ | ✓ | ✓ |
| Communication | ✓ | ✓ | ✗ | ✓ |
| Condition | ✓ | ✓ | ✓ | ✓ |
| Consent | ✓ | ✓ | ✗ | ✓ |
| Coverage | ✓ | ✓ | ✓ | ✓ |
| CoverageEligibilityRequest | ✓ | ✗ | ✗ | ✗ |
| CoverageEligibilityResponse | ✗ | ✓ | ✗ | ✓ |
| DetectedIssue | ✓ | ✓ | ✓ | ✓ |
| Device | ✗ | ✓ | ✗ | ✓ |
| DiagnosticReport | ✗ | ✓ | ✗ | ✓ |
| DocumentReference | ✓ | ✓ | **✗** | ✓ |
| Encounter | ✗ | ✓ | ✗ | ✓ |
| Goal | ✗ | ✓ | ✗ | ✓ |
| Group | ✓ | ✓ | ✓ | ✓ |
| Immunization | ✓ | ✓ | ✓ | ✓ |
| Location | ✗ | ✓ | ✗ | ✓ |
| Media | ✓ | ✓ | ✗ | ✓ |
| Medication | ✗ | ✓ | ✗ | ✓ |
| MedicationDispense | ✗ | ✓ | ✗ | ✓ |
| MedicationRequest | ✗ | ✓ | ✗ | ✓ |
| MedicationStatement | ✓ | ✓ | ✓ | ✓ |
| Observation | ✓ | ✓ | **✗** | ✓ |
| Organization | ✗ | ✓ | ✗ | ✓ |
| Patient | ✓ | ✓ | ✓ | ✓ |
| PaymentNotice | ✓ | ✓ | ✗ | ✓ |
| Practitioner | ✓ | ✓ | ✓ | ✓ |
| Procedure | ✗ | ✓ | ✗ | ✓ |
| Provenance | ✗ | ✓ | ✗ | ✓ |
| Questionnaire | ✗ | ✓ | ✗ | ✓ |
| QuestionnaireResponse | ✓ | ✓ | ✓ | ✓ |
| RelatedPerson | ✗ | ✓ | ✗ | ✓ |
| Schedule | ✗ | ✗ | ✗ | ✓ |
| ServiceRequest | ✗ | ✓ | ✗ | ✓ |
| Slot | ✗ | ✗ | ✗ | ✓ |
| Specimen | ✗ | ✓ | ✗ | ✓ |
| Task | ✓ | ✓ | ✓ | ✓ |

Custom (non-FHIR) Canvas HTTP APIs also exist: **CCDA, Letter, Note**.

Key consequences:
- **ServiceRequest has no create.** This closes the *FHIR* route to orders and
  nothing else. Do not generalise it to "Canvas takes no orders by API".
- **DocumentReference cannot be updated.** A locked note written as a
  DocumentReference is immutable; an amendment is a new resource.
- **Observation cannot be updated**, and create is restricted in practice to
  vitals/panel-shaped categories. Do not assume arbitrary scores can be stored.
- **Goal and CarePlan are read-only in FHIR.** A goal is writable only as a
  Plugin SDK `Goal` command.
- **MedicationRequest is read-only.** Prescriptions cannot be created in FHIR.

---

## 2. Canvas Plugin SDK — Commands

**PLUGIN-GATED.** Commands are created inside a **note**. `CommandAPI` is a
Python base class in the plugin SDK that you subclass to expose an endpoint at
`/plugin-io/api/<plugin>/` — it is not an API Canvas hosts for you. Nothing in
this table is reachable without a deployed plugin.

Externally reachable equivalents, for the two cases that have one:
`POST /Condition` with `clinicalStatus: active` "will be added as a `Diagnose`
command", and `POST`/`PUT /Task` work as plain FHIR.

| Command | Key fields | originate | edit | delete | commit | **sign** | send |
|---|---|---|---|---|---|---|---|
| AdjustPrescription | fdb_code, new_fdb_code, sig, days_supply, quantity_to_dispense, refills, substitutions, pharmacy, prescriber_id | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Allergy | allergy, severity, narrative, approximate_date | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Assess | condition_id, background, status, narrative | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| ChangeMedication | medication_id, sig | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| ChartSectionReview | section | ✓ | ✗ | ✗ | (auto) | ✗ | ✗ |
| CloseGoal | goal_id, achievement_status, progress | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Diagnose | icd10_code, background, approximate_date_of_onset, today_assessment | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| FamilyHistory | family_history, relative, note | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| FollowUp | structured, requested_date, note_type_id, coding, comment | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Goal | goal_statement, start_date, due_date, achievement_status, priority, progress | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| HistoryOfPresentIllness | narrative | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| **ImagingOrder** | image_code, diagnosis_codes, priority, additional_details, service_provider, comment, ordering_provider_key | ✓ | ✓ | ✓ | ✓ | **✓** | ✓ |
| ImagingReview | report_ids, message_to_patient, communication_method, linked_items_urns, comment | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| ImmunizationStatement | cpt_code, cvx_code, unstructured, approximate_date, comments | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Immunize | vaccine_id, lot_id, lot_number, manufacturer, expiration_date, sig, consent_given, given_by_id | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Instruct | coding, comment | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| **LabOrder** | lab_partner, tests_order_codes, ordering_provider_key, diagnosis_codes, fasting_required, comment | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ |
| LabReview | report_ids, message_to_patient, communication_method, linked_items_urns, comment | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| MedicalHistory | past_medical_history, approximate_start_date, approximate_end_date, show_on_condition_list, comments | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| MedicationStatement | fdb_code, sig | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| SurgicalHistory | past_surgical_history, approximate_date, comment | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Perform | cpt_code, notes | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Plan | narrative | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| POCLabTest | template, indications, test_values, remarks | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Prescribe** | fdb_code / compound_medication_id / compound_medication_data, icd10_codes, sig, days_supply, quantity_to_dispense, type_to_dispense, refills, substitutions, pharmacy, prescriber_id | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ |
| PhysicalExam | questionnaire_id, answers | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Questionnaire | questionnaire_id, answers | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| ReasonForVisit | structured, requested_date, note_type_id, coding, comment | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Refer** | referral_type, specialty, service_provider, comment, ordering_provider_key | ✓ | ✓ | ✓ | ✓ | **✓** | ✗ |
| Refill | medication_id, days_supply, refills, pharmacy, prescriber_id | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| ReviewOfSystems | questionnaire_id, answers | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| VitalSignReading | vital_sign_type, value, units | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |

Also: `review()` only on Prescribe. `delegate()` only on ImagingOrder and Refer.
Every command supports `upsert_metadata()` and `upsert_custom_html()`.

**Known trap:** `originate(commit=True)` is silently ignored for order commands —
you get a staged command nobody has signed and no error saying so.

**RESOLVED, was an open question.** `send()` does not bypass the signature.
`sign_action` "Signs the prescription, transitioning it from staged to committed
state", and "The command must be committed/signed before it can be sent
electronically" — so for Prescribe, **sign is the commit**. Canvas's own
`send_all_prescriptions` example filters `committer__isnull=False`, i.e. commands
a human already committed. The identity gates (Surescripts SPI, EPCS for
controlled substances) attach to the prescriber, not the calling application.

**Also note:** `Prescription` has **no foreign key to `Command`**. If you need to
correlate them, set your own `command_uuid` at origination — it is the only clean
join key.

---

## 3. Canvas Plugin SDK — Effects

**PLUGIN-GATED**, but *not* event-gated: `SimpleAPI` route handlers and
`CronTask.execute` may both return effects. So one thin plugin turns this whole
catalogue into something an external caller can invoke synchronously over HTTP.

Effects write data or drive UI. Categories and the notable members:

**Clinical data**
- `CREATE_OBSERVATION`, `UPDATE_OBSERVATION` — note UPDATE exists here even
  though FHIR Observation has no update.
- `CREATE_LAB_REPORT`, `UPDATE_LAB_REPORT`, `ATTACH_LAB_REPORT_RESULTS`,
  `ENTER_IN_ERROR_LAB_REPORT` — **this is how a Junction result becomes a real
  Canvas lab report with values, units, reference ranges and abnormal flags.**
  It does not require a Canvas lab order to exist.

**Notes**
- `CREATE_NOTE`, `UPDATE_NOTE`, `SIGN_NOTE`, `DELETE_NOTE`, `UNDELETE_NOTE`,
  `UPSERT_NOTE_METADATA`.
- **`SIGN_NOTE` exists.** If a screen or annotation says "whether an embedded app
  can sign notes is an open spike", that spike is resolved for the SDK path.

**Patient data**
- `CREATE_PATIENT`, `UPDATE_PATIENT`, `UPSERT_PATIENT_METADATA` (arbitrary
  key/value), `CREATE_PATIENT_EXTERNAL_IDENTIFIER`,
  `CREATE_PATIENT_PREFERRED_PHARMACIES`, `CREATE_PATIENT_FACILITY_ADDRESS`.
- **`UPSERT_PATIENT_METADATA` and `UPSERT_NOTE_METADATA` are the escape hatch**
  for Aleron-owned facts that have no FHIR field (deferral reasons, package ids,
  engine run ids). If a screen says "this needs a Custom Data Model", metadata may
  be the cheaper answer — say so.

**UI / decision support**
- `ADD_BANNER_ALERT`, `REMOVE_BANNER_ALERT`, `ADD_OR_UPDATE_PROTOCOL_CARD`,
  `SHOW_ACTION_BUTTON` (supports `LaunchModalEffect`),
  `SHOW_PATIENT_CHART_SUMMARY_SECTIONS`, `PATIENT_CHART_SUMMARY__CUSTOM_SECTION`.

**Portal**
- `PORTAL_WIDGET`, `SHOW_PATIENT_PORTAL_MENU_ITEMS`,
  `PATIENT_PORTAL__SEND_CONTACT_VERIFICATION`, `PATIENT_PORTAL__SEND_INVITE`,
  `PATIENT_PORTAL__APPOINTMENT_SHOW_MEETING_LINK`.

**Other**: Appointments (create/reschedule/cancel + metadata), Tasks
(create/update/comment + metadata), Messages, Claims, Service Providers.

Also available in the SDK: `SimpleAPIRoute` (custom HTTP endpoints hosted by the
plugin), `CronTask` (scheduled jobs), and a secrets store.

---

## 4. Canvas auth / identity

- SSO is **SAML 2.0**; Microsoft Azure / Entra is a supported IdP, which matches
  Aleron's own auth.
- **There is no just-in-time provisioning.** A Canvas user must exist before SSO
  works. This is the root cause of "no Canvas practitioner id" failures — a
  command with no clinician to attribute never runs.
- Canvas embedding *Aleron* (an app inside Canvas) is documented. Canvas inside
  an Aleron iframe is **not** documented.

---

## 5. Junction API

Junction is a **lab-testing and wearables** platform. Confirmed scope limit:
**labs only — no imaging, no radiology, no referrals, no prescriptions.** It has
no documented EMR push; it embeds inside EMRs rather than writing to them.

### API groups
- **Core / Users** — `create-user`, `get-user`, `resolve-user`, `patch-user`,
  `delete-user`, `undo-delete-user`, `get-users`, `upsert-info`,
  `get-info-latest`, `create-insurance` (beta), `get-latest-insurance`,
  `create-portal-url`.
- **Lab Testing** — orders, appointments, results.
- **Devices / Wearables** — connections, device data, backfill status.
- **Junction Sense** — aggregated device data, continuous queries / result tables.
- **Management API** — team configuration.

### Create order — `POST /v3/order`

Required: `user_id` (UUID), `patient_details`, `patient_address`.

`patient_details`: `first_name` (1–50), `last_name` (1–50), `dob`, `gender`
(female|male|other|unknown), `phone_number`, `email` — all required; optional
`medical_proxy`, `race`, `ethnicity`, `sexual_orientation`, `gender_identity`,
`household_income`, `household_size`.

`patient_address`: `first_line`, `city`, `state`, `zip` (`^\d{5}(-\d{4})?$`),
`country` required; `receiver_name`, `second_line`, `access_notes` (max 1000),
`phone_number` optional.

Optional top level: `lab_test_id` (deprecated), `order_set` (`lab_test_ids[]`),
`collection_method` (**testkit | walk_in_test | at_home_phlebotomy |
on_site_collection**), `physician` (`first_name`, `last_name`, **`npi`**,
`email`, `licensed_states`, `signature_image`), `health_insurance`, `priority`,
`billing_type` (client_bill | commercial_insurance | patient_bill_passthrough |
patient_bill), `icd_codes[]`, `consents[]`, `activate_by`, `aoe_answers[]`,
`passthrough`, **`clinical_notes` (max 120 chars)**, `lab_account_id`,
`creator_member_id`.

### Order response / status

`order.status` ∈ **received | collecting_sample | sample_with_lab | completed |
cancelled | failed**, plus `events[]` (`id`, `created_at`, `status`) and
`last_event`. Also `id`, `team_id`, `user_id`, `sample_id`, `notes`,
`clinical_notes`, `lab_test` (`name`, `description`, `method`), `details`,
`created_at`, `updated_at`, `health_insurance_id`, `priority`, `billing_type`,
`icd_codes`, `has_abn`. There are also modality-specific low-level statuses.

### Results — `BiomarkerResult`

Fields: `name`, `slug`, `value`, `result`, `type`, `unit`, `timestamp`, `notes`,
`reference_range`, `min_range_value`, `max_range_value`, `is_above_max_range`,
`is_below_min_range`, `interpretation`, `loinc`, `loinc_slug`, `provider_id`,
`source_markers`.

`interpretation` distinguishes **abnormal** (outside lab reference range) from
**critical** (life-threatening range). Results come as structured data plus,
when the lab provides one, a PDF report.

### Webhooks
`labtest.order.created`, `labtest.order.updated`, `labtest.result.critical`,
`labtest.appointment.created`, `labtest.appointment.updated`.

---

## 6. The Aleron ↔ Junction ↔ Canvas flow this design assumes

1. **Compose / risk / plan** — Aleron-owned. No third party involved.
2. **Lock note** → Canvas, as a DocumentReference (immutable) or via
   `CREATE_NOTE` + `SIGN_NOTE`.
3. **Problem-list decisions** → Canvas `Condition` (FHIR create/update) or
   `Diagnose` / `Assess` commands.
4. **Lab or genetic order** → **Junction** `POST /v3/order`. Junction places and
   results it. Results return by webhook and are written into Canvas via
   `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS`. Canvas holds no order
   record for these, by design.
5. **Imaging order / referral** → **Canvas** `ImagingOrder` / `Refer` commands,
   `originate()` then `sign()`. One act, no vendor, nothing returns to Aleron;
   the report or consult note lands in the chart.
6. **Prescription** → Canvas `Prescribe` command, originated but **not signed**.
   The physician is redirected into Canvas to sign. Surescripts SPI and, for
   controlled substances, EPCS enrolment gate the signature and attach to the
   prescriber.
7. **Release to patient** — Aleron-owned, gated on the Canvas linkage.

**Known undrawn gap:** the *return* leg from step 6. Deep-linking into Canvas to
a specific note from outside is not documented. "Come back afterwards" is
currently a sentence, not a mechanism.

---

## 7. LATE ADDITIONS — verified 3 Sep 2026, after the audit began

If you are still reading, these three facts override anything above that conflicts.

### 7.1 The Canvas **Note API** exists and changes the note-lock model

`https://<instance>.canvasmedical.com/core/api/notes/v1/Note` — OAuth2 scopes
`user/Note.read`, `user/Note.write`.

- **POST** creates a note (state `NEW`). Fields: `title`, `encounterStartTime`,
  `patientKey`, `providerKey`, `practiceLocationKey`, `noteTypeName`,
  `noteTypeSystem`, `noteTypeCoding`. An "encounter" category note creates an
  encounter; a billable note generates a claim.
- **GET** `Note/{noteKey}` reads one; **GET** searches with filters + pagination.
- **PATCH** updates — but only `title`, `providerKey`, `practiceLocationKey`,
  `stateChange`. Note type is immutable after creation.
- Response fields: `noteKey`, `title`, `datetimeOfService`, `titleDisplay`,
  `currentState`, `patientKey`, `providerKey`, `practiceLocationKey`,
  `noteTypeName`, `noteTypeSystem`, `noteTypeCoding`.

> **Corrected by [INSTANCE-FINDINGS](INSTANCE-FINDINGS.md) X5.** Locking over
> the API generates **neither** the PDF nor the `DocumentReference` on
> `aleronmd-dev`: 11 locked notes hold 0 documents, the only 2 documents belong
> to the only 2 notes at `SGN`, and `stateChange` refuses `SGN`. The claim below
> is Canvas's documentation, not this instance's behaviour.

**The consequence that matters:** `stateChange` **locks** a note, and locking is
what "generat[es] PDFs and FHIR DocumentReference records". So Aleron does not
construct a DocumentReference for a locked note — **it locks the note and Canvas
produces the DocumentReference.** Any screen or plan that describes Aleron
writing a DocumentReference directly has the mechanism wrong, even though the
end state is right. `stateChange` also drives appointment states (no-show,
check-in).

### 7.2 The return leg is still **not solved**, but it is now sharper

The Note API response documents **no permalink or deep-link URL field**. What it
does give is a stable `noteKey`. So a deep link into a specific note in the
Canvas UI is *constructible by convention* but **not documented or supported** —
which is a different and more actionable statement than "no mechanism exists".
Treat a constructed note URL as a spike with a real chance of working and no
contract behind it.

### 7.3 `send()` on a prescription does **not** bypass the signature

Canvas's own `send_all_prescriptions` example filters for
`committer__isnull=False` — i.e. commands **a human already committed**. It then
constructs `PrescribeCommand(command_uuid=...)` and calls `send()`.

So the sequence is: a human signs in Canvas → a plugin may then send. Canvas has
also split the old single "send" into a **dual sign-and-send action**, so signing
and sending are separately addressable. None of this lets Aleron originate,
sign and send a prescription on the prescriber's behalf. **The redirect stands.**
