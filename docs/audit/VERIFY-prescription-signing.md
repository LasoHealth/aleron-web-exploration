# Can an external app sign and send a prescription as the physician?

**Verdict:** **Redirect needed for signing** — no Canvas surface (plugin effects, CommandAPI/SimpleAPI over HTTP, or FHIR) can commit/sign a Prescribe command; a human must click sign in the Canvas charting UI, controlled or not. An external app *can* compose it, put it in review, and — once a human has signed it — send it over the API as the physician.

Docs fetched raw and grepped on 2026-09-04 (pages last updated 2 Sep 2026; release notes through 3 Sep 2026). All 337 non-release-note doc pages were fetched and grepped, plus the full changelog.

---

## Effects vs CommandAPI: which surface does each restriction govern?

They are **not** two capability tables. There is one capability table — the command-type table on `/sdk/effects/` — and CommandAPI is a thin producer of exactly those effects. `sign_action` is a **UI button name**, not an HTTP action.

**1. `/sdk/effects/` — the table you found.** Its scope is stated at the top of the page:

> "Effects are instructions that plugins can return in order to perform an action in the Canvas EMR."

Command-type table row:

> "Prescribe | `*_PRESCRIBE_COMMAND` | **No COMMIT. Supports SEND and REVIEW**"

Action definitions on the same page:

> "COMMIT | Finalize and save a command."
> "SEND | Transmit **a committed command** to an external system (prescribe, refill, adjust prescription, lab orders only)."
> "SIGN | Sign the order (**imaging order, refer only**)."
> "ORIGINATE | ... Supports an optional commit flag to also commit the command in the same operation **if the command is commit-able via SDK**."

Note SIGN is scoped to Imaging Order and Refer. Prescribe has neither COMMIT nor SIGN on this surface.

**2. `/sdk/commands/` — where `sign_action` actually lives.** The page defines the word "action" before it uses it, and the definition is the UI:

> "**Command Actions.** All commands support **user-triggered actions through the Canvas UI**. These actions appear as buttons or menu items that users can click to perform operations on a command. Commands have two types of actions: Generic actions — available on all commands. **Command-specific actions** — vary by command type and are documented in each command's section below."

and immediately after:

> "**The `send` action is the only command action available through the SDK**, and only LabOrder, Prescribe, Refill and Adjust Prescription commands support it."

`sign_action`, `sign_send_action`, `print_action` and `make_changes` appear in the *Command-specific actions* table for Prescribe — i.e. inside the UI-button set that sentence excludes from the SDK. Grep confirms the string `sign_action` occurs on exactly one page in the entire docs site (`/sdk/commands/`), only inside those UI tables, and `sign_send` likewise. Nothing exposes them over HTTP.

The same page's *Methods* section (the things CommandAPI calls) draws the line explicitly:

> "**sign** — Returns an Effect that signs an existing, staged command, transitioning it to a committed state. *Limited availability:* The `sign()` method **can only be called on ImagingOrder and Refer** command objects. Other command types do not support this operation."
> "**send** — Returns an Effect that **sends a signed command**."
> "**review** — *Limited availability:* The `review()` method can only be called on Prescribe commands."

and, on `originate(commit=True)`:

> "Commands that do not support committing (Reason For Visit, **Prescribe**, Refill, Adjust Prescription, Refer, and Order commands) **will ignore this parameter**."

Methods section header also states the bridge: *"To call these over HTTP rather than from a handler, see CommandAPI."*

**3. `/sdk/handlers-simple-api-commands/` (CommandAPI) — the HTTP surface, same table.** Its `action` method takes one of `commit / delete / enter_in_error / review / send / delegate / sign`, and then:

> "`action` names a method on the command class, and each one builds the corresponding **command effect**."
> "No command supports all of them, and not even `commit` is universal. Which actions a command accepts is listed per command in Commands ... **`review` and `send` belong to Prescribe, Refill and Adjust Prescription**, and `send` also to Lab Order. Those four are not committed — sending is how they are finished. **`delegate` and `sign` belong to Imaging Order and Refer**, which are not committed either."
> "An action the command class does not have is a 400."

**4. `/guides/writing-commands-over-http/` — states the enforcement point.** This is the decisive passage, because it says where the "No COMMIT" restriction bites:

> "Gating the actions is not defensive tidiness, it is the difference between a write landing and silently not landing. Every command class inherits `commit()`, so `POST /commands/prescribe/<id>/commit` would build a valid effect and **answer 200 — and Canvas would then refuse to apply it, because Prescribe has no COMMIT.** The caller is told the write succeeded when it did not."

