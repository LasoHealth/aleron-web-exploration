# Junction Flow 2: customer-supplied physician, end to end

Researched 2026-09-04 against `https://docs.junction.com` (OpenAPI version stamp `0.4.749` on every
api-reference page). All ~126 lab-testing markdown pages plus the webhook pages were fetched raw
(`<url>.md`) and grepped. Quotes are verbatim; everything marked **[INFERENCE]** is my reading, not
Junction's words.

**One-line answer on feasibility:** Flow 2 is real and API-complete for *placing* physician-attributed
orders — but it is **gated on a lab-account configuration flag (`delegated_flow`), not on passing the
`physician` object**, it requires the customer's own lab account (or a Junction subaccount) rather than
Junction's platform account, and Junction provides **no result-delivery-to-physician channel and no
sign-off API** — result review in Flow 2 is entirely the customer's own build and own record-keeping.

---

## The critical discovery: Flow 2 is a lab-account setting

This is the single most important finding and it is not on the `/lab/overview/physicians` page. The
three documented flows map onto an enum on the **lab account** object, `LabAccountDelegatedFlow`
(`GET /v3/lab_test/lab_account`):

> ```
> LabAccountDelegatedFlow:
>   enum: [order_delegated, result_delegated, fully_delegated, not_delegated]
>   description: >-
>     Describes which parts of the lab testing flow are delegated to the customer.
>     - ORDER_DELEGATED: Ordering using client's physicians, critical result follow up via Junction
>     - RESULT_DELEGATED: Ordering using Junction's Physician Network, critical results handled by client
>     - FULLY_DELEGATED: Order and critical results handled by client
>     - NOT_DELEGATED: Junction handles both ordering and results
> ```
> — `api-reference/lab-testing/lab_accounts.md`

Mapping (mine, **[INFERENCE]** but tightly constrained by the wording):

| Physicians-page flow | `delegated_flow` |
|---|---|
| Flow 1 — Junction orders and reviews | `not_delegated` |
| **Flow 2 — customer physician orders *and* reviews** | **`order_delegated` or `fully_delegated`** |
| Flow 3 — Junction orders, customer reviews | `result_delegated` |

`order_delegated` vs `fully_delegated` is exactly the critical-results question: under
`order_delegated` Junction retains critical-result follow-up; under `fully_delegated` the customer
owns it too. Aleron must decide which it wants and have the CSM configure it — there is no API to set it.

And the enabling condition, from the changelog:

> ### Lab account delegation status enforced (May 2026)
> We will soon be enforcing that at least one physician is supplied on order creation for Labcorp,
> Quest, and Sonora Quest labs *if your order is configured to use a delegated lab account*. Up until
> now, even if the order should be delegated, we would allow a fallback to using Junction physicians if
> a physician wasn't provided in the order. Going forward, non-delegated orders will use Junction
> physicians, but delegated orders must supply a physician.
> […]
> Delegated flow values of either `order_delegated` or `fully_delegated` mean that we expect you to be
> supplying your own physicians in order requests. **This only applies when you're using your own lab
> account or a Junction subaccount. If you only order with Junction platform accounts, these are
> non-delegated and orders will continue to use our physicians.**
> — `changelog/lab-testing/api.md`

**Consequences for Aleron's requirement ("every order attributed to the logged-in physician"):**

1. Passing `physician` on a **platform-account** order does not put Aleron in Flow 2. Pre-enforcement
   the field is accepted; the *account* is `not_delegated`, so Junction's network still validates.
   **[INFERENCE]**, but it is the only reading consistent with "non-delegated orders will use Junction
   physicians."
2. Flow 2 therefore requires Aleron (or its Org) to hold **its own Labcorp/Quest/Sonora Quest account,
   or a Junction subaccount**, marked delegated. That account must be certified:
   > "Before a customer-owned lab account can be used operationally through Junction, the laboratory may
   > require certification… you should expect most certifications to take several weeks to complete with
   > the lab." — `lab/overview/lab-accounts.md`
3. Once delegated, supplying `physician` stops being optional and becomes **mandatory per order** —
   which happens to be exactly the invariant Aleron wants, enforced by the vendor.
4. Junction recommends always sending `lab_account_id` explicitly, and it is effectively required if
   more than one active account is linked:
   > "If more than one active lab account is linked to your Team for the selected lab, the order may be
   > rejected unless you provide `lab_account_id`." — `lab/overview/lab-accounts.md`

Check it at runtime: `GET /v3/lab_test/lab_account` returns `delegated_flow` per account. A portal
should read this on boot and refuse to render an order form against a non-delegated account.

---

## The physician object

`PhysicianCreateRequest`, verbatim from `api-reference/lab-testing/create-order.md` (identical schema
in `import-order.md` and `register-order.md`):

| Field | Required in Flow 2? | Notes | Evidence |
|---|---|---|---|
| `first_name` | **Yes** | `type: string`. Junction's `PatientDetails` name regex is documented; **no** equivalent regex is documented for physician names. | `required: [first_name, last_name, npi]` |
| `last_name` | **Yes** | `type: string` | same |
| `npi` | **Yes** | `type: string`. **No format, length, or checksum validation is documented**, and Junction's own import example passes `npi=""`: `PhysicianCreateRequest(first_name="Jane", last_name="Doe", npi="")`. So the API will likely accept a syntactically invalid NPI — **Aleron must validate the 10-digit Luhn itself.** | `required` list; `lab/workflow/importing-order.md` |
| `email` | Optional | `anyOf: [string, 'null']`. No format validation declared. **No documented purpose** — Junction's `communications.md` covers only patient email/SMS and never mentions physician notification. Do **not** assume results are emailed here. | schema; `lab/workflow/communications.md` |
| `licensed_states` | Optional | `items: {type: string}, type: array` — note: **plain `string`, not the `USState` enum** used elsewhere in the same spec (e.g. `allowed_billing`). Absent from `required`. | schema |
| `signature_image` | Optional | `anyOf: [Jpeg, Png, 'null']`, described as *"An image of the physician signature for health insurance billing"*. | schema |

