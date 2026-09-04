# v2/inbox.html and v2/panel.html

**Screen purpose:** *Inbox* is the physician's work queue, filtered to patients whose lifecycle state permits an act, sorted by lifecycle rank then wait duration. *Panel* is the same row anatomy with the "permits an act" filter dropped, showing all 146 assigned patients plus an optional six-domain risk read.

**Data points audited:** 92 total — OK 53, GAP 19, WRONG 9, UNVERIFIED 5, NONE 6
(inbox 57, panel 35; the shared rail is counted once, in the inbox. Rows that repeat one field across many patients — nine patient names, 48 domain tiers — are counted as one data point each and their per-patient values listed in the note.)

Newly verified against live docs in this pass (not in `API-GROUND-TRUTH.md`), each cited inline below:

| Fact | URL |
|---|---|
| Canvas `Task` search takes `owner`, `status`, `due`, `label`, `patient`, `priority`, `requester`, `modified`, `_sort` (`_id`, `due-date`, `-_id`, `-due-date`) and **does not require a patient** | https://docs.canvasmedical.com/api/task/ |
| Canvas `Task.input` labels are **free text, auto-created if absent**, and searchable with `label=` | https://docs.canvasmedical.com/api/task/ |
| Canvas `Task` due date is `restriction.period.end`; team assignment is an extension `.../fhir/extensions/task-group` pointing at a `Group` | https://docs.canvasmedical.com/api/task/ |
| Canvas `Patient` supports reverse-chaining: `_has:CareTeam:participant:member=Practitioner/{id}` — **the only cross-patient "my panel" query in the FHIR API** | https://docs.canvasmedical.com/api/patient/ |
| Canvas `CareTeam` `participant` search is **not** cross-patient; `Patient` reverse-chaining is | https://docs.canvasmedical.com/api/careteam/ |
| Every Canvas FHIR search Bundle carries `total`; `_count` default 10, **max 100**; `_offset` supported | https://docs.canvasmedical.com/api/pagination/ |
| Canvas `Note` custom API search filters on `patient_key`, `provider_key`, `note_type_*`, `datetime_of_service` + `limit`/`offset`/`ordering`. **No state filter** — you cannot ask Canvas for "unsigned notes" | https://docs.canvasmedical.com/api/note/ |
| Canvas `DocumentReference` search: `_id`, `category`, `date`, `patient`, `status`, `subject`, `type`. **No author parameter** | https://docs.canvasmedical.com/api/documentreference/ |
| Canvas `Group` (`type: person`) can hold a patient list; searchable only by `_id` and `type` | https://docs.canvasmedical.com/api/group/ |
| Junction **`GET /v3/orders`** is a team-wide cross-patient order list: `status[]`, `user_id`, `patient_name`, `order_ids[]`, `start_date`/`end_date`, `updated_start_date`/`updated_end_date`, `is_critical`, `interpretation`, `order_type[]`, `order_key`, `order_direction`, `page`, `size` (max 100), response `{orders, total, page, size}` | https://docs.junction.com/api-reference/lab-testing/get-orders.md |
| Junction **`GET /v2/user`** lists users team-wide: `offset`, `limit` (max 500), response `{users, total, offset, limit}` | https://docs.junction.com/api-reference/user/get-users |
| Junction **Sense continuous queries** aggregate device data across users; `get-result-table` returns per-user rows and `continuous_query.result_table.changed` fires as a webhook | https://docs.junction.com/llms.txt (`/api-reference/sense/continuous-query/*`) |

---

## Can these screens be populated without an Aleron-side index?

**The row set, the ordering and every count on the inbox can be, but only if Aleron adopts Canvas `Task` as its queue primitive; the panel's risk read cannot be, at any price.**

The inbox is two cross-patient calls, not seven per-patient round trips. `GET /Task?owner=Practitioner/{okafor}&status=requested&_count=100` is a genuine cross-patient query — Canvas explicitly does not require a patient parameter on Task search — and a Task carries everything the queue row needs: `for` (the patient), `owner` (the physician), `authoredOn` (when the work entered this state, so the "held 6 days" column), `restriction.period.end` (a due date), `note` (free-text comments, so the "what is waiting" sentence), `description`, and `input` labels that Canvas **creates on demand from free text and lets you search with `label=`**. That last fact is the load-bearing one: Aleron's lifecycle vocabulary — `Review pending`, `Signature blocked`, `Physician hold`, `Monitoring update requires review` — can be written as Task labels and queried back as labels, so the queue's sort key lives in Canvas rather than in Aleron. The patient column is a second call, `GET /Patient?_has:CareTeam:participant:member=Practitioner/{okafor}&_count=100`, which is the only cross-patient panel query the FHIR API offers and returns names, birth dates, genders and identifiers for the whole list at once. Every count on both screens — the four tiles, the two tab badges, the four rail badges, "146", "Showing 9 of 146", "137 more" — comes from `Bundle.total` on a `_count=1` search, so **no count on either screen requires fetching the rows it counts**. "Awaiting results" and Marcus Bell's stalled genetics kit come from Junction's own cross-patient `GET /v3/orders`, filtered by `status[]`, with a `total`.

So the standing constraint survives the inbox intact, and it survives it in a way worth stating precisely: **Aleron does not need an index of "which patients are waiting on me", because Canvas Task already is that index, and it lives in the system that is allowed to hold patient identifiers.** The tension the brief anticipates — that a workflow index nonetheless contains patient identifiers — is dissolved rather than accepted, because the identifiers never leave Canvas. What Aleron holds is a Practitioner id and a request.