Its reference implementation hard-codes the allowed set:

> `PrescribeCommand.Meta.key: {"delete", "review", "send", "enter_in_error"}`

**Scope conclusion.** "No COMMIT" is a property of the **effect application layer in canvas_core**, not of the effects *authoring* surface. Every write path in the SDK — plugin handler, action button, CommandAPI route — terminates in the same effect, so all of them inherit the restriction. The previous investigation's phrasing ("plugins can't commit a Prescribe; humans can") is right about the outcome but wrong about the reason: it is not a plugin-sandbox rule that CommandAPI escapes; it is the command type itself. And a `commit` route on Prescribe **fails silently with HTTP 200** — the worst possible failure mode for a clinical workflow, and the reason this must be gated caller-side.

**5. `/sdk/handlers-simple-api-http/` — finding (3) is correct but orthogonal.**

> "By default, a SimpleAPI request isn't tied to a specific person, so any effects it returns — such as creating, locking, or signing a note — are recorded as Canvas Bot rather than a clinician. To have a request run as a specific Canvas staff member ... call the endpoint with an access token obtained through the Authorization Code flow ... **any effects the handler returns are attributed to that staff member.** ... In this example **the note** is signed and recorded in Canvas as signed by the staff member who authorized the access token, not by Canvas Bot."

`/guides/writing-commands-over-http/` puts it precisely:

> "**Attribution** — who will the chart say wrote it? ... A session-backed request is attributed to the logged-in user, and so is one carrying an access token from the Authorization Code flow."
> "Scheme | ... | An Authorization Code access token | yes | the staff member who authorized it"

**Attribution answers *whose name goes on an effect that is allowed*. It does not add effects to the allowed set.** Also note the worked example signs a **Note** (note lock/sign, per `/guides/note-management-oauth/`: "lock, sign, unlock, check-in, no-show") — a different object from a Prescribe command commit. Note-signing under an OAuth token is documented and works. Prescribe-committing has no effect to attribute.

So (2) does not hold together with (3), because (2) is a misreading: there is no `sign_action` over CommandAPI.

---

## Prescribe `sign_action` preconditions

| Precondition | Documented? | Satisfiable by an API caller? | Evidence |
|---|---|---|---|
| The action is reachable over HTTP at all | Yes — it is not | **No.** Not exposed. `sign` over CommandAPI is Imaging Order / Refer only; `commit` on Prescribe answers 200 and is then discarded | `/sdk/commands/`: "The `send` action is the only command action available through the SDK"; `sign()` "can only be called on ImagingOrder and Refer"; `/sdk/handlers-simple-api-commands/` action list; `/guides/writing-commands-over-http/`: "Canvas would then refuse to apply it, because Prescribe has no COMMIT" |
| Command state = **in review** (not staged) | Yes | Yes — `review()` / `POST .../review` is available to Prescribe and is the one state transition the API owns | `/sdk/commands/`: "`sign_action` \| **command is in review** \| Signs the prescription, transitioning it from staged to committed state"; `review()` "can only be called on Prescribe commands" |
| Required command fields present (`sig`, `quantity_to_dispense`, `type_to_dispense`, `refills`, `substitutions`, `prescriber_id`, one of `fdb_code`/`compound_medication_id`/`compound_medication_data`) | Yes | Yes — all settable via `values` on originate/edit | `/sdk/commands/` Prescribe parameter table ("Required to review / send") |
| Prescriber **NPI** on file | Yes | Yes, but it is a data prerequisite on the Staff record, not something the call supplies | Release note 3 Sep 2026: "An **NPI number is still required to sign**" |
| Prescriber **SPI** (Surescripts) | Yes — and explicitly **not** a signing precondition | N/A for signing | `/sdk/commands/`: "**SPI is a send requirement only: a prescriber without one can still review and sign the prescription.**" Release note 3 Sep 2026: "Prescribers can now review and sign a prescription without an SPI ... SPI is only needed to transmit ... electronically through Surescripts" |
| **EPCS enrolment** for controlled substances | Partially — documented as a *send* restriction, with one release note implying it also touches signing | Not satisfiable by a call; it is prescriber enrolment state | `/sdk/commands/`: "For a controlled substance, the prescriber must be enrolled in EPCS, or **the send is restricted** with `eRx unavailable, prescriber not enrolled in EPCS`". But release note: "**Fixed an error that could prevent EPCS signing for refill prescriptions**" and "controlled-substance prescribing is still gated by EPCS enrollment". Treat the sign-time role of EPCS as **not settled** |
| Two-factor / identity-proofing step-up at signature | **No — absent from the entire docs site** | N/A | `grep -il "two-factor\|two factor\|identity proofing\|2FA"` across all 337 non-release-note pages plus the full changelog: **zero hits**. The only MFA mention anywhere is incidental ("Fixed provider signatures not appearing when previewing or printing letters for staff who have multi-factor authentication enabled") |
| In-UI confirmation | Not stated as a rule, but implied by the whole action model | This is the blocker | "All commands support user-triggered actions **through the Canvas UI**" + `sign_action` sits in that set + no SDK equivalent exists |

