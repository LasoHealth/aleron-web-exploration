# Whose signature is a plugin-initiated sign()?

**One-line answer:** It is whoever authenticated the HTTP request that returned the effect — and Canvas documents this explicitly: a plugin request carrying an **Authorization Code access token** (or a Canvas staff session) is attributed to that staff member, while an API-key or Basic-auth request is attributed to **Canvas Bot**. So Aleron *can* sign as the logged-in physician, but only if every write travels on a per-physician OAuth token; `ordering_provider_key` / `prescriber_id` are **clinical data fields on the order**, not the thing that drives signer attribution.

The product does **not** have to redirect into Canvas. The documented mechanism is exactly Aleron's shape: *"For applications that need to make API calls on behalf of specific Canvas users (e.g., a provider portal calling plugin endpoints): One-time setup per user: Each user authorizes the app via the browser flow. Store the refresh token per user in your backend."* (`/api/customer-authentication/`, "Recommended Pattern for External Applications").

---

## Can a plugin act as a named provider?

**Yes, and it is documented — not inferred.** Two independent pages say it in plain words.

`/sdk/handlers-simple-api-http/` § "Acting as a Canvas user":

> "By default, a SimpleAPI request isn't tied to a specific person, so any effects it returns — such as creating, locking, or signing a note — are recorded as Canvas Bot rather than a clinician.
>
> To have a request run as a specific Canvas staff member — for example, so a note is signed under the treating provider's name — call the endpoint with an access token obtained through the Authorization Code flow. That flow issues a token that represents the staff member who signed in and approved it. Send it as a Bearer token in the Authorization header, and Canvas identifies the user from the token and treats the request as coming from them, so any effects the handler returns are attributed to that staff member."
>
> "In this example the note is signed and recorded in Canvas as signed by the staff member who authorized the access token, not by Canvas Bot."

`/guides/writing-commands-over-http/` § "Checking that the caller may write to this note" — this page frames attribution as a **first-class clinical design decision**:

> "**Attribution** — who will the chart say wrote it? This follows from how the caller authenticated, which makes the scheme you pick a clinical decision and not only a security one. A session-backed request is attributed to the logged-in user, and so is one carrying an access token from the Authorization Code flow. A shared secret identifies nobody, so `APIKeyAuthMixin` and `BasicAuthMixin` requests are recorded as Canvas Bot — fine for a device feed, wrong for anything a clinician should be seen to have written."

And the table on that same page:

| Scheme | Identifies a person | The command is attributed to |
|---|---|---|
| `StaffSessionAuthMixin` | yes — a staff member | that staff member |
| `PatientSessionAuthMixin` | yes — a patient | that patient |
| An Authorization Code access token | yes | the staff member who authorized it |
| `APIKeyAuthMixin` | no — a shared key | Canvas Bot |
| `BasicAuthMixin` | no — a shared secret | Canvas Bot |

`/api/customer-authentication/` § "Authorization Code" corroborates the plumbing:

> "The access token obtained through this flow carries the identity of the user who authorized it. This means: FHIR API calls are scoped to that user's permissions. SimpleAPI plugin endpoints receive the user as the event actor…"
>
> "When a SimpleAPI plugin receives a request with a Bearer token, Canvas validates the token, identifies the user, and sets them as the event actor."

`/sdk/events/` § "Event Actor" confirms `self.event.actor` is populated for "SimpleAPI handlers — HTTP and WebSocket requests", exposing `actor.instance` (a `CanvasUser`) and `actor.instance.person_subclass` (the `Staff`).

**There is no impersonation / on-behalf-of / act-as-user API.** The only way to be a named user is for that user to have personally authorized the token (Authorization Code, with consent screen) or to be inside a live Canvas session. Aleron cannot mint a physician's identity from a service credential — which is the correct outcome for a signature, but it means **enrolment is mandatory: each physician must complete an OAuth consent once, and Aleron must store a per-physician refresh token.**

