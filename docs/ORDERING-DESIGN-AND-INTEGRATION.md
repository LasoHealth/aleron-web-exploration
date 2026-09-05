# Ordering: what the APIs permit, and what the design must become

**Master document.** The physician-portal designs were drawn before anyone knew
enough about Junction or the Canvas write surfaces. This document runs the other
direction: it establishes what the two APIs actually permit, and derives what the
design and the backend must look like as a consequence.

4 September 2026. Supersedes
[DECISION-junction-ordering-physician.md](DECISION-junction-ordering-physician.md),
which reasoned from the legacy `JunctionController` / `GeneticsOrderService` /
`PhysicianOrderPlacer` code as though it were the intended model. **No claim here
rests on those controllers.** Every factual claim is sourced in §9.

Companion documents: [API-IMPLEMENTATION-AUDIT.md](API-IMPLEMENTATION-AUDIT.md)
(every data point on every screen), [API-GROUND-TRUTH.md](API-GROUND-TRUTH.md)
(capability reference, pinned to the live `aleronmd-dev` CapabilityStatement).

---

## 0. The user story this serves

> A physician reviews the care plan and sees suggested orders. They review,
> modify, remove or add orders as they see fit — imaging, prescriptions, labs.
> Aleron shows the final list. The physician is guided into the next steps:
> redirected to sign where necessary, or clicking a button in Aleron to confirm
> the orders they want to release to the patient.

With three stated priorities:

1. **Any order is associated to the physician logged into Aleron.**
2. **The complete order history is save-able to the patient's chart in Canvas.**
3. **Steps complete inside Aleron.** Where a step cannot, for legal or
   functional reasons, the physician is redirected to finish it.

**All three are achievable.** Priority 1 depends on one lab-account setting
whose current value nobody has checked — two calls settle it and it may already
be satisfied (§2.1). Priority 3 costs exactly one redirect, and it is the
prescription (§3).

---

## 1. The five facts everything else follows from

