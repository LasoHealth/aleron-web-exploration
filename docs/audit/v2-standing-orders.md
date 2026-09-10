# v2/standing-orders.html

**Screen purpose:** Show a physician, from inside a patient's chart, the two signed authorizations under which Aleron may place lab and genetic orders, the test menu each authorizes, and every condition that would make an order refuse.

**Data points audited:** 76 — OK 36, GAP 28, WRONG 5, UNVERIFIED 0, NONE 7

---

## Where does a standing order live?

Nowhere but Aleron. Neither Canvas nor Junction has a standing-order resource, and neither is asked for one. The entire record on this screen resolves from two Laravel config trees — `config/junction.php` `standing_order.{blood,genetics}.{reference,physician_npi,canvas_practitioner_id}` and the catalogs `junction.orderable_lab_tests` / `junction.genetics_panels` — every leaf of which is an `env()` read. `App\Services\Junction\StandingOrder::for($type)` returns a three-field readonly struct or `null`; `App\Services\Junction\OrderCatalog::listing($type)` returns the menu. There is no table, no FHIR resource, no Junction object, and no signed document anywhere in the system: the "signed standing order" is a paper artefact held outside the platform and referenced here by an opaque string. That makes a standing order **Aleron configuration, not patient data** — which is the only reason it does not violate the "Canvas holds all patient data; Aleron stores none" rule. The one place it touches a patient record is downstream: `OrderCanvasRecorder` prints `Authorized under standing order: <ref>` and `Ordering physician NPI: <npi>` as free text inside the per-order `DocumentReference` it writes to Canvas. So a physician auditing Ethan Park's chart **in Canvas** sees a laboratory-order-authorization document per placed order, each quoting a reference string and an NPI as prose, and sees no standing order, no catalog, no count, no kill-switch state and no way to tell that a second authorization exists and is currently refusing everything. The screen is the only surface in the platform where this record is legible, and it is legible only because Aleron re-reads its own configuration.

Two consequences the screen does not draw. First, because the NPI never leaves Aleron (`physician` is not in the `POST /v3/order` body that `JunctionController` or `GeneticsOrderService` build), **Junction is currently ordering under its own physician network, not under Dr. Okafor**. The standing order authorizes nothing at the vendor; it is an internal audit stamp. Second, because the catalog is a config file rather than a read of `GET /v3/lab_tests`, "14 orderable here" means "14 env vars are non-empty" and nothing more — it is not a statement about what Junction will accept.

**Newly verified against live docs (3 Sep 2026), not in `docs/canvas/API-GROUND-TRUTH.md` (in `Meridian-Web`):**

- `GET /v3/lab_tests` — the catalog read. Filters `generation_method`, `lab_slug`, `collection_method`, `status` (active | pending_approval | inactive), `marker_ids[]`, `provider_ids[]`, `name`, `order_key`, `order_direction`. A lab test object carries required `id` (UUID), `slug`, `name`, `sample_type`, `method`, `price`, `is_active`, `status`, `lab`, `markers[]`, plus optional `fasting`, `has_collection_instructions`, `common_tat_days`, `worst_case_tat_days`, `auto_generated`, `is_delegated`. Also `GET /v3/lab_tests` paginated, `get-lab-test`, `biomarkers`, `lab-test-markers`. <https://docs.junction.com/api-reference/lab-testing/tests.md>
- `GET /v3/lab_test/lab_account` — lab accounts carry `id`, `lab`, `status` (active | pending | suspended | ready_to_launch), `delegated_flow`, `provider_account_id`, `account_name`, `default_clinical_notes`, `business_units`, `allowed_billing` (states where billing is permitted), `team_id_allowlist`. The docs do **not** state how `lab_account_id` filters test availability. <https://docs.junction.com/api-reference/lab-testing/lab_accounts.md>
- `physician` on create-order: `first_name`, `last_name`, `npi`, `licensed_states[]` are **required when the object is supplied**; `email` and `signature_image` optional (`signature_image` is documented as "An image of the physician signature for health insurance billing"). No documented validation of `licensed_states` against `patient_address.state`. <https://docs.junction.com/api-reference/lab-testing/create-order.md>
- Supplying `physician` moves responsibility: "Both the order and the results are the responsibility of the Customer's chosen physician." Omitting it means "The validation of both the order and the results is done by Junction's physician network." <https://docs.junction.com/lab/overview/physicians>
- `consents[]` entries are `{consentType, version?, timeOfConsent?}` with a **closed enum**: `terms-of-use`, `telehealth-informed-consent`, `mobile-terms-and-conditions`, `notice-of-privacy-practices`, `privacy-policy`, `hipaa-authorization`. There is no genetic-consent and no counseling type. <https://docs.junction.com/api-reference/lab-testing/create-order.md>
- `order_set` is `{lab_test_ids[] (UUID), add_on?, lab_account_id?}`; `lab_account_id` also exists top level; `lab_test_id` is deprecated. Only documented error is `422 HTTPValidationError`. <https://docs.junction.com/api-reference/lab-testing/create-order.md>
- Coverage: testkit and walk-in cover 49 states (all but NY); at-home phlebotomy 35 states. <https://docs.junction.com/lab/overview/testing-modalities>