The object *is* mandatory-as-a-whole on delegated accounts (per the changelog), but Junction never
publishes a Flow-2-specific required-field list — the schema's `required` triple is the only
field-level authority. So: **first_name + last_name + npi is the minimum that will be accepted.**

Note the asymmetry on read-back: the order **response** carries `ClientFacingPhysician`, which is only
`{first_name, last_name, npi}` (all three required) — no `email`, no `licensed_states`, no signature.
Aleron cannot round-trip through Junction to learn which physician-record it sent; **store the
attribution locally, keyed by `order.id`.**

### What `signature_image` is, and whether it removes a signing step

Format: a JSON object, not a multipart upload or a bare base64 string:

> ```
> Jpeg:
>   properties:
>     content: {type: string, format: binary}
>     content_type: {type: string, const: image/jpeg}
>   required: [content]
> Png:
>   properties:
>     content: {type: string, format: binary}
>     content_type: {type: string, const: image/png}
>   required: [content]
> ```
> — `api-reference/lab-testing/create-order.md`

- **Encoding:** `format: binary` inside a JSON body. OpenAPI `string/binary` in a JSON payload is
  conventionally base64 — but Junction does not say so, and does not give an example anywhere in the
  docs. **Unresolved; must be confirmed with the CSM or by sandbox trial.**
