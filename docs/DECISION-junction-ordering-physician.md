# Decision brief: who is the ordering physician on an Aleron lab order?

**For:** the medical director.
**Decision needed:** whether Aleron begins sending a `physician` object to
Junction on lab and genetic orders, and separately, which of Junction's three
physician flows Aleron is contracted into.
**Why it cannot be settled by engineering:** both options are technically small.
What differs is who is clinically and legally responsible for validating the
order and reviewing the results.

Raised by the API implementation audit
([API-IMPLEMENTATION-AUDIT.md](API-IMPLEMENTATION-AUDIT.md), Part 5 decision 12).
Every factual claim below is sourced in the register at the end. Code references
are to the `Aleron-Web` repository at the commit audited on 3 September 2026.

> This brief states what the systems do and what each option entails. It does not
> offer legal or regulatory advice, and the responsibility question at the centre
> of it is not an engineering call.

---

## 1. The short version

Aleron sends **no physician** to Junction on any order path. Under Junction's own
model that places Aleron in **Flow 1**, where *"the validation of both the order
and the results is done by Junction's physician network."*

Three things follow, in increasing order of consequence:

1. **A physician-portal screen states the opposite.** `v2/standing-orders.html`
   tells the physician *"This is the NPI Junction receives, whoever places the
   order."* Junction receives no NPI. This is a regulator-facing claim on a
   compliance screen and it is false today.
2. **The ordering-physician identity has no licensure data attached.** Not "the
   roster exists but is unenforced" — an earlier version of this analysis said
   that and was wrong. The order path identifies the physician as a `User`;
   `licensed_states` lives on a separate `Physician` profile model that the order
   path never touches.
3. **The designs draw a physician act that Junction may already be performing.**
   The Orders screen has the Aleron physician signing returned results. In Flow 1,
   Junction's network has already evaluated those results for abnormal and
   critical findings. Either Aleron is contracted into a different flow, or two
   physicians are reviewing the same results and the screen shows one of them.

Item 3 is the one I would put first on the agenda. It is not a copy defect.

---

## 2. What the screen claims

`v2/standing-orders.html`, in the standing-order record card:

> Ordering physician NPI — **This is the NPI Junction receives, whoever places
> the order.**

The same screen also states, of a missing Canvas practitioner id:

> Canvas order-authorization writes fail soft, with no clinician attribution on
> the record. The order still transmits to the vendor; only the Canvas
> attribution is lost.

Both sentences are inaccurate. The first is addressed in §3; the second in §7.

---

## 3. What the code actually sends

**Both order paths send exactly five fields, and neither includes a physician.**

Blood orders — `app/Http/Controllers/JunctionController.php:294-300`:

```php
$result = Client::createOrder([
    'user_id'           => (string) $user->id,
    'patient_details'   => $patientDetails,
    'patient_address'   => $validated['patient_address'],
    'order_set'         => ['lab_test_ids' => $labTestIds],
    'collection_method' => $validated['collection_method'],
]);
```

Genetic orders — `app/Services/GeneticsOrderService.php:91-100`, the same five
fields with a fixed collection method.

Also absent: `icd_codes`, `clinical_notes`, `billing_type`, `activate_by`,
`priority`, `consents`, `lab_account_id`. Junction's `create-order` schema
accepts all of them.

**This is deliberate, not unimplemented.** The physician-initiated path
`app/Services/Physician/PhysicianOrderPlacer.php:152` records
`'authorizing_physician_id' => $physician->id` on the local order row, and
`PhysicianOrderPlacer.php:160-167` passes the physician and the Canvas
practitioner id into `dispatchToJunction` — then builds the outbound payload with
the same five-field builder. The physician's identity is in hand at the moment of
the call and is not transmitted.

**The code states its reasoning.** `config/junction.php:10-12`:

> Under the standing-order model the allowlist IS the physician authorization, so
> every placed order is stamped with the reference (and ordering physician NPI)
> of the standing order it was authorized under.

And `app/Services/Junction/StandingOrder.php:38-41`:

> Null means orders of this type must be refused — enabling ordering without a
> real standing order on file would place orders with no physician authorization
> behind them.

So the platform's own model is coherent: **the catalog allowlist is the
authorization**, and the NPI is an audit stamp on the local record. The screen's
claim is the outlier, not the code.

Where the NPI does go: `junction_orders.standing_order_npi`, written at
`JunctionController.php:286` and `JunctionGeneticsController.php:216`, and into
the body of the Canvas order-authorization document (§7).

---

## 4. What Junction documents

Junction operates a 50-state physician network and documents **three flows**
([Order and Follow-up Physician](https://docs.junction.com/lab/overview/physicians)):

| Flow | Name | Order validated by | Results validated by |
|---|---|---|---|
| **1** | Order and Results through Junction Physician Network | Junction's network | Junction's network |
| **2** | Order and Results with Customer Physician Network | The customer's physician | The customer's physician |
| **3** | Order with Junction Physician Network and Results with Customer Physician Network | Junction's network | The customer's physician |

In Junction's words:

- Flow 1 — *"The validation of both the order and the results is done by
  Junction's physician network."* Results are evaluated *"for abnormal/critical
  results"*, with patient contact at the network physician's discretion.
- Flow 2 — the customer *"must specify a `physician` when making an order
  request"*, and *"both the order and the results are the responsibility of the
  Customer's chosen physician."*
- Flow 3 — no physician is supplied on the order, but *"it's the Customer's
  physician's responsibility to validate the results and do the follow-ups."*
  With one caveat that survives every flow: *"When there are critical results,
  Junction's physician network will always be notified."*

The `physician` object on `POST /v3/order`
([create-order](https://docs.junction.com/api-reference/lab-testing/create-order))
accepts `first_name`, `last_name`, `npi`, `email`, `licensed_states` and
`signature_image`.

**Junction documents no cross-check of `licensed_states` against
`patient_address.state`.** Supplying the field does not cause Junction to enforce
it.

---

## 5. Which flow is Aleron in?

**The code puts us in Flow 1 or Flow 3** — no physician is sent, so it cannot be
Flow 2. Which of the two applies is **contractual, not observable in the
codebase**, and it is the first question to answer because everything else
depends on it.

- If **Flow 1**: Junction's network is validating our patients' requisitions
  *and* reviewing their results for abnormal and critical findings.
- If **Flow 3**: Junction validates the requisition; result review and follow-up
  are ours.

Nothing in the code, the config or the designs records which one. That gap is
itself worth closing regardless of the decision.

---

## 6. The consequence the designs have not drawn

`v2/orders.html` renders result review as a physician act: an order reaches
`resulted`, the row shows `unsigned`, and the physician signs with an optional
note. The v0 replica shows the same capability in the shipped app, so this is
built, not merely proposed.

**Under Flow 1 that act is a second review of results Junction's network has
already evaluated.** Two clinicians reviewing the same results is not necessarily
wrong — but only one of them appears anywhere in the product, and the screen
presents that signature as *the* review. Under Flow 3 the screen is correct and
Junction's involvement is limited to requisition validation plus the critical-
results notification.

So the flow question is not administrative. It determines whether a screen we
have already built describes the actual clinical process.

---

## 7. The Canvas attribution defect, corrected

The screen says the Canvas write *"fails soft, with no clinician attribution on
the record."* The code does something different, at
`app/Services/Junction/OrderCanvasRecorder.php:79-83`: if the standing order has
no `canvas_practitioner_id`, it **skips writing the document entirely**.

Both words are defensible about different things, and the screen conflates them:

- **Fail soft with respect to the order.** `OrderCanvasRecorder.php:25-26` —
  *"practitioner mapping must therefore NEVER fail the patient's successful
  order. Every failure is logged and leaves `canvas_document_id` null."* The
  order transmits and results return. Correct, and deliberate.
- **Fail closed with respect to the chart.** No document is written. There is no
  record missing a name; there is **no record**.

That is a materially worse state than the screen describes, and it is the state
in which the NPI's other destination — the authorization document body — does not
exist either. A genetic order with no chart record is arguably the failure mode a
physician most needs to see, and it currently reads as a cosmetic attribution
gap.

Root cause is not a blank field to backfill: Canvas SSO is SAML 2.0 with **no
just-in-time provisioning**, so a Canvas user must exist before a practitioner id
can be resolved at all. See [API-GROUND-TRUTH.md](API-GROUND-TRUTH.md) §4.

---

## 8. The licensure gap, corrected

An earlier version of this analysis said Aleron holds a licensure roster and
merely fails to enforce it. That was wrong and the correction matters.

- `app/Models/Physician.php:16` does carry `licensed_states`, cast to an array at
  line 27 — but that model is a **profile**: `name`, `credentials`, `specialty`,
  `organization`, `years_experience`, `focus_area`, `rating`,
  `board_certifications`, `medical_school`, `residency`, `bio`. Its shape is a
  directory entry.
- The order path does not use it. `PhysicianOrderPlacer` imports
  `App\Models\User` (line 6) and identifies the ordering physician as a `User`.

**So there is no licensure data attached to the identity that places orders.**

Meanwhile the only geographic validation on an order is that the patient's state
is two characters long — `JunctionController.php:191` and
`JunctionGeneticsController.php:121`:

```php
'patient_address.state' => 'required|string|size:2',
```

Today this is harmless, because we assert no physician and Junction's network
covers 50 states. **It stops being harmless the moment we name our own
physician**, because at that point the order asserts a licensure claim that
neither system checks: Junction documents no cross-check, and Aleron has no data
to check against.

One further coverage fact the screens omit entirely: testkit and walk-in
modalities cover 49 states (not New York), at-home phlebotomy 35. An order can
fail on geography under a perfectly valid authorization.

---

## 9. The options

### Option A — stay in the network flow; correct the screen
No code change to the order path. Replace the false caption with what is true:

> Recorded on every order placed under this authorization, and written into the
> Canvas order-authorization document. Junction is not sent a physician; its own
> network validates the order.

**Also requires**, and this is the part that is not just copy: several screens
describe order authorization as a physician clinical act with its own
attestation. Under Option A it is an **internal control** — the physician
authorizes the catalog, and the vendor's network authorizes the order. The care
plan's three-act model and the Orders screen's authorization language both need
re-reading against that. Cost: copy across `standing-orders`, `orders`,
`care-plan` and `emr`.

### Option B — send the physician; move to Flow 2
Add `physician: {first_name, last_name, npi, licensed_states, email}` to both
payload builders. Roughly a ten-line change.

**What it entails:**
- The named physician becomes responsible for validating **both** the order and
  the results — Junction's Flow 2 language is explicit.
- Result review stops being duplicative and the Orders screen becomes accurate.
- Aleron must build licensure data on the ordering identity and enforce
  `patient_address.state ∈ licensed_states` at its own gate, because nobody else
  will. This is new work, not a config change.
- The physician's name must stop being inferred from the session. Today the
  standing-order card would name whoever is logged in; config holds only a bare
  NPI (`config/junction.php:16,24`).
- `signature_image` is available and unused; whether it is expected is worth
  asking Junction.

### Option C — confirm Flow 3 and correct the screen accordingly
If we are contractually in Flow 3, Option A's copy is still needed but §6
resolves differently: the physician's result signature *is* the review of record,
and the screen is right. This may be the state we are already in and have not
written down.

---

## 10. Recommendation

**Do Option A's caption fix this week regardless of anything else.** A false
regulator-facing statement on a compliance screen should not wait on a strategy
decision, and it is a one-line change.

**Then answer §5 before choosing between A, B and C**, because the flow we are
contracted into determines whether the Orders screen's result-signature act is
the review of record, a duplicate, or a control with no external standing. That
question is answerable from the Junction contract in an afternoon and it is a
prerequisite, not a parallel track.

**On A versus B, I have no recommendation to give**, and that is deliberate:
the difference is which physician carries responsibility for order validation and
result review. Option B is cheaper in code and more expensive in liability;
Option A is the reverse. That trade is the medical director's.

What engineering can commit to either way: if Option B is chosen, the licensure
enforcement in §8 must ship **with** it, not after. An order that asserts a
physician's licensure without checking it is worse than an order that asserts
nothing.

---

## 11. Source register

### Code — `Aleron-Web`, audited 3 Sep 2026

| Fact | Location |
|---|---|
| Blood order payload, five fields, no physician | `app/Http/Controllers/JunctionController.php:294-300` |
| Genetic order payload, same five fields | `app/Services/GeneticsOrderService.php:91-100` |
| Physician identity held at the call site and not sent | `app/Services/Physician/PhysicianOrderPlacer.php:152`, `:160-167` |
| Ordering physician is a `User`, not the `Physician` model | `app/Services/Physician/PhysicianOrderPlacer.php:6` |
| `licensed_states` on the profile model only | `app/Models/Physician.php:16`, cast at `:27` |
| "the allowlist IS the physician authorization" | `config/junction.php:10-12` |
| Standing order per type: reference, NPI, Canvas practitioner id | `config/junction.php:13-28` |
| Fail-closed refusal without a configured standing order | `app/Services/Junction/StandingOrder.php:38-55` |
| NPI stamped on the local order row | `JunctionController.php:286`, `JunctionGeneticsController.php:216` |
| Canvas document skipped entirely when no practitioner id | `app/Services/Junction/OrderCanvasRecorder.php:79-83` |
| "must NEVER fail the patient's successful order" | `app/Services/Junction/OrderCanvasRecorder.php:25-26` |
| Patient state validated as two characters only | `JunctionController.php:191`, `JunctionGeneticsController.php:121` |

### Junction documentation

| Fact | Source |
|---|---|
| The three physician flows and their responsibility language | [Order and Follow-up Physician](https://docs.junction.com/lab/overview/physicians) |
| `physician` object fields: `first_name`, `last_name`, `npi`, `email`, `licensed_states`, `signature_image` | [Create order](https://docs.junction.com/api-reference/lab-testing/create-order) |
| Full `create-order` schema, including the fields Aleron omits | [Create order](https://docs.junction.com/api-reference/lab-testing/create-order) |
| Collection-method enum and state coverage by modality | [Testing Modalities](https://docs.junction.com/lab/overview/testing-modalities) |
| Critical results always notify Junction's network | [Order and Follow-up Physician](https://docs.junction.com/lab/overview/physicians) |
| Lab testing overview and lifecycle | [Introduction](https://docs.junction.com/lab/overview/introduction), [Lab Test Lifecycle](https://docs.junction.com/lab/workflow/lab-test-lifecycle) |

### Canvas documentation

| Fact | Source |
|---|---|
| SAML 2.0 SSO with no just-in-time provisioning | [API-GROUND-TRUTH.md](API-GROUND-TRUTH.md) §4 |
| Canvas resource capabilities, pinned to the live instance | [canvas-capability-snapshot.json](canvas-capability-snapshot.json), re-checkable with `node scripts/verify-canvas.js` |

### Design surfaces carrying the claims

| Claim | Location |
|---|---|
| "This is the NPI Junction receives, whoever places the order" | `v2/standing-orders.html` |
| "fail soft, with no clinician attribution on the record" | `v2/standing-orders.html` |
| Physician result review as a signable act | `v2/orders.html`, and `v0/lab-orders.html` for the shipped equivalent |
| Full screen audit | [audit/v2-standing-orders.md](audit/v2-standing-orders.md), [audit/v2-orders.md](audit/v2-orders.md) |

### Corrections to earlier statements in this project

1. **"Aleron holds a licensure roster; only enforcement is missing."** Wrong. The
   roster is on a profile model the order path does not use; the ordering
   identity has no licensure data at all (§8).
2. **"The fail-soft caption is inverted."** Imprecise. It is fail-soft about the
   order and fail-closed about the chart record; the screen conflates the two
   (§7).