The price is real and should be priced. Every state transition becomes a Canvas write. Aleron's lifecycle enum becomes a set of free-text strings in a foreign system with no schema, no enum validation and no referential integrity: nothing stops a typo creating a ninth lifecycle state, and `LIFECYCLE_RANK` in `inbox.html` would silently fall through to rank 99. Canvas surfaces these tasks in its own Tasks UI, to the same physician, with Canvas's wording and Canvas's status vocabulary (`requested` / `completed` / `cancelled`), which neither screen has accounted for. And `Task._sort` supports only `_id` and `due-date`, so "Waiting longest" and "Held longest" are not server-sortable unless Aleron abuses `restriction.period.end` to carry an age rather than a due date; over a 146-patient panel with `_count` capped at 100 that means two pages before you can sort.

The panel is the screen that breaks. Its default density is **With risk by domain**, so the default render asks for six risk tiers for each of nine patients, and "Load next 25" asks for 150 more. No Canvas resource holds an Aleron risk tier: `Observation` cannot be updated and its create is restricted in practice to vitals and panel-shaped categories, `CarePlan` and `Goal` are read-only in FHIR, and `UPSERT_PATIENT_METADATA` — the sanctioned escape hatch — is per-patient and **not cross-patient searchable**, so it can store a tier but cannot list one. Populating that column honestly means running the SPAR engine once per patient, and each run needs that patient's full packet: labs, vitals, genetics, wearables. That is nine engine runs and dozens of per-patient Canvas reads behind one list view, for a column the screen's own prose calls "a second question the physician sometimes asks". Either the panel defaults to **Lifecycle only** and loads the domain read on demand, or Aleron caches computed risk tiers somewhere — and a cache of per-patient risk tiers keyed by patient id is patient data by any reading, which is the constraint the whole design is built to avoid. That, not the queue, is where the storage question actually bites.

---

## Data points — inbox

### Region A — inbox rail (identical markup in both screens)

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| I1 | `aleronMD` wordmark | `NONE` (static) | OK | Product chrome, no data. |
| I2 | `AO` avatar initials | `Derived` (from practitioner name) | OK | From `Practitioner.name` on the authenticated user. |
| I3 | `Dr. A. Okafor` | `Canvas FHIR:Practitioner` read by id, single-resource | OK | Available from the session's own practitioner id. No cross-patient concern. |
| I4 | `Physician · LASO Wellness` | `Canvas FHIR:Practitioner` + `Canvas FHIR:Organization` | UNVERIFIED | Canvas `Practitioner` exposes qualifications; whether it exposes an employing-organization reference readable in one call is not documented. Cheapest honest source is Aleron's own auth claim (Entra), which is not patient data. |
| I5 | Inbox count `7` | `Canvas FHIR:Task` search, cross-patient: `?owner=Practitioner/{id}&status=requested&_count=1` → `Bundle.total` | OK | Newly verified: Task search does not require a patient. One call, no rows fetched. |
| I6 | Panel count `146` | `Canvas FHIR:Patient` search, cross-patient: `?_has:CareTeam:participant:member=Practitioner/{id}&_count=1` → `Bundle.total` | OK | Newly verified. Presupposes Aleron's panel assignment is modelled as Canvas CareTeam membership, which is a design decision the screens do not state. |
| I7 | Reviews count `3` | `Aleron` | GAP | A "release package" with a hash is an Aleron artefact. Canvas `DocumentReference` search has no author parameter, so you cannot ask Canvas for "packages this physician released". |
| I8 | Messages count `2` | `Canvas FHIR:Communication` search | UNVERIFIED | Communication is create/read/search in the matrix; whether its search accepts a recipient/sender parameter without a patient is undocumented. If it does not, this count needs an Aleron-side or per-patient sweep. |
| I9 | `Practice standing orders` link | `NONE` (static route) | OK | No data. |
| I10 | `Dr. A. Okafor` (rail foot actor) | Same as I3 | OK | Duplicate of I3 in the same rail; a defect of composition, not of sourcing. |
| I11 | `Log out` | `Aleron` (Entra session) | OK | Not patient data. |

### Region B — header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| I12 | `Inbox` (h1) | static | OK | |
| I13 | `Refreshed 09:14, 31 Aug 2026` | `Derived` (client clock at fetch completion) | OK | Honest only if it stamps the completion of the Task+Patient fetch, not page load. With two calls plus per-row enrichment the two differ by seconds. |
| I14 | "Work waiting on you, ordered by where each patient sits in the lifecycle…" | static copy | OK | Asserts a sort the API cannot perform server-side; see I24. |

### Region C — counts strip

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| I15 | `Ready for review` **3** | `Canvas FHIR:Task` cross-patient `?owner=…&label=Review%20pending&_count=1` → `total` | OK | Newly verified: `label` is a searchable free-text parameter and Canvas creates unknown labels on write. One call, no rows. |
| I16 | `Review started` **2** | same, `label=Plan editing` | GAP | The state word exists in `LIFECYCLE_RANK` as `Plan editing`, but the tile says **Review started**. Two vocabularies for one state; only one can be the label. See Required change 6. |
| I17 | `Blocked or on hold` **1** | same, `label` in {`Signature blocked`, `Physician hold`} | WRONG | The tile reads 1, but the list below carries two rows in those states (Priya `Signature blocked`, Tomas `Physician hold`). The screen contradicts itself. Also needs OR-on-repeat-param (`label=a,b`), which Canvas does not document — otherwise 2 calls and a sum. |
| I18 | `blocked` hazard tile beside I17 | `Aleron` (validation outcome) | GAP | See I36. |
| I19 | `Awaiting results` **1** | `Junction:GET /v3/orders?status[]=received,collecting_sample,sample_with_lab&size=1` → `total` | GAP | Newly verified that the call exists and returns a `total`. But it is **team-wide**: Junction has no per-physician filter, `physician` on an order is a write-only name/NPI block, not a query parameter. A single-physician count needs the patient set first, then `user_id` filtering, which is N calls. |