| # | Fact | Source |
|---|---|---|
| **F1** | **Canvas attributes a write to whoever authenticated the request.** A plugin route called with an OAuth Authorization Code access token records that staff member as the actor — *"the note is signed and recorded in Canvas as signed by the staff member who authorized the access token."* An API key records **Canvas Bot** instead. | [`/sdk/handlers-simple-api-http/`](https://docs.canvasmedical.com/sdk/handlers-simple-api-http/), [`/guides/writing-commands-over-http/`](https://docs.canvasmedical.com/guides/writing-commands-over-http/) |
| **F2** | **Every command and effect is plugin-gated.** `CommandAPI` is a Python base class you subclass inside a plugin to *create* an endpoint at `/plugin-io/api/<plugin>/`; it is not an API Canvas hosts. The only externally-reachable Canvas surfaces are FHIR and the Note API. | [`/sdk/commands/`](https://docs.canvasmedical.com/sdk/commands/) |
| **F3** | **`send` is the only command action available through the SDK**, for `LabOrder`, `Prescribe`, `Refill` and `AdjustPrescription`. `sign_action` is a **Canvas UI button**, not an HTTP action. Only `ImagingOrder` and `Refer` publish a real `sign()`. | [`/sdk/commands/`](https://docs.canvasmedical.com/sdk/commands/) |
| **F4** | **Junction's delegated flow is a lab-account setting, not a payload choice.** `ClientFacingLabAccount.delegated_flow` is a **required** field, and delegation applies *"only when you're using your own lab account or a Junction subaccount. If you only order with Junction platform accounts, these are non-delegated and orders will continue to use our physicians."* | [`GET /v3/lab_test/lab_account`](https://docs.junction.com/api-reference/lab-testing/lab_accounts), [changelog, May 2026](https://docs.junction.com/changelog/lab-testing/api) |
| **F5** | **A Junction order cannot be edited after submission.** `PATCH /v3/order/{id}` accepts exactly one field, `activate_by`. Cancellation is impossible past `partial_results`. | [`PATCH /v3/order`](https://docs.junction.com/api-reference/lab-testing/patch-order), [cancel order](https://docs.junction.com/api-reference/lab-testing/cancel-order) |

**F1 is why priority 1 works.** **F5 is why the user story's "review, modify,
remove, add" must be a draft inside Aleron rather than post-submission editing —
the API permits nothing else.** **F3 is why priority 3 costs one redirect.**

### Two silent failures to gate against

Both return success and write nothing. Neither is discoverable at runtime without
a caller-side pre-check.

- **A closed note answers `201` with a `command_uuid` and writes nothing.**
- **An unsupported action answers `200` and is then refused** by the
  effect-application layer — *"The caller is told the write succeeded when it did
  not."* This is exactly what `POST /commands/prescribe/<id>/commit` does.
  ([`/guides/writing-commands-over-http/`](https://docs.canvasmedical.com/guides/writing-commands-over-http/))

---

## 2. Prerequisites

Neither is engineering work. The first may already be met; the second is a
one-time setup per physician.

### 2.1 Confirm the lab account's delegated flow — may already be satisfied

Junction supports using your own physicians. Their
[physicians page](https://docs.junction.com/lab/overview/physicians) describes it
as Flow 2: *"the Customer must specify a physician when making an order request.
Both the order and the results are the responsibility of the Customer's chosen
physician."*

**What is not a payload decision is which flow an order runs under.** The
create-order schema says so directly, of the now-deprecated per-lab-test flag:

> `is_delegated` — *"Deprecated and always false. **Delegation is now at the lab
> account level.** Used to denote whether a lab test requires using non-Vital
> physician networks."*
> — [create-order](https://docs.junction.com/api-reference/lab-testing/create-order)

That also reconciles the two pages: delegation used to be per lab test and
moved to the account. The physicians page describes what the flows **are**; the
account's `delegated_flow` decides which one you **get**.

The four settings, verbatim from `LabAccountDelegatedFlow`:

| Value | Junction's description | Satisfies priority 1? |
|---|---|---|
| `order_delegated` | *"Ordering using client's physicians, critical result follow up via Junction"* | Yes, and Junction keeps critical-result follow-up |
| `result_delegated` | *"Ordering using Junction's Physician Network, critical results handled by client"* | **No** — this is the inverse |
| `fully_delegated` | *"Order and critical results handled by client"* | Yes, and Aleron owns critical follow-up too |
| `not_delegated` | *"Junction handles both ordering and results"* | No |

### Two calls settle this, and they may settle it in our favour

**An earlier draft of this document called a delegated lab account a blocking
commercial prerequisite of "weeks, not a sprint". That was speculation.** Nobody
had read our own account's setting. It is a value, and there is an empirical
test that does not depend on reading documentation at all.

**1. Read the setting.**

```
GET /v3/lab_test/lab_account          # team-level
```

If `delegated_flow` already reads `order_delegated` or `fully_delegated`, there
is **no prerequisite** and priority 1 works today. The
[org-level endpoint](https://docs.junction.com/api-reference/org-management/lab-accounts/get-lab-accounts)
returns every account at once.

**2. Place one sandbox order with `physician` set, and read the physician back.**

The order response carries `physician: ClientFacingPhysician {first_name,
last_name, npi}`. So the authoritative answer to *"whose name is on our orders"*
is a field, not an interpretation:

- comes back as **our** physician → delegation is live, priority 1 satisfied
- comes back as a **Junction network** physician → the account is not delegated,
  and the payload was ignored

Do both before designing around a prerequisite that may not exist.

### If it turns out not to be delegated

Then it is a configuration change, and possibly an account one — not
necessarily lab certification:

- Delegation applies to *"your own lab account **or a Junction subaccount**"*,
  and Junction's own worked example describes *"a non-delegated Junction
  subaccount"*. So subaccounts come both ways, and **a delegated subaccount is a
  much smaller ask than certifying our own Labcorp or Quest account.** Ask for
  that first.
- Delegation covers **Labcorp, Quest and Sonora Quest**.
- `order_delegated` versus `fully_delegated` decides **whether Junction still
  phones our patients** about critical results. That is a clinical-operations
  choice, not a technical one.

**The one thing to build defensively regardless.** Enforcement is not yet live —
the changelog section *"Lab account delegation status enforced (May 2026)"* says
*"we will soon be enforcing"*, with *"a grace period"*. Until it lands, *"even if
the order should be delegated, we would allow a fallback to using Junction
physicians if a physician wasn't provided."* A silent fallback is exactly a
priority-1 violation that nothing surfaces, so **read `order.physician` back on
every order and reconcile it against the physician we sent.** That check is
cheap, it is the only thing that detects the failure, and it stays useful after
enforcement arrives.

Junction also recommends *"specifying the lab account ID in requests"* whenever
possible, so send `lab_account_id` rather than leaving the account to inference.

### 2.2 Per-physician Canvas OAuth enrolment — gates priority 1 only

> **Narrowed by [INSTANCE-FINDINGS](INSTANCE-FINDINGS.md) X4.** Canvas has two
> attribution mechanisms and this section originally treated them as one. The
> **Note API** takes `client_credentials` and names the clinician in its
> `providerKey` field, so **priority 2 — order history in the chart — needs no
> per-physician enrolment at all.** Enrolment is required for *commands*, which
> is priority 1, and remains untested until a plugin exists.

Per **F1**, attribution follows the token. Staff-session auth also works but
needs a Canvas session cookie, which a third-party origin cannot hold. So
Aleron's path is the **Authorization Code + PKCE** flow, storing a rotating
refresh token per physician.

Canvas names this shape the *"Recommended Pattern for External Applications"* — a
provider portal holding a per-user refresh token — and ships a reference
implementation
([`/guides/note-management-oauth/`](https://docs.canvasmedical.com/guides/note-management-oauth/),
[`/api/customer-authentication/`](https://docs.canvasmedical.com/api/customer-authentication/)).

**Consequence for the design:** a physician who has not consented cannot place an
attributable order. That is a first-class state a screen must show, not an error.
Canvas users being provisioned (confirmed) is necessary but not sufficient —
consent is a separate, per-physician, one-time act.

---

## 3. The order routing table

What each order type can and cannot do, and where the physician's next step is.

| Order type | Composed in Aleron | Signed | Transmitted | Redirect? |
|---|---|---|---|---|
| **Lab / genetic panel** | ✓ draft as staged `LabOrder` command | n/a — Junction places it | **Junction** `POST /v3/order` | **No** |
| **Imaging** | ✓ `ImagingOrder.originate()` | **✓ `sign()`** under the physician's token | ✓ `send()` | **No** |
| **Referral** | ✓ `Refer.originate()` | **✓ `sign()`** under the physician's token | ✗ **no `send()`** — transmission is Canvas-native | No, for signing |
| **Prescription** | ✓ `originate()` → `edit()` → **`review()`** | ✗ **UI only** | `send()` after a human signs | **Yes — the one redirect** |

**Notes that matter for each row.**

- **Labs.** Junction places and results them; Canvas holds no order record by
  default. A staged Canvas `LabOrder` command is still worth originating as the
  *chart record* (§4.5), but it is not what transmits.
- **Imaging.** Two calls, not one: `sign()` then `send()`. A `send()` that fails
  after a successful `sign()` leaves a signed, untransmitted order — a state the
  UI must be able to show.
- **Referrals.** `Refer` publishes `sign()` and `delegate()` but **no `send()`**.
  Aleron can sign a referral and cannot transmit it or learn that it was
  transmitted. Also: **`Refer` has no `ordering_provider_key`** in its parameter
  table, so attribution rests entirely on **F1** — the token.
- **Prescriptions.** `review()` is SDK-available, which lands the prescription
  **one click from signed** in Canvas. That is the handoff to build. `SPI` is
  send-only — *"a prescriber without one can still review and sign"* — while
  `NPI` is required to sign. **EPCS does not create a second path**; it narrows
  the same one, so there is no "controlled substances only" carve-out.

### The `delegate` fallback, and the only real deep link

`ImagingOrder` and `Refer` publish `delegate()`, which creates a Canvas **`Task`**
with `linked_object_type` of exactly `IMAGING` or `REFERRAL`. FHIR `Task`
responses carry a genuine **`task-permalink`** that survives an SSO bounce.

This matters because **note and command permalinks have no documented API** —
constructing one is inference — and there is **no documented "awaiting your
signature" queue** for commands. If any step needs a durable hand-off link, route
it through a Task.

---

## 4. What must change in the design

Nine changes. Each is a consequence of §1–3, not a preference.

### 4.1 The order set becomes a real draft, and the draft lives in Canvas

The user story has the physician **modifying, removing and adding** orders. The
current care plan draws an engine-proposed set with disposition controls
(include / defer / document exception) — dispositioning is not editing.

**F5 forces the draft to precede submission.** The cheapest place to hold it that
does not break strict data residency
([audit Part 5, decision 2](API-IMPLEMENTATION-AUDIT.md)) is **a Canvas note with
staged, uncommitted commands**:

- `CREATE_NOTE` at the start of the care-plan cycle — currently undrawn on every
  screen, and everything downstream needs the `note_uuid`.
- Each proposed order is `originate()`d as a **staged** command.
- Editing is `edit()` on the staged command; removing is `delete()`; adding is
  another `originate()`.
- Nothing is patient-linked in Aleron. The draft is Canvas-resident from the
  first keystroke.

Cost, stated plainly: the chart accumulates open notes with staged orders that
clinicians will see in Canvas, and the Note API has **no state filter**, so
Aleron cannot list its own drafts back.

### 4.2 A confirm-orders surface, which does not exist today

Orders are currently split between the care plan (intents) and `orders.html`
(placed), with nothing in between. The story needs the middle: *"Aleron shows the
final list of orders."*

It must show, per order: the order, its route, **what it needs from the
physician**, and whether it completes in Aleron. It is a **one-way door** — after
confirmation, Junction permits no edits and no cancellation past
`partial_results`. The screen has to say so before the click, not after.

### 4.3 The standing-orders screen loses its premise

That screen is built around a configured standing order — a reference, an NPI, a
catalog — as *the* physician authorization. Under priority 1 **every order names
the logged-in physician**, so a config-level NPI authorizes nothing.

What the surface should become, because these facts still need a home:

- Per-physician **credential and enrolment state**: Canvas OAuth consent (§2.2),
  Canvas `Staff.id`, NPI, `licensed_states`, SPI present, EPCS enrolled. Each is a
  precondition for some order type, and a physician missing one needs to know
  which orders they cannot place.
- The **lab catalog**, reconciled against Junction rather than against `.env`
  (§5.5).
- The **`delegated_flow`** the account is on, because it determines who reviews
  results.

### 4.4 Per-order next-step guidance replaces a per-screen route strip

The routing pass added a route strip to the *authorize* card. Under the story the
guidance is **per order in the final list**, because a single confirmation spans
orders with four different endings. Three states are enough:

- **Completes here** — labs, imaging, referrals.
- **Needs your signature in Canvas** — prescriptions, with the redirect.
- **Signed, transmission is the practice's** — referrals, which Aleron cannot
  send.

### 4.5 The chart record becomes the note, and it is the order history

Priority 2 is *"the complete order history is save-able to the patient's chart."*

The mechanism is not a per-order document. It is the note: staged and signed
commands live in it, and locking it via `PATCH /core/api/notes/v1/Note` with
`stateChange` — externally callable — makes it immutable.

> **Corrected twice; [INSTANCE-FINDINGS](INSTANCE-FINDINGS.md) X7 is current.**
> This section said locking *"generates the PDF **and** the FHIR
> `DocumentReference`"*, which is what
> [`/api/note/`](https://docs.canvasmedical.com/api/note/) states and what the
> instance contradicts: **14 locked notes, 0 documents.** **Signing is what
> generates them** — the first note signed produced a document within five
> seconds, `period.start` matching exactly.
>
> `stateChange` refuses `SGN`, but `POST /api/NoteStateChangeEvent/` reaches it
> and accepts a `client_credentials` token, so **the sequence is Aleron's to
> perform: create, lock, sign.** That endpoint is **undocumented as HTTP** —
> Canvas's own front end calling itself — so priority 2 rests on something
> Canvas has not promised to keep. The supported alternative is a plugin
> `SignNoteActionButton` in the note footer, which is a physician click rather
> than a headless call. Vendor question 9 asks Canvas to settle this.

For Junction labs, the chart also needs the results, which arrive as **real
values** via `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS` — units, reference
ranges and abnormal flags, not a PDF. Junction's requisition PDF is retrievable
at `GET /v3/order/{id}/requisition/pdf` and belongs in the chart as the
order-side artefact.

### 4.6 Order authorization and patient release stay separate

Confirmed as a design decision. Confirming the order set transmits orders;
releasing the plan controls what the patient sees. Different audiences, different
failure modes, and orders may transmit while the note is still an open draft.

### 4.7 The prescription redirect becomes a drawn step, not a footnote

It is the only redirect in the flow and it should look deliberate:

1. Aleron composes the prescription and calls `review()` — one click from signed.
2. The physician is sent to Canvas. Land them on the patient chart; a constructed
   note URL from `noteKey` has no contract, so it needs a 404 fallback.
3. They sign in the Canvas UI.
4. **Aleron learns on the next render.** No callback, no scheduled job — the
   physician is the trigger. The plugin ORM read is exact.

The copy *"Open the chart and come back; the plan holds its place"* is true under
this model.

### 4.8 Physician identity belongs on the order, visibly

Priority 1 is an invariant, so it should be visible and its failure should block.
`ordering_provider_key` takes a `Staff.id`, is **plain data with no validation at
sign time**, and Canvas will write a record where the named provider and the
actual committer disagree. **Aleron must enforce that consistency itself**, and
the screen should show which physician is on the order.

### 4.9 A result-review surface, because Flow 2 makes abnormals silent

Under a delegated flow, result validation is Aleron's physician's
responsibility — and Junction has **no `labtest.result.abnormal` event**. Only
`labtest.result.critical` exists, and **partial results fire no webhook at all**
by default, Junction's stated reason being *"the possibility of critical
values."*

So abnormal results must be **polled**, not awaited. `GET /v3/orders` supports
`is_critical` and `interpretation` filters, which is what the queue is built on.
This is a clinical-safety obligation the delegated flow transfers to Aleron, and
no current screen carries it.

---

## 5. How the backend should work

### 5.1 Identity and tokens

- Authorization Code + PKCE per physician; store the refresh token per physician,
  rotated (single-use).
- **Every Canvas call in an order's lifecycle carries that physician's access
  token.** `originator` and `committer` resolve independently per request:
  originate under a service key and sign under the physician's token and the
  record reads originator = Canvas Bot, committer = Dr. X.
- Service-key calls remain fine for reads and for anything genuinely
  system-authored.
- A physician without valid consent cannot place an attributable order. Surface
  it; do not fall back to the service key.

### 5.2 The note lifecycle

```
CREATE_NOTE (cycle start, physician token)
  → originate staged commands per proposed order
  → edit / delete as the physician revises
  → on confirm:  ImagingOrder.sign() + send()
                 Refer.sign()
                 Prescribe.review()        ← then redirect
                 Junction POST /v3/order   ← labs
  → UPSERT_NOTE_METADATA for Aleron-owned facts
  → PATCH Note stateChange → locked
        ⇒ Canvas generates the PDF and the DocumentReference
```

**Pre-check note state before every command write** — a closed note answers `201`
and writes nothing. **Gate the action set caller-side** — an unsupported action
answers `200` and is silently refused. Both per §1.

### 5.3 Junction submission

Required per order: `user_id`, `patient_details`
(`first_name`, `last_name`, `dob`, `gender`, `phone_number`, `email`),
`patient_address` (`first_line`, `city`, `state`, `zip`, `country`).

The `physician` object requires only **`first_name`, `last_name`, `npi`**;
`email` and `licensed_states` are optional, and the object is **embedded per
order every time** — the only physician endpoint is read-only
[`GET /v2/team/{team_id}/physicians`](https://docs.junction.com/api-reference/lab-testing/get-team-physicians),
returning `{first_name, last_name, npi}` with no POST, PATCH or DELETE. There is
no physician registration or credentialing step at Junction; the gate is the lab
account. Two cautions:

- **`licensed_states` is typed bare `string[]`**, not the `USState` enum the same
  spec uses elsewhere, and **no cross-check against `patient_address.state` is
  documented**. Nobody enforces licensure. If Aleron asserts a physician, Aleron
  owns that gate.
- **`signature_image` is not a requisition signature.** Its only description is
  *"An image of the physician signature for health insurance billing"*, beside
  `patient_signature_image` with identical wording. Nothing says it is rendered
  onto a requisition, and there is no signing endpoint in the API. **Do not
  design on it** without checking a sandbox requisition PDF (§6, T4).

**Send `lab_account_id`.** Junction recommends it explicitly — *"whenever
possible, we recommend specifying the lab account ID in requests"* — and it is
what determines whether an order runs delegated at all (§2.1). The account also
carries a `default_clinical_notes`.

Also worth sending, all currently unused: `icd_codes`, `clinical_notes`
(**120-character cap**), `billing_type`, `activate_by`, `priority`.

### 5.4 Results back into the chart

- Webhook `labtest.result.critical` → immediate physician surfacing.
- **Poll** `GET /v3/orders?is_critical=…&interpretation=…` for abnormals, which
  have no event.
- Structured `BiomarkerResult` (`name`, `value`, `unit`, `reference_range`,
  `min_range_value`, `max_range_value`, `is_above_max_range`,
  `is_below_min_range`, `interpretation`, `loinc`) →
  `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS`.
- Result PDFs and the requisition PDF are separately retrievable and belong in
  the chart alongside.
- Model `order.status` and the 52-value `OrderStatus` **as strings**. Both are
  documented non-exhaustive with an explicit warning against exhaustive matching.
- The webhook envelope is **inconsistent**: order events are bare objects,
  appointment and critical events use `{event_type, data}`. Handle both.

### 5.5 Catalog and pre-flight

There is **no single "is this orderable for this patient" endpoint.** Assemble
it: `area/info` (with `lab_account_id`), `psc/info`, `allowed_billing` per state,
and `POST /v3/lab_tests/list_order_set_markers` as a dry run — the `400` is
authoritative. `simulate-order` is a sandbox status-advancer, not validation.

Reconcile the catalog against `GET /v3/lab_tests` on a schedule and give the menu
states for *not active at the lab* and *not offered by this lab account*. A count
of configured env vars is a claim about `.env`, not about the world.

Coverage the screens omit entirely: testkit and walk-in cover 49 states (not New
York); at-home phlebotomy 35.

---

## 6. Tests to run before building

Ordered by how much they would change if the answer surprises us.

| # | Test | Decides |
|---|---|---|
| **T1** | On a Prescribe command: `review()`, do **not** sign, then `send()`. Inspect `committer`. | Whether *"sending is how they are finished"* means `send` performs the sign. If it does, §3's prescription row and the whole redirect flip. This is the one contradiction the research did not resolve. |
| **T2** | Call a plugin route with a physician's OAuth token; originate and sign an `ImagingOrder`. Inspect `originator`, `committer`, `Provenance.agent`. | Whether **F1** holds in practice. Priority 1 depends on it. |
| **T3** | Set `ordering_provider_key` to a provider **other than** the token holder. | Whether Canvas validates it, or writes the self-contradicting record. Decides whether the field is useful or a liability. |
| **T0** | `GET /v3/lab_test/lab_account`, then place a sandbox order with `physician` set and read `order.physician` back. | Whether priority 1 already works. Cheapest test in this table and it may delete §2.1 entirely. Run it first. |
| **T4** | Place a sandbox Junction order with `signature_image`; fetch `GET /v3/order/{id}/requisition/pdf`. | Whether the physician's signature appears on the requisition. Decides whether labs truly need nothing further. |
| **T5** | Originate under a service key, sign under the physician's token. | Confirms the token must thread through every call, or shows the sign alone suffices. |
| **T6** | `POST` a command to a **locked** note. | Confirms the silent `201`, and fixes the pre-check. |
| **T7** | Sign a prescription for a controlled substance via API. | EPCS-at-sign is genuinely unsettled — one release note references *"an error that could prevent EPCS signing for refill prescriptions."* |

---

## 7. Open questions for the vendors

**Junction**

1. Which `delegated_flow` is available to us, and does it require our own
   certified lab account? What is the lead time? (§2.1)
2. Under `fully_delegated`, who contacts a patient with a critical result?
3. **A contradiction to resolve:** `critical-results` says the lab calls *"the
   Junction-assigned physician… They act as the ordering physician"*, which
   cannot describe a delegated flow where our physician is the orderer.
4. Is `signature_image` rendered onto the requisition, or is it billing-only?
5. Is `licensed_states` validated anywhere?

**Canvas**

6. Is API-initiated prescription signing prohibited, or merely not enumerated?
   The docs have never prohibited it in writing — which also means it could
   appear in a release without any documentation reading as contradictory.
7. Is there any command-level "awaiting signature" queue or permalink, or is
   `Task` genuinely the only durable hand-off?
8. Does `sign()` on `ImagingOrder` / `Refer` constitute a clinical attestation,
   or only a state transition? Every `sign_action` is documented as
   staged → committed, never as an attestation.
9. **[Note → Update](https://docs.canvasmedical.com/api/note/#update) says
   locking generates the PDF and the `DocumentReference`. Signing is what does**
   ([INSTANCE-FINDINGS](INSTANCE-FINDINGS.md) X7) — 14 API-locked notes produced
   0 documents; one signature produced one. Will Canvas correct the page?
10. **`stateChange` cannot reach `SGN` or `DLT`, but `POST
    /api/NoteStateChangeEvent/` can, and it accepts a `client_credentials`
    token.** That endpoint is undocumented. **Will Canvas support it, or name
    the supported headless equivalent?** Without one, a partner application
    cannot sign or delete a note except by putting a button in the Canvas UI for
    a physician to click.
11. The same endpoint records a **named human** — the OAuth application's owner
    — where the v1 Note API records **Canvas Bot**, on one identical token. Is
    that intended, and is the owner configurable per call?

---

## 8. What this changes in the audit

| Audit claim | Correction |
|---|---|
| "`Refer` has `ordering_provider_key`" | It does not. Attribution rests on the token. |
| "`LabOrder` and `Prescribe` have no `sign_action`" | They have one — but it is a **UI button**, not an HTTP action, so the practical conclusion stands. |
| "`Task` is a Canvas command" | It is not. FHIR resource plus Task effects. |
| "The prescription return leg is unsolved" | Solved by read-on-render. And `task-permalink` is a real deep link where one is needed. |
| "Aleron writes the locked note's `DocumentReference`" | Canvas generates it on lock. |
| "Junction Flow 2 follows from sending `physician`" | It follows from `delegated_flow` on the lab account. Sending `physician` on a non-delegated account changes nothing. |
| "`signature_image` may carry the requisition signature" | Unverified and probably billing-only. |

---

## 9. Source register

### Canvas

| Fact | Source |
|---|---|
| OAuth token attribution; Canvas Bot default | [`/sdk/handlers-simple-api-http/`](https://docs.canvasmedical.com/sdk/handlers-simple-api-http/) |
| Attribution table by auth mixin; the silent-200 commit trap | [`/guides/writing-commands-over-http/`](https://docs.canvasmedical.com/guides/writing-commands-over-http/) |
| Recommended pattern for external applications; per-user refresh token | [`/api/customer-authentication/`](https://docs.canvasmedical.com/api/customer-authentication/) |
| Reference implementation, OAuth + PKCE external app signing notes | [`/guides/note-management-oauth/`](https://docs.canvasmedical.com/guides/note-management-oauth/) |
| `send` is the only SDK command action; `sign()` on ImagingOrder and Refer only; command field tables | [`/sdk/commands/`](https://docs.canvasmedical.com/sdk/commands/) |
| Effects catalogue; `CREATE_LAB_REPORT`, `ATTACH_LAB_REPORT_RESULTS`, note effects | [`/sdk/effects/`](https://docs.canvasmedical.com/sdk/effects/) |
| Note API: create, `stateChange` lock, PDF and DocumentReference on lock | [`/api/note/`](https://docs.canvasmedical.com/api/note/) |
| FHIR read/write matrix, pinned to the instance | [canvas-capability-snapshot.json](canvas-capability-snapshot.json), `node scripts/verify-canvas.js` |
| Condition update restricted to entered-in-error | [`/api/condition/`](https://docs.canvasmedical.com/api/condition/) |

### Junction

| Fact | Source |
|---|---|
| The three physician flows and their responsibility language | [Order and Follow-up Physician](https://docs.junction.com/lab/overview/physicians) |
| `delegated_flow`, all four members with descriptions; `ClientFacingLabAccount` | [Get lab accounts](https://docs.junction.com/api-reference/lab-testing/lab_accounts) |
| **"Delegation is now at the lab account level"**; `physician` optional on request; `ClientFacingPhysician` returned on the order | [Create order](https://docs.junction.com/api-reference/lab-testing/create-order) |
| Org-level view of every lab account | [Org management, get lab accounts](https://docs.junction.com/api-reference/org-management/lab-accounts/get-lab-accounts) |
| Delegation needs own or sub- account; enforcement grace period; `lab_account_id` recommended | [Changelog, lab testing API](https://docs.junction.com/changelog/lab-testing/api) |
| Read-only team physician list | [Get team physicians](https://docs.junction.com/api-reference/lab-testing/get-team-physicians) |
| `create-order` schema; `physician` object; `clinical_notes` 120-char cap | [Create order](https://docs.junction.com/api-reference/lab-testing/create-order) |
| `PATCH` accepts only `activate_by`; no post-submission edits | [Patch order](https://docs.junction.com/api-reference/lab-testing/patch-order) |
| Cancellation window | [Cancel order](https://docs.junction.com/api-reference/lab-testing/cancel-order) |
| `BiomarkerResult` fields | [Get results](https://docs.junction.com/api-reference/lab-testing/results/get-results) |
| Critical results, and the ordering-physician contradiction | [Critical Results](https://docs.junction.com/lab/results/critical-results) |
| Result formats, PDFs, structured data | [Result Formats](https://docs.junction.com/lab/results/result-formats) |
| Webhook events and envelope | [Webhooks](https://docs.junction.com/webhooks/introduction), [Event structure](https://docs.junction.com/webhooks/event-structure) |
| Collection methods and state coverage | [Testing Modalities](https://docs.junction.com/lab/overview/testing-modalities) |
| Order status lifecycle | [Lab Test Lifecycle](https://docs.junction.com/lab/workflow/lab-test-lifecycle) |

### Working notes behind this document

- [VERIFY-signature-attribution.md](audit/VERIFY-signature-attribution.md) — whose signature a plugin-initiated write carries
- [VERIFY-prescription-signing.md](audit/VERIFY-prescription-signing.md) — why the prescription redirect is unavoidable
- [VERIFY-junction-flow2.md](audit/VERIFY-junction-flow2.md) — Flow 2 end to end, and the lab-account flag
- [VERIFY-sdk-reach.md](audit/VERIFY-sdk-reach.md) — which write surfaces an external app can reach
- [VERIFY-plugin-mechanics.md](audit/VERIFY-plugin-mechanics.md) — events, egress, custom data models

### Deliberately not cited

The legacy `JunctionController`, `JunctionGeneticsController`,
`GeneticsOrderService`, `PhysicianOrderPlacer`, `OrderCanvasRecorder` and
`config/junction.php` standing-order block. They implement a superseded design
in which a configured NPI was the authorization. Under priority 1 that model is
replaced, and describing it would only anchor the new design to the old one.
