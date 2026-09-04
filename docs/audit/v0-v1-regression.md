# v0 / v1 regression sweep

**Screens swept:**

v0 (11, all read in full): `_flow.html`, `login.html`, `patients.html`,
`risk-models.html`, `risk-models-systemic.html`, `risk-models-domain.html`,
`lab-orders.html`, `standing-orders.html`, `care-plan.html`,
`care-plan-note.html`, `emr.html`.

v1 (8, all read in full): `_flow.html`, `patient-data.html`, `risk-models.html`,
`risk-actions.html`, `vitality.html`, `care-plan.html`, `journal.html`,
`aleron-ai.html`.

v2 (14) and v3 (2) read for presence/absence only, plus every `carried` and
`dropped` annotation in both, extracted in full.

**Headline:** v2 is a genuine superset of v0 and v1 on almost every axis. Most
of what I expected to find missing is present, often improved. Six real
undocumented regressions, two of them material (numeric clinical targets, the
register toggle) and four minor. Three `dropped` annotations misdescribe what
they dropped.

---

## Undocumented capability regressions

| # | Capability / data point | Where in v0 or v1 | Should live in | Deliberate? | Cost to restore |
|---|---|---|---|---|---|
| 1 | **Numeric clinical target per action.** v0 states the goal every prioritized action is aiming at: `Goal: LDL-C < 70 mg/dL, ApoB < 80 mg/dL`, `Goal: < 130/80 mmHg`, `Goal: HbA1c < 5.7 %, HOMA-IR < 2.0`, `Goal: VO2max >= 33 mL/kg/min at 12 months`. No target string of any kind appears anywhere in v2 or v3: `Goal:`, `Target`, `70 mg/dL`, `130/80`, `33 mL/kg/min` all return zero across the 16 files. | `v0/risk-models.html`, "Prioritized actions · Action layer", one goal line per decision card | `v2/risk-actions.html` (evidence ledger row) and/or `v2/care-plan.html` (per-problem Plan field) | **No annotation.** Nothing in the set records this as a drop. v2 prices actions in QALY, which is the value of doing the thing, not the number the follow-up lab is measured against. The two are not substitutes. | Low. One field on the ledger row and one line inside the Plan textarea. The values already exist in the engine output v0 renders. This also fixes a real gap: v2's care plan orders a repeat lipid panel at 12 weeks with no stated threshold for what a good result is. |
| 2 | **The register toggle.** v0 ships a working day / flight-deck switch in its header (`aria-label="Switch to flight deck register"`) on every signed-in page. v2 hard-codes `data-register="flight-deck"` on `<html>` and ships no control at all. The string `Flight deck` does not occur in any v2 file. | `v0/patients.html` and all five v0 chart screens, `.v0-header__right` | The chart-rail and inbox-rail foot, beside `Log out` | **No annotation.** BRIEF.md P1 says day is "kept live for print and consult-room reading", which means a physician needs a way to reach it. v1 dropped it when the header became a rail, exactly as v1's own `fixed` annotation says happened to `Log out` and the actor name; those two were restored and this one was not. | Low. Same rail-foot slot the log-out fix already claimed an exemption for. Note the login screen already has the inverse defect recorded in v0 (register persisted before first paint with no control), so the mechanism exists. |
| 3 | **The full proposal space, by objective.** v1's care plan carries a 3x3 table (Risk reduction / Vitality improvement / Safety context, against Lifestyle / Diagnostics / Therapeutic) showing everything scored, not only the chosen few, with `double duty` marking levers that serve two objectives and `N/A · No proposal for this cell` where nothing was proposed. Absent from v2 and v3: `Full proposal space`, `Risk reduction`, `Vitality improvement`, `Safety context`, `double duty` all return zero. | `v1/care-plan.html`, `<details>` "Full proposal space" | `v2/care-plan.html` as a disclosure, or `v2/risk-actions.html` as a ledger view | **No annotation.** v2's ledger shows all 36 scored items, so "everything scored" survives; what is lost is the *objective* framing, and specifically that vitality improvement is a first-class objective a lever can be chosen for. The empty cells are also a P7 statement (nothing proposed here, said out loud) that the ledger cannot make. | Medium-low. The data is in the ledger; it needs an objective tag per row and one grid. |
| 4 | **Genetic-finding source detail behind the required channel.** v1 carries condition name, panel source, quantified lifetime risks (breast 20-30 %, pancreatic conditional, prostate possible), the sex-limited MRI rule with its 20 % threshold and NCCN citation, the CAPS/NCCN conditional pancreatic-surveillance criteria including the age-50 start, and the "risk-reducing mastectomy is generally not recommended" context. v2 compresses this to two sentences: "Confirmed P/LP on the 163-gene panel. Moderate penetrance; management is surveillance, not surgery." `NCCN` returns zero across v2 and v3. | `v1/care-plan.html`, `<details>` "Genetic findings · source detail behind the required channel" | `v2/care-plan.html`, beside the required-item disposition | **No annotation.** v1's own `gap` note on this block objects only to the two raw library keys in `Linked levers`, and those are correctly gone. The clinical detail went with them. This matters because the required channel is the one thing a physician cannot reject, so the basis for it should be the best documented on the surface. | Low. It is a disclosure block of static reference text, already written. Drop `Linked levers`, keep the rest. |
| 5 | **The "manual review" flag on a systemic pattern.** v0's systemic panel marks a pattern as flagged for human checking (`manual review` pill on SYS-P2). No equivalent in v2's three pattern cards; `manual review` returns zero across v2. | `v0/risk-models-systemic.html` | `v2/risk-models.html`, Systemic pattern card header, beside confidence and temporal-consistency | **No annotation.** Defensible on the merits: v0's own finding says the pill "carries no control: there is nothing to click, no queue it feeds, and no record of whether the review happened". But v2 has `Reviews` and an `Inbox`, which are exactly the queue v0 lacked, so v2 could have made it work rather than losing it. | Low as a chip. Medium if wired to Reviews, which is the version worth having. |
| 6 | **Notes that carry no orders.** v1's journal explains, per entry, why a signed note produced no order: review is itself a signed decision, external orders live with their external author, a cancellation is itself an order and this note is its authorization. Absent from v2's journal. | `v1/journal.html`, `<details>` "Notes that carry no orders" | `v2/journal.html` | **No annotation.** The doctrine it teaches, that "no new orders yet" is documented like any other decision, is not stated anywhere else in v2. | Low. One disclosure of three lines. |