### Region D — filter bar and sort

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| I20 | Tab `Needs me` badge **7** | `Canvas FHIR:Task` cross-patient `?owner=…&status=requested&_count=1` → `total` | OK | Provided "needs me" is exactly "an open Task assigned to me". |
| I21 | Tab `Waiting` badge **12** | `Aleron` + `Junction:GET /v3/orders` | GAP | "Waiting on something else" is the absence of a physician-actionable Task plus the presence of an open external dependency. No single call returns it. Requires the panel set minus the Task set, intersected with open Junction orders. |
| I22 | `All 146 on Panel →` | Same as I6 | OK | |
| I23 | Sort select: `Lifecycle rank` / `Waiting longest` / `Waiting shortest` / `Patient name` / `Custom order` | `Derived` (client-side over the fetched page) | GAP | `Task._sort` supports only `_id` and `due-date`. Nothing server-side sorts by lifecycle rank, by wait, or by patient name. Correct only while the whole queue fits one `_count=100` page. |
| I24 | Sort note `Lifecycle rank, then the longest wait first.` | `Aleron` (rank table) | OK | The rank table is Aleron product policy, not patient data. Correctly a fixture in the script. |
| I25 | `Custom order` drag arrangement | `NONE` | OK | The screen's own annotation is correct and verified: `Task.priority` accepts only `stat`, `urgent`, `routine` — three buckets, not a total order. Correctly declared unpersisted. |

### Region E — "Needs me" section furniture

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| I26 | `Needs me` (h2) | static | OK | |
| I27 | `Seven items. Each names the act it is waiting for.` | `Derived` (count spelled in prose) | WRONG | A hardcoded word for a live count. It agrees with I20 today and will not tomorrow. |
| I28 | Column header row: Patient / Lifecycle state / What is waiting / Waiting / Next act | static | OK | |

### Region F — queue rows (7 rows)

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| I29 | Patient name (`Ethan Park`, `Daniel Whitfield`, `Mara Chen`, `Helena Vasquez`, `Priya Raghunathan`, `Tomas Lindqvist`, `Ana Beatriz Rocha`) | `Canvas FHIR:Patient.name`, cross-patient via `_has:CareTeam:participant:member` | OK | One call for all seven. Joining to Task rows is client-side on `Task.for`. |
| I30 | Patient code (`AL-47M`, `AL-61M`, `AL-56F`, `AL-58F`, `AL-44F`, `AL-52M`, `AL-49F`) | `Canvas FHIR:Patient.identifier` (Aleron system), searchable; writable via `Canvas SDK:CREATE_PATIENT_EXTERNAL_IDENTIFIER` | OK | Returned in the same Patient bundle. |
| I31 | Age and sex (`47M`, `61M`, `56F`, `58F`, `44F`, `52M`, `49F`) | `Derived` from `Patient.birthDate` + `Patient.gender` | WRONG | Not the derivation — the **code**. `AL-47M` encodes the age at enrolment. On Ethan Park's 48th birthday the row reads `AL-47M · 48M` and the identifier contradicts the value beside it. An immutable identifier must not embed a mutable attribute. |
| I32 | Lifecycle state word (`Review pending` ×2, `Plan editing`, `Ready for signature`, `Signature blocked`, `Physician hold`, `Monitoring update requires review`) | `Canvas FHIR:Task.input` label, cross-patient searchable via `label=` | GAP | Newly verified as workable. It is a gap not because it cannot be done but because it is free text in a foreign system: no enum, no validation, and `LIFECYCLE_RANK` falls to 99 on any drift. |
| I33 | `What is waiting` sentence (7 distinct) | mixed — see I34–I40 | GAP | As a *carrier* it is `Task.description` or `Task.note`, which the Task bundle already returns. What it must contain is the problem. |
| I34 | Ethan Park: "Packet frozen, engine run complete. Metabolic **34 %** 10-yr T2D, and an ATM P/LP on the required channel." | `Aleron` (packet freeze + SPAR run) + `Canvas FHIR:Observation` (genomic) for the ATM finding | GAP | The `34 %` is engine output with no Canvas home. Genomic P/LP: Observation is readable but its search is patient-scoped, so a cross-patient "who has a P/LP" question does not exist. Both must be denormalized into the Task text at write time. |
| I35 | Daniel Whitfield: "Cardiovascular **24 %** 30-yr ASCVD. Coronary calcium gate resulted overnight." | `Aleron` (24 %) + `Canvas FHIR:DiagnosticReport` (read-only) for the CAC result | GAP | **Junction cannot be the source of a coronary calcium score.** Junction is labs only: no imaging, no radiology. The gate must be a Canvas `ImagingOrder` command resulting into a read-only `DiagnosticReport`, whose search is patient-scoped. "Resulted overnight" therefore has no cross-patient watch. |
| I36 | Mara Chen: "You have three problems drafted. Preview note not yet generated." | `Aleron` | NONE | A draft that has not been written is by definition not in Canvas. `CREATE_NOTE` without `SIGN_NOTE` would put it there, but the screen's own state is `Plan editing`, i.e. before that. This is Aleron-held in-flight work with patient content in it — the sharpest instance of the storage tension on either screen. |
| I37 | Helena Vasquez: "Preview generated and hashed. Four visible actions, one hold resolved." | `Aleron` | NONE | The hash is an Aleron release-package artefact. Nothing in Canvas or Junction models it. |
| I38 | Priya Raghunathan: `blocked` tile + "Two visible recommendations have no provenance. Release validation fails until both carry one." | `Aleron` (release validator) | NONE | Purely Aleron workflow. Carriable as `Task.note` + a `blocked` label. |
| I39 | Tomas Lindqvist: "You placed a hold pending the hepatology opinion. Hold copy released to the patient on 24 Aug." | `Aleron` (hold) + `Canvas SDK:Refer` command (the hepatology referral) | GAP | The hold and the patient-facing copy are Aleron. The referral is a real Canvas act (`Refer`, originate + sign). Nothing links them, and there is no cross-patient "referrals awaiting a consult note" query. |
| I40 | Ana Beatriz Rocha: "Wearable delta crossed the alert threshold: resting heart rate up **11 bpm** against her own baseline over 14 days." | `Junction:` Sense continuous query → `get-result-table`, plus the `continuous_query.result_table.changed` webhook | OK | **Newly verified and the best-sourced value on either screen.** Sense aggregates device data across users into a result table and pushes changes by webhook, so this alert genuinely arrives without polling per patient. The 14-day baseline window is a query definition, not a per-patient computation. |
| I41 | Waiting duration (`2 d`, `4 d`, `6 h`, `1 d`, `3 d`, `7 d`, `9 h`) | `Derived` from `Canvas FHIR:Task.authoredOn` (or `meta.lastUpdated` / the `modified` search param) | GAP | Correct only if Aleron closes one Task and opens another on every state change; otherwise `authoredOn` measures time in the queue, not time in the state, and "held 7 days" becomes a different claim. `_sort` cannot order by it. |
| I42 | Next act button label (`Start review` ×2, `Resume`, `Preview`, `Open blocker`, `Review hold`, `Open`) | `Derived` from I32 via Aleron's state→act table | OK | The disclosure states this explicitly and it is right: the label is a pure function of the state. No API. |
| I43 | Row link target (`patient-data.html` ×2, `care-plan.html` ×4, `patient-data.html`) | `Derived` from I32 | OK | Same mapping. |
| I44 | Drag handle per row | `NONE` | OK | See I25. |