---

## Data points

### Rail and session chrome

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 1 | `Ethan Park` | Canvas FHIR:Patient.name | OK | |
| 2 | `AL-47M · 47M` | Aleron (MRN) + Derived from Canvas FHIR:Patient.birthDate / .gender | OK | |
| 3 | Avatar `EP` | Derived | OK | |
| 4 | `Dr. A. Okafor` (signed-in actor) | Aleron (Entra / `EntraTokenGuard`) | OK | The Entra identity. Not the same object as the NPI in rows 21/53, which is a config string with no user behind it. |
| 5 | Rail foot link `Practice standing orders` | Aleron | OK | Self-link. BRIEF puts this registry on the **Inbox** rail foot, not the chart rail; see Contradictions. |

### Header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 6 | `Standing orders` (h1) | Aleron | OK | |
| 7 | `Read only · environment configuration` | Aleron | OK | True: `StandingOrdersPageController` has no write path and the role matrix puts adapter config under Admin. |
| 8 | Lede: "each record is referenced by environment configuration, and each menu is a versioned, peer-reviewed, deploy-gated artefact" | Aleron | OK | Verbatim-in-substance from `OrderCatalog`'s docblock. Accurate. |

### Fail-closed rollup

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 9 | `1 of 2 authorizations will refuse` | Derived (count over the two `describe()` rows) | OK | |
| 10 | "genetic kit orders are declined in this environment" | Aleron `junction.genetics_ordering_enabled` | OK | `JunctionGeneticsController` returns 403 when false. |
| 11 | `StandingOrder::for('genetics')` rendered in a `.pval` | Aleron (PHP symbol) | **WRONG** | A class-and-method name in front of a physician. BRIEF: "Never put the API on the product surface… Do not put a field name, its writability, or its permitted values in front of a physician." `check.js`'s `api-on-product-surface` rule exists for exactly this. |
| 12 | "fails closed rather than transmitting on partial configuration" | Aleron | OK | Verified: both controllers gate before any remote call. |