### Checked and clear

These were the likely regressions and each one is present in v2, sometimes
renamed:

- v1's whole Vitality screen: four PRO cards with the fixed eight-slot x-scale,
  the HRV bridge with baseline and coverage, and the nine-driver explorer, all
  in `v2/patient-data.html` under "Felt experience", "Recovery context" and
  "Associated drivers".
- v1's "What this readout means" / "Clinical next moves" survive as "What it
  means here" / "Next moves" with the same three-card structure.
- v1's Variables with model-sensitivity bars survive and gain a reference-frame
  column, so v2 is a superset of both v1's tracks and v0's group tables.
- v1's action map, evidence ledger, diagnostics-as-gates table, AI candidate
  pipeline, action-changing gates, VO2max ladder: all present.
- v1's six-cell agent context strip is still a visible `.ai-strip` module with
  Dominant lens, Top action and Top gate, not demoted into the disclosure.
- v1's journal spine, all five entries including the imported external document
  and the change-of-direction entry: present.
- v1's computed commitment sentence, input readiness, packet provenance and
  read-only orders table: present.
- v0's Steps 1-3 derivation, A-D modifier groups with rules and composites,
  information gaps and evidence/provenance: present as disclosures.
- v0's whole systemic vocabulary except the manual-review flag: present, plus a
  new "Would settle it" row.
- v0's whole standing-orders screen including the fail-closed rollup, which v2
  widens to cover the kill switch as well.
- v0's ordering card, catalog, collection methods, counseling attestation,
  orders table, review-and-sign-in-row and the Entra `2fa.recent` step-up gate:
  present, the gate promoted from a quiet strip to a hazard boundary.
