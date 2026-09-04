# Which Canvas write surfaces can an external app reach?

**One-line answer:** Effects **and** CommandAPI are both plugin-side — a standalone external web app with OAuth credentials can reach neither directly; the only externally-callable write surfaces are the FHIR API, three non-FHIR "custom" APIs (Note, Letter, CCDA) and the `$create-lab-report` operation, so an external caller gets *no* metadata write at all and must either deploy a plugin (which then exposes its own HTTP endpoints, authenticated by API key/basic/session — not OAuth) or store Aleron-owned facts in FHIR `Patient.identifier`.

The load-bearing quote, from `https://docs.canvasmedical.com/sdk/commands/`:

> "Commands are written from event handlers by default. To let something outside Canvas write them — a patient-facing form, a device, an internal tool — expose them over HTTP with `CommandAPI`."

`CommandAPI` is a class **you subclass inside a plugin**. It is not a Canvas-hosted OAuth endpoint. Its routes live at `/plugin-io/api/<plugin_name>/<PREFIX>/<path>` and only exist once your plugin is installed.

## Verdict table

### Commands (CommandAPI)

| Mechanism | External-callable? | Evidence (URL + quote) |
|---|---|---|
| `CommandAPI` as a Canvas-provided OAuth HTTP API | **NO — PLUGIN-ONLY** to define; externally callable only *after* you deploy the plugin | `https://docs.canvasmedical.com/sdk/commands/`: "Commands are written from event handlers by default. To let something outside Canvas write them … expose them over HTTP with `CommandAPI`, which reads a request body onto any command on this page, validates it, and emits the effects." |
| `CommandAPI` OAuth scopes | **None — no OAuth** | `https://docs.canvasmedical.com/guides/writing-commands-over-http/` — auth is chosen by mixin, not OAuth: `StaffSessionAuthMixin`, `PatientSessionAuthMixin`, `APIKeyAuthMixin`, `BasicAuthMixin`. No OAuth scope is documented anywhere for CommandAPI or for the commands module. |
| Route URL shape | n/a | `https://docs.canvasmedical.com/sdk/handlers-simple-api-http/`: "https://\<instance-name\>.canvasmedical.com/plugin-io/api/\<plugin-name\>/\<PATH\>" |
| `originate()` | PLUGIN-ONLY (same as above) | `https://docs.canvasmedical.com/sdk/commands/`: "Not every command supports every method. `originate` is the only one they all have." |
| `edit()`, `commit()`, `delete()`, `review()`, `enter_in_error()`, `upsert_metadata()` | PLUGIN-ONLY | same page — all are methods on the SDK command classes, which return Effects |
| `sign()` | PLUGIN-ONLY. Documented for ImagingOrder / Refer (staged → committed) | `https://docs.canvasmedical.com/sdk/commands/` |
| `send()` | PLUGIN-ONLY. Documented for signed LabOrder, Prescribe, Refill, AdjustPrescription | `https://docs.canvasmedical.com/sdk/commands/` |
| `delegate()` | PLUGIN-ONLY. Documented for ImagingOrder / Refer (creates a task) | `https://docs.canvasmedical.com/sdk/commands/` |
| `Diagnose` | PLUGIN-ONLY as a command. **Partial external equivalent: `POST /Condition`** | `https://docs.canvasmedical.com/api/condition/`: "If `clinicalStatus` is **active**, the Condition will be added as a `Diagnose` command." `PUT /Condition/{id}` is restricted to marking entered-in-error. |
| `Assess` | PLUGIN-ONLY. No external equivalent found | not in the `/api/` resource list (`https://docs.canvasmedical.com/api/`) |
| `Plan` | PLUGIN-ONLY. `CarePlan` is read/search only | `https://docs.canvasmedical.com/api/careplan/` |
| `Goal` | PLUGIN-ONLY. FHIR Goal is **read + search only** | `https://docs.canvasmedical.com/api/goal/`: only "get /Goal/{id}" and "get /Goal"; "To learn more about how to create goals within the Canvas UI see this Zendesk article" |
| `Task` | **Not a command at all.** There is no `Task` command in the commands module. Externally: **`POST /Task` and `PUT /Task/{id}` work** | commands list at `https://docs.canvasmedical.com/sdk/commands/` (AdjustPrescription, Allergy, Assess, ChangeMedication, ChartSectionReview, CloseGoal, Diagnose, FamilyHistory, FollowUp, Goal, HistoryOfPresentIllness, ImagingOrder, ImagingReview, ImmunizationStatement, Immunize, Instruct, LabOrder, LabReview, MedicalHistory, MedicationStatement, SurgicalHistory, Perform, Plan, POCLabTest, Prescribe, PhysicalExam, Questionnaire — no Task); `https://docs.canvasmedical.com/api/task/`: "Create a task. Tasks created through this FHIR Endpoint will display in the patient chart via the tasks icon." |
| `Refer` | PLUGIN-ONLY. `ServiceRequest` is **read + search only** | `https://docs.canvasmedical.com/api/servicerequest/`: only "ServiceRequest Read" and "ServiceRequest Search" |
| `ImagingOrder` | PLUGIN-ONLY. `ServiceRequest` read-only, as above | `https://docs.canvasmedical.com/api/servicerequest/` |
| `LabOrder` | PLUGIN-ONLY. No external lab-*order* write found (lab *results* are a different story — see `$create-lab-report`) | `https://docs.canvasmedical.com/api/servicerequest/`, `https://docs.canvasmedical.com/api/` |
| `Prescribe` | PLUGIN-ONLY. `MedicationRequest` is **read + search only** | `https://docs.canvasmedical.com/api/medicationrequest/`: "MedicationRequest maps to the Prescribe, Refill, Adjust Prescription, Deny Refill, Approve Refill commands in Canvas" — with only GET endpoints documented |