### Region G — "Waiting on something else"

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| I45 | `Waiting on something else` (h2) | static | OK | |
| I46 | `Visible so a stalled patient cannot go quiet. No act is available yet.` | static | OK | |
| I47 | `Marcus Bell` / `AL-39M · 39M` | Same as I29–I31 | OK | But Marcus is not in the CareTeam-derived Task set (no open physician Task), so he arrives from the Patient panel query, not the Task query. Two different fetches feed one visual list. |
| I48 | `Results partially received` | `Derived` from `Junction:order.status` across two orders | GAP | Junction statuses are per order (`received`, `collecting_sample`, `sample_with_lab`, `completed`, `cancelled`, `failed`). "Partially" is Aleron's roll-up across an order set. Computable from one `GET /v3/orders?user_id=…` call once you know the Junction `user_id`. |
| I49 | "Blood panel resulted. Genetics kit not returned to the lab since it shipped on 12 Aug." | `Junction:orders[].status` + `orders[].events[].created_at` + `order_type=testkit` | UNVERIFIED | The call and the shape are verified. What is not: whether a genetics kit is a Junction lab test at all. Ground truth fixes Junction's scope at labs; a germline panel as a `testkit` order is plausible but unconfirmed, and if it is not Junction then this row has no source at all. |
| I50 | `19 d` | `Derived` from the Junction order's `created_at` / shipping event | OK | `GET /v3/orders` returns `events[]` with timestamps and supports `order_key=created_at`. |
| I51 | `Ops follow-up` | `Derived` (Aleron: no physician act permitted in this state) | OK | Correctly rendered as text, not a button. |
| I52 | `1 of 12 waiting patients is carried as a fixture.` | `NONE` (reviewer scaffolding) | WRONG | This is wireframe bookkeeping rendered inside the product surface in a `role="status"` region, not in a `wf-scaffold` note. A physician would read it as a data-completeness warning about their queue. |

### Region H — disclosure "Where these states come from"

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| I53 | "Every word in the lifecycle column is a state in the Role and Release Matrix v1 section 4…" | static | OK | |
| I54 | `Source` → `docs/product/ROLE_AND_RELEASE_MATRIX_V1.md` section 4 | `NONE` | WRONG | An internal repository path in front of a physician. The BRIEF forbids putting the API on a product surface for exactly this reason; a source-control path is the same failure with a different vocabulary. |
| I55 | `Queue` → "Physician work items, assigned. Ops-only states are filtered out." | `Derived` | OK | Accurate description of `?owner=…&status=requested`. |
| I56 | `Sort` → "Lifecycle rank, then wait duration descending" | `Aleron` | OK | See I23 for what the server can and cannot do. |
| I57 | `Not shown` → enrolment, invitation and onboarding states | `Aleron` | OK | Correct and useful. These states precede any Canvas Task, so their absence is structural rather than a filter. |

---

## Data points — panel

Rail: identical markup to the inbox. Verdicts as **I1–I11**, not re-counted.

### Region A — header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| P1 | `Panel` (h1) | static | OK | |
| P2 | `146 patients assigned to you` | `Canvas FHIR:Patient?_has:CareTeam:participant:member=Practitioner/{id}&_count=1` → `Bundle.total` | OK | Newly verified. One call, no rows. |
| P3 | "Everyone on your list, including the ones with nothing waiting…" | static | OK | |

### Region B — tools

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| P4 | Search field, placeholder `Ethan Park, AL-47M` | `Canvas FHIR:Patient?name=` / `?identifier=`, cross-patient | UNVERIFIED | Each parameter works alone. Whether Canvas permits `name` **and** `_has:CareTeam:participant:member` in the same query — required to scope search to this physician's panel — is not documented. If not, search returns the whole practice and Aleron must filter client-side against a 146-id set. |
| P5 | Sort select: `Lifecycle rank` / `Held longest` / `Held shortest` / `Patient name` / `Custom order` | `Derived`, client-side | GAP | Worse than the inbox's version: the panel is 146 rows and `_count` caps at 100, so no client-side sort is correct until two pages are fetched. The control sorts the 9 loaded rows and presents the result as if it ranked 146. |
| P6 | Sort note `Lifecycle rank, then the longest held first.` | `Aleron` | OK | |
| P7 | Row density: `Lifecycle only` / `With risk by domain` (checked) | `Aleron` (view preference) | WRONG | Not the control — the **default**. `With risk by domain` is `aria-checked="true"` in the markup, so the panel's first paint demands 9 SPAR runs. See Required change 1. |

