# Spike: can Canvas Observations hold engine risk output?

**Verdict: partly viable — and the good news first: the Plugin SDK's `CREATE_OBSERVATION` effect is *not* restricted to vital signs. It is a different surface from the FHIR endpoint, it takes arbitrary `codings` (any system, any code), an arbitrary `category`, a `value` + `units`, and nested `components`; `UPDATE_OBSERVATION` and `ENTER_IN_ERROR_OBSERVATION` are both real and documented. So the preferred option survives.**

The split: **the two probabilities and the risk band go in Observations. The QALY-gain figures, the reclassification-probability figures, and the 19-row modifier table do not** — not because Canvas blocks them, but because they have no standard vocabulary and (for the modifier table) no Observation field that can hold a citation. Those need a second home. You need **both**.

Evidence base: all Canvas quotes are from `docs.canvasmedical.com` pages fetched raw on 2026-09-04 (page "last updated" dates noted). LOINC facts are from the NLM Clinical Table Search Service LOINC index (`clinicaltables.nlm.nih.gov/api/loinc_items/v3`), queried live. Anything I am inferring is labelled **[inference]**.

---

## Is create restricted? Is update real?

| Surface | Create restricted to? | Update? | Evidence |
|---|---|---|---|
| **FHIR `POST /Observation`** | **Yes — hard-restricted to a 12-code vital-sign list.** "Although the observation endpoint houses many different Canvas models, currently, **only vital signs and panels can be created through this endpoint**." And on `Observation.code`: "For create interactions, only vital sign LOINC codes are supported." Off-list codes are rejected: "A vital sign code that is not listed in the table above is rejected with a **405** and the message `Sign is not supported by Canvas`." | **No.** The page documents exactly three endpoints: `post /Observation`, `get /Observation/{id}`, `get /Observation`. No PUT, PATCH or DELETE anywhere on the page. Also `status`: "Observations created via the FHIR API can only be `final`." | `/api/observation/` (last updated 4 Aug 2026) |
| **SDK effect `CREATE_OBSERVATION`** | **No code restriction documented.** The effect page enumerates the full attribute set and no accepted-code list. `codings` is "List of standardized codes identifying this observation (e.g., LOINC codes)"; `CodingData.system` is "URI identifying the terminology system (e.g., `http://loinc.org`)". `category` is "Category of observation (e.g., 'vital-signs', 'laboratory', 'imaging'). Can be a single category or a list" — `str \| list[str]`, no enum. Validation for `create()` is only: `observation_id` must **not** be set; `patient_id`, `name`, `effective_datetime` **required**; parent must exist if `is_member_of_id` given. **Nothing about codes.** | **Yes.** `UPDATE_OBSERVATION`: "`observation_id` is **required** and must reference an existing observation. All other fields are optional; only dirty (modified) fields are updated." Payload `{ "data": { observation_id, <dirty_fields> } }`. | `/sdk/effect-observation/` (last updated 1 Jun 2026); `/sdk/effects/` |

### Exact FHIR-accepted code list (for the record)

`85353-1` vital sign panel · `85354-9` blood pressure · `29463-7` weight · `8302-2` height · `8867-4` pulse rate · `8310-5` body temperature · `2708-6` O2 sat (arterial) · `59408-5` O2 sat · `9279-1` respiration rate · `56086-2` waist circumference · `80339-5` note · `8884-9` pulse rhythm. Plus: "supplemental oxygen (`88658-0`) **cannot** be created through this endpoint."

### The full `CREATE_OBSERVATION`/`UPDATE_OBSERVATION` schema