**The single biggest gap:** the docs state the rule for *note* effects and for *commands written through CommandAPI*, but nowhere state it for a `sign()` / `commit()` effect returned from an **event handler** (an action button, a command lifecycle handler). Inference: those use `self.event.actor` too, since `/sdk/effect-notes/` repeats "This effect will be originated by the current actor that triggered the event, with a fallback to Canvas Bot if no actor is found" for every note effect, and `/sdk/events/` lists which events carry an actor. Not documented for command effects specifically — **test it.**

---

## ordering_provider_key / prescriber_id

| Field | Commands | What it controls | Can it name someone other than the caller? | Evidence |
|---|---|---|---|---|
| `ordering_provider_key` | `ImagingOrder` (required to delegate/sign), `LabOrder` (optional), `Refer` — **note: `Refer` does not list this field at all** (see below) | Attribution **on the clinical record** — the ordering provider of the order. Verbatim: *"The `Staff` `id` of the provider ordering the imaging."* / *"…the provider ordering the tests."* | **Documented as free data, with zero stated link to the caller and zero stated validation.** Nothing says it must equal the authenticated user. Inference from silence + from it being a plain command field parsed like any other: yes, it can name anyone. | `/sdk/commands/` ImagingOrder + LabOrder parameter tables |
| `prescriber_id` | `Prescribe`, `Refill`, `AdjustPrescription` (required) | Attribution of the prescription — *"The `Staff` id of the prescriber."* | Same: no documented tie to the caller. | `/sdk/commands/` Prescribe parameter table |
| `supervising_provider_id` | `Prescribe`, `Refill`, `AdjustPrescription` (optional) | *"The `Staff` id of the supervising provider of the prescriber."* | n/a | same |

**Identifier space.** All of these take **`Staff.id`** — a 32-character UUID with no dashes. `/guides/writing-commands-over-http/`: *"The header carries the staff key, which is what `Staff.id` holds — a 32-character UUID with no dashes — so it matches on `id` rather than `dbid`."* This is the same id space as the FHIR `Practitioner` id (`Practitioner/5eede137ecfe4124b8b773040e33be14`) and as the Note API's `providerKey`. It is **not** the `CanvasUser` space that `originator`/`committer` live in — `Staff.user` is the bridge (`/sdk/data-staff/`).

**Permission to act: no.** Nothing in the docs treats these fields as authorization. `/guides/writing-commands-over-http/` is emphatic that authorization is the plugin's own job: *"An endpoint gated only on 'is staff' lets any staff member write any command to any note… `StaffSessionAuthMixin` only checks that the session belongs to a staff member — it does not consider roles, and it says nothing about whether that person may write to the note."*

**Validation: only at send time, not at sign time.** Documented gates:
- `LabOrder.send()`: *"The ordering provider must have an NPI."*
- `Prescribe.send()`: *"The prescriber must have an SPI (Surescripts Prescriber Identifier) number on file, or the send is restricted with `eRx unavailable, prescriber missing SPI number`. **SPI is a send requirement only: a prescriber without one can still review and sign the prescription.**"* Controlled substances additionally require EPCS enrolment.
- **No documented check that the named provider is `active`, holds a role, or is credentialed, at originate/sign time.** No documented check that they even exist (contrast the Note effect, which *does* say *"Verifies that the practice location and provider are valid"* and *"If `supervising_provider_id` is provided, validates that the `Staff` record exists"*).

**Correction to the brief:** `Refer`'s parameter table on `/sdk/commands/` lists `service_provider`, `diagnosis_codes`, `clinical_question`, `priority`, `notes_to_specialist`, `include_visit_note`, `comment`, `linked_items_urns` — **no `ordering_provider_key`**. If `Refer` needs a named ordering provider, the docs do not show how to set one, which makes the signer identity the *only* provider on a referral. Verify on a real instance.

---

## Who is recorded

`Command` (`/sdk/data-command/`) carries three separate `CanvasUser` fields plus a source marker:

| Field | Type |
|---|---|
| `originator` | `CanvasUser` |
| `committer` | `CanvasUser` |
| `entered_in_error` | `CanvasUser` |
| `origination_source` | String (**values undocumented**) |

`CanvasUser` (`/sdk/data-canvasuser/`) is the reverse side: *"This model isn't meant to be referenced directly, but is sometimes used to attribute a record to user"*, with `commands_originated`, `commands_committed`, `commands_entered_in_error`, and `person_subclass → Staff | Patient`.

**Per path:**

| Path | `originator` | `committer` | Provenance agent |
|---|---|---|---|
| Plugin route authed by `APIKeyAuthMixin` / `BasicAuthMixin` | Canvas Bot | Canvas Bot | Canvas Organization (`Organization/00000000-0000-0000-0002-000000000000`) |
| Plugin route with Authorization Code Bearer token | the authorizing staff member | the authorizing staff member | `Practitioner/<that staff id>` |
| Plugin route with `StaffSessionAuthMixin` (live Canvas session) | the logged-in staff member | the logged-in staff member | `Practitioner/<that staff id>` |
| Event handler (action button etc.) | `self.event.actor`, fallback Canvas Bot | same (**inferred** — stated for note effects, not command effects) | follows |

`Provenance` is unambiguous (`/api/provenance/`):

> "The agent will be populated by the **committer or originator** in Canvas as the auth[o]r. If neither is found, it will default to the Canvas Organization as the composer."
>
> "If the reference is `Organization/00000000-0000-0000-0002-000000000000`, a committer or originator coul[d not be found]"

So the Provenance agent tracks `committer`/`originator` — the **authenticated caller** — and **not** `ordering_provider_key`/`prescriber_id`. Canvas creates a Provenance record whenever `Prescription`, `ServiceRequest`, `DiagnosticReport`, `Encounter`, etc. is created or updated, so orders and prescriptions are covered.

**Design consequence, and it is a sharp one.** `originator` and `committer` are *separate fields resolved per request*. If Aleron originates a staged order under a service credential and then signs it under the physician's token, the record reads **originator = Canvas Bot, committer = Dr. X**. Provenance would still name Dr. X (committer wins per the quoted rule), but the command row carries a bot as its author. **Every call in the lifecycle of an order — originate, edit, sign — must run on the physician's token**, not just the signing call.

The other consequence: `ordering_provider_key` and the signer are independently settable, so it is possible to write a record where the named ordering provider and the recorded committer disagree. Nothing in the docs prevents it. Aleron must enforce `ordering_provider_key == prescriber_id == Staff.id of the token's owner` itself, in the plugin, or accept a chart that contradicts itself.

---

## Staff-session auth on plugin routes

**Documented: yes — a staff-session-authenticated route attributes commands to that staff member.** It is the first row of the attribution table in `/guides/writing-commands-over-http/`: `StaffSessionAuthMixin` → "that staff member". This is not inference.

But **it is the wrong mechanism for Aleron**, and this matters more than the answer. Session auth means the *Canvas* session cookie: `SessionCredentials.logged_in_user` (`{"id": ..., "type": "Staff"|"Patient"}`), and the two headers Canvas injects — `canvas-logged-in-user-type` and `canvas-logged-in-user-id`, of which the guide says *"Neither can be forged: plugin-io strips both if they arrive from the client and sets them only from a session it has verified itself."*

Aleron is a **third-party web app on its own origin**. It has no Canvas session cookie to present, and cannot obtain one. Session auth is for surfaces served from inside Canvas (a Canvas Application handler, an embedded iframe, a note application). **Aleron's path is the Authorization Code Bearer token** — the third row of the same table, with identical attribution.

Note also what `StaffSessionAuthMixin` deliberately does *not* do: *"This makes no assertions about the particular staff member, just that they are staff, and that they are logged in."* And: *"An authentication mixin establishes who the caller is, not what they may write."*

Two hard mechanics worth carrying into the design regardless of scheme:

1. **MRO order is load-bearing and fails silently.** `(StaffSessionAuthMixin, CommandAPI)` works; `(CommandAPI, StaffSessionAuthMixin)` rejects every request *"with no error to tell you why"*, because `SimpleAPI.authenticate` returns `False` by default. The mixin must be listed **first**.
2. **A closed note returns success and writes nothing.** *"Nothing in canvas-plugins reads the note's state, and command effects are applied after your response has already gone back. A closed note therefore answers 201 with a `command_uuid` and then writes no command."* Aleron must pre-check note state itself (the guide gives an `OPEN_STATES` list: `NEW, PUSHED, UNLOCKED, RESTORED, UNDELETED, CONVERTED`) or it will report signed orders to physicians that never reached the chart. Same trap for actions: an action the command does not support builds a valid effect, answers 200, and is then refused by Canvas — *"The caller is told the write succeeded when it did not."*

---

## What sign() means per command

**Correction to the brief on two points.** `LabOrder` and `Prescribe` **do** have `sign_action`; and every `sign_action` in the docs is described as a **state transition**, with identical wording, never as a clinical attestation.

| Command | SDK `sign()` method | `sign_action` (HTTP/UI action) | Documented meaning | Preconditions |
|---|---|---|---|---|
| `ImagingOrder` | **yes** | `sign_action` | *"Signs the order, transitioning it from staged to committed state."* | command is **staged**; `image_code`, `diagnosis_codes`, `service_provider`, `ordering_provider_key` all "required to delegate / sign" |
| `Refer` | **yes** | `sign_action` | *"Signs the order, transitioning it from staged to committed state."* | command is **staged**; `service_provider`, `diagnosis_codes`, `clinical_question`, `notes_to_specialist` required |
| `LabOrder` | no (`send()` only) | `sign_action`, plus `send_action` and `sign_send_action` | *"Signs the order, transitioning it from staged to committed state."* | command is **staged**. `send` additionally needs: electronic-ordering-enabled lab partner, committed/signed order, patient address + phone, ordering provider NPI |
| `Prescribe` | no (`review()`, `send()`) | `sign_action`, `sign_send_action`, `print_action`, `make_changes` | *"Signs the prescription, transitioning it from staged to committed state."* | command is **in review** — so the lifecycle is staged → `review()` → sign. `send` needs prescriber SPI; EPCS for controlled substances |

The SDK `sign()` method itself (`/sdk/commands/` § Methods): *"Returns an Effect that signs an existing, staged command, transitioning it to a committed state. **Limited availability** The `sign()` method can only be called on `ImagingOrder` and `Refer` command objects."*

**Does the documentation distinguish clinical signature from state transition? No — and that silence cuts in your favour.** Every `sign_action` is defined *only* as a staged→committed transition. There is no signature payload, no attestation text, no reference to `Staff.signature` (which exists on the Staff model as a String but is documented nowhere in the command flow), and no separate signer field on `Command`. The signature *is* the commit, and the identity behind it *is* `committer`. Which is why the auth scheme is the whole answer.

Also relevant: `originate(commit=True)` is **useless for orders**. *"Commands that do not support committing (Reason For Visit, Prescribe, Refill, Adjust Prescription, Refer, and Order commands) will ignore this parameter."* Orders must be signed/sent as a separate second call — and per the section above, that second call must also carry the physician's token.

`CommandAPI`'s HTTP action table (`/sdk/handlers-simple-api-commands/`) mirrors all of this: `commit` = *"Signs the staged command into the note"*, `sign` = *"Signs the order"*, `delegate` = *"Delegates the order to someone else to complete"*.

---

## If a redirect is needed

**Permalinks exist and reach a specific object, but only one flavour is documented and exposed.**