### Effects

All of these are effect types listed on `https://docs.canvasmedical.com/sdk/effects/`, which states:

> "Effects are instructions that plugins can return in order to perform an action in the Canvas EMR."

> "Effects are returned as a list from the `compute` method of a plugin that inherits from `BaseHandler`."

So every one is **PLUGIN-ONLY**. The nuance that matters (see "Where my hypothesis was wrong") is that plugin *HTTP routes* may also return effects — `https://docs.canvasmedical.com/sdk/handlers-simple-api-http/`: "Endpoint handlers may return zero or one response objects and any number of Effects." — and so may `CronTask.execute` (`https://docs.canvasmedical.com/sdk/handlers-crontask/`: "returning a list containing any effects you want to return"). Effects are therefore reachable over HTTP, but only through HTTP surface *you* deploy inside Canvas.

| Effect | External-callable? | External equivalent, if any |
|---|---|---|
| `CREATE_NOTE` | PLUGIN-ONLY as an effect | **YES via Note API**: `POST /core/api/notes/v1/Note`, scope `user/Note.write` — "The effect of creating a note is the same as creating a note in the user interface." (`https://docs.canvasmedical.com/api/note/`) |
| `UPDATE_NOTE` | PLUGIN-ONLY as an effect | **YES**: `PATCH /core/api/notes/v1/Note/{noteKey}`, scope `user/Note.write` |
| `SIGN_NOTE` | PLUGIN-ONLY as an effect | **YES, partially**: the Note API's `stateChange` supports lock/sign transitions (`https://docs.canvasmedical.com/guides/note-management-oauth/` documents "Lock Note", "Sign Note", "Lock and Sign Note", "Unlock Note", "Check In", "No Show") |
| `UPSERT_NOTE_METADATA` | **PLUGIN-ONLY. No external equivalent.** | none — see next section |
| `UPSERT_PATIENT_METADATA` | **PLUGIN-ONLY. No external equivalent.** | none — closest is `Patient.identifier`, see next section |
| `CREATE_PATIENT_EXTERNAL_IDENTIFIER` | PLUGIN-ONLY as an effect | **YES via FHIR Patient `identifier`** on `POST /Patient` / `PUT /Patient/{id}` (`https://docs.canvasmedical.com/api/patient/`): "External identifiers for this patient. None of these identifiers are surfaced on the patient chart, but they may help you correlate the Canvas patient with records in your own systems." |
| `CREATE_LAB_REPORT` | PLUGIN-ONLY as an effect | **YES via a real external operation**: `POST /DiagnosticReport/$create-lab-report`, scopes `system/DiagnosticReport.create-lab-report` / `user/DiagnosticReport.create-lab-report` — "Creates a lab report, lab tests, lab values, and a stored PDF in Canvas." (`https://docs.canvasmedical.com/api/diagnosticreport-operations/`) |
| `ATTACH_LAB_REPORT_RESULTS` | PLUGIN-ONLY | Partly folded into `$create-lab-report` (it takes `labTestCollection` parameters with tests/values and abnormal interpretation codes). No separate external attach-to-existing-report endpoint found. |
| `UPDATE_LAB_REPORT` | PLUGIN-ONLY | **None.** `DiagnosticReport` itself is read + search only (`https://docs.canvasmedical.com/api/diagnosticreport/`) |
| `CREATE_OBSERVATION` | PLUGIN-ONLY as an effect | **YES but heavily constrained**: `POST /Observation` — "Although the observation endpoint houses many different Canvas models, currently, only vital signs and panels can be created through this endpoint." Codes outside the documented LOINC table are "rejected with a 405 and the message `Sign is not supported by Canvas`"; supplemental oxygen (88658-0) "can only be captured through the Vitals command in Canvas." (`https://docs.canvasmedical.com/api/observation/`) |
| `UPDATE_OBSERVATION` | PLUGIN-ONLY | **None** — no PUT/PATCH documented on `/Observation` |
| `ADD_BANNER_ALERT` | PLUGIN-ONLY | None. UI surface, no REST analogue. |
| `ADD_OR_UPDATE_PROTOCOL_CARD` | PLUGIN-ONLY | None. |
| `SHOW_ACTION_BUTTON` | PLUGIN-ONLY | None. It is a UI-registration effect returned from an ActionButton handler. |
| `LaunchModalEffect` | PLUGIN-ONLY | None. Imported from `canvas_sdk.effects.launch_modal` and returned from an Application's `on_open` method; targets `DEFAULT_MODAL`, `NEW_WINDOW`, `PAGE`, `RIGHT_CHART_PANE`. This is the hook by which a plugin *embeds your external web app in the Canvas UI* — see consequences. (`https://docs.canvasmedical.com/guides/your-first-application/`) |