| Field | Type | Notes from docs |
|---|---|---|
| `observation_id` | `str \| UUID \| None` | "Must be unset when creating; required when updating." |
| `patient_id` | `str \| None` | Required on create |
| `is_member_of_id` | `str \| UUID \| None` | "Reference to a parent observation (for grouping related observations)" |
| `category` | `str \| list[str] \| None` | free-form in the effect |
| `units` | `str \| None` | e.g. "mmHg", "mg/dL" |
| `value` | `str \| None` | "The observation value **as a string**" |
| `note_id` | `int \| None` | optional |
| `name` | `str \| None` | Required on create — human-readable |
| `effective_datetime` | `datetime \| None` | Required on create |
| `codings` | `list[CodingData]` | `code`, `display`, `system`, `version`, `user_selected` |
| `components` | `list[ObservationComponentData]` | each: `value_quantity` (str), `value_quantity_unit`, `name`, `codings` |
| `value_codings` | `list[CodingData]` | "List of coded values for interpretation (e.g., 'normal', 'abnormal')" |

Notable **absences** from the effect: no `status`, no `method`, no `performer`, no `device`, no `derivedFrom` (only `is_member_of_id`), no free-text note/comment field, and `value` is a string with a separate `units` string rather than a typed quantity.

### Amend / supersede / entered-in-error

- **`ENTER_IN_ERROR_OBSERVATION` exists** and is the documented retraction path: "Marks an existing observation as entered in error. Use this when an observation was recorded incorrectly and should be flagged rather than deleted." Payload is `{ "data": { observation_id } }` only — "setting any other field will raise a validation error."
- Two constraints matter operationally: "The observation must not already be entered in error" and **"The observation must not belong to a locked note."** Shipped 2 Jun 2026 release; create/update shipped 8 Jan 2026 ("Implements effects for creating and updating observations via the Canvas SDK").
- **No `supersedes` / `amends` / versioning concept** is documented for Observations on any surface. FHIR `status` supports `entered-in-error` on read, but is not settable via the effect and is forced to `final` via the FHIR endpoint.
- **[inference]** Because `UPDATE_OBSERVATION` only needs an existing `observation_id` and imposes no origin check, a plugin can update an Observation it created earlier — that is the natural reading of "must reference an existing observation", and it is what the doc's own example does (fetch via `ObservationModel.objects.filter(...)`, then `Observation(observation_id=...).update()`). The docs do **not** say only plugin-created observations can be updated, nor do they say the locked-note restriction applies to `update()` (it is stated only for `enter_in_error()`). Both worth confirming against a real instance.

---

## Does `RiskAssessment` exist in Canvas?

**No. Canvas does not expose FHIR `RiskAssessment` in any form I can find.** Stating it positively, three independent checks:

1. **Resource index** — the API nav enumerates 57 pages. The complete resource list is: AllergyIntolerance, Allergen, Appointment, CarePlan, CareTeam, Claim, Communication, Condition, Consent, Coverage, CoverageEligibilityRequest, CoverageEligibilityResponse, DetectedIssue, Device, DiagnosticReport, DocumentReference, Encounter, Goal, Group, Immunization, Letter, Location, Media, Medication, MedicationDispense, MedicationRequest, MedicationStatement, Note, Observation, Organization, Patient, PaymentNotice, Practitioner, Procedure, Provenance, Questionnaire, QuestionnaireResponse, RelatedPerson, Schedule, ServiceRequest, Slot, Specimen, Task. **`RiskAssessment` is not among them.**
2. **`GET https://docs.canvasmedical.com/api/riskassessment/` → HTTP 404**, and `RiskAssessment` does not appear in `sitemap.xml` (923 URLs).
3. **Release notes** — zero occurrences of "RiskAssessment", "risk assessment", or "risk score" across the entire `/product-updates/release-notes/` page (~280 KB of text). Nothing announced, nothing deprecated, nothing on a roadmap.

The docs' full-text search returns exactly **one** hit for "RiskAssessment": `/sdk/commands-custom-command/`, where it is the *example name of a plugin-defined custom command* — `{"name": "RiskAssessment", "label": "Risk Assessment", "schema_key": "riskAssessment"}`. That is a coincidence of naming, not the FHIR resource. It is also, as it happens, a useful pointer (see Recommendation).

So: `prediction.probabilityDecimal`, `prediction.qualitativeRisk`, `prediction.whenRange`, `basis` and `method` are all unavailable. There is no resource in Canvas that models a prediction natively.