### Blood labs card

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 13 | `Blood labs` | Aleron (controller `label:`) | OK | |
| 14 | Catalog key `blood` | Aleron `OrderCatalog::TYPE_BLOOD` | GAP | An internal enum value on the product surface. Softer than row 11 (it is the compliance artefact's own identifier) but still Aleron vocabulary the physician cannot act on. |
| 15 | `Quest` | Aleron (hardcoded inside each `display` string) | GAP | Real source is `Junction: lab_test.lab` (*newly verified*, <https://docs.junction.com/api-reference/lab-testing/tests.md>). Nothing reconciles the two: if the account is provisioned against LabCorp, the screen still says Quest. |
| 16 | "basket of one or more tests per order" | Junction: `order_set.lab_test_ids[]` | OK | Matches `JunctionController`'s payload. |
| 17 | Status `Authorized` | Derived (`StandingOrder::for()` non-null AND `ordering_enabled`) | OK | |
| 18 | `SO-BLOOD-2026-01` | Aleron `env(JUNCTION_BLOOD_STANDING_ORDER_REF)` | OK | Opaque string. No system validates it against anything. |
| 19 | `Signed 14 Jan 2026` | **NONE** | NONE | No signature date exists in config, in Canvas, or in Junction. Fabricated provenance under a `.pledger__prov` caption, which is where the screen puts things it is asserting as sourced. |
| 20 | `countersigned by the medical director` | **NONE** | NONE | Same. No countersignatory field anywhere. |
| 21 | NPI `1487520394` | Aleron `env(JUNCTION_BLOOD_STANDING_ORDER_NPI)` | OK | Stored on `junction_orders.standing_order_npi` and printed into the Canvas DocumentReference text. |
| 22 | "This is the NPI Junction receives, whoever places the order." | Junction: `physician.npi` | **WRONG** | Junction receives no NPI. `JunctionController::store` and `GeneticsOrderService::buildOrderParams` send only `user_id`, `patient_details`, `patient_address`, `order_set`, `collection_method`. No `physician` object at all, therefore per Junction's own docs the order is validated by **Junction's physician network**, not Dr. Okafor. |
| 23 | `Dr. A. Okafor` given as the NPI's owner | **NONE** | NONE | Config holds a bare NPI string with no name. The screen infers the name from the session actor, which will be wrong the moment a second physician logs in. |
| 24 | Canvas practitioner id `prac-9f2c41` | Canvas FHIR:Practitioner.id (held in Aleron config) | OK | Fixture shape is not a Canvas id shape; use a UUID. Canvas has no JIT provisioning, so a wrong id here is a silent no-write, not an error. |
| 25 | "Order-authorization writes to Canvas carry clinician attribution." | Canvas FHIR:DocumentReference (create) | OK | `DocumentReferenceResource::recordOrderAuthorization(reviewerId: …)`. DocumentReference create is supported; update is not, so an amended authorization is a second document. |
| 26 | Ordering `Enabled` | Aleron `junction.ordering_enabled` | OK | |
| 27 | "Kill switch on. Turning it off refuses every blood order in this environment immediately." | Aleron | OK | Verified: 403 at the top of `store()`. |
| 28 | `16 entries, 14 orderable here` | Derived over `config('junction.orderable_lab_tests')` | GAP | "Orderable" means `! empty($entry['lab_test_id'])` — an env var is non-empty. It is never checked against `GET /v3/lab_tests`, so the count asserts Aleron's configuration, not Junction's catalog. See Catalog drift. |
| 29 | `Lipid Panel (Quest)` · Orderable | Aleron config `display` | GAP | Display string is hand-authored, not `Junction: lab_test.name`. |
| 30 | `Comprehensive Metabolic Panel (Quest)` · Orderable | Aleron config `display` | GAP | |
| 31 | `Hemoglobin A1c (Quest)` · Orderable | Aleron config `display` | GAP | |
| 32 | `hs-CRP (Quest)` · Orderable | Aleron config `display` | GAP | |
| 33 | `Fasting Insulin (Quest)` · Orderable | Aleron config `display` | GAP | |
| 34 | `Apolipoprotein B (Quest)` · Orderable | Aleron config `display` | GAP | |
| 35 | `Lipoprotein(a) (Quest)` · Orderable | Aleron config `display` | GAP | |
| 36 | `Urine Albumin/Creatinine Ratio (Quest)` · Orderable | Aleron config `display` | GAP | |
| 37 | `PSA (Quest)` · Orderable | Aleron config `display` | GAP | |
| 38 | `eGFR / Creatinine (Quest)` · Orderable | Aleron config `display` | GAP | |
| 39 | `Liver Function Panel / LFTs (Quest)` · Orderable | Aleron config `display` | GAP | |
| 40 | `Creatine Kinase (Quest)` · Orderable | Aleron config `display` | GAP | |
| 41 | `TSH (Quest)` · Orderable | Aleron config `display` | GAP | |
| 42 | `Complete Blood Count (Quest)` · Orderable | Aleron config `display` | GAP | |
| 43 | `p-tau217 (Quest)` · `No test id configured` | Derived (`lab_test_id` empty) | GAP | Accurate about Aleron config, silent on the real question: whether the assay exists on the account's catalog at all. `GET /v3/lab_tests?name=p-tau217` answers that; nothing calls it. |
| 44 | `Neurofilament Light / NfL (Quest)` · `No test id configured` | Derived (`lab_test_id` empty) | GAP | Same. |

### Genetic kits card

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 45 | `Genetic kits` | Aleron (controller `label:`) | OK | |
| 46 | Catalog key `genetics` | Aleron `OrderCatalog::TYPE_GENETICS` | GAP | As row 14. |
| 47 | `Invitae` | Aleron (hardcoded in one `display` string, generalised into the subtitle) | GAP | Only `invitae-160` names Invitae in config. The other four panels have no vendor recorded anywhere; the subtitle asserts a vendor for all five. Real source is `Junction: lab_test.lab`. |
| 48 | "a single panel per order" | Aleron `GeneticsOrderService` | OK | `order_set.lab_test_ids => [$labTestId]`, always one. |
| 49 | Status `Configured, ordering off` | Derived | OK | Correctly separates a complete record from a disabled switch. |
| 50 | `SO-GEN-2026-02` | Aleron `env(JUNCTION_GENETICS_STANDING_ORDER_REF)` | OK | |
| 51 | `Signed 3 Feb 2026` | **NONE** | NONE | As row 19. |
| 52 | `countersigned by the medical director` | **NONE** | NONE | As row 20. |
| 53 | NPI `1487520394` | Aleron `env(JUNCTION_GENETICS_STANDING_ORDER_NPI)` | OK | Same value as blood on this fixture; they are independent env vars and may legitimately differ. |
| 54 | `Dr. A. Okafor.` | **NONE** | NONE | As row 23. |
| 55 | Canvas practitioner id `Not set` | Canvas FHIR:Practitioner (absent) | OK | Correctly renders the null. |
| 56 | "Canvas order-authorization writes fail soft, with no clinician attribution on the record." | Canvas FHIR:DocumentReference | **WRONG** | Inverted. `OrderCanvasRecorder` rule 2 fails **closed** for attribution: with no practitioner id it writes **nothing** and returns, leaving `canvas_document_id` null. There is no record and therefore no record-without-attribution. |
| 57 | "The order still transmits to the vendor; only the Canvas attribution is lost." | Canvas FHIR:DocumentReference | **WRONG** | First clause is right (the order is already placed; the mirror is best-effort). Second clause is wrong: the **entire chart document** is lost, not the attribution line. Canvas shows no evidence the order was ever placed. |
| 58 | Ordering `Disabled, kill switch off` | Aleron `junction.genetics_ordering_enabled` | OK | |
| 59 | "Every genetic order in this environment is refused while this is off, whatever the rest of the record says." | Aleron | OK | Verified: 403 before the standing-order gate. |
| 60 | `5 entries, 4 orderable here` | Derived over `config('junction.genetics_panels')` | GAP | As row 28. |
| 61 | `Invitae 160-Gene Panel` · Orderable | Aleron config `display` | GAP | |
| 62 | "The panel that resulted for this patient on 23 Jun 2026" | Aleron `junction_orders` + Junction `order.lab_test.name` / result timestamp | OK | The only patient-specific fact on either card, and the strongest justification for the screen living in the chart. |
| 63 | `Hereditary Cancer Panel` · Orderable | Aleron config `display` | GAP | |
| 64 | `Cardiovascular Genetic Panel` · Orderable | Aleron config `display` | GAP | |
| 65 | `Proactive Genetic Health Screen` · Orderable | Aleron config `display` | GAP | |
| 66 | `Pharmacogenomics Panel` · `No test id configured` | Derived | GAP | |
| 67 | Advisory label `Model under review` | Aleron | OK | |
| 68 | "The physician-portal ordering flow enforces that acknowledgment today; the mobile standing-order rail does not yet" | Aleron | OK | **Verified true.** `PhysicianOrderPlacer::placeGenetics` throws `counseling_required` (422) when `$counselingAcknowledged` is false. `JunctionGeneticsController` (mobile) gates on the patient's genetic *consent*, never on a physician counseling attestation. The two paths genuinely authorize the same panel under different obligations. |
| 69 | The counseling attestation itself, which #68 says is enforced here | **NONE** | NONE | Persists only as `junction_orders.genetic_counseling_acknowledged_at`, an Aleron column. Canvas has no field. Junction's `consents[]` enum is closed and contains no counseling or genetic type (*newly verified*, <https://docs.junction.com/api-reference/lab-testing/create-order.md>), so it does not fit. |

### Reviewer scaffold (`wf-ex` disclosure and footer — not product surface)

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 70 | `docs/physician-portal/canvas-clinical-documentation-and-lab-order-authorization.md` section 5, Model 1 | Aleron | OK | Doc exists and is cited by `StandingOrdersPageController`'s own docblock. |
| 71 | "Records: Two: `blood` and `genetics`. One catalog, one enforcement path." | Aleron | OK | Verified: both types route through `OrderCatalog::CONFIG_PATHS`. |
| 72 | "Fail closed: Missing reference, missing NPI, missing test id or a kill switch that is off all refuse the order." | Aleron | OK | All four verified in `JunctionController::store` / `JunctionGeneticsController::store` / `CatalogResolution`. |
| 73 | "Fail soft: Missing Canvas practitioner id. The order transmits; the Canvas record loses clinician attribution." | Canvas FHIR:DocumentReference | **WRONG** | Same inversion as rows 56–57, restated in the scaffold. Fix both. |
| 74 | "Physician can edit: Nothing. Section 2 of the role matrix puts adapter configuration under Admin." | Aleron | OK | |
| 75 | "Being on the catalog with a configured test id **is** being authorized under the standing order. There is no second allowlist." | Aleron | GAP | True of Aleron. False of the system: Junction applies its own gate — an unrecognised `lab_test_id`, an inactive test (`status`), or a test outside the `lab_account_id`'s scope returns 422 after Aleron has already said yes. There *is* a second allowlist; Aleron just never reads it. |
| 76 | Footer: "Synthetic staging configuration · references and NPIs shown are fixtures · each record is a signed document referenced by environment configuration, and this screen reads it rather than holding it." | Aleron | OK | Accurate and well-framed. |

---

## Catalog drift

| Risk | What breaks | Mitigation |
|---|---|---|
| A configured `lab_test_id` is deactivated by Junction or the lab (`is_active: false` / `status: inactive`) | Screen says Orderable. Aleron passes every gate, calls `POST /v3/order`, gets `422`. The physician sees a generic failure after committing to the order, with no way to tell from this screen why. | Nightly `CronTask` / scheduled command reading `GET /v3/lab_tests?status=active`, diffing against the two config catalogs, and surfacing a third status on this screen: `Configured, not active at the lab`. Cache the result; do not call Junction on page render. |
| A `lab_test_id` is copied from the sandbox catalog into production env (or vice versa) | Silent. Both look like non-empty strings. Fails at 422 on first real order. | Same reconciliation job, plus asserting the returned test's `lab.slug` matches the vendor the screen claims (row 15/47). |
| Junction renames or re-slugs a test | Screen keeps showing Aleron's hand-authored `display` string, which drifts from what the lab report and the patient's kit say. | Render `Junction: lab_test.name` from the reconciliation cache, and keep the Aleron `display` only as the app-facing key's label. |
| The account's `lab_account_id` scope changes (`team_id_allowlist`, `status: suspended`) | Every test still shows Orderable; every order 422s or routes to the wrong lab. | Read `GET /v3/lab_test/lab_account`; show the account `status` and `lab` on the card head instead of a hardcoded vendor name. This is the field that actually answers "orderable *here*". |
| An assay Aleron wants was never in Junction's catalog (the p-tau217 / NfL case) | `No test id configured` reads as "an env var is pending", i.e. a provisioning task. It may instead be "Junction does not offer this", i.e. a sourcing decision. Two different owners, one string. | Split the state: `No test id configured` vs `Not offered by this lab account`, decided by a `GET /v3/lab_tests?name=` lookup in the same job. |
| Junction adds a test Aleron's risk engines consume | Invisible. The catalog only shrinks in practice; growth requires a deploy. | Accept. The deploy gate is the point of the compliance artefact. Report the delta in the reconciliation job's output, not on this screen. |

---

## Required changes

1. **The NPI caption is false (row 22). Medium.** "This is the NPI Junction receives, whoever places the order" describes a `physician` object Aleron does not send. Either (a) start sending `physician: {first_name, last_name, npi, licensed_states}` on `POST /v3/order` — which per Junction's docs transfers order and result responsibility from Junction's physician network to Dr. Okafor, a compliance decision, not an engineering one — or (b) change the caption to what is true: *"Recorded on every order placed under this authorization and written into the Canvas order-authorization document. Junction is not sent a physician; its own network validates the order."* Do (b) now, and raise (a) as the decision it is.

2. **The fail-soft caption is inverted (rows 56, 57, 73). Small edit, important.** `OrderCanvasRecorder` fails *closed* on attribution: with no `canvas_practitioner_id` it writes nothing. Replace with: *"No Canvas document is written for these orders. The order transmits and results still return, but the chart carries no record that the order was placed."* That is a materially worse failure than the screen currently describes and it deserves the harder wording — arguably a `.ptile` hazard rather than a caption, since a genetic order with no chart record is the failure mode a physician most needs to see.

3. **Remove `StandingOrder::for('genetics')` from the rollup (row 11). Trivial.** Say what happens: *"The authorization record is complete, but ordering is switched off for genetics in this environment, so the order is still declined."* The PHP symbol adds nothing a physician acts on and it is exactly the `api-on-product-surface` pattern BRIEF names.

4. **Delete or source the signature provenance (rows 19, 20, 51, 52). Small.** No signature date and no countersignatory exists in any system. Either add them to `config/junction.php` as `signed_on` / `countersigned_by` (cheap: two more env reads per type, and it makes the config match what the paper document actually carries), or drop the captions. Do not leave asserted provenance with no source on a compliance screen — it is the one screen where a fabricated date is a real liability.

5. **Stop inferring the physician's name from the session (rows 23, 54). Small.** Config holds a bare NPI. Add `physician_name` alongside `reference` and `physician_npi`, or render the NPI alone. Today the card would name whoever is logged in as the authorizing physician, which is wrong the first time a second doctor uses the portal.

6. **Reconcile the catalog against Junction (rows 28, 29–44, 60, 61–66, 75). Large — this is the real work.** A scheduled job reading `GET /v3/lab_tests` and `GET /v3/lab_test/lab_account`, caching the result, and giving the menu a third and fourth status (`Not active at the lab`, `Not offered by this lab account`). Without it, "14 orderable in this environment" is a claim about Aleron's `.env` presented as a claim about the world.

7. **Give the counseling attestation a home outside Aleron's DB (row 69). Medium.** See Alternative pathways.

8. **Add the licensed-states check nobody is performing. Medium.** Aleron validates `patient_address.state` as `size:2` and nothing more. Junction documents `licensed_states` as required *when you supply a physician* and documents no cross-check against the patient address. Nobody is enforcing that Dr. Okafor is licensed where Ethan Park lives. Add `licensed_states` to the standing-order config and refuse at the Aleron gate when the patient's state is not in it. Also surface the state coverage the screen omits entirely: testkit and walk-in are 49 states (no NY), at-home phlebotomy 35 — an order can fail on geography with a fully valid authorization.

---

## Alternative pathways

**Row 11 — `StandingOrder::for('genetics')` (WRONG).** Drop it. Nothing replaces it; the sentence is complete without it.

**Row 22 — "the NPI Junction receives" (WRONG).** Two workable paths. (a) Send `physician` on `POST /v3/order` with `npi` and `licensed_states`, making the caption true — cost: Aleron's physician becomes responsible for order validation and result review, which is a legal posture change and needs the medical director, not a ticket. (b) Keep the current network flow and re-caption to name the two places the NPI actually goes: the `junction_orders` audit row and the Canvas DocumentReference body. (b) is free. Do not leave the current wording; it tells a physician a regulator-facing fact that is not true.

**Rows 56, 57, 73 — fail-soft description (WRONG).** No API alternative needed, this is a copy fix. But the underlying gap is worth naming: when attribution is missing there is *no* chart record, and the reconciliation signal (`canvas_document_id` null on an `ordered` row) is invisible to physicians. If the team wants a chart record regardless, the cheapest correct route is `Canvas SDK: UPSERT_PATIENT_METADATA` keyed on the Junction order id, or a `Task` for the admin to fix the practitioner mapping — not writing an unattributed DocumentReference, which the code deliberately refuses.

**Rows 19, 20, 51, 52 — signature date and countersignature (NONE).** No Canvas or Junction home and none is wanted: this is configuration about a paper document, not patient data. Cheapest: two more keys in `config/junction.php` (`signed_on`, `countersigned_by`), same env pattern as everything else on the card, near-zero cost. A redirect into Canvas is *not* available — Canvas has no standing-order resource to link to. Second choice: drop the captions and let the reference string stand alone. Do not store this as patient data; it is not.

**Rows 23, 54 — the physician's name (NONE).** Same answer: a `physician_name` config key. A Canvas `Practitioner` read via the configured `canvas_practitioner_id` would also work and would be self-consistent (`GET /Practitioner/{id}` is supported), at the cost of a Canvas round-trip on a page render and a new failure mode when Canvas is down. Config is lazier and adequate — the NPI is already config.

**Row 69 — the genetics counseling attestation (NONE).** Ranked:
1. **`Canvas SDK: UPSERT_NOTE_METADATA` / `UPSERT_PATIENT_METADATA`.** The escape hatch API-GROUND-TRUTH names for Aleron-owned facts with no FHIR field. Key it to the order (`genetic_counseling_ack.<junction_order_id> = <ISO timestamp>|<practitioner id>`). Cheap, already in the SDK, survives in Canvas.
2. **`Canvas FHIR: Consent` (create supported).** This is what `ConsentCapture` already does for the patient's genetic-testing consent, mirrored as a FHIR Consent with pre-configured codings. But note the type mismatch BRIEF is explicit about: counseling acknowledgment is a **physician attestation of fact**, not a patient consent. Modelling it as a Consent puts the physician's attestation in the patient's consent ledger, where an auditor will read it as the patient consenting. Only take this if counsel says the coding can carry the distinction.
3. **Text inside the order-authorization `DocumentReference`.** `OrderCanvasRecorder::authorizationText` already builds a line-per-fact block; add `Pre-test genetic counseling acknowledged: <date> by <practitioner>`. Legally durable, human-readable in the chart, zero new machinery. Not queryable, and lost entirely when attribution is missing (rows 56–57), which is precisely when you would want it.
4. **Junction `consents[]` — does not fit.** Closed enum, no genetic or counseling member. Do not stretch `telehealth-informed-consent` to mean this.
5. **Junction `passthrough`** would round-trip the flag on the order object, but passthrough is opaque to the lab and to Canvas: it proves nothing to an auditor and creates a second copy of a compliance fact in a vendor's system. Reject.
6. **Aleron keeps it** (status quo: `genetic_counseling_acknowledged_at`). Cost: the fact lives only in Aleron's DB, contradicting "Canvas holds all patient data; Aleron stores none," and it is invisible to any physician auditing the chart in Canvas. Acceptable only as the working column *behind* option 1 or 3, never as the record of truth.

Do 1 plus 3: metadata for machines, the document line for humans.

**Rows 14, 46, 15, 47, 75, 28/60 and the menu rows (GAP).** Covered by required change 6 — a reconciliation job feeding `Junction: lab_test.{name, lab, is_active, status}` and `lab_account.{status, lab}` into the card head and the status column. Dropping the data point is not an option; the menu is the screen.

---

## Contradictions with what the screen already claims

> "**Ordering physician NPI** … `1487520394` … Dr. A. Okafor. **This is the NPI Junction receives, whoever places the order.**"

Junction receives no NPI. The create-order payload built by `JunctionController::store` and `GeneticsOrderService::buildOrderParams` is `user_id`, `patient_details`, `patient_address`, `order_set`, `collection_method`. No `physician`. Per Junction's own physician-flows page, that means "The validation of both the order and the results is done by Junction's physician network" — not by Dr. Okafor. The screen's central claim, that this record is what authorizes the order at the vendor, is not true of the vendor.

> "**Canvas practitioner id** · `Not set` … Canvas order-authorization writes **fail soft, with no clinician attribution on the record**. The order still transmits to the vendor; **only the Canvas attribution is lost.**"

`OrderCanvasRecorder`, rule 2, verbatim: *"Fail CLOSED for attribution. The document is only written when the ordering physician's Canvas Practitioner id is known; otherwise nothing is written (never an unattributed record under the service account)."* Nothing is lost from the record; the record does not exist. The screen understates the failure on the card that is already failing.

> "Being on the catalog with a configured test id *is* being authorized under the standing order. **There is no second allowlist.**"

There is. Junction's catalog is the second allowlist and it is authoritative. A `lab_test_id` that is inactive, deprecated, or outside the `lab_account_id`'s scope returns 422 after Aleron has already told the physician it is orderable. Aleron's catalog is not the last gate, it is the first one.

> "**16 entries, 14 orderable here**"

"Orderable" is `! empty($entry['lab_test_id'])`. The screen's most load-bearing number counts environment variables.

> BRIEF: "The rail foot carries the practice-wide standing-order registry, which is **deliberately not a rail item**: v0's own eyebrow calls it *'Practice-wide registry · LASO Wellness · not patient-specific'*, so it does not belong in a patient's chart."

The screen puts it on the **chart** rail foot at `aleron.md/chart/AL-47M/standing-orders`, and its own disclosure argues at length for why it belongs in the chart. That may well be the right call — row 62 is the one genuinely patient-specific fact and it is a good one — but it is the opposite of what BRIEF specifies, and the chart rail here runs seven items (Patient Data · Risk · Vitality · Screening · Care Plan · Journal · Aleron AI) against BRIEF's closed set of six (… Care Plan · **Orders** · …), with `aria-current="page"` sitting on Care Plan rather than on this surface and no breadcrumb back to its family. Design findings, not API findings, but they bear on the headline question of where a standing order lives.

---

## Open questions for the humans

1. **Do we want to be the ordering physician at Junction, or not?** Supplying `physician` transfers order validation and result review to Dr. Okafor. Not supplying it leaves both with Junction's network. The screen describes the first and the code does the second. Whichever is right, one of them has to change, and it is a medical-director call.
2. **If we do supply `physician`, who owns `licensed_states`?** Junction requires the field and documents no check of it against `patient_address.state`. Nothing in Aleron checks it either. Today an order for a patient in a state Dr. Okafor is not licensed in would be placed by Junction's network and never touch the question; the moment we name our physician, we own it and there is no backstop.
3. **Is the standing order a compliance record or a config value?** It is currently `env()`. If it is a record — with a signature date, a countersignatory, an effective date and an expiry, none of which exist today — it wants a table and an audit trail, not `.env`. The screen already renders it as a record.
4. **There is no expiry or effective date anywhere.** Standing orders normally expire. Nothing in config, nothing on the screen, nothing refuses an order under a lapsed authorization. Is that deliberate?
5. **Where does the counseling attestation belong legally** — the patient's consent ledger, the physician's attestation on the order document, or both? It changes which of the three options above we build.
6. **What does the physician do when they see `Configured, ordering off`?** The screen is read-only by design and the role matrix puts this under Admin. The physician learns their order will refuse and has no route to fix it. Is there a Task, a page to escalate to, a named admin? Right now the screen is a dead end at exactly the moment it becomes useful.
7. **`prac-9f2c41` is not a Canvas id shape.** Confirm the fixture, and confirm what happens when the configured id is simply wrong: Canvas has no JIT provisioning, and the recorder's failure path for a bad id looks the same as its path for a missing one — nothing is written, only a log line.