### Region C — module head and columns

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| P8 | `Assigned panel` (h2) | static | OK | |
| P9 | `Showing 9 of 146` | `Derived` (page size + `Bundle.total`) | OK | |
| P10 | Column header row: Patient / Program / Lifecycle state / Last run / Next act | static | OK | |

### Region D — cohort rows (9 rows)

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| P11 | Patient name ×9 (`Ethan Park`, `Mara Chen`, `Helena Vasquez`, `Priya Raghunathan`, `Tomas Lindqvist`, `Ana Beatriz Rocha`, `Marcus Bell`, `Joseph Ferreira`, `Grace Okonjo`) | `Canvas FHIR:Patient` cross-patient reverse-chain | OK | One call for the page. |
| P12 | Patient code ×9 | `Canvas FHIR:Patient.identifier` | OK | |
| P13 | Age and sex ×9 | `Derived` from `birthDate` + `gender` | WRONG | Same defect as I31: the code embeds an age that will drift from the value next to it. |
| P14 | `Longevity core` ×9 | `Aleron` (program enrolment) | GAP | Canvas has no program-enrolment concept. Nearest homes are a `Group` (`type: person`, but searchable only by `_id` and `type`, so it cannot answer "which program is this patient in") or `UPSERT_PATIENT_METADATA` (per-patient, not searchable). Neither supports a cross-patient read. |
| P15 | `with genetics` ×6 / `genetics declined` ×3 | `Canvas FHIR:Consent` (create/read/search) | UNVERIFIED | Consent is searchable per the matrix; whether its search accepts a category/scope filter without a patient is undocumented. If it does, this is one cross-patient call; if not, it is 9. |
| P16 | Lifecycle state ×9 (`Physician review pending`, `Plan editing`, `Plan ready for signature`, `Signature blocked`, `Physician hold`, `Monitoring update requires review`, `Results partially received`, `Patient plan available`, `Action tracking active`) | `Canvas FHIR:Task.input` label | GAP | Same as I32. **Three of these nine states are not physician-actionable** (`Results partially received`, `Patient plan available`, `Action tracking active`), so by the inbox's own rule they have no open physician Task. They must either be Tasks owned by someone else, or they come from elsewhere entirely, and the panel does not say which. |
| P17 | `blocked` hazard tile on Priya | `Aleron` | GAP | Same as I18/I38. |
| P18 | `Last run` ×8 (`2 d ago`, `6 h ago`, `1 d ago`, `3 d ago`, `7 d ago`, `9 h ago`, `12 d ago`, `21 d ago`) | `Aleron` (SPAR engine run timestamp) | NONE | There is no Canvas resource for "when Aleron last ran its engine". `UPSERT_PATIENT_METADATA` can store it per patient but cannot list it, so populating this column is 9 per-patient metadata reads, or an Aleron-side record. |
| P19 | `no run` (Marcus Bell) | `Aleron` | OK | Correct P7 behaviour: declared, not blank. The sort correctly floats it to last. |
| P20 | Next act button ×6 (`Start review`, `Resume`, `Preview`, `Open blocker`, `Review hold`, `Open`) | `Derived` from P16 | OK | |
| P21 | `Ops follow-up` (Marcus Bell) | `Derived` | OK | |
| P22 | `Read receipt 26 Aug` (Joseph Ferreira) | `Aleron` (member app telemetry) | NONE | Canvas has portal effects (`PATIENT_PORTAL__SEND_INVITE`, `PORTAL_WIDGET`) but no read-receipt read API, and the plan the patient reads is Aleron's release, not a Canvas document. Nothing in either system records that a patient opened it. |
| P23 | `4 of 6 actions started` (Grace Okonjo) | `Aleron` (action tracking) | GAP | Nearest Canvas home is `Goal` via the SDK `Goal` command with `achievement_status`. But FHIR `Goal` is read-only and its search is patient-scoped, so a cross-patient "4 of 6" is 9 per-patient Goal searches. |
| P24 | `Risk by domain` label ×9 | static | OK | |
| P25 | Domain tier ×6 per row (`CVD moderate`, `CKD low`, `CAN moderate`, `MET high`, `NEU moderate`, `SYS moderate`, …) — 48 values across 8 rows | `Aleron` (SPAR engine) | NONE | **The single largest problem on either screen.** No Canvas resource holds a risk tier: `Observation` has no update and its create is restricted to vitals/panel-shaped categories, `CarePlan` and `Goal` are read-only in FHIR, `DetectedIssue` is create/read/update/search but is a clinical decision-support flag, not a graded domain score, and its search is patient-scoped. `UPSERT_PATIENT_METADATA` stores but does not list. Populating the default panel view means 9 engine runs plus each run's own packet reads. |
| P26 | `insufficient data` ×6 (Marcus Bell) | `Derived` (packet incomplete) | OK | Correct P7 behaviour and the right word: not `low`. Cheap, because it is the absence of a run rather than a run. |
| P27 | Row link target (`patient-data.html` ×3, `care-plan.html` ×4, `journal.html` ×2) | `Derived` from P16 | OK | |
| P28 | Drag handle ×9 | `NONE` | OK | Same as I25. |