---

## Vocabulary, per data kind

What LOINC actually has in this family (live query, exact long common names):

| LOINC | Long common name |
|---|---|
| `99055-6` | Cardiovascular disease 10Y risk **[Likelihood]** — *method-agnostic* |
| `99056-4` | Cardiovascular disease 10Y risk (property `Find`) |
| `79423-0` | Cardiovascular disease 10Y risk [Likelihood] **ACC-AHA Pooled Cohort by Goff 2013** |
| `95549-2` | Cardiovascular disease **lifetime** risk [Likelihood] ACC-AHA Pooled Cohort by Goff 2013 |
| `95548-4` | Cardiovascular disease 10Y risk **goal** based on ACC-AHA Pooled Cohort by Goff 2013 |
| `65853-4` | General cardiovascular disease 10Y risk [#] Framingham.D'Agostino |
| `65860-9` / `65861-7` | Cardiovascular disease 10Y risk [#] SCORE.Conroy 2003 |
| `65850-0` / `65851-8` / `65857-5` | Hard CHD / CHD 10Y risk (ATP III, Wilson 1998, Reynolds) |

**There is no LOINC code for PREVENT.** A search for "PREVENT risk" returns six results, none of which is a CVD equation (they are CDC/PROMIS/CPHS survey items). **There is no 30-year-horizon code of any kind** — "30Y risk" returns **0 results**, and the only non-10-year CVD horizon in LOINC is *lifetime* (`95549-2`, and that one is method-bound to Pooled Cohort). **No "ASCVD"-specific code either** — "atherosclerotic risk" returns exactly one hit, `95549-2` again.

| Data kind | Standard code exists? | Expressible as an Observation? | Note |
|---|---|---|---|
| **10-year probability** | **Yes, but imperfect.** `99055-6` "Cardiovascular disease 10Y risk [Likelihood]" is the right code — it is method-agnostic, so it does not falsely assert Pooled Cohort. `79423-0` is the wrong code for PREVENT output (it names Goff 2013 in the code itself). | **Yes.** `value="8.4"`, `units="%"`, `codings=[99055-6 @ http://loinc.org]`. | Put the equation name in `name` (e.g. "PREVENT 10-yr ASCVD risk") since no code carries it. LOINC does not distinguish ASCVD from total CVD at this level. |
| **30-year probability** | **No.** Nothing at a 30-year horizon exists in LOINC. | **Yes, mechanically** — but only under a local code. | Options: (a) a local `system` URI of your own with a stable local code; (b) `99055-6` with the horizon only in `name`/`effective` semantics — **do not do (b)**, it silently mislabels a 30-year number as a 10-year one to every downstream reader. Use a local code and submit a LOINC request. |
| **Risk band (low/mod/high)** | **No.** "cardiovascular risk category" returns 0 results; the only CVD-adjacent qualitative code is `95548-4`, which is a *goal*, not a band. | **Yes** — this is exactly what `value_codings` is for: "List of coded values for interpretation (e.g., 'normal', 'abnormal')". Attach the band to the probability observation rather than creating a second observation. | Caveat: the docs' own example uses `system="http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation"` with `code="normal"` — but that system's real codes are `N`/`A`/`H`/`L`, and it has no low/moderate/high risk-stratum concept. **[inference]** you will end up with a local code system for the band regardless. |
| **QALY gain per proposed action** | **No.** "quality adjusted life year" returns **0 LOINC results**. Nearest neighbours are life-expectancy items (`75327-7` "Life expectancy [Time] Estimated", `46525-2` [OASIS]) — none of which means QALY, and none of which is per-action. | **Structurally, no.** An Observation has one `value` and no field to say *which proposed action the value belongs to*. `name` is free text, so you could encode "QALY gain — start statin" in a name, but then the action is an unparseable string and you get one Observation per action per run. | Your suspicion is correct. This is not Observation-shaped data: it is a *decision-model output keyed by intervention*, and FHIR's home for it would have been `RiskAssessment.prediction` + `basis`, which Canvas doesn't have. |
| **Reclassification probability per diagnostic gate** | **No.** "reclassification" returns **0 LOINC results**. | **Structurally, no** — same reason as QALY: the value is meaningless without the gate it is keyed to, and Observation has no slot for the key. | Same conclusion. |
| **19-row modifier table (multiplier / effect / citation)** | **No** — and there is no code for "risk modifier" as a concept, let alone per-modifier codes. | **Partly, and I would say no.** Canvas **does** support `Observation.component`: `components: list[ObservationComponentData]`, each with `value_quantity`, `value_quantity_unit`, `name`, `codings`; the read model exposes `observation.components.all()` with `component.codings`. So 19 rows of *(name, multiplier)* fit as 19 components on one Observation. **But there is no field for the citation and no field for the free-text effect** — `ObservationComponentData` has exactly four fields. Component *order* is also not documented as preserved. | You could smuggle the citation into `component.name`, which is a string-jamming anti-pattern in a chart-visible clinical field. Verdict: components are real and usable for the multipliers, but the table as specified (multiplier + effect + citation, ordered, per-run) does not fit. |

Note the boundary this creates on the *read* side: the FHIR `Observation` read/search page enumerates a **closed** set of supported `category` codes (`vital-signs`, `social-history`, `imaging`, `laboratory`, `procedure`, `survey`, `exam`, `therapy`, `activity`, `sdoh`, `functional-status`, `cognitive-status`, `disability-status`) and, for `code`, a closed list of provenances ("Any LOINC codes from Vital Panel or Vital Signs captured in the Observation Create / Vital Command", questionnaire codes, questionnaire scoring results, pediatric vitals, lab report values). **Plugin-effect-created observations are not mentioned in either list.** **[inference]** the effect will let you write a category like `risk` that the FHIR read layer has no mapping for; pick a category from the 13 enumerated ones (`survey` or `exam` are the least-wrong for a computed score) to stay inside documented territory.

---

## Provenance an Observation can carry

**Thin, and this is the weakest part of the Observation option.**

What you *cannot* set: the effect has **no `method`, no `performer`, no `device`, no `derivedFrom`, no `status`**. FHIR `Observation.performer` is read-only and constrained anyway: "Performer can be a Practitioner or a Patient" — **not a Device**, so there is no way to say "a machine computed this" through the standard field designed to say that.

What you *do* get, automatically:

- **A Provenance record per write.** "In Canvas a Provenance record is created each time the following data types are created or updated in the Canvas database" — the list includes `Observation`. Activity is coded `CREATE` or `UPDATE` from `v3-DataOperation`. `Provenance` is read-only (`get /Provenance/{id}`, `get /Provenance`).
- **Agent attribution:** "The agent will be populated by the committer or originator in Canvas as the auther. If neither is found, it will default to the **Canvas Organization as the composer**." Agent participant types available include `author`, `enterer`, `performer`, `verifier`, `attester`, `informant`, `assembler`, **`composer`**.
- **User fields on the read model:** the SDK `Observation` model exposes `originator: CanvasUser`, `committer: CanvasUser`, `entered_in_error: CanvasUser`. So a plugin-created Observation is attributable to whatever user the plugin runs as.

**The safety read.** There is **no dedicated "unvalidated" or "machine-generated" flag**. The only honest markers available are: (a) the `name` string, (b) the `codings` you choose, (c) `value_codings`, and (d) whichever `CanvasUser` shows up as originator. That means an Aleron-written risk score lands in the chart looking like ordinary clinical data, distinguishable only by a name you wrote and a service-account identity a clinician has to notice. **[inference, and I'd treat it as a finding rather than a footnote]** if the team writes probabilities as Observations, the mitigation has to be conventional, not enforced: a mandatory `name` prefix ("Aleron (computed, unvalidated): …"), a dedicated service account whose display name says so, and a `value_codings` entry from a local system marking provenance. None of that is enforced by Canvas, and nothing stops a later reader — including a Canvas protocol doing a ValueSet match — from treating the number as clinician-entered. I would not ship this without a named decision on it.

---

## Practical consequences

**Chart visibility — undocumented, and probably nil by default.** This is the single biggest unresolved item.

- The patient chart summary has a **fixed section enum**: `SOCIAL_DETERMINANTS`, `GOALS`, `CONDITIONS`, `MEDICATIONS`, `ALLERGIES`, `CARE_TEAMS`, `VITALS`, `IMMUNIZATIONS`, `SURGICAL_HISTORY`, `FAMILY_HISTORY`, `CODING_GAPS`. **There is no "Observations" section.**
- Every documented Canvas workflow that produces a visible Observation produces it *as a by-product of something else* that owns the UI — the Vitals command, a questionnaire/ROS/PE/structured assessment, a questionnaire scoring result, a lab report. The Vitals surface is anchored on a **separate model**: "The `VitalSignReading` model is the anchor for the Vitals command." **[inference]** the Vitals section renders `VitalSignReading` rows, not arbitrary Observations, so a plugin-written Observation with a non-vital code has no host UI.
- **No page anywhere in the docs states where an Observation created by `CREATE_OBSERVATION` appears in the chart.** The effect page has no UI section. The 8 Jan 2026 release note links only back to the same page. `note_id` is an optional field with no stated default or rendering behaviour.
- The documented way to make plugin data visible is to build the UI yourself: an `ActionButton` + `LaunchModalEffect` (per `/guides/growth-charts/`, "The Canvas SDK gives you access to real-time patient data and allows you to create custom UIs accessible from a patient's chart"), a `PatientChartSummaryCustomSection` ("Custom sections render plugin-provided content in an iframe"), or a `CustomCommand` (below).

**Readability — good, on two of three surfaces.**

- **Canvas protocols and other plugins: yes.** The SDK data module reads them first-class: `Observation.objects.get/filter/for_patient`, `patient.observations.all()`, arbitrary attribute filters, and ValueSet matching via `Observation.objects.find(Weight)`. Codings and components are traversable (`observation.codings.all()`, `observation.components.all()`).
- **FHIR read API: probably, but undocumented for this origin.** Read/search exist (`get /Observation/{id}`, `get /Observation`) and the auto-Provenance record proves the write is a first-class DB event. But as noted, neither the supported-`category` list nor the supported-`code` list mentions plugin-created observations. **Not established** — test it.
- **Other clinicians: only if you build the UI.**

**Volume and performance — nothing specific documented.** No per-patient Observation cap, no write rate limit, no ingest quota for Observations anywhere in the docs. The only hard number is on read: "There is a maximum page size (`_count`) that is enforced by the server. This value is at 100 at the time of writing, but can change without warning… When no count is specified in a search, it will default to 10." Two adjacent signals worth weighing given "recomputed on every engine run": the chart-load guidance in `/guides/tailoring-the-chart-to-the-patient/` ("The less data transmitted, the faster your plugins execute, and the faster your charts load… over time and with enough plugins installed the inefficiencies could add up"), and the existence of past `chart-load-performance` and `vitals-and-questionnaires-performance` release notes. **[inference]** the accumulation risk is real — N runs × (2 probabilities + 1 band) grows without bound, and there is no documented purge. Update-in-place (which you now know works) rather than append-per-run is the mitigation, with `enter_in_error` for genuine retractions.

---

## Recommendation

**Both — and the line falls at "does a clinician need to see this number in the chart, and does it have a code?"**

**Observations (via the SDK effect, not FHIR), holding three things:**
1. 10-year probability → `99055-6`, `value` + `units="%"`, band attached as `value_codings`.
2. 30-year probability → local code under your own `system` URI. Do **not** reuse `99055-6`.
3. That's it.

Write them with `UPDATE_OBSERVATION` keyed on a stored `observation_id` per patient per measure, so each engine run overwrites rather than appends. Store that id mapping in the CDM (see below). Use `enter_in_error()` only for real retractions, and handle its locked-note failure mode.

**Custom Data Model, holding everything else:** QALY gains per action, reclassification probabilities per gate, the 19-row modifier table with multipliers/effects/citations, plus the full per-run engine output for audit, plus the Observation-id map. This data is per-run, nested, ordered, keyed by domain objects (actions, gates, modifiers) that FHIR Observation has no slot for and LOINC has no codes for. No amount of `component` gymnastics changes that. Accept the CDM's permanence constraint deliberately — "tables can be added but never dropped via the SDK, and fields can be added but never altered or removed" — which argues for **few, wide, JSON-leaning tables** rather than a normalized schema across actions/gates/modifiers. The docs say this themselves: "Don't create five interrelated CustomModels with foreign keys… Over-engineering the schema early is costly because tables cannot be dropped if you change your mind." (Note the CLI escape hatch that exists outside the SDK: `canvas namespace reset` / `canvas namespace drop`, which the docs say applies "in production as well as during development" — but dropping regenerates keys and breaks co-tenant plugins, so treat it as a dev tool.)

**Third piece, and I'd push for it: a `CustomCommand` for chart visibility.** This is the surface that solves the CDM's invisibility problem without a bespoke chart section, and Canvas's own example for it is literally named "Risk Assessment". `CustomCommand` takes `content` (HTML for the chart) and `print_content` (HTML for print), declared in `CANVAS_MANIFEST.json` with a `section` (the example uses `"assessment"`). It is "designed for displaying read-only content and does not support user input" — which is exactly right for engine output: the modifier table, the QALY figures and the citations render as a legible, printable block anchored to a note, with no pretence of being coded clinical data. That framing also happens to be the honest answer to the provenance problem: the numbers a clinician *acts on* appear as a clearly-labelled third-party assessment block, and only the two coded probabilities enter the structured record.

So: **CDM = system of record. Observations = the two probabilities + band, for interoperability and protocol matching. CustomCommand = the human-readable surface.** The team gets their standards-based option, but it carries about a third of the payload, not all of it.

---

## What I could not establish

1. **Where a plugin-created Observation actually appears in the chart UI, if anywhere.** No documentation exists. My inference (nowhere, by default) is based on the fixed summary-section enum, `VitalSignReading` being the Vitals anchor, and every documented visible-Observation workflow being owned by another UI. **This needs a 30-minute test on a real instance** and it materially changes the recommendation — if a plugin Observation with `category="survey"` does render somewhere sensible, the CustomCommand piece gets smaller.
2. **Whether the FHIR read/search API returns plugin-effect-created Observations.** The supported-`code` and supported-`category` lists on `/api/observation/` do not mention them. Testable in the same session.
3. **What Canvas does with a `category` value outside the 13 enumerated codes** — the effect accepts a free `str`, the read layer enumerates a closed set. Untested.
4. **Whether `UPDATE_OBSERVATION` inherits the locked-note restriction** that is documented only for `enter_in_error()`. If a plugin-created Observation lands on a note that later gets signed/locked, the update path may fail. Not documented either way.
5. **Whether `UPDATE_OBSERVATION` can change `codings` / `components` or only scalar fields.** "Only fields marked dirty… are included" implies any field, and the doc's own example passes `components` to `update()` — but replace-vs-merge semantics for the component list are unstated.
6. **Whether `Observation.component` order is preserved** on read. Relevant only if you overrule me and put the modifier table in components.
7. **Which `CanvasUser` a plugin's writes are attributed to as `originator`/`committer`**, and therefore what a clinician actually sees as the author. Not documented on any page I read; it determines whether the "machine-generated" signal is visible at all.
8. **Any per-patient Observation volume ceiling or write rate limit.** Genuinely absent from the docs rather than found-and-noted. Ask Canvas support directly before committing to append-per-run anywhere.
9. **Whether a LOINC request for PREVENT / 30-year horizons is in flight.** I confirmed no such code exists today via the NLM LOINC index; I did not check LOINC's submission pipeline or pre-release content.