- **Size limits:** **none documented anywhere.**
- **Dimensions / DPI:** none documented.
- **Documented purpose:** "for health insurance billing" — and nothing else. It sits directly
  alongside `HealthInsuranceCreateRequest.patient_signature_image` ("An image of the patient signature
  for health insurance billing"), i.e. it is presented as an **insurance-billing artefact, paired with
  the patient's signature — not as a requisition-signing mechanism.**

**Does supplying it satisfy the requisition signature requirement?** **The docs do not say so, and the
one sentence describing the field points the other way.** I found no statement anywhere that
`signature_image` is rendered onto the requisition, nor any documented separate signing step, nor any
signing endpoint. Two candidate readings:

- **[INFERENCE, plausible]** On a delegated account the requisition is generated with the supplied
  physician as ordering provider and the signature image applied, so no separate step exists — this is
  consistent with there being no signing endpoint in the entire API surface and with delegated accounts
  being usable end-to-end.
- **[INFERENCE, also plausible]** Signing is handled out-of-band per lab-account configuration (a
  standing signature on file with the lab, established during certification), and `signature_image` is
  genuinely only an insurance-billing field.

**Treat "the signature rides on the order, so labs complete entirely inside Aleron" as UNVERIFIED.**
It is the load-bearing assumption for the in-portal design and Junction's docs do not support it.
Get it in writing from the CSM before building on it.

### Is `licensed_states` cross-checked?

**Your belief is confirmed: Junction documents no cross-check.** The string `licensed_states` appears
in exactly four places in the whole lab-testing corpus — three identical schema definitions
(`create-order`, `import-order`, `register-order`) and one payload example in
`lab/workflow/scheduled-orders.md`. There is:

- no narrative page describing it,
- no error message mentioning it (the documented 400s in `lab/workflow/ordering.md#test-selection-errors`
  are all about test/marker/lab/collection-method conflicts),
- no mention in `order-requirements.md`, whose Physician section just links out to the flows page,
- no mention against `patient_address.state`, against `allowed_billing` state lists, or against
  `AreaInfo`.

It is also typed as bare `string[]` rather than the `USState` enum the same spec uses elsewhere, which
is what you'd expect of a field that is stored and echoed rather than validated. **[INFERENCE]** it is
a pass-through/record-keeping field. **Aleron must enforce physician-licensure-vs-patient-state
itself.** That is a real compliance obligation Junction is not carrying.

---

## Physician registration

**Per-order. There is no physician registration or management API.**

The only physician endpoint in the entire documented surface is read-only:

> `GET /v2/team/{team_id}/physicians` — "Retrieve the list of physicians associated with a team."
> Returns `ClientFacingPhysician[]` = `{first_name, last_name, npi}`.
> — `api-reference/lab-testing/get-team-physicians.md`

Note it is a **`/v2/team/…` org-management route**, not `/v3/…` lab-testing. There is no POST, PATCH or
DELETE counterpart anywhere in `llms.txt` or the 124-page lab-testing index — I grepped both. So:

- No `physician_id` exists to reference on an order. The `physician` object is embedded in the request
  body, per order, every time.
- Whatever populates the team-physicians list is populated **out of band** (**[INFERENCE]**: by Junction
  during onboarding/delegation setup, and/or derived from physicians seen on orders). Junction does not
  document the mechanism.
- Aleron therefore owns the physician roster: NPI, name, licensed states, signature asset, all stored
  locally and re-serialised into each `POST /v3/order`. `GET /v2/team/{team_id}/physicians` is at best a
  reconciliation check against what Junction thinks it has.

**Credentialing gate:** none documented at the physician level. There is no verification, approval, or
credentialing step for a customer-supplied physician, and no status field on a physician. The gate is
one level up and it is a heavy one: **lab-account certification** (weeks, coordinated with the lab and
the CSM, and blocked until production access is granted) plus the CSM-side `delegated_flow` setting.
**[INFERENCE]** Junction's model is "we credential your account, you credential your physicians."

---

## Result delivery and review in Flow 2

### Mechanism: there is no physician-directed channel. It is webhook + API poll, to *your server*.

Junction never delivers results to a physician. It delivers them to the integration:

> "Junction receives results from the partner laboratory, associates them with an order, and exposes them
> through the API. Your integration should use webhooks to detect changes and the results endpoints to
> retrieve the current result data." — `lab/results/overview.md`

Recommended flow, verbatim (`lab/results/overview.md`):

> 1. Store the `order.id` and `order_transaction.id` returned when you create an order.
> 2. Subscribe to `labtest.order.updated` and the result events your workflow requires.
> 3. Use each order's status and events to track its progress…
> 4. When the transaction reaches `completed`, call [Get Order Transaction Results]…
> 5. Use [Get Order Results] when you specifically need the result associated with one order.
> […]
> Treat webhook payloads as notifications that data changed. Fetch the current order or result before
> making a final workflow decision, and make webhook processing idempotent because delivery can be
> retried or arrive out of order.

Events that matter for results: `labtest.order.updated` (fires on the `completed` transition),
`labtest.result.critical`, and optionally `labtest.match_review.created` for unmatched results.

> "When the test results are ready, you will receive a `labtest.order.updated` webhook where the order
> has a `completed` status." — `lab/results/follow-up.md`

**Partial results do not fire a webhook by default:**

> "The `partial_results` status does not trigger a Webhook unless specifically requested from Junction."
> — `lab/walk-in/webhooks.md`
> "Junction makes these results available to you as soon as we receive them, but does not send a webhook
> notification for `partial` results. This means that if you probe the API for results, you might get a
> `partial` result, even if there was no webhook… This is done due to the possibility of critical values."
> — `lab/results/result-formats.md`

So a Flow-2 portal that must not miss an early critical value needs either an opt-in
(`/lab/workflow/partials`, request from Junction) or a poll. **This is a real gap to design around.**

No portal, no email, no fax to the physician is documented. `lab/workflow/communications.md` is
entirely patient-facing (email + SMS, toggled per Team in the dashboard) and never mentions the
physician. **[INFERENCE]** the physician-facing inbox is Aleron's to build — which is what Aleron wants
anyway, but it means Junction contributes nothing here.

**Useful for building that inbox:** `GET /v3/orders` supports `is_critical` ("Filter by critical order
status") and `interpretation` (`normal | abnormal | critical | unknown`) filters, plus
`updated_start_date` / `updated_end_date`, `status`, `user_id`, `order_transaction_id`, and pagination.
That is a serviceable "unreviewed abnormals" query without maintaining your own index — though it
filters by *interpretation*, not by physician, so Aleron must join to its own physician↔order map.
There is also `POST /v3/order/resend_events` ("Replay a webhook for a given set of orders") for
backfilling after an outage.

### The critical-results caveat

The physicians page carries this warning against **all three flows**:

> "When there are critical results, Junction's physician network will always be notified."

But `lab/results/critical-results.md` describes the mechanism in Flow-1 terms and, read literally,
contradicts the warning for Flow 2:

> "For critical results, the laboratory will contact a physician, so they can provide further information
> to the patient. **The physician called is the Junction-assigned physician. They act as the ordering
> physician when placing the order.** After the call is made, and Junction has received the results from
> the laboratory, a `labtest.result.critical` event is sent."

In Flow 2 the ordering physician on the requisition is *Aleron's* physician, not a Junction-assigned
one — so by the lab's own routing rule the **lab will call Aleron's physician at the number on the
requisition**, not Junction's network. This page appears not to have been updated for the delegated
flows.

The `delegated_flow` enum is the more trustworthy authority and it splits the caveat cleanly:

- **`order_delegated`** — *"Ordering using client's physicians, **critical result follow up via
  Junction**"*. Junction's network stays in the loop for criticals. This is where the "will always be
  notified" warning holds.
- **`fully_delegated`** — *"Order and critical results handled by client"*. Junction's network is out.
  **The warning does not hold here as written**, or holds only as a notification-of-record.

**So: which flavour of Flow 2 Aleron gets is a configuration choice, and it is precisely the choice of
whether Junction still phones patients about criticals.** Confirm with the CSM.

**Does the customer physician still have to act?** Yes, in both flavours. Even under `order_delegated`,
Junction's documented critical-result behaviour is a phone call plus a `labtest.result.critical`
webhook — not a clinical disposition, not a note, not a closed loop. And Junction is unambiguous that
routine follow-up is the customer's:

> "Please keep in mind that the follow-up call with the patient only happens for orders processed by our
> physician network. **If you provided your own physician when you placed the order, you will be
> responsible for following up with your patients.**" — `lab/results/follow-up.md`

### Acknowledgement / sign-off

**There is no acknowledgement or sign-off API, and Junction expects none.** I grepped the full corpus
for `acknowledg`, `sign_off`, `sign-off`, `signoff`, `attest` — every hit is about *appointment*
providers acknowledging booking requests. There is no result-review state on the order, no
`reviewed_at`, no reviewing-physician field, no endpoint to post a disposition.

Result review in Flow 2 is **entirely the customer's own record-keeping.** Aleron must model
reviewed/unreviewed, reviewer identity, and timestamp in its own schema (and, for the EHR chart,
persist them there). Junction's order object will never reflect that a physician looked at the result.

### Abnormal-but-not-critical results in Flow 2

**Nothing happens on Junction's side.** Abnormal is a value, not an event:

- `interpretation: abnormal` appears on the overall result metadata and per-marker
  (`lab/results/critical-results.md`, `result-formats.md`).
- There is **no `labtest.result.abnormal` event** — the event catalog has only
  `labtest.result.critical` (plus order, appointment, match_review, and lab_report parsing events).
- Discovery is via the `completed` `labtest.order.updated` webhook, then reading `interpretation`; or
  via `GET /v3/orders?interpretation=abnormal`.
- Junction's abnormal-result physician call is explicitly Flow-1-only ("our physician will determine if
  a call with the patient is required… only happens for orders processed by our physician network").

So in Flow 2 abnormals are silent: the order simply completes and Aleron must inspect the payload.
Triage, escalation, and patient contact for abnormals are 100% Aleron's.

---

## Requisitions and result documents

Yes, a requisition document exists per order and is API-retrievable.

| Artefact | Endpoint | Format |
|---|---|---|
| **Requisition form** | `GET /v3/order/{order_id}/requisition/pdf` | `application/pdf` ("PDF with requisition form"; op id `get_order_requisition_url_…`) |
| **Result PDF (per order)** | `GET /v3/order/{order_id}/result/pdf` | `application/pdf` |
| **Result PDF (per transaction, combined)** | `GET /v3/order_transaction/{transaction_id}/result/pdf` | `application/pdf` |
| **Structured results (per order)** | `GET /v3/order/{order_id}/result` | JSON, `BiomarkerResult[]` |
| **Structured results (per transaction)** | `GET /v3/order_transaction/{transaction_id}/result` | JSON |
| Result metadata only | `GET …/result/metadata` (`results/get-results-metadata`) | JSON |
| Specimen labels | `GET /v3/order/{order_id}/labels/pdf` | PDF |
| ABN form | `GET /v3/order/{order_id}/abn_pdf` | PDF |
| Collection instructions | `GET /v3/order/{order_id}/collection_instruction_pdf` | PDF |

For a complete EHR chart, the set to archive per order is: requisition PDF + result PDF (prefer the
order-transaction PDF, which merges redraws) + structured JSON + the `order.events` array (the full
status history, which is the audit trail).

Caveats worth designing for:

- Availability is status-gated. Requisitions exist from `requisition_created` onward; before that
  there is no document. **[INFERENCE]** from the lifecycle statuses.
- **Imported orders have no requisition:** "a requisition will not be created… you cannot use the
  endpoint to retrieve the requisition for an imported order since Junction does not have access to it."
  (`lab/workflow/importing-order.md`). Same for the `requisition_bypassed` state generally:
  *"An order requisition form wasn't created when the order was placed with us because it already
  existed."* If Aleron ever imports externally-placed orders, that chart will be missing its requisition.
- Result PDFs may lag partial results: "Some laboratories do not issue PDFs for partial results, and
  only provide PDF reports once all results are finalized." (`lab/results/result-formats.md`)
- `order.requisition_form_url` exists on the order object but is marked **"DEPRECATED. Requistion form
  url."** — use the endpoint, not the field.

### Does the requisition carry the supplied physician's name, NPI and signature?

**Name and NPI: [INFERENCE] almost certainly yes** — the requisition is the lab's order document, it
must name an ordering provider, and on a delegated account the supplied physician *is* the ordering
provider. But Junction **never documents the requisition's contents or rendering**. There is no field
list, no annotated example, and the only page describing what lands on a requisition is
`lab/workflow/clinical-comments.md`, which covers only free-text notes:

> "Central labs (Labcorp, Quest, Sonora Quest and BioReference) allow you to pass in clinical notes.
> These are reflected in the Requisition form that is generated." (order-level via `clinical_notes`,
> max 120 chars, concatenated with any Lab Account default.)

**Signature: not established.** See the `signature_image` discussion above — the only sentence about
that field says "for health insurance billing," and no page states that any signature is rendered onto
the requisition. **If the requisition must visibly bear the physician's signature for Aleron's
compliance story, that must be confirmed with Junction and verified by eye on a sandbox requisition
PDF.** This is the highest-value thing to check first.

---

## Order lifecycle

### High-level status — `order.status`, `OrderTopLevelStatus`

`received | collecting_sample | sample_with_lab | completed | cancelled | failed`

Meanings (`lab/workflow/lab-test-lifecycle.md`): `received` = stored and processing; `collecting_sample`
= shipment (kits) or appointment (phlebotomy/walk-in); `sample_with_lab` = lab analysing; `completed` =
results ready; `cancelled` = by you or the patient; `failed` = Junction failed to process.

Also on the order: `order_transaction.status` = `active | completed | cancelled`
(`OrderTransactionStatus`) and result `status` = `partial | final`. Three different questions — don't
conflate them (`lab/overview/orders-and-results.md`).

### Low-level statuses — `OrderStatus`, format `[HIGH].[MODALITY].[LOW]`

The complete enum from `api-reference/lab-testing/get-order.md` (52 values):

**walk_in_test** — `received.walk_in_test.ordered`, `.requisition_created`, `.requisition_bypassed`;
`collecting_sample.walk_in_test.appointment_pending`, `.appointment_scheduled`, `.appointment_cancelled`,
`.redraw_available`; `sample_with_lab.walk_in_test.partial_results`;
`completed.walk_in_test.completed`, `.corrected`; `cancelled.walk_in_test.cancelled`;
`failed.walk_in_test.sample_error`

**at_home_phlebotomy** — `received.at_home_phlebotomy.ordered`, `.requisition_created`,
`.requisition_bypassed`; `collecting_sample.at_home_phlebotomy.appointment_pending`,
`.appointment_scheduled`, `.draw_completed`, `.appointment_cancelled`;
`sample_with_lab.at_home_phlebotomy.partial_results`; `completed.at_home_phlebotomy.completed`,
`.corrected`; `cancelled.at_home_phlebotomy.cancelled`; `failed.at_home_phlebotomy.sample_error`

**testkit** — `received.testkit.ordered`, `.awaiting_registration`, `.requisition_created`,
`.requisition_bypassed`, `.registered`; `collecting_sample.testkit.transit_customer`,
`.out_for_delivery`, `.with_customer`, `.transit_lab`, `.problem_in_transit_customer`,
`.problem_in_transit_lab`; `sample_with_lab.testkit.delivered_to_lab`, `.lab_processing_blocked`;
`completed.testkit.completed`, `.corrected`; `failed.testkit.failure_to_deliver_to_customer`,
`.failure_to_deliver_to_lab`, `.sample_error`, `.lost`; `cancelled.testkit.cancelled`,
`.do_not_process`

**on_site_collection** — `received.on_site_collection.ordered`, `.requisition_created`,
`.requisition_bypassed`; `sample_with_lab.on_site_collection.draw_completed`, `.partial_results`;
`completed.on_site_collection.completed`, `.corrected`; `cancelled.on_site_collection.cancelled`;
`failed.on_site_collection.sample_error`

### `OrderStatusDetail` — descriptive-only companion field

`fulfillment_error | date_of_collection_unspecified | demographic_information_unspecified |
demographic_information_mismatch | sample_quantity_not_sufficient | sample_contaminated |
sample_stability_exceeded | sample_hemolyzed | sample_improper_collection`

> "A descriptive-only additional field to be used in combination with OrderStatus."

Good source of user-facing failure copy in a UI.

**Every one of these enums is annotated `ℹ️ This enum is non-exhaustive`, and Junction warns explicitly:**

> "To ensure future compatibility, we ask that you avoid exhaustive matching on enum values such as an
> order's status… treat unknown values gracefully" — `lab/workflow/lab-test-lifecycle.md`

For a Go/PHP backend: model statuses as strings with a `default:` branch, not as a closed type. Parse
the three dotted segments rather than matching whole literals.

### Webhook events

Full order/appointment/result event list for lab testing (from the event catalog index):

| Event | When | Payload shape |
|---|---|---|
| `labtest.order.created` | order created, status `ordered` | the order object |
| `labtest.order.updated` | **every** subsequent status change, incl. the `completed` transition that means results are ready | the order object |
| `labtest.appointment.created` | appointment created for an order | `{event_type, data: {…appointment}}` |
| `labtest.appointment.updated` | appointment status change | same |
| `labtest.result.critical` | critical marker or overall interpretation | `{event_type, data: {…}}` |
| `labtest.match_review.created` | unmatched result opened for customer review (closed beta) | — |
| `labtest.match_review.updated` | match review changed | — |
| `lab_report.parsing_job.created` / `.updated` | lab-report parsing jobs (separate feature) | — |

> "The `labtest.order.created` event is triggered when an order is created in the system, having the
> `ordered` status, and all subsequent status changes will trigger a `labtest.order.updated` event."
> — `lab/walk-in/webhooks.md`

**Payload shapes.** The `/event-catalog/*.md` pages are content-stripped (rendered client-side) — the
real examples live on the per-modality webhook pages (`lab/{walk-in,at-home-phlebotomy,testkits,
on-site-collection}/webhooks.md`).

Order payload (walk-in `completed`, abridged from `lab/walk-in/webhooks.md`) — note the order object is
sent **at the top level, without an `event_type`/`data` envelope**:

```json
{
  "id": "84d96c03-…", "team_id": "6353bcab-…", "user_id": "3fa85f64-…",
  "patient_details": { "dob": "2020-01-01", "gender": "male" },
  "patient_address": { "receiver_name": "John Doe", "first_line": "123 Main St.", "city": "San Francisco",
                       "state": "CA", "zip": "91189", "country": "United States", "phone_number": "+1123456789" },
  "details": { "type": "walk_in_test", "data": { "id": "a655f0e4-…", "created_at": "…", "updated_at": "…" } },
  "sample_id": "123456789", "notes": "This is a note",
  "created_at": "…", "updated_at": "…",
  "status": "completed",
  "events": [ { "id": 1, "created_at": "…", "status": "received.walk_in_test.ordered" },
              { "id": 2, "created_at": "…", "status": "received.walk_in_test.requisition_created" },
              { "id": 3, "created_at": "…", "status": "collecting_sample.walk_in_test.appointment_pending" },
              { "id": 4, "created_at": "…", "status": "collecting_sample.walk_in_test.appointment_scheduled" },
              { "id": 5, "created_at": "…", "status": "sample_with_lab.walk_in_test.partial_results" },
              { "id": 6, "created_at": "…", "status": "completed.walk_in_test.completed" } ],
  "origin": "initial",
  "order_transaction": { "id": "6424dd45-…", "status": "completed",
    "orders": [ { "id": "84d96c03-…", "low_level_status": "completed",
                  "low_level_status_created_at": "…", "origin": "initial" } ] }
}
```

**The order webhook payload does not include the `physician` object** in Junction's example (the order
object returned by `GET /v3/order/{id}` does, as `ClientFacingPhysician`). Another reason to hold
attribution locally rather than reading it back off the webhook.