- **Task permalinks — documented and machine-readable.** `/api/task/`: a FHIR Task read/search response carries extension `http://schemas.canvasmedical.com/fhir/extensions/task-permalink` with a `valueString` — *"a url that will directly link to the task in the Canvas UI."* Worked example: `http://example.canvasmedical.com/permalinks/v1/VGFzazo4OTo3MA==`, and `base64("Task:89:70")` decodes exactly to that token. Release note `/release-notes/permalinks-auth/` (30 Jan 2025): *"If a user is logged out, the API permalink will now navigate into the right page in Canvas through the login process, including SSO."* So a permalink survives a cold start and an SSO bounce — ideal for a hand-off out of Aleron.
- **Note permalinks exist but only as a UI affordance.** `/release-notes/copy-note-permalinks/` (16 Sep 2024): *"Earlier this year, Canvas deployed permalinks. These are direct links to Canvas objects (**notes, commands, PDFs and more**) that can be added to tasks… we have added an option 'copy link' to the kebab (triple dot) menu of the note."* So Canvas *does* mint permalinks for notes and for **individual commands** — but **no API is documented for obtaining one**, for a note or a command. Constructing `/permalinks/v1/base64("Note:<dbid>")` or `base64("Command:<dbid>")` by analogy with the Task token is **pure inference and unsupported** — plausible, cheap to try, and not something to design on until tested.
- **Internal path deep links — documented, via a different door.** `/sdk/effect-redirect/` documents valid internal Canvas paths including `/patient/{key}?noteId=...`, `/panel`, `/schedule`. That gives a note-level (not command-level) landing target whose URL shape is documented. Caveat: the `RedirectEffect` itself is *not* usable from Aleron — *"A redirect is delivered only to the acting user who triggered the handler — and only to that user's browser"*, and each destination must be pre-allowlisted by an instance admin via `REDIRECT_ALLOWLIST_INTERNAL` / `_EXTERNAL` / `_APPLICATION` secrets (default: everything blocked). Using `https://<instance>.canvasmedical.com/patient/{key}?noteId=...` as a plain browser navigation *from* Aleron is inference from the path form documented there — but it is a much smaller leap than guessing a permalink token.

**Naming the queue: the signature worklist is the Task list, and `delegate` is how an order gets into it.** This is the more useful answer than a deep link.