### Region E — pagination

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| P29 | `137 more patients on this panel, all in states with no physician act outstanding.` | `Derived` (`Bundle.total` − page) | WRONG | The arithmetic is fine; the claim is false. Four of the nine rows already shown carry no outstanding physician act, and the inbox says seven patients need one — so the remaining 137 cannot all be actless unless the inbox's own count is wrong. The sentence asserts something about 137 unfetched rows that the screen has not checked. |
| P30 | `Load next 25` | `Canvas FHIR:Patient?…&_count=25&_offset=9` | GAP | The Patient call is fine. At the shipped density it also triggers 25 more SPAR runs. |

### Region F — disclosure

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| P31 | "The inbox is filtered to states whose *Physician visible* column… permits an act…" | static | OK | |
| P32 | `Source` → `docs/product/ROLE_AND_RELEASE_MATRIX_V1.md` section 4 | `NONE` | WRONG | Same defect as I54. |
| P33 | `Panel` → "Patients assigned to this physician, all lifecycle states" | `Derived` | OK | Accurate description of the reverse-chain query, provided assignment is CareTeam membership. |
| P34 | `Domains` → Cardiovascular, kidney, cancer, metabolic, neurodegenerative, systemic | `Aleron` | OK | Product taxonomy, not patient data. |
| P35 | `Unmodelled` → shown as `insufficient data`, never as low | `Aleron` | OK | |

---

## Cross-patient query cost

| Screen region | Calls required to populate | Across how many patients | Note |
|---|---|---|---|
| Inbox rows, best case (Task adopted) | **2** — `GET /Task?owner=…&status=requested&_count=100`, `GET /Patient?_has:CareTeam:participant:member=…&_count=100` | 7 rows from 146 | Both are genuine cross-patient calls. Join client-side on `Task.for`. This is the whole argument for Task. |
| Inbox rows, without Task | **1 + 7 + 7** — panel query, then per-patient state, then per-patient Junction status | 7 | And "state" has nowhere to live per patient either, so this branch does not actually terminate. |
| Inbox four count tiles | **4** (`_count=1`, read `Bundle.total`) or **2** if Canvas honours comma-OR on `label` | 0 rows fetched | Counts never require fetching rows. Verified: every search Bundle carries `total`. |
| Inbox tab badges (7, 12) | **1** for `Needs me`; `Waiting` is not one call | 146 | `Waiting` = panel set minus Task set, intersected with open Junction orders. |
| Inbox rail badges (7, 146, 3, 2) | **2 verified + 2 unverified** | 0 rows fetched | Reviews and Messages have no confirmed cross-patient query. |
| Inbox "Awaiting results" | **1** team-wide (`GET /v3/orders?status[]=…&size=1`) or **N** per-physician | all Junction users, or 146 | Junction has no per-physician filter. `physician` is a write-only block on the order, not a query parameter. |
| Inbox `Waiting` section row | **1** Junction call once `user_id` is known; `user_id` mapping is Aleron's | 1 | Aleron must hold the Canvas-patient-id ↔ Junction-user-id mapping. That mapping is a patient identifier pair and is unavoidable. |
| Panel rows, lifecycle-only density | **2** — same two calls, `_count=25` | 9 of 146 | Cheap. This is what the default should be. |
| Panel rows, shipped density (risk by domain) | **2 + 9 engine runs**, each run reading that patient's full packet (labs, vitals, genetics, wearables) from Canvas and Junction | 9, expanding to 34 on one `Load next 25` | Realistically dozens of Canvas reads per patient. No cross-patient path exists for any risk tier. |
| Panel `Program` + genetics consent | **9** if Consent search is patient-scoped, **1** if not | 9 | Unverified either way. |
| Panel `Last run` column | **9** metadata reads, or Aleron holds it | 9 | `UPSERT_PATIENT_METADATA` writes but does not list. |
| Panel `4 of 6 actions started` | **1 per such row** (`Goal` search, patient-scoped) | 1 today, N in production | |
| Panel sort over 146 | **2 pages minimum** before any sort is correct | 146 | `_count` max 100; `Task._sort` supports only `_id` and `due-date`. |
| Panel search box | **1**, if `name` and `_has:` compose | 146 or the whole practice | If they do not compose, search leaks beyond the physician's panel and must be filtered client-side. |

---

## Required changes

1. **The panel's default density demands nine engine runs on first paint. (Large.)** `data-density="domain"` is `aria-checked="true"` in the shipped markup, and there is no cross-patient source for a risk tier. Flip the default to `Lifecycle only` and load the domain read per row on demand, or on an explicit "compute risk read" action. The control already exists; only the default and the fetch trigger change. Without this the panel cannot be built at all without a cached risk store, which is patient data.