Appointment payload — **does** use the envelope: `{"event_type": "labtest.appointment.updated", "data":
{ id, user_id, order_id, order_transaction_id, address, location, start_at, end_at, iana_timezone, type,
provider, status, event_status, provider_id, can_reschedule, event_data, events[] }}`. Note both
`status` ("confirmed") and `event_status` ("scheduled"), and a provider-specific `event_data`.

Critical payload — envelope, thin: `{"event_type": "labtest.result.critical", "data": {created_at,
updated_at, order_id, sample_id, status, interpretation, team_id, user_id}}`. No marker values; fetch
`GET /order/{order_id}/result`.

**Two envelope styles in one product.** Order events are bare; appointment and critical events are
`{event_type, data}`. Your webhook router must handle both.

Delivery: Svix. Verify `svix-id` / `svix-timestamp` / `svix-signature` against the endpoint's Signing
Secret (`webhooks/introduction.md`). Endpoints are CRUD-able via the Webhooks API, and events are
testable from the dashboard's Webhooks → Testing section with "Send Example".

Also worth heeding, from `lab/walk-in/webhooks.md`: if pre-requisition PSC scheduling or Arizona
scheduling is enabled, *"An endpoint subscribed only to `labtest.order.*` will not receive Appointment
status changes such as scheduled or cancelled."* Subscribe to `labtest.appointment.updated` too.