## Is there an externally-callable metadata write?

**No. Not for note metadata, and not for patient metadata.** This is the answer that should reshape the remediation plan.

Evidence:

1. `UPSERT_NOTE_METADATA` and `UPSERT_PATIENT_METADATA` appear only in the effects catalogue (`https://docs.canvasmedical.com/sdk/effects/`), and effects are "instructions that plugins can return."
2. The `PatientMetadata` effect is a plugin class with `patient_id`/`key`/`value` returned as `return [metadata.upsert(value)]` from a handler's compute method (`https://docs.canvasmedical.com/sdk/effect-patient-metadata/`). Same pattern for `Note.upsert_metadata(key, value)` (`https://docs.canvasmedical.com/sdk/effect-note-metadata/`) — "Creates or updates a metadata entry for the specified note … The operation is idempotent."
3. The API surface has exactly **three** non-FHIR custom APIs, and none is metadata: `https://docs.canvasmedical.com/api/` lists Custom APIs as **CCDA, Letter, Note**. There is no `/core/api/metadata/...` endpoint anywhere in the sitemap; a sitemap scan for URLs containing "metadata" returns nothing under `/api/`.
4. FHIR is not an escape hatch. `https://docs.canvasmedical.com/api/patient/` enumerates a closed list of accepted extension URLs (`us-core-birthsex`, `us-core-race`, `us-core-ethnicity`, `http://schemas.canvasmedical.com/fhir/extensions/preferred-pharmacy`, etc.). There is **no documented arbitrary-extension or key/value passthrough**, and the page's general posture toward unrecognised input is to ignore it ("Entries with any other `use` value are ignored", "Entries with any other `system` value are ignored"). *(Inferred:* that the closed list means an Aleron-defined extension URL would be rejected or dropped — the docs do not say explicitly what happens to an undocumented extension, only that undocumented values elsewhere are ignored. Worth an empirical test against a sandbox before betting on it.)*

**The one externally-writable custom-key store is `Patient.identifier`.** It is an array of `{system, value}` pairs, explicitly intended for correlation with external systems, writable on `POST /Patient` and `PUT /Patient/{id}`, and explicitly *not* rendered on the chart. It is the closest external analogue to `UPSERT_PATIENT_METADATA`. Caveats to design around:
- Per-patient only. There is **no** note-scoped equivalent whatsoever.
- Semantics are "identifier", not "arbitrary fact": a long JSON blob in `value` will work mechanically but is an abuse of the field.
- Update is whole-resource `PUT`, so read-modify-write with concurrency care; and MRN identifiers must be left alone ("Canvas-issued MRNs are managed by Canvas and should not be modified").

Anything in the plan of the shape "store the Aleron-owned fact as note metadata" is **not achievable without a plugin**. Anything of the shape "store the Aleron-owned fact as patient metadata" is achievable only as a `Patient.identifier` entry, with the constraints above, or with a plugin.

## The Note API

Confirmed as a plain external HTTP API, and the most useful non-plugin write surface Canvas has.