- v0's Canvas deep-link card and unlinked empty state: near verbatim.
- v0's cohort search, patient count, row-to-chart navigation, six-domain read
  and `Last run`: present on Panel.
- v0's `Order error` annunciator for a test with no configured id is not
  carried, and should not be: `v2/orders.html` prevents the state instead
  ("p-tau217 and Neurofilament Light have no test id configured here, so they
  are listed on the standing order and not offered"). That is a fix, not a loss.

---

## Documented drops, confirmed

The `dropped` set is 24 entries across v2 and v3. Twenty-one of them match
reality: the thing named is genuinely in v0 or v1 and genuinely absent from v2,
and the reason given is the real reason. Three do not.

1. **`v2/panel.html` and `v2/inbox.html`, the criticality pill.** Both say the
   counts behind the pill "survive inside the chart" / "inside the chart's
   action map". They do not. v0's tooltip carries four counts (*mandatory or
   override*, *do now*, *strong candidate*, *later*) and none of those four
   words or their counts appears anywhere in v2. The action map carries
   per-action QALY and gate status, which is a different quantity answering a
   different question. The drop of the pill is right; the claim that its
   information survives is not. Either restore the counts somewhere or amend
   the annotation to say the counts go with the pill.

2. **`v2/patient-data.html`, the felt half.** "Nothing from v0 is carried into
   the felt half, because v0 has nothing to carry: the current portal models
   five disease domains plus a systemic pass and records no patient-reported
   outcome anywhere. That absence is the finding." The absence is a *surface*
   absence, not a data absence. `v0/risk-models-systemic.html` displays
   `self-reported energy 4/10, cognitive clarity 4/10` as a signal under SYS-P2,
   lists `patient-reported` as a data type on that pattern, and reasons about
   mood 6 and body ease 5 under "Noise excluded". `v0/risk-models.html` and
   `v0/care-plan.html` both cite the same scores. So the shipped portal both
   receives and prints PROs; what it lacks is a place to see them as outcomes.
   That is a sharper and more useful finding than the one written, and it is
   also **proven-in-production evidence that PRO data reaches the engine**,
   which the current wording throws away.

3. **`v2/risk-models.html`, the "per-domain Model audit trail output grid, six
   PREVENT endpoints as tiles".** Nothing matching that description exists in
   the v0 record. `v0/risk-models-domain.html` renders Steps 1-3, information
   gaps and an evidence/provenance block, and no six-tile endpoint grid. Either
   the feature is in the shipped Laravel app and the v0 replica omits it, in
   which case v0 has an unrecorded capability and the replica is incomplete, or
   the annotation is describing the later app build rather than v0. It should
   say which. (v2 does add the 10-yr total CVD figure to its scorecard, so
   something from that grid was carried; the citation is what is wrong.)

Everything else lines up. The two `note`-tagged entries carrying
`data-kind="dropped"` on `v2/inbox.html` (the All and Released tabs) and
`v3/care-plan.html` (the basis-line measure) are self-critiques of v2's own
prior turn rather than v0 drops, which is a different use of the tag but not a
misstatement. Note also that every `data-kind="dropped"` in the **v0** files is
used as a plain reviewer note, not as a drop record; v0's tags carry
`<span class="wf-note__tag">note</span>`, so the two vocabularies do not
collide in practice, but a grep on `data-kind="dropped"` across the repo will
mix them.

---

## Proven-in-production data points

v0 replicates shipped Laravel code, so what v0 draws, some code path already
produced. Marked `proven` only where the screen or its annotation names a live
mechanism (a class, a column, a config key, an error the runtime raised);
`assumed` where the value could equally be fixture or seed.