### Cancellation

`DELETE /v3/lab_test/{order_id}/cancel` (`api-reference/lab-testing/cancel-order`). Governed by an FSM.

Cancellable across all modalities: `ordered`, `requisition_created`, `requisition_bypassed`,
`awaiting_registration`. Never cancellable: `cancelled`, `do_not_process`, `completed`,
`partial_results`, `lost`, `sample_error`, `failure_to_deliver_to_customer`,
`failure_to_deliver_to_lab`. (`lab/workflow/cancelling-an-order.md`)

**`partial_results` being terminal-for-cancellation is the sharp edge** — the moment the lab returns
one marker, the order is locked. So the practical cancellation window is "until the sample reaches the
lab", not "until results are final".

Per modality: walk-in adds all three appointment states; phlebotomy adds appointment states plus
`draw_completed`; testkits stop being cancellable once shipping starts (`out_for_delivery` onward);
on-site adds `draw_completed`.

Failure response: `{"error": "Bad Request", "message": "Transition from current_status to cancelled is
not allowed", "status_code": 400}`. Check `GET /v3/order/{id}` first rather than probing.

Appointment side-effects, which a UI must get right:
- **Mobile phlebotomy:** cancelling the order auto-cancels the appointment. <24h notice is
  non-refundable; >24h fully refunded.