- Base: `https://<your-instance>.canvasmedical.com/core/api/notes/v1/Note` (`https://docs.canvasmedical.com/api/note/`)
- Operations and scopes, all quoted from that page: `POST /Note` (`user/Note.write`), `GET /Note/{noteKey}` (`user/Note.read`), `PATCH /Note/{noteKey}` (`user/Note.write`), `GET /Note` (`user/Note.read`). New scopes are `user/Note.read` and `user/Note.write`.
- POST really creates a note: "The effect of creating a note is the same as creating a note in the user interface."
- `stateChange` **is available externally** — it is a field on the PATCH body, under the same `user/Note.write` scope. Documented transitions include `ULK → LKD`, `NEW → LKD`, `CVD → LKD` (lock), `LKD → ULK` (unlock), `BKD → NSW`, `RVT → NSW` (no-show), and `BKD → CVD`, `NSW → CVD`, `RVT → CVD` (check-in). The OAuth guide (`https://docs.canvasmedical.com/guides/note-management-oauth/`) documents the same set as "Lock Note", "Sign Note", "Lock and Sign Note", "Unlock Note", "Check In", "No Show".
- **Locking does generate both artefacts**, verbatim: "Locking a note will result in the Note PDF being generated along with it associated FHIR DocumentReference record." Note the carve-out in the same sentence's context: locking applies to "an unlocked note (excluding DATA notes)."
- **No metadata field.** The resource exposes `title`, service datetime, `currentState`, patient/provider/location keys, note type coding, and `created`/`modified` timestamps. Nothing user-extensible.

## If a plugin is required

**Hosting: Canvas hosts it, on your Canvas instance.** There is no separate service for you to run. From `https://docs.canvasmedical.com/sdk/`, plugins "run in a sandboxed process directly on the Canvas instance", and from `https://docs.canvasmedical.com/guides/plugin-security-model/`: "Process and user isolation. Plugin code runs in a separate operating-system user and process from the core application."

**Deploying one** (`https://docs.canvasmedical.com/sdk/canvas_cli/`):
- `canvas init` — "Create a new plugin"
- `canvas validate` — "Validate a plugin's manifest and that all handlers load"
- `canvas install` — "Install a plugin into a Canvas instance"; runs the same pre-flight validation (manifest validation, static linting, sandbox loading) then uploads the bundle
- `canvas enable` / `canvas disable` / `canvas uninstall` / `canvas list`
- `canvas logs` — "Subscribes to a log stream and prints to your console"
- A `CANVAS_MANIFEST.json` is required, "inside the plugin's package directory (the directory whose name matches the manifest \"name\"), alongside the handler packages."

**Sandbox constraints** (`https://docs.canvasmedical.com/guides/plugin-security-model/`):
- "Code executes in a RestrictedPython sandbox with an explicit allowlist of importable modules. Modules outside that list are rejected at load time, not at run time."
- "No direct system access. Plugins have no direct database connection, no filesystem access, and no operating-system access."

**Outbound HTTP: yes, and this is the load-bearing capability for an Aleron-style integration.**
- "Outbound communication is limited to HTTP and HTTPS through the SDK's supported clients. Raw sockets and non-HTTP protocol libraries are not available in the sandbox." (`https://docs.canvasmedical.com/guides/plugin-security-model/`)
- The client is `canvas_sdk.utils.Http`, supporting `get`, `post`, `put`, `patch` with url/headers/json/data (`https://docs.canvasmedical.com/sdk/utils/`). Pre-built clients exist for AWS S3, FHIR, AI/LLMs, SendGrid, Twilio.
- **No egress allowlist or destination restriction is documented.** I looked in the security model, the utils page and the SDK index; the only stated restriction is protocol (HTTP/HTTPS via SDK clients), not destination. *(Inferred:* unrestricted egress to arbitrary hosts. Treat as unverified — the absence of a documented allowlist is not a documented absence of one. Confirm with Canvas before designing around it.)*

**Secrets:** configured per-plugin and "write-only from the plugin author's perspective: they can be set and used at runtime, but not read back out through the interface used to configure them." The auth mixins consume named secrets — `APIKeyAuthMixin` requires `simpleapi-api-key`; `BasicAuthMixin` requires `simpleapi-basic-username` and `simpleapi-basic-password`.

**Inbound HTTP into the plugin:** `SimpleAPIRoute` (single `PATH`) or `SimpleAPI` (a `PREFIX` plus decorated methods) — "The Canvas SDK provides a way to define an HTTP API with any number of endpoints in your instance", served at `/plugin-io/api/<plugin-name>/<PATH>`. Auth is one of the four mixins; **OAuth is not among them**, so a plugin route is authenticated by shared API key, basic auth, or an already-logged-in Canvas staff/patient session — a different credential model from the OAuth client credentials the rest of the plan presumably uses.