- `ImagingOrder` and `Refer` both expose `delegate_action` — *"Delegates the order by creating a task"* (SDK: *"Returns an Effect that delegates an existing, staged command by creating a task"*). `CommandAPI` describes the same action as *"Delegates the order to someone else to complete."*
- The Task effect (`/sdk/effect-tasks/`) closes the loop: `AddTask` takes `assignee_id` (*"the id of the staff the task should be assigned to"*), `team_id`, `title`, `due`, `priority` (`STAT`/`URGENT`/`ROUTINE`), `labels`, `author_id` (*"defaults to CanvasBot"* — the same fallback again), and `linked_object_id` + `linked_object_type`, whose enum is exactly **`REFERRAL`** and **`IMAGING`**.
- So the natural product shape, if any order type turns out to be un-signable from Aleron: **stage the order via `originate`, then `delegate` it (or `AddTask` with `linked_object_type=IMAGING`/`REFERRAL`, `assignee_id` = the physician's `Staff.id`), and hand the physician the task permalink from the FHIR Task API.** That lands them on the task, which links to the order, inside their own Canvas task list — all of it documented, none of it inferred.
- One documented signature label exists for inbound documents, not orders: `/release-notes/remove-requires-signature-label/` — *"When `ENABLE_REQUIRES_SIGNATURE` constance configuration is enabled, the Requires Signature label will automatically be removed once a document (lab, imaging, consult report, and uncategorized report) have been marked as signed through the corresponding command."* That is a review queue for results, not a queue of orders awaiting signature. **No "commands awaiting your signature" queue is documented anywhere.** A staged command simply sits in its note.

---

## Notes

**`CREATE_NOTE` / `SIGN_NOTE` attribution is the best-documented case in the whole audit** — and it separates the two concepts cleanly.

`/sdk/effect-notes/` repeats, verbatim, under **every** note state effect (`sign`, `lock`, `unlock`, `push_charges`, `check_in`, `no_show`, and more):

> "This effect will be originated by the current actor that triggered the event, with a fallback to Canvas Bot if no actor is found."

And `Note.sign()` is described as: *"Signs an existing note, marking it as reviewed and approved by the provider. Has the exact same effect as clicking on the Sign button in the Note footer."* Precondition: *"`instance_id` must be a valid, existing Note that is not already signed."*

So the **signer of a note is the request's actor**, full stop — the OAuth token holder or session user, never a field you pass.

**`provider_id` / `providerKey` is a different thing: the note's provider of record, and yes, it can name anyone.**
- SDK `Note` create effect: `provider_id` (required), `supervising_provider_id` (optional). *"Verifies that the practice location and provider are valid"*, *"If `supervising_provider_id` is provided, validates that the `Staff` record exists"* — existence checks only, no identity-of-caller check. `provider_id` is also **updatable** after creation via `Note.update()`.
- Note API (`/api/note/`): `providerKey` = *"The unique key of the Provider staff who is writing the Note"* — settable on create **and** on `PATCH`, alongside `stateChange`.
- **So yes: `providerKey` can name a provider other than the caller, and the docs state no restriction.** The note would then read "written by Dr. A" while its signature Provenance names Dr. B. Aleron must keep these consistent itself.

Worth flagging for the redirect design: **the Note API's `stateChange` cannot sign.** Its documented v1 transitions are only `ULK/NEW/CVD → LKD` (lock), `LKD → ULK` (unlock), `BKD/RVT → NSW` (no-show), `BKD/NSW/RVT → CVD` (check-in). Signing a note is available **only** through the SDK `Note.sign()` effect — i.e. only through a plugin. That is a point in favour of the plugin path, not against it: there is no REST alternative to route around.

The reference implementation for all of this already exists in the docs: **`/guides/note-management-oauth/`** — "Note Management Plugin", an external app that does Authorization Code + PKCE against `/auth/authorize/` and `/auth/token/`, then calls `POST /plugin-io/api/note_sign_api/notes/<id>/sign` with the Bearer token, whose `authenticate` is literally `return self.event.actor.instance is not None`. Aleron is that guide with orders instead of notes. Note its caveats: staff authorization **requires** a base64 `launch` parameter (*"Without this parameter, the authorization will be denied with `error=access_denied`"*, e.g. `base64('{"patient":""}')`); authorization codes live ~60 seconds; access tokens 10 hours; refresh tokens are non-expiring but **single-use and rotated** (store the newest, per physician); scopes on refresh must match or subset the original grant.

---

## Tests required before designing

Nine tests. They are cheap and they settle everything the docs leave open. Run them against a Canvas sandbox instance with two staff records — **Dr. A** (the token owner) and **Dr. B** (a different active provider) — and a patient with an open note.

**T1 — Baseline: does the OAuth token actually carry identity into a command effect?**
Register a Confidential OAuth app with grant type Authorization Code. Have Dr. A complete `/auth/authorize/?response_type=code&…&launch=eyJwYXRpZW50IjoiIn0=`, exchange for a token. Deploy a `CommandAPI` with `authenticate` = `self.event.actor.instance is not None`. `POST` an `ImagingOrder` originate with Dr. A's Bearer token.
*Afterwards:* `Command.objects.get(id=...)` → assert `originator.person_subclass` is Dr. A's `Staff`, **not** Canvas Bot. Log `origination_source` — its values are undocumented; record what appears.

**T2 — The crux: is `sign` attributed to the token owner?**
`POST /<command_id>/sign` with Dr. A's token.
*Afterwards:* assert `Command.committer.person_subclass` == Dr. A. Then `GET /Provenance?target=ServiceRequest/<id>` and assert `agent[].who.reference` == `Practitioner/<Dr. A's Staff.id>` and **not** `Organization/00000000-0000-0000-0002-000000000000`. Also check `ServiceRequest.requester` — confirming (or refuting) that it tracks `ordering_provider_key`.

**T3 — The divergence test: can the named provider differ from the signer, and what does the chart show?**
Originate + sign an `ImagingOrder` with Dr. A's token but `ordering_provider_key` = **Dr. B**.
*Afterwards:* record all four independently: `Command.originator`, `Command.committer`, `ServiceRequest.requester`, `Provenance.agent[].who`. This is the test that tells you whether Canvas will let you write a self-contradicting order — and whether it is `ordering_provider_key` or the token that appears where a regulator or a specialist would look. **Also open the order in the Canvas UI and photograph what a human sees.** The UI's rendering is the thing that matters clinically and is documented nowhere.

**T4 — Negative control: confirm the Canvas Bot failure mode.**
Same originate + sign, but on an `APIKeyAuthMixin` route with a shared secret.
*Afterwards:* assert `originator`/`committer` are Canvas Bot and `Provenance.agent.who` is the Organization reference. This proves your instrumentation can actually see the difference, so a pass in T2 means something.

**T5 — Mixed-credential lifecycle (the trap).**
Originate under the API key, then sign under Dr. A's token.
*Afterwards:* assert `originator` = Canvas Bot, `committer` = Dr. A, and see which one Provenance picks (the docs say "committer or originator", committer implied first). If this produces a record that reads acceptably, the design has slack. If it does not, **every** call must carry the physician's token, which changes Aleron's token-handling from nice-to-have to load-bearing.

**T6 — Repeat T2/T3 per order type.** `ImagingOrder.sign`, `Refer.sign`, `LabOrder.sign` then `send`, `Prescribe` → `review` → `sign` then `send`. Each has a different lifecycle and a different precondition. In particular: (a) does `Refer` accept an `ordering_provider_key` at all, or reject it as an unknown field — the parameter table omits it; (b) for `Prescribe`, does `sign` succeed when `prescriber_id` names Dr. B while Dr. A holds the token, and does Surescripts transmit Dr. B's SPI; (c) whether a signed `Prescribe` for a controlled substance is refused for the *token owner's* EPCS status or the *named prescriber's*. Do (c) on a non-controlled drug first.

**T7 — Note signing.** `Note` create with `provider_id` = Dr. B under Dr. A's token, then `Note.sign()` under Dr. A's token.
*Afterwards:* confirm the note's provider-of-record is Dr. B while the signature is Dr. A, and check what the note footer and the generated note PDF / FHIR `DocumentReference` each display. The PDF is the document that leaves the building.

**T8 — Validation probes (each expected to be a no-op, so worth 10 minutes to disprove).**
Set `ordering_provider_key` / `prescriber_id` to: an **inactive** `Staff`; a staff member with **no NPI**; a non-provider staff member (scheduler/biller); a well-formed but nonexistent UUID. Record which are refused at originate, which at sign, which at send, and which sail through. The docs promise validation only at `send`.

**T9 — Deep-link and queue reality check** (only if T2/T3 fail and a redirect becomes necessary).
(a) `delegate` a staged `ImagingOrder`, then `GET /Task?…` and confirm the `task-permalink` extension is present; open it as a logged-out Dr. A and confirm the SSO bounce lands on the task and that the task links onward to the order.
(b) Copy a note permalink from the Canvas UI kebab menu and a **command** permalink if the UI offers one, and decode both tokens — that tells you in one minute whether `base64("Note:<dbid>")` / `base64("Command:<dbid>")` is the real scheme and whether an Aleron-constructed permalink is viable or fantasy.
(c) Navigate a logged-in physician straight to `https://<instance>.canvasmedical.com/patient/<patientKey>?noteId=<noteId>` from an external tab and confirm it opens the note.

**Do not design the order-signing flow until T2, T3 and T5 have run.** T2 decides whether Aleron can sign at all; T3 decides whether `ordering_provider_key` is a useful field or a liability; T5 decides whether the physician's token must be threaded through every call or only the last one.