- **Walk-in PSC:** cancelling the order does **not** cancel the PSC appointment — *"to avoid a poor
  patient experience where they arrive and their appointment is cancelled"* — call
  `DELETE /v3/order/{order_id}/appointment/psc/cancel` separately.
- **Test kits:** cancel before shipment to avoid fees; kits ship same business day if ordered before 1PM ET.

### Post-submission modification

**Orders are immutable in content once placed. Tests cannot be added or removed.**

`PATCH /v3/order/{order_id}` exists but its entire request body is one field:

> ```
> UpdateOrderBody:
>   properties:
>     activate_by: {anyOf: [{type: string, format: date}, {type: 'null'}]}
>   required: [activate_by]
>   description: Patch body for updating a modifiable order's scheduled activation date.
> ```

> "Update a modifiable order's scheduled activation date. The order must be in `ordered` or
> `awaiting_registration` status… Returns 400 when: the order is not in a modifiable status, the order
> was created for immediate processing (cannot be scheduled after the fact), `activate_by` is in the past."
> — `api-reference/lab-testing/patch-order.md`

So: no test-set edits, no physician swap, no billing-type change, no address change. `activate_by`
rescheduling only, only for orders that were *created* with an `activate_by`, only while `ordered`.

**Design consequence:** a physician editing a proposed order set must do so entirely in Aleron's own
draft state, before `POST /v3/order`. Model an Aleron-side draft/proposed order and treat the Junction
`POST` as the irreversible commit. Post-submission "edit" = cancel + re-place, which is only possible
inside the cancellation window and issues a new `order.id` (and, note, a **new order transaction** —
grouping is per initial order).

---

## Catalog and pre-flight

### Discovery endpoints

| Endpoint | Returns |
|---|---|
| `GET /v3/lab_tests` | all lab tests the team can access; filters `generation_method` (default `manual`), `lab_slug`, `collection_method`, `status`, `marker_ids`, `provider_ids` |
| `GET /v3/lab_test` | same, paginated |
| `GET /v3/lab_tests/{lab_test_id}` | one lab test |
| `GET /v3/lab_tests/{lab_test_id}/markers` | markers on a test, with `expected_results` (name, slug, provider_id, LOINC) |
| `GET /v3/lab_tests/markers` | search markers by lab or name; filter `a_la_carte_enabled` |
| `POST /v3/lab_tests/list_order_set_markers` | markers resolved for a proposed `OrderSetRequest` — takes the same body you'd order with |
| `GET /v3/lab_tests/labs` | labs |
| `POST /v3/compendium/search` + `/convert` | compendium search |
| `GET /v3/lab_test/lab_account` | team lab accounts incl. `delegated_flow`, `allowed_billing`, `status` |
| `POST /v3/lab_tests` / `PATCH /v3/lab_tests/{id}` | create / update a reusable lab test |

### `ClientFacingLabTest`