**Scheduled work:** `CronTask` with a `SCHEDULE` cron string; `execute()` returns "a list containing any effects you want to return, or an empty list". Combined with `Http`, this is the shape for a polling reconciler that pulls from Aleron and writes effects into Canvas.

## Where my hypothesis was wrong

The hypothesis was half right and half wrong, and the wrong half is the expensive one.

- **Right:** effects are plugin-only. Confirmed verbatim — "Effects are instructions that plugins can return", "returned as a list from the `compute` method of a plugin that inherits from `BaseHandler`."
- **Wrong:** "CommandAPI is HTTP and externally callable" is a category error. `CommandAPI` is a **Python base class in the plugin SDK** that you subclass to *create* an HTTP endpoint. It is not an endpoint Canvas ships. There is no `POST https://instance.canvasmedical.com/.../Command` you can hit with OAuth credentials. Nothing in `/api/` covers commands: the Custom (non-FHIR) API list is exactly "CCDA, Letter, Note". So an external app cannot write commands without a plugin being deployed first.
- **Wrong in the other direction too, and worth exploiting:** "effects are plugin-only" does not mean "effects are event-driven-only". Effects can be returned from a plugin's *HTTP route* ("Endpoint handlers may return zero or one response objects and any number of Effects") and from `CronTask.execute`. So once one plugin is deployed, effects become synchronously invokable over HTTP by an external caller. The plugin is a thin, one-time adapter — not a per-feature cost.
- **Also worth flagging:** the `/release-notes/commands-api/` note ("The Commands API allows you to read, search, create, and update … commands via the API") reads like a REST commands API and is likely to be what seeded the original assumption. It is historical, and the same note says commands "migrated to the commands module of the SDK". Do not plan against it; the current `/api/` index has no commands endpoint. *(Inferred from the release-note wording plus the current API index — I could not retrieve the full release note text.)*
- **Minor factual correction:** `Task` is not a Canvas command. It is an effect (`CREATE_TASK`) and a FHIR resource with real external `POST`/`PUT` support. If the plan lists "Task command", that line is wrong on its own terms.

## Consequences for a standalone external app

**Can do, with OAuth, no plugin:**
- Create, read, update notes and drive their full state machine including lock/sign — `/core/api/notes/v1/Note` with `user/Note.read` / `user/Note.write`. Locking yields the PDF and the FHIR `DocumentReference` for free.
- Create a diagnosis, indirectly: `POST /Condition` with `clinicalStatus: active` lands as a `Diagnose` command.
- Create and update tasks: `POST /Task`, `PUT /Task/{id}`.
- Create lab reports with tests, values, abnormal flags and a stored PDF: `POST /DiagnosticReport/$create-lab-report`.
- Create vital-sign observations and panels, restricted to the documented LOINC list.
- Create and update patients, including arbitrary `{system, value}` external identifiers on `Patient.identifier`.
- Read essentially everything through FHIR R4 / US Core STU 6.1.0.

**Cannot do without a plugin:**
- Write **any** note metadata. No endpoint exists.
- Write patient metadata as such. Only `Patient.identifier` approximates it, per-patient, non-chart-visible.
- Originate, edit, commit, sign, send or delegate **any** command via a supported HTTP surface — including `Assess`, `Plan`, `Goal`, `Refer`, `ImagingOrder`, `LabOrder`, `Prescribe`. Their FHIR counterparts (`CarePlan`, `Goal`, `ServiceRequest`, `MedicationRequest`) are read/search only.
- Update or enter-in-error an observation or a lab report.
- Touch any UI surface: banner alerts, protocol cards, action buttons, chart panes, modals, applications.
- Run anything on a schedule inside Canvas.

**What one thin plugin buys, and why it is probably the right call:** a single plugin with (a) `SimpleAPI`/`CommandAPI` routes that accept calls from Aleron and return effects, (b) a `CronTask` reconciler using `canvas_sdk.utils.Http` to pull from Aleron, and (c) a `LaunchModalEffect`-based Application to surface the Aleron UI inside the chart, converts the whole effects catalogue from unreachable to reachable. Cost: a `CANVAS_MANIFEST.json`, `canvas install`, a RestrictedPython allowlist to live inside, and a **second auth model** (`simpleapi-api-key` or basic, not OAuth) for the inbound leg. Canvas hosts and runs it — there is no new infrastructure to operate.

**Two things to verify empirically before committing:** whether an undocumented FHIR extension URL on `Patient` is rejected or silently dropped, and whether plugin outbound egress is in practice unrestricted. Both are inferences above, not quotes.