**Is there an explicit sentence saying "prescription signing must happen in the Canvas UI"?** **No.** I searched all 337 doc pages for `must be signed in` / `only be signed in` / `signed in the (Canvas) UI` — zero hits. The conclusion is built from four converging *positive* statements (the SDK-actions sentence, `sign()`'s limited availability, the `No COMMIT` row, and the CommandAPI action list) rather than one prohibition. That is a weaker rhetorical form but the same logical force: the capability is enumerated and Prescribe is not in it. The absence of a flat prohibition is worth noting because it means Canvas has not *committed* to this as policy — it could expose a `sign` action for Prescribe in any release without contradicting current docs. Watch the changelog.

The UI has **three** paths that commit a Prescribe, all requiring a human: `sign_action`, `sign_send_action` ("Signs and immediately sends"), and `print_action` ("Prints and commits the command" — the paper route, which needs no SPI/Surescripts at all).

---

## Controlled substances and EPCS

**DEA two-factor identity proofing at signing has no documented Canvas path.** Not on `/sdk/commands/`, not on `/sdk/data-prescription/`, not in the changelog, not anywhere in the docs site. Canvas documents EPCS only as **prescriber enrolment state** — a boolean gate on the Staff record — and surfaces it as a send-time restriction string. `Prescription.is_epcs` exists as a read-only field on the data model.

Consequences:

- **An API caller cannot satisfy it, because there is nothing to satisfy through the API.** There is no documented endpoint, header, parameter, or effect for presenting a second factor at signature.
- **EPCS does not create a *different* signing path — it narrows the same one.** Non-controlled and controlled prescriptions are both signed by a human in the UI. So the option "redirect needed only for controlled substances" is **wrong**: it is needed for both.
- Whatever satisfies 21 CFR 1311 two-factor at signature happens **inside the Canvas UI signing flow**, undocumented in the developer docs. If your workflow touches controlled substances, this is a question for Canvas support / your EPCS attestation, not for the SDK docs. Do not design against an inference here.
- Related command-level EPCS behaviour that *is* documented: "Prescribe / Refill — Adds max refill validation for epcs" (`/product-updates/commands-module/`), and for controlled substances "the patient's sex at birth must be male or female, or the send is restricted with `eRx unavailable, patient sex at birth must be male or female`".

---

## Sending

**`send()` documented preconditions** (`/sdk/commands/` → Prescribe, "Electronic prescribing ... has additional validations"):

1. "A **pharmacy** must be specified on the command before it can be sent."
2. "The command must be **committed/signed** before it can be sent electronically."
3. "The prescriber must have an **SPI** ... or the send is restricted with `eRx unavailable, prescriber missing SPI number`."
4. "For a controlled substance, the prescriber must be **enrolled in EPCS**, or the send is restricted with `eRx unavailable, prescriber not enrolled in EPCS`."
5. "For a controlled substance (a medication with a DEA schedule), the **patient's sex at birth** must be male or female."

> "These validations apply to Refill and AdjustPrescription as well, and **in the Canvas UI as well as through the SDK** — in the UI a restricted prescription offers no send action at all."

Optional: `practice_location_override` (Prescribe only) — "**applies only to `send()`-initiated (plugin-driven) prescriptions**", and an id matching no practice location "raises an error rather than falling back".

**Does a commit performed under an OAuth token satisfy precondition 2?** The question is moot for Prescribe — there is no such commit. **But if Canvas ever exposes one, the answer is almost certainly yes** (*inference, not documented*): the precondition is expressed as command state, and `Prescription.committer` is a `CanvasUser`. Attribution sets *which* user lands in `committer`; it does not change *whether* the field is populated. Canvas's own `send_all_prescriptions` example tests exactly that field and nothing else:

```python
prescribe_commands = Command.objects.filter(note_id=note_id, schema_key="prescribe", committer__isnull=False)
```

Nothing in the docs distinguishes a token-attributed committer from a session-attributed one, and `/guides/writing-commands-over-http/` treats the two schemes as equivalent for attribution. **Marked as inference.**

**Where SPI / NPI / EPCS are validated:**

| Check | Validated at | Failure mode |
|---|---|---|
| **NPI** on prescriber | **Sign / commit** | Sign is refused. Only stated as "An NPI number is still required to sign" — the exact error is undocumented |
| **SPI** on prescriber | **Send only** — explicitly not at sign | `send()` is restricted: `eRx unavailable, prescriber missing SPI number`. UI offers no send button at all |
| **EPCS** enrolment (controlled only) | **Send** (documented); possibly also **sign** (implied by "Fixed an error that could prevent EPCS signing for refill prescriptions") — **unsettled** | `eRx unavailable, prescriber not enrolled in EPCS` |
| Pharmacy on command | **Send** | Send refused |
| Patient sex at birth (controlled only) | **Send** | `eRx unavailable, patient sex at birth must be male or female`. Release note: "Previously the send failed downstream with nothing to point the prescriber at the cause" |
| Everything else (address transliteration, message formatting, pharmacy rejection) | **Surescripts boundary — after transmission** | Late and asynchronous. Lands in `Prescription.status` (`error`, `pending`, `transmitted`, `delivered`, …) with `error_message` and `reason_code`. "Failed prescriptions now show more detail regarding the reason for failure" |

**What this means for failing early vs late.** The five documented restrictions fail **early and visibly, at `send()`, synchronously, with a machine-readable string** — that is the good case, and it is worth pre-flighting them yourself so you never build a prescription you cannot transmit. Everything past Surescripts fails **late and silently from the caller's point of view**: `send()` succeeded, and the only signal is a later `Prescription.status == "error"`. Any workflow you build must poll or subscribe to prescription status; treating a 200 on send as delivery is wrong.

**Also note the silent-success trap** on the commit side, from `/guides/writing-commands-over-http/`: `POST .../prescribe/<id>/commit` returns **200 with nothing written**. Gate the allowed action set per command in your own code (`{"delete", "review", "send", "enter_in_error"}` for Prescribe, per Canvas's own example) or your caller will believe prescriptions are signed that are not.

**FHIR is not an alternative.** `/api/medicationrequest/` documents **Read and Search only** — no Create, no Update (contrast `MedicationStatement`, which has Create and Update). "FHIR MedicationRequest maps to the Prescribe, Refill, Adjust Prescription, Deny Refill, Approve Refill commands in Canvas" — read-only.

---

## The bottom line

**A redirect (or an already-in-Canvas clinician) is required for the signature, on every prescription — controlled and non-controlled alike.** What is required is a human performing `sign_action` / `sign_send_action` / `print_action` in the Canvas charting UI, on a Prescribe command in *review* state. There is no API, effect, token, scope, or credential that substitutes for it. An OAuth access token changes *whose name* is recorded on effects Canvas already permits; it does not make Prescribe committable.

What an external application **can** do end to end under Dr. X's Authorization Code token:

1. `POST /plugin-io/api/<plugin>/…` → `originate` a `PrescribeCommand` into a note with `prescriber_id` = Dr. X and every clinical field populated. Attributed to Dr. X.
2. `PUT …/<command_id>` → `edit` while staged (remember: `values` replaces the whole field set, it is not a patch).
3. `POST …/<command_id>/review` → move it to **in review**, which is the state the UI sign button requires. This is the furthest the API goes, and it is a genuinely useful handoff point — the prescription arrives fully composed and one click from signed.
4. **Human step, in Canvas.** Dr. X signs (or signs-and-sends, or prints).
5. `POST …/<command_id>/send` → transmit, if the human chose plain sign rather than sign-and-send. Optionally `practice_location_override`.
6. Poll `Prescription.status` / `error_message` for the Surescripts outcome.

Credentials and setup for steps 1–3 and 5: a Confidential OAuth application registered at `{instance}/auth/applications/` with the Authorization Code grant; per-staff one-time browser authorization (staff tokens **require** a base64 `launch` context parameter or authorization is denied with `access_denied`); `offline_access` scope for the refresh token; stored per-user refresh token (non-expiring, single-use, rotate on every refresh; access tokens last 10 hours); a plugin exposing a `CommandAPI` with the auth mixin listed **before** `CommandAPI` in the bases (wrong order rejects every request with no error), plus your own note-level authorization check against the `note_id` **in the request body**. Data prerequisites on the Staff record: NPI to sign, SPI to send electronically, EPCS enrolment for controlled substances.

So the correction to give the team: **the OAuth-token attribution story is real, and it is not enough.** Build the compose-and-review handoff — it removes most of the clicks — but the signature stays a deliberate human act in Canvas, and the workflow must be designed around that, not around getting rid of it.

One documentation contradiction to name honestly rather than paper over: `/sdk/handlers-simple-api-commands/` says of Prescribe/Refill/Adjust Prescription/Lab Order *"Those four are not committed — **sending is how they are finished**"*, which read alone could mean `send` itself performs the sign. Five other statements say otherwise — `send()` "sends a **signed** command"; "The command must be committed/signed **before** it can be sent"; the effects table's "SEND \| Transmit **a committed** command"; the UI table's "`send_action` \| command is **committed**"; and Canvas's own `send_all_prescriptions` example filtering `committer__isnull=False`. I read the CommandAPI sentence as loose phrasing meaning "the terminal action is `send`, not `commit`", and the verdict above follows the five. **If that reading is wrong, the verdict flips to "no redirect needed for non-controlled prescriptions"** — which is why test 1 below is not optional before anyone designs on this.

---

## Tests that would settle what documentation cannot

Run all of these in a **non-production** Canvas instance (`/api/non-prod-service-base-urls/`) against a test patient, with a staff account holding NPI + SPI and a second without EPCS. Each is one call plus one inspection.

**1. Does `send` on an unsigned prescription sign it? (the decisive test — resolves the one contradiction, and the whole verdict)**
Originate a non-controlled Prescribe with a pharmacy and all required fields under Dr. X's Authorization Code token; `POST …/review`; do **not** sign; then `POST …/send`.
Inspect: the HTTP status and body; `Prescription.objects.get(...)` → `committer`, `status`, `error_message`; and the command's `audit_history` in the UI.
- 400 / restriction / no `committer` → verdict above confirmed. Redirect required.
- 200 with `committer` = Dr. X and `status` moving to `signed`/`inqueue`/`transmitted` → **the docs are wrong and the verdict flips**: non-controlled prescriptions are fully API-signable. Immediately re-run as test 4 for controlled substances.

**2. Confirm the silent-200 on commit (so you gate for it).**
`POST …/prescribe/<id>/commit` via a CommandAPI route that does *not* gate the action set.
Inspect: expect **HTTP 200** with `{"mode": "commit"}`, and then `Prescription.committer is None` / command still staged in the note. Confirms the effect is discarded after a success response. If it commits, everything above is obsolete — recheck the whole question.

**3. Attribution of an effect that *is* permitted (validates finding (3) on the objects you care about).**
Under Dr. X's token, `POST …/review` on a staged prescription; separately have a human sign it in the UI.
Inspect: `Command.objects.get(...)` / the command audit history for the review actor; and `Prescription.committer` after the UI sign. Establishes that token attribution reaches command-level actions (not just note signing) and shows exactly which `CanvasUser` the UI sign records.

**4. Whether EPCS gates sign or only send.**
Two accounts, one EPCS-enrolled and one not, both with NPI and SPI. Originate a controlled substance (DEA-scheduled `fdb_code`, patient sex at birth recorded) for each, `review`, then attempt to sign in the UI as each.
Inspect: whether the non-enrolled prescriber is offered `sign_action` at all, or is offered sign but not send. Settles the "unsettled" row above, and tells you whether an unsignable controlled prescription fails at review, at sign, or at send.

**5. Whether signing prompts for a second factor, and whether it is scriptable.**
As an EPCS-enrolled prescriber, sign a controlled substance in the UI with the browser devtools network tab recording.
Inspect: whether a 2FA/OTP/biometric prompt appears; the request(s) the sign button issues, their path, and their payload. This is the only way to learn whether the DEA two-factor step exists and whether it is even theoretically reachable from outside the UI. **Expect it to be non-reproducible outside the browser session — and note that reproducing it deliberately from an external app would likely breach your EPCS attestation regardless of technical feasibility.** Treat this test as fact-finding, not as a workaround to build on.

**6. NPI-at-sign.**
Strip the NPI from a test prescriber; originate + review a non-controlled prescription; attempt to sign in the UI.
Inspect: whether `sign_action` is offered and what error appears. Documents the failure surface for the one sign-time prerequisite Canvas states but does not give an error string for.

**7. Regression watch.**
Subscribe to `https://docs.canvasmedical.com/feed.xml` and diff `/sdk/effects/` (the Prescribe row) and `/sdk/handlers-simple-api-commands/` (the action list) on each release. Canvas has never *prohibited* API signing in writing — it merely does not enumerate it — so this can change without any doc reading as a contradiction.