`id`, `slug`, `name`, `sample_type` (`LabTestSampleType`), `method` (`LabTestCollectionMethod`:
`testkit | walk_in_test | at_home_phlebotomy | on_site_collection`), `price`, `status`
(`LabTestStatus`; `is_active` deprecated), `fasting`, `lab` (`ClientFacingLab`), `markers`
(`ClientFacingMarker[]`), `auto_generated`, `has_collection_instructions`, `common_tat_days`,
`worst_case_tat_days`, and the deprecated `is_delegated`.

Note there is **one `lab` and one `method` per lab test** — "which labs" and "which collection methods"
are singular at test level. `ClientFacingLab` carries `id, slug, name, first_line_address, city,
zipcode, collection_methods[], sample_types[], logo_url` — so the *lab* advertises multiple
collection methods and sample types even though a given test pins one.

**There is no per-state availability on a lab test or a marker.** The only `us_state` in the marker
schema is `MarkerPricingConditions.us_state` (`USStatePricingCondition.any_of`) — **pricing**
conditions, not orderability. State-level gating that *is* documented lives on the lab account's
`allowed_billing`, which maps each `billing_type` to the states where it's available.

`is_delegated` on a lab test is worth quoting because it's how I found the whole delegation story:

> "Deprecated and always false. Delegation is now at the lab account level. Used to denote whether a lab
> test requires using non-Vital physician networks."

**Do not branch on `lab_test.is_delegated` — it is always false.** Read `lab_account.delegated_flow`.

### `lab_account_id` × `order_set.lab_test_ids`

They are orthogonal but must be mutually consistent:

- `order_set` (which is also the body of `POST /v3/lab_tests/list_order_set_markers`) is
  `{lab_test_ids[], add_on{marker_ids[] | provider_ids[]}, lab_account_id}` — note **`lab_account_id`
  appears inside `OrderSetRequest` as well as at the top level of the create-order body.**
- All referenced lab tests must resolve to **one lab** and **one collection method**:
  `cannot order lab_tests from multiple labs`, `cannot order lab tests with multiple collection methods`.
- The chosen lab account *"must be active, linked to your Team, and associated with the lab selected for
  the order."* Selection when omitted, verbatim from `lab/overview/lab-accounts.md`:

  | Accounts linked for the selected lab | Behaviour |
  |---|---|
  | none | Junction's platform account, if available to your Team |
  | exactly one active | that account |
  | more than one active | Junction does **not** select — order may be rejected |
  | linked but none active | **no fallback to the platform account** |

- **Availability is per-lab-account in three respects:** billing (`allowed_billing` per state),
  delegation (`delegated_flow`), and geographic coverage (`GET /v3/order/area/info` accepts
  `lab_account_id` — *"Lab Account ID to use for availability checks"*). Also per-account:
  `default_clinical_notes` and `business_units`.
- **[INFERENCE]** the *test catalogue* itself is team-scoped rather than lab-account-scoped —
  `GET /v3/lab_tests` has `lab_slug` but no `lab_account_id` filter. So a test can be visible yet
  unorderable on a given account.

### Is there a single pre-flight — "can this patient, at this address, get this test by this method?"

**No. There is no such endpoint.** The answer has to be assembled from four calls, and even then it is
not authoritative:

1. **Geography** — `GET /v3/order/area/info?zip_code=…&radius=…&labs=…&lab_account_id=…`
   > "GET information about an area with respect to lab-testing. Information returned: Whether a given
   > zip code is served by our Phlebotomy network. List of Lab locations in the area."

   Returns `central_labs` per lab with `within_radius`, `radius`, and `capabilities` (e.g. `stat`,
   `appointment_scheduling_with_lab`). `radius` ∈ `10|20|25|50|100` (default 25). Zip pattern
   `^\d{5}(?:-?\d{4})?$`. Labs enum: `quest | labcorp | bioreference | sonora_quest`.
2. **Walk-in locations** — `GET /v3/order/psc/info` → PSC addresses, hours, distance, `site_code`,
   per-site `capabilities`.
3. **Billing in that state** — `lab_account.allowed_billing[billing_type]` must contain
   `patient_address.state`.
4. **Test/marker validity** — `POST /v3/lab_tests/list_order_set_markers` with the exact `order_set`
   you intend to submit. It resolves the markers, which surfaces same-lab / same-collection-method
   conflicts before you commit. Plus `a_la_carte_enabled` on markers if using `add_on`, and
   `lab_test.status == active`.

What none of these check: physician licensure vs patient state, patient-specific eligibility (age, sex,
minor status), AOE completeness, or per-state test legality. Junction is explicit that real validation
happens **at submission**:

> "The API validates the selected tests, markers, laboratories, and collection methods before accepting
> an order." — `lab/workflow/ordering.md`

`POST /v3/order/{order_id}/test` ("Simulate Order") is **not** a pre-flight — it's a sandbox
status-advancer that drives an existing order to a `final_status`. Similarly, sandbox does not
auto-advance: *"In sandbox, there is no async transition from the `ordered` state to the
`requisition_created` state. This must be manually triggered via the Junction Dashboard."*

**Recommendation:** show an order as "placeable" from (1)+(3)+(4), label it optimistically, and treat
the `POST` 400 as the authoritative answer with the documented error strings mapped to user-facing copy.
`list_order_set_markers` is the closest thing to a dry run and is cheap — call it on every draft change.

---

## What Flow 2 costs the customer

Obligations Junction shifts onto Aleron and its physicians:

1. **Own a certified, delegated lab account.** Flow 2 is not reachable on Junction platform accounts.
   Expect *"several weeks"* of lab certification, blocked until production access is granted, and a CSM
   to set `delegated_flow`. This is a procurement and timeline dependency, not a code change.
2. **Supply a physician on every order** — mandatory once delegated (enforced for Labcorp, Quest,
   Sonora Quest), with no ability to fall back to Junction's network for a one-off.
3. **Own the physician roster.** No registration API, no `physician_id`, no server-side credentialing.
   Names, NPIs, licensed states and signature assets are Aleron's records, re-sent per order.
4. **Validate NPIs yourself.** No documented format or checksum validation; Junction's own example
   passes `npi=""`.
5. **Enforce licensure-vs-patient-state yourself.** `licensed_states` is documented nowhere beyond its
   schema line and is not cross-checked against `patient_address.state`.
6. **Build the result inbox.** Webhook receiver + Svix verification + idempotency + out-of-order
   handling + API re-fetch. Junction delivers to a server, never to a physician.
7. **Poll or opt in for partial results.** No webhook by default — the documented reason is *"the
   possibility of critical values"*, which makes this a clinical-safety obligation, not an optimisation.
8. **Triage abnormals with no help.** No `abnormal` event, no Junction call, no queue. `interpretation`
   on a completed order is the only signal.
9. **Own patient follow-up.** *"If you provided your own physician… you will be responsible for
   following up with your patients."*
10. **Own critical-result clinical action.** Even under `order_delegated`, Junction's contribution is a
    call plus a webhook — the disposition is the customer physician's. Under `fully_delegated` even the
    call is yours.
11. **Build result review and sign-off from scratch.** No acknowledgement API, no reviewed state on the
    order, no reviewer field. If Aleron needs an auditable "Dr. X reviewed this at T", Aleron stores it.
12. **Archive artefacts yourself** for the EHR chart: requisition PDF, result PDF, structured JSON,
    `order.events`. Junction retains them but the chart of record is Aleron's.
13. **Design around order immutability.** All physician editing happens pre-submission in Aleron's
    draft state; post-submission the only lever is cancel-and-replace, inside a window that closes the
    moment the first partial result lands.
14. **Assemble your own pre-flight** from four endpoints, and accept that the real validation is the
    `POST` response.

---

## What I could not establish

1. **Whether `signature_image` satisfies the requisition signature requirement.** The highest-stakes
   unknown. The field's only description is *"An image of the physician signature for health insurance
   billing"*, sitting beside `patient_signature_image` with the same phrasing. No page says any
   signature is rendered onto the requisition, and no separate signing endpoint exists anywhere in the
   API. Both "no separate step needed" and "signing is handled out-of-band at the lab-account level"
   are consistent with the docs. **Verify by inspecting a sandbox requisition PDF and by written CSM
   confirmation before designing on it.**
2. **`signature_image` wire encoding and limits.** `{content: string/binary, content_type: "image/png"}`
   in a JSON body, but no statement of base64 vs. anything else, and no example anywhere in the docs.
   No size, dimension, or DPI limits documented.
3. **What the requisition PDF actually contains.** Junction documents no field list or annotated
   example. Only `clinical_notes` (≤120 chars, concatenated with a lab-account default) is confirmed to
   appear on it.
4. **Whether Flow 2 truly requires a delegated lab account, or whether passing `physician` on a platform
   account also produces physician-attributed orders.** The changelog says non-delegated orders "will
   use Junction physicians," which implies the former, but does not state what happens to a `physician`
   object supplied on a non-delegated order — silently ignored, echoed onto the requisition, or
   rejected. **This determines whether Aleron needs its own lab account at all. Ask directly.**
5. **The critical-results contradiction.** `critical-results.md` says the lab calls *"the
   Junction-assigned physician"* who *"act[s] as the ordering physician"* — which cannot describe Flow 2,
   where Aleron's physician is the ordering physician. Under `order_delegated`, does the lab call
   Junction's network, Aleron's physician, or both? And what does Junction's network do on being
   notified when it did not order the test? Not documented.
6. **What populates `GET /v2/team/{team_id}/physicians`,** and whether an NPI must appear there before it
   can be used on an order. If it is a gate, that is an undocumented credentialing step.
7. **Whether `licensed_states` is validated at all** (server-side but undocumented), or is purely
   stored. Only testable empirically — send a mismatch in sandbox.
8. **The `email` field's purpose.** Optional, no documented use, and no physician-directed
   communication exists in `communications.md`. Likely lab-contact / requisition metadata, but unstated.
9. **The meaning of "at least one physician"** (changelog, plural) when the schema exposes a single
   `physician` object. Whether ordering and follow-up physicians can differ per order, or a
   multi-physician form exists on some path, is not documented.
10. **Whether the delegated flow changes the requisition-generation path or its statuses.**
    `requisition_bypassed` turns out to mean only *"a requisition form wasn't created… because it already
    existed"* (i.e. imported orders) — so it is **not** a delegated-flow signal, which rules out my
    initial hypothesis. Whether delegated orders still pass through `requisition_created` normally is
    unstated but **[INFERENCE]** yes.
11. **Structured-result payload envelope for `labtest.order.updated` vs `labtest.order.created`.** Only
    one example (walk-in, `completed`) is published, and the `/event-catalog/*` pages are
    content-stripped in markdown — their payload tables render client-side only. The per-modality
    payloads may differ in `details.data`. Read the event catalog pages in a browser to confirm field
    reference tables.
12. **Whether the order webhook ever includes `physician`.** Absent from the published example; present
    on `GET /v3/order/{id}`. Assume absent.