2. **Adopt Canvas `Task` as the queue primitive, explicitly, in the annotations. (Large, but it is the design's load-bearing decision.)** One Task per patient-work-item: `for` = patient, `owner` = physician, `input` label = lifecycle state, `authoredOn` = state entry, `note` = the "what is waiting" sentence, `restriction.period.end` = the due date. Both screens currently imply an Aleron-side queue that the standing constraint forbids. Say Task, and say that Aleron closes one Task and opens another on every transition — otherwise the `Waiting` column measures the wrong interval.

3. **"Blocked or on hold **1**" contradicts two rows in blocked/hold states. (Small.)** Either the tile is 2, or the tile counts only `Signature blocked` and its label is wrong.

4. **"Seven items" is a hardcoded word for a live count. (Small.)** Render the number, or drop the count from the sentence.

5. **The patient code embeds age. (Medium, and it is a data-model decision, not a wireframe one.)** `AL-47M · 47M` will read `AL-47M · 48M` within a year and the identifier will be lying. Either the code loses the age and sex, or the row stops showing a derived age beside it. It is a Canvas `Patient.identifier` and identifiers do not get rewritten.

6. **Two names for one state. (Small.)** The inbox count tile says `Review started`; the row, the rank table and the panel all say `Plan editing` / `Physician review pending`. If lifecycle states become free-text Canvas labels, exactly one string per state must exist, because Canvas will silently create whichever one you send.

7. **The inbox and panel use different words for the same states. (Small.)** `Review pending` vs `Physician review pending`, `Ready for signature` vs `Plan ready for signature`. Two rank tables, two label vocabularies, one underlying state. Pick one; the label is a query key, not display copy.

8. **`1 of 12 waiting patients is carried as a fixture.` is reviewer text on the product surface. (Small.)** Move it into a `wf-scaffold` note. In a `role="status"` region it reads to a physician as a warning that their queue is incomplete.

9. **`docs/product/ROLE_AND_RELEASE_MATRIX_V1.md` section 4 appears on both product surfaces. (Small.)** A repo path is implementation detail in front of a clinician, which is the failure mode the BRIEF's `api-on-product-surface` rule exists to catch. Say "the Role and Release Matrix" in prose and put the path in an annotation.

10. **"137 more patients on this panel, all in states with no physician act outstanding" asserts what has not been fetched. (Small.)** Either compute it (`Bundle.total` for the actless label set) or say "137 more patients on this panel" and stop.

11. **Both sort controls sort a page and present it as a ranking. (Medium.)** `Task._sort` supports only `_id` and `due-date`, `_count` caps at 100, and the panel is 146. Either constrain the sorts to what the server can do, fetch both pages before enabling sort, or label the control as sorting the loaded rows.

12. **"Coronary calcium gate resulted overnight" cannot come from Junction. (Small, but it is the kind of error the ground truth exists to prevent.)** Junction is labs only. A CAC score is a Canvas `ImagingOrder` resulting into a read-only `DiagnosticReport` with a patient-scoped search, so "resulted overnight" has no cross-patient watch and must arrive as an Aleron-scheduled per-patient poll or a Canvas plugin `CronTask`.

13. **Confirm whether a germline genetics kit is a Junction order at all. (Medium.)** Marcus Bell's entire row depends on it. If genetics runs through a different vendor, the row's status, its `19 d` and the `Awaiting results` tile all lose their source.

---

## Alternative pathways

**I36 / I37 / I38 — in-flight plan drafts, the release hash, the provenance validator (`NONE`).**
These are Aleron's own workflow and there is nothing to redirect to: a draft that has not been signed is not in Canvas by definition. Nearest workable: `Canvas SDK:CREATE_NOTE` early (unsigned), so the draft lives in Canvas from the first keystroke and `SIGN_NOTE` is the commit act — the SDK ground truth confirms `SIGN_NOTE` exists, so this is available. Cost: a stream of half-written notes in the chart that clinicians will see in Canvas, and `Note` search has **no state filter**, so Aleron cannot even list its own drafts back. Cheaper alternative: keep drafts in Aleron for the editing session only, carry the *fact* of a draft as a Task label (`Plan editing`) with no clinical content in it, and let the Task's `note` say only "a plan is in progress" — the row then names a state without holding patient data. That is the version that respects the constraint, and it costs the row its informative sentence.

**I40 — kept, not replaced.** The Junction Sense continuous query is the right pathway and should be named in the annotation. It is the only place on either screen where a cross-patient signal arrives by push rather than poll.

**I52 / I54 / P32 — reviewer text and repo paths (`NONE`, `WRONG`).** Drop from the product surface into `wf-scaffold` / `wf-annotations`. Zero cost.

**I17 / I27 / P13 / P29 — self-contradicting or hardcoded values (`WRONG`).** Fix the fixture. Zero cost except P13, which is a data-model change to the patient code.

**P7 — the density default (`WRONG`).** Flip to `Lifecycle only` and make the risk read an explicit request. Cost: the panel's most distinctive column is one click away instead of visible. That is the correct trade, and the screen's own prose already argues for it ("a second question the physician sometimes asks of the same list").

**P18 — `Last run` (`NONE`).** Three options, in order of preference. (a) Write the engine-run timestamp into the Task that the run produces — `Task.authoredOn` on a `Review pending` task *is* the run time, so the column is free and needs no new storage. (b) `UPSERT_PATIENT_METADATA` per patient: stores it, but cannot list it, so the panel costs 9 reads. (c) Aleron holds a `{patient_id, last_run_at}` table — which is a patient identifier plus a timestamp, the minimum viable violation of the constraint. Option (a) is available today and costs nothing, and should be taken.

**P22 — `Read receipt 26 Aug` (`NONE`).** No Canvas or Junction surface records that a patient opened an Aleron-released plan. Options: (a) drop the column value and show the release date instead, which Aleron already knows and which is what the physician mostly needs; (b) hold read receipts in the member app's own telemetry, keyed by member id rather than Canvas patient id, which keeps the identifier out of Aleron; (c) write the receipt back as a `Canvas FHIR:Communication` (create/read/search) whose `sent`/`received` carries the timestamp — this is the only path that puts it in Canvas, but Communication has no update and its cross-patient search is unverified. Recommend (a) for the wireframe and (c) as the spike.

**P23 — `4 of 6 actions started` (`GAP`).** Redirect: the count is a roll-up of `Canvas SDK:Goal` commands with `achievement_status`, so the honest render is a link into the patient's chart rather than a number on a list row. If the number stays, it costs one patient-scoped `Goal` search per row.

**P25 — the six-domain risk read (`NONE`).** No workaround makes this a cross-patient read. The genuine options, all with costs: (a) **drop it from the list** and keep the risk read inside the chart where the model provenance can be qualified — the disclosure already concedes this is where the claim belongs; (b) **compute lazily per visible row**, which is Required change 1 and keeps the column at the price of a visible load per row; (c) **redirect into the chart** with a per-row "risk read" affordance; (d) **cache tiers in Aleron** keyed by Canvas patient id, which is the one that breaks the constraint outright — it stores derived clinical inference about a named patient, and it goes stale silently the moment a lab result lands, so a physician scans a list of tiers that no longer describe anyone. (d) should be refused, not priced.

**I19 / P14 / P15 — team-wide Junction counts, program, genetics consent (`GAP` / `UNVERIFIED`).** Junction's `GET /v3/orders` has no physician filter, so a per-physician "awaiting results" needs the 146-patient set first and then either `user_id` filtering (N calls) or a client-side intersection against one team-wide page. The team-wide page is one call and is the right shape, provided the practice is one Junction team. Program enrolment has no Canvas home worth using — `Group` cannot be searched by membership and metadata cannot be listed — so the program name is the one field on the panel that legitimately argues for Aleron holding something, and it holds no clinical content.

**I25 / P28 — custom order (`NONE`).** The screens' own annotation is correct and is now verified: `Task.priority` is exactly `stat` / `urgent` / `routine`. Keep it unpersisted and per-viewer. If persistence is ever wanted, `Task.input` labels are free text and auto-created, so a `rank:007` label is technically a total order — but it writes a physician's private triage order into the shared chart where every other clinician sees it, which is worse than not saving it.

---

## Contradictions with what the screens already claim

**The blocked count disagrees with the list beneath it.** `inbox.html` shows

> `Blocked or on hold` … `1` `blocked`

directly above two rows in exactly those states: Priya Raghunathan, `Signature blocked`, and Tomas Lindqvist, `Physician hold`. If the tile counts both states, it is 2. If it counts only one, the label names two.

**"Seven items" is a word where a count belongs.** `inbox.html`:

> Seven items. Each names the act it is waiting for.

The tab badge beside it is a live `7`. The two agree only by coincidence of the fixture.

**The two screens name the same states differently.** `inbox.html` ranks `"Review pending"`, `"Ready for signature"`; `panel.html` ranks `"Physician review pending"`, `"Plan ready for signature"`. Both claim the same provenance:

> every state word here is a literal from Role and Release Matrix v1 section 4

They cannot both be literals from one section. Once these strings become Canvas Task labels, which Canvas creates on demand from whatever you send, the divergence stops being cosmetic.

**The panel asserts a property of rows it has not fetched.** `panel.html`:

> 137 more patients on this panel, all in states with no physician act outstanding.

The inbox says seven patients need an act; four of the nine rows already rendered on the panel need none. The sentence is a claim about 146 − 9 unfetched rows, and nothing on the screen has checked it.

**The panel's own prose argues against its own default.** `panel.html`:

> the risk read is a second question the physician sometimes asks of the same list

and yet `With risk by domain` ships `aria-checked="true"`, so the sometimes-asked question is asked nine times on every load.

**The inbox correctly refuses to invent a priority, and is right.** `inbox.html`:

> There is no single priority field to sort on, and that is deliberate… the nearest field is `Task.priority`, which accepts only `stat`, `urgent` and `routine`

Verified against the live docs. This annotation is accurate, and it is the one place on either screen where an API constraint was checked rather than assumed.

**One screen surfaces its own scaffolding as product data.** `inbox.html` renders, inside `.pwrap` in a `role="status"` live region:

> 1 of 12 waiting patients is carried as a fixture.

---

## Open questions for the humans

1. **Is Aleron's panel assignment modelled as Canvas `CareTeam` membership?** Everything cross-patient on both screens hangs off `_has:CareTeam:participant:member=Practitioner/{id}`. If assignment lives anywhere else, there is no cross-patient panel query at all and the panel becomes an Aleron index by necessity.

2. **Will Aleron own Canvas `Task`, or will Canvas users also create tasks?** If clinic staff use Canvas Tasks natively, Aleron's label vocabulary shares a namespace with theirs, and `?owner=X&status=requested` returns their work alongside Aleron's. A `task-group` extension pointing at a Canvas `Group` could partition it — needs confirming that the extension is filterable in search, which the docs do not say.

3. **Does Canvas accept comma-OR on repeat search parameters** (`label=a,b,c`, `_id=x,y,z`)? Four count tiles, the `Needs me` badge and any batch patient fetch all collapse from N calls to 1 if it does. Standard FHIR says yes; Canvas documents neither way.

4. **Do `name` / `identifier` compose with `_has:CareTeam:participant:member` on Patient search?** If not, the panel's search box queries the whole practice and needs client-side filtering against the physician's 146 ids.

5. **Is a germline genetics kit a Junction order?** Ground truth fixes Junction at labs only. Marcus Bell's row, the `Awaiting results` tile and `Results partially received` all depend on the answer.

6. **Is the practice one Junction team?** `GET /v3/orders` is team-scoped with no physician filter. If one team spans multiple physicians, every Junction-derived count on the inbox is either practice-wide or needs a per-patient join.

7. **Where does the coronary calcium result arrive from, and how does Aleron learn it landed?** Canvas `DiagnosticReport` is read-only with patient-scoped search and there is no webhook named in the ground truth. A plugin `CronTask` polling 146 patients is the fallback; is that acceptable?

8. **Is a per-physician triage order patient data?** The inbox annotation raises it and leaves it open. The answer generalises: it is the same question as whether `{patient_id, last_run_at}` may live in Aleron, and it should be answered once for the class rather than per field.

9. **Does a physician see Aleron's Tasks inside Canvas's own Tasks UI, and is that acceptable?** Neither screen accounts for the queue existing in two places with two vocabularies.

10. **What happens to a lifecycle state when a Canvas user closes the Task by hand?** Canvas Task `status` is `requested` / `completed` / `cancelled` and is writable from the Canvas UI. Aleron's lifecycle would then have been advanced by someone outside Aleron, with no event to tell it.