| Data point | v0 screen | proven / assumed | What it implies is obtainable |
|---|---|---|---|
| `canvas_patient_id` on the patient record, and its absence as a distinct rendered state | `emr.html` | **proven** (named as the column, with both linked and unlinked specimens and a documented empty-state defect that prints the column name to the physician) | Aleron already stores and reads a Canvas patient linkage. Canvas FHIR `Patient` read/search is live. The unlinked branch is real, so the "no Canvas linkage" failure mode is already handled in code, not hypothetical. |
| Canvas patient id displayed as a value (`c8a1f4e2`) | `emr.html` | **proven** | The id round-trips to the UI. Any v2 screen that wants to show Canvas linkage state has the identifier already. |
| Canvas deep link into a patient chart, opened in a new tab, gated behind Aleron SSO with a documented one-time-Canvas-sign-in fallback | `emr.html` | **proven** (the fallback caveat is the shape of a bug someone hit) | Canvas SSO via Entra works, and the "you may see a one-time Canvas sign-in" caveat is exactly the no-JIT-provisioning consequence in the ground truth. Confirms the ground truth's §4 rather than contradicting it. Also confirms Canvas is reached by *link out*, never embedded, which matches "Canvas inside an Aleron iframe is not documented". |
| `Practitioner/9d31c07a` as a stored Canvas practitioner id, with an explicit consequence when unset | `standing-orders.html` | **proven** (the row states the failure mode: "Not set: Canvas order-authorization writes fail soft (no clinician attribution)") | Aleron already resolves a Canvas `Practitioner` reference per standing order. This is the exact identity the ground truth says is the root cause of command failures, and v0 shows it is already modelled, already checkable, and already has a defined degraded state. |
| Ordering physician NPI (`1487203956`) stored per catalog type | `standing-orders.html` | **proven** (row is `Not set: blocks ordering` in the unconfigured card, so the value gates real behaviour) | Junction's `physician.npi` field on `POST /v3/order` is already populated from Aleron config. |
| Standing-order reference document id (`ALR-SO-2025-014`) referenced by environment configuration, not app state | `standing-orders.html` | **proven** (the subtitle says so and the rollup names `\App\Services\Junction\StandingOrder::for()`) | The authorization model is deployed. `StandingOrder::for($type)` exists and is called at order time. |
| Fail-closed refusal of an order under an unconfigured standing order | `standing-orders.html`, `lab-orders.html` | **proven** (PHP class reference printed to the physician, plus a live `Order error` annunciator) | The gate runs at request time, not as a UI hint. |
| Per-test `lab_test_id` presence/absence per environment, surfaced as a runtime error that drops a test from the basket | `lab-orders.html` ("Lipoprotein(a) (Quest) has no lab_test_id configured in this environment and was dropped from the basket"), `standing-orders.html` (`No test id configured` on 3 blood and 3 genetics rows) | **proven** (this is an error string a running system produced) | Junction lab-test ids are configured per environment and Aleron validates against them before submitting. The catalog-to-Junction mapping layer exists. |
| A 16-test blood catalog with Quest display names (lipid panel, CMP, HbA1c, hs-CRP, fasting insulin, ApoB, Lp(a), UACR, PSA, eGFR/creatinine, LFTs, CK, TSH, CBC, p-tau217, NfL) | `lab-orders.html`, `standing-orders.html` | **proven** | Quest is the live lab partner through Junction and this exact menu is orderable today, minus the three with no id. |
| Five genetics panels (Invitae 160-gene, Hereditary Cancer, Cardiovascular Genetic, Pharmacogenomics, Proactive Genetic Health Screen), two with configured ids | `lab-orders.html`, `standing-orders.html` | **proven** | Genetic panels are ordered through the same Junction lab-testing path as blood. Consistent with the ground truth's "labs only" scope: a gene panel is a lab test. |
| Three collection methods: `walk_in_test`, `at_home_phlebotomy`, `testkit` | `lab-orders.html`, `care-plan-note.html` | **proven** (raw enum values are in the `<option value>` attributes) | Three of Junction's four documented `collection_method` values are wired. `on_site_collection` is the one Aleron does not use. |
| Shipping address block (receiver name, street, city, 2-char state, ZIP, 2-char country defaulted `US`) | `lab-orders.html`, `care-plan-note.html` | **proven** (field-level `maxlength` constraints match Junction's schema) | Junction's required `patient_address` is already collected at order time. |
| Order lifecycle states `requisition_sent`, `collected`, `resulted` | `lab-orders.html` | **proven** (v0's own finding calls them "the raw persisted enum") | Aleron persists its own order state machine and updates it from Junction. See the contradiction note below: these are not Junction's documented `order.status` words. |
| Result availability and a per-order physician review/sign state (`Available` / `Pending`, `Signed` / `Unsigned`, with a `Review & sign` action appearing only when available and unsigned) | `lab-orders.html` | **proven** | Results come back from Junction into Aleron, and Aleron already models physician review of a returned result as a signable act. |
| Order ids as integers (`#1041`, `#1038`, `#1022`, `#0994`) with a mixed blood/genetics history | `lab-orders.html` | assumed (plausible fixtures, but the id scheme and the mixed history are consistent with a real table) | An order table with type discriminator and history exists. |
| Note lock producing a Note PDF and a legal-record `DocumentReference` in Canvas | `care-plan-note.html` ("Freezes the note ... Generates the Note PDF and the legal-record DocumentReference in Canvas") | **proven** (matches the FHIR write matrix exactly, including the PDF attachment, which is not something a wireframe author would guess) | Canvas `DocumentReference` create with `application/pdf` base64 is implemented. This is the strongest single piece of Canvas-write evidence in the set. |
| Per-problem `Add to problem list` toggle with a named problem string (`ATM heterozygous carrier`, `Stage 2 hypertension, untreated`) and a distinct "documented in note only" state | `care-plan-note.html` | **proven** (binary state is rendered, both branches drawn) | Canvas `Condition` create is implemented, and the note-only branch means Aleron already decides per problem whether to write one. Ground truth confirms `Condition` create/update. |
| Entra step-up re-auth gate on order transmission, with the real failure mode (`2fa.recent` scope, HTTP 423, return-to-here) | `lab-orders.html`, `care-plan-note.html` | **proven** (a 423 and a named scope are runtime facts) | Entra/Azure AD auth with a step-up claim is deployed. Anything v2 gates on freshness of identity already has a mechanism. |
| Genetics pre-test counseling attestation, enforced on the portal ordering route and *not* on the mobile standing-order rail | `lab-orders.html`, `standing-orders.html` advisory | **proven** (the advisory names the divergence between two shipped surfaces) | The attestation is real, persisted, and gating. It also tells you the mobile client places genetics orders on a different path. |
| Six-domain risk read per patient across a cohort, with a fourth "no analysis" state | `patients.html` | **proven** (the `none` tier and the `-` criticality both render for a real unrun patient) | The risk engines run per patient and the cohort query reads their outputs, including the not-yet-run case. |
| Patient identity falling back to an email address when no MRN exists (`marcus.bell@example.com` in the MRN slot) | `patients.html` | **proven** (this is a real fallback showing through, and v2's `dropped` annotation calls it an identifier leak) | MRN comes from the Canvas linkage; an unlinked patient has no MRN, which corroborates the `canvas_patient_id` story above. |
| Action Layer run identity: `Run #7c1a9f04 · Action Layer v2.1.0`, run date, physician, and a criticality rollup of four counts per patient | `care-plan.html`, `patients.html` | **proven** (run id + version + the "no action-layer run on file" empty state) | The action layer runs, versions itself and persists a run per patient. Aleron-owned; no third party. |
| Engine rank and score per action (`ENG #1 · 8.42`), a TOP 3 marker, and rule-triggered Tier 1 entries that bypass ranking | `care-plan.html` | **proven** (v0's finding objects that the score has "no scale, no unit and no interval", which is a complaint about a real number) | The action layer emits a continuous score and a separate rule-flag channel. The required-channel concept exists in shipped code, not just in the reference design. |
| Full CVD derivation: `aha-prevent-v1` base model, 12.65 % base P, the PREVENT logit with 8 interaction terms, four sex-and-horizon coefficient tables of 19 terms, per-modifier multipliers with citations, group rules (PRODUCT / MAX), `exp(sum log-HR)` composite, tier classifier | `risk-models-domain.html` | **proven** (names `PreventCoefficients::totalCvd10yr()` / `totalCvd30yr()` and a spec section number) | The CVD engine is implemented to the AHA PREVENT 2024 spec and can already emit its own derivation. Aleron-owned. |
| Engine provenance stamp: spec version, engine slug, run timestamp, engine semver (`Aleron CVD Risk Engine Spec v2.3 · cvd-risk-engine · 8/29/2026, 9:14:02 AM · 1.0.0`) | `risk-models-domain.html` | **proven** | Per-run provenance is persisted per domain. |
| Systemic LLM run metadata: `systemic-llm-v2`, spec v1.4, `Data rows 1284`, `Verification passed`, a full run UUID truncated to 8 chars | `risk-models-systemic.html` | **proven** (the truncation with the full value in a `title` attribute is a real implementation detail) | An LLM synthesis pass runs over a counted row set with a verification step, and both the count and the verdict are persisted. |
| Cross-domain information gaps with never-performed status and an overdue interval (`Colorectal cancer screening: never performed · 21mo overdue`) | `risk-models.html` | **proven** (v0's own finding names `infoGapRows()` and a `t.domain` interpolation bug, so the generator is real code) | Aleron already computes screening due-dates and overdue intervals. v2's screening panel has a source. |
| Per-domain information gaps with "why missing matters", "if obtained · effect" and a cadence | `risk-models-domain.html` | **proven** (same generator, `Informs cvd` is the same unmapped-key bug showing) | Structured gap records with cadence exist per domain. |
| Wearable-derived signals reaching the engines: SpO2 nadir 89 %, overnight RHR 38 bpm, HRV 34 ms against a 42 ms personal baseline, 82 % coverage, "3 of 14 nights" | `risk-models-systemic.html` | assumed (rendered inside engine narrative prose, so the display is proven but the pipeline is inferred) | Junction Devices/Wearables data reaches Aleron and is being reasoned over, including a personal baseline and a coverage figure. v2's Device instruments group is not inventing a capability. |
| Patient-reported outcomes reaching the engines: energy 4/10, cognitive clarity 4/10, mood 6/10, body ease 5/10, and `patient-reported` as a declared data type | `risk-models-systemic.html` | assumed (same caveat: printed inside narrative, no PRO surface) | The portal has PRO values today. See documented-drops item 2: v2 asserts the opposite. |
| Genetic result as structured data: `ATM heterozygous P/LP, reported on the 160-gene panel`, driving both a Cancer-domain modifier and a rule-flagged Tier 1 action | `risk-models.html`, `risk-models-systemic.html`, `care-plan.html` | **proven** (it is an engine input, not a display string) | A genetics result from a Junction-ordered panel is parsed into a variant-level fact Aleron's engines read. |
| Physician identity in session (`Dr. A. Okafor`) with a log-out control | `patients.html` and all v0 chart screens | **proven** | Session and actor are modelled. v1's `fixed` annotation restoring these to the rail foot is restoring a shipped capability, correctly. |
| Entra workforce SSO as the production sign-in, with a `localLoginEnabled` non-production branch | `login.html` | **proven** (the config flag is named) | Physician auth is Entra in production. |

---

## Where v0 contradicts the API ground truth

Four, of which one is substantive.

1. **Canvas order-authorization writes. Substantive.**
   `v0/standing-orders.html` renders, for an unset Canvas practitioner id:
   *"Not set: Canvas order-authorization writes fail soft (no clinician
   attribution)"*. That sentence asserts Aleron writes an order authorization to
   Canvas. The ground truth says FHIR `ServiceRequest` has no create, and the
   only Canvas order write is a Plugin SDK `LabOrder` / `ImagingOrder` command
   originated inside a note. `v0/care-plan-note.html`'s own annotation agrees:
   *"it cannot become anything through the API: `ServiceRequest` is read and
   search only."*
   So one of three things is true, and the set does not say which: (a) the
   shipped app writes something else and calls it order authorization (a `Task`,
   a second `DocumentReference`, or note/patient metadata), (b) it runs a Plugin
   SDK command and the copy is loose, or (c) the write silently no-ops and
   "fail soft" is the tell. The phrase *fail soft* rather than *fail closed* is
   the clue: the blood card is fully configured and ordering is enabled, which
   means orders transmit to Junction today with no Canvas record at all. That
   matches the ground truth's step 4 ("Canvas holds no order record for these,
   by design") and makes the sentence describe a write that never happens.
   **This is worth resolving before v2 builds on it**, because v2's
   `standing-orders.html` carries the four record fields and "their fail-closed
   and fail-soft consequences ... moved from a docblock into the row where the
   consequence applies", so it inherits the claim.

2. **Junction order statuses.** v0 persists and displays `requisition_sent`,
   `collected`, `resulted`. Junction's documented `order.status` set is
   `received | collecting_sample | sample_with_lab | completed | cancelled |
   failed`. Not a contradiction so much as an undocumented mapping layer:
   Aleron keeps its own lifecycle and translates. The ground truth's mention of
   "modality-specific low-level statuses" may be where `requisition_sent` comes
   from. Someone should write the mapping down, because v2 keeps the same words
   (minus the pills) and a physician reading `collected` is reading an Aleron
   word, not a Junction one.

3. **`lab_test_id` per test.** v0 orders by a per-test `lab_test_id`. The
   ground truth marks that field deprecated in favour of
   `order_set.lab_test_ids[]`. Not impossible, just stale: the shipped code
   predates the deprecation. It is a migration item, not a design question,
   but it touches every row of both standing-order menus.

4. **Canvas SSO.** `v0/emr.html` promises SSO and then admits a one-time Canvas
   sign-in may appear. That is not a contradiction, it is the ground truth's
   "there is no just-in-time provisioning" observed in the wild. Recording it
   here because it is the only place in the whole set where a shipped screen
   confirms a documented limitation rather than assuming it away, and it means
   the practitioner-provisioning problem is already visible to physicians
   today.

Two non-contradictions worth stating, because they are the cases where v0 is
*right* and a reader might expect otherwise: the note-lock copy
("Note PDF and the legal-record DocumentReference in Canvas") matches the FHIR
matrix exactly, and the order path ("Transmits to Junction now, while the note
stays an open draft") matches the ground truth's Junction-places-labs flow.

---

## Open questions for the humans

1. **Where do numeric clinical targets live in v2?** This is the one regression
   I would not ship without. v0 states a goal per action; v2 states a QALY per
   action. Both are needed, and only one is drawn. If the intent was that
   targets belong to the care plan's Plan field rather than the ledger, say so
   and put them there.

2. **Is day register reachable in v2 at all?** BRIEF.md P1 keeps day live "for
   print and consult-room reading". v0 has a toggle on every page. v2 has none.
   Either the rail foot gains one or P1's justification needs rewriting.

3. **Does Aleron write anything to Canvas at order time?** See contradiction 1.
   The answer changes what `Canvas practitioner id` is *for* on v2's standing
   orders screen, and whether "fail soft" is a real degraded mode or a
   description of a no-op.

4. **The criticality counts.** v2 drops v0's pill and claims the counts survive
   in the chart. They do not. Are the four counts (mandatory/override, do now,
   strong candidate, later) wanted anywhere, or does the QALY scale genuinely
   replace them? If replaced, amend two annotations.

5. **Does the portal have PRO data today or not?** v2's patient-data annotation
   says no; v0's systemic panel prints four PRO scores and declares
   `patient-reported` as a data type. If the answer is "the engine receives them
   from the member app and the portal has no surface", that is the finding, and
   it is better evidence for building v2's felt half than "v0 has nothing".

6. **What is the "six PREVENT endpoints as tiles" grid** that v2's risk-models
   annotation says it dropped? It is not in the v0 record. If it is in the
   shipped app, v0 is incomplete and the replica should be corrected (v0 is a
   record, and a missing feature in a record is a defect in the record, not a
   design choice).

7. **Should the manual-review flag be wired to Reviews** rather than dropped?
   v0 had the flag and no queue; v2 has the queue and no flag. That is an easy
   thing to regret.

8. **`lab_test_id` deprecation.** Who owns migrating the catalog to
   `order_set.lab_test_ids[]`, and does it change the standing-order menu
   shape? Both v0 and v2 render one status per test id.
