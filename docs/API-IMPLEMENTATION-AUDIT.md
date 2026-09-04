# API implementation audit

**Every data point on every proposed screen, checked against the Canvas and
Junction APIs.**

3 September 2026. Method: one agent per screen, each reading its screen in full
against a pinned capability reference ([API-GROUND-TRUTH.md](API-GROUND-TRUTH.md)),
plus a regression sweep across v0 and v1. Per-screen evidence, including the full
data-point tables, is in [docs/audit/](audit/). This document is the synthesis
and the change register.

**Scope.** v2 (13 screens) and v3 (1 screen) were audited data point by data
point, because they are what would be built. v0 and v1 were swept for
*regressions* and for *proven-in-production evidence* rather than audited for
feasibility — v0 is a record of shipped code, so what it draws, some code path
already produces. That evidence was the strongest input on the Canvas write path
and, on one point, actively misleading — see the PRO correction in Part 3. A
replica of shipped code proves a screen rendered a value; it does not prove a
pipeline produced it.

---

## The number

**1,664 data points audited.**

| Verdict | Count | Meaning |
|---|---:|---|
| `OK` | 1,012 | Obtainable as drawn |
| `GAP` | 391 | Obtainable, but needs work the design has not accounted for |
| `WRONG` | 110 | The API contradicts what is shown, or cannot produce that shape |
| `UNVERIFIED` | 84 | Plausible, unconfirmed; each names what would settle it |
| `NONE` | 66 | No API path exists |

**61 % of the set is buildable exactly as drawn.** That is a better result than
the headline findings below will make it sound, and it is worth holding onto:
the failures cluster, and they cluster in places that are fixable.

*(One screen's own totals are off by one against its verdict split; the
discrepancy is in `v2-risk-models.md`, where ten rows carry `NONE` as a source
rather than as a verdict.)*

---

## The verdict in one page

Four things are true, in descending order of consequence.

**1. The set's model of how Canvas is written to is wrong, and it is wrong the
same way on six screens.** The designs describe Aleron writing a
`DocumentReference` to lock a note. That is not the mechanism. Canvas's Note API
creates a note and a `stateChange` **locks** it, and *locking is what generates
the PDF and the `DocumentReference`*. Aleron does not write the document; it
locks a note and Canvas produces one. This matters far beyond pedantry, because
**every clinical command — `Diagnose`, `Assess`, `Plan`, `Goal`, `Refer`,
`Prescribe` — must be originated inside a note.** As currently drawn,
the problem-list decisions have nothing to crystallize into and the release
package's "Canvas note id" never comes into existence.

**2. Only two of the 34 proposed clinical actions are reachable end to end.**
The coronary calcium score (`ImagingOrder`, originate + sign) and the bariatric
referral (`Refer`, originate + sign). Everything else stages, redirects, or has
no act behind it at all. The board's two highest-value diagnostics — home BP
confirmation at 65 % reclassification odds, the largest movable PREVENT term,
and the home sleep apnea test at 35 % — are **device orders**, and there is no
device-order path in any system in this stack.

**3. Aleron is being asked to store patient data on at least four screens, and
the designs never say so.** The order ledger spans three systems under one id
sequence. The panel's default view needs a cross-patient risk tier no API holds.
The journal needs an act log for events Canvas has no resource for. The AI
screen needs durable per-patient reasoning. Each is individually defensible;
together they are the quiet end of "Canvas is the system of record, Aleron
stores nothing", and it should end deliberately rather than by accumulation.

**3b. The risk engine is sound and its audit panel is not.** Independently
verified against the published PREVENT coefficients recovered from the CRAN
`preventr` package: the screen's headline figures are correct ASCVD outputs
(16.18 % and 2.74 % against 16.0 % and 2.7 % shown). The β table that claims to
derive them matches no published table, omits a required term, and misstates
three transforms. Separately, the modifier layer multiplies hazard ratios onto
an absolute probability and lands above the published ceiling for a broader
endpoint. Good news about the model, bad news about the one panel whose whole
purpose is proving the model.

**4. The return leg from Canvas was the wrong problem.** One redirect is
genuinely unavoidable — prescription signing, gated on Surescripts SPI and, for
controlled substances, EPCS enrolment, both of which attach to the prescriber and
not to the calling application. This document originally proposed either
inverting the embed or building a callback, and both were over-engineering.

**The physician is the trigger.** They leave, they sign, they come back, and the
page reads exact state on that render through the plugin ORM. No callback, no
scheduled reconciliation, no acknowledged table. It also makes two nasty facts
irrelevant: plugin outbound HTTP *swallows transport failures* — "the failure is
logged and the effect pipeline continues", so a callback has no failure signal —
and `PRESCRIPTION_SIGNED` may fire only inside the DrFirst pipeline, which would
mean a printed prescription never fires it. Subscribe to no events and neither
matters. See Part 5, decision 8.

---

## Part 1 — The flow, corrected

The Aleron ↔ Junction ↔ Canvas flow as the audit found it, rather than as the
screens describe it. Changes from the drawn version are marked **▲**.

> **Everything in the Canvas column marked `SDK` needs a deployed plugin.**
> `CommandAPI` is a Python base class you subclass inside a plugin, not an API
> Canvas hosts. The externally-reachable Canvas surfaces are FHIR, the Note API,
> and nothing else. This is settled — see Part 5, decision 1.

| # | Step | System | Mechanism | Notes |
|---|---|---|---|---|
| 0 | **Create the note** ▲ | Canvas | `CREATE_NOTE` (SDK) or `POST /core/api/notes/v1/Note` | **Undrawn on every screen.** Everything downstream needs a `note_uuid`. Must happen before any command. |
| 1 | Compose plan, run engines | Aleron | — | Aleron-owned. No third party. |
| 2 | Problem-list decisions | Canvas | `Diagnose` (new), **`Assess`** ▲ (existing) | *Not* FHIR `Condition` update: the **only** supported Condition update is marking it `entered-in-error`. |
| 3 | **Lock the note** ▲ | Canvas | `stateChange` → `LKD`, or `SIGN_NOTE` | Canvas generates the PDF **and** the `DocumentReference`. Aleron does not write the document. |
| 4 | Lab / genetic order | **Junction** | `POST /v3/order` | Canvas holds no order record, by design. Results return by webhook. |
| 5 | Results into the chart | Canvas | `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS` (SDK) | Real values, units, ranges, abnormal flags — not a PDF. Needs no Canvas lab order to exist. `POST /DiagnosticReport/$create-lab-report` looked like an external alternative but is **not declared on `aleronmd-dev`** — untested, so assume the effect. |
| 6 | Imaging order | Canvas | `ImagingOrder` — originate, **sign**, then **`send()`** ▲ | **Two calls, not one.** A failed `send()` after a successful `sign()` leaves the row lying. |
| 7 | Referral | Canvas | `Refer` — originate, **sign**, **no `send()`** ▲ | Aleron can sign a referral and **cannot transmit it or learn that it was transmitted.** Transmission is Canvas-native. |
| 8 | Prescription | Canvas | `Prescribe` — originate only, **no `sign()`** | Physician redirected to Canvas. `send()` exists but Canvas's own example applies it to commands **a human already committed**. |
| 9 | Release to patient | Aleron | gated on Canvas linkage | Package id and hash ride on the note via `UPSERT_NOTE_METADATA`. |

**Two traps that bite silently.** `originate(commit=True)` is ignored for every
order command — you get a staged command nobody signed and no error. And a
locked note is **not editable**, so any command added after step 3 needs a new
note.

### The ordering constraint, and where v3 over-claims

**Orders while the note is open works, and it is the intended flow** — a
physician keeps the note open and starts investigations immediately. Commands
live in a note and an open note accepts them. An earlier revision of this
document called v3's independence claim broken; that was an overstatement, and
it is corrected here.

What v3 over-claims is **one state out of three.** It says the act "reads the
same" whether step 2 is *open, locked, or never taken*. Open is fine. Never taken
is fine, since a note only has to exist and creating one is cheap. **Locked is
not** — a locked note is not editable, so no further command can enter it. The
fix is one conditional blocker, not a redesign: after a lock, a later order opens
a new note for the same episode, drawn as an ordinary flow. See Part 5,
decisions 10 and 11.

The correct rule is **per-route, not global**: Junction labs are genuinely
independent of the note; Canvas commands are not.

---

## Part 2 — Cross-cutting findings

Eight findings that appear on three or more screens. Fixing these fixes most of
the register in Part 3.

### C1. The note, not the document (6 screens)
`DocumentReference` has **no update** and is an attached document, not a note. It
cannot host commands and cannot carry a post-hoc fact. Every screen that draws
"lock the note → write a DocumentReference" has the mechanism inverted.
**Fix:** `CREATE_NOTE` → originate commands → `UPSERT_NOTE_METADATA` →
`SIGN_NOTE`. The DocumentReference arrives on its own.
*Screens: v2 care-plan, v3 care-plan, emr, journal, orders, reviews.*

### C2. `verificationStatus` is not writable, and one drawn value doesn't exist (3 screens)
Canvas carries `confirmed`, `provisional`, `entered-in-error`. **None is
writable by Aleron**, and `monitoring` — drawn as a selectable state on the care
plan — is not a Canvas value at all. Neither `Diagnose` nor `Assess` carries a
certainty field.
**Useful corollary:** a `provisional` Condition is what Canvas creates when you
attach a diagnosis to an Image / Refer / POC Lab / Lab Order command. It is a
side effect of ordering, not a separate act.
**Fix:** render certainty as prose, or hold it as note metadata and stop
implying it reaches the chart.

### C3. Aleron-owned facts have a home, and it is cheaper than the designs assume (9 screens)
The set says repeatedly that deferral reasons, override reasons, package ids,
engine run ids and display policies "have no field in Canvas FHIR" and need a
Custom Data Model. **`UPSERT_NOTE_METADATA` and `UPSERT_PATIENT_METADATA`
cover almost all of it** — note-scoped for anything that must survive a lock,
patient-scoped for anything that must cross cycles.
Two specific wins: `DetectedIssue` has **full FHIR CRUD** and its `mitigation`
field is the right home for a deferred preventive-care obligation; and
`QuestionnaireResponse` has create/read/update and is the right home for the
Vitality PROs — though the audit's premise there was wrong: they do not live in
Aleron either, because they do not exist. `QuestionnaireResponse` is where they
belong once something collects them.
**Do not build a Custom Data Model** for anything in this register except the
release package.

### C4. Cross-patient queries are better supported than assumed (2 screens, large)
The inbox and panel looked like they required an Aleron-side index. They do not.
- `GET /Task?owner=Practitioner/{id}&status=requested` is a **real cross-patient
  work-queue query**, and `Task.input` labels are **free text, auto-created, and
  searchable** — so Aleron's whole lifecycle vocabulary can live in Canvas.
- `GET /Patient?_has:CareTeam:participant:member=Practitioner/{id}` is the only
  cross-patient "my panel" query in the FHIR API, and it returns the whole panel
  at once.
- Every search Bundle carries `total`, and `_count=1` works, so **every count on
  both screens is free.**

**This dissolves the storage tension rather than accepting it: Canvas Task *is*
the index, so patient identifiers never leave Canvas.** The costs are real —
labels are free text with no enum, so a typo silently creates a ninth lifecycle
state, and `Task._sort` supports only `_id` and `due-date`, so neither screen's
"waiting longest" sort is server-side.

**Consequence:** exactly one string per lifecycle state must exist across both
screens. They currently use different words for the same states
(`Review pending` vs `Physician review pending`). That stops being cosmetic the
instant those strings become Canvas labels.

### C5. Device orders have no path anywhere (4 screens)
No DME or home-diagnostic order command exists in the SDK; FHIR `ServiceRequest`
has no create; Junction is labs only. This kills, as drawn: home BP
confirmation, home sleep apnea test, overnight oximetry, CGM trial, ABPM, Holter
and patch monitors.
**But the clinical objective survives** — see Part 4, which is where the
alternatives live. Do not read this as "cannot be done"; read it as "cannot be
done as an order".

### C6. Canvas has no just-in-time provisioning (every screen)
SSO is SAML 2.0 with Entra as a supported IdP, but **a Canvas user must exist
before SSO works.** Every command needs a Canvas practitioner id. Nothing in the
set surfaces whether the signed-in physician has one.
This is the root cause of the genetics-order failure the set describes, and it is
a **provisioning runbook item, not a design one** — but it belongs beside the
Entra freshness check as a named precondition, because every command on every
screen fails without it.

### C7. Aleron learns of Canvas acts only by polling (3 screens)
`AuditEvent` is not exposed. `Subscription` is absent. The FHIR surface
documents **no webhook of any kind**. `Provenance` is readable and
cross-patient-searchable (all four search params are optional), which is more
than expected — but whether it fires on **UI-originated human acts** is not
documented, and everything in "acts Aleron never sees" depends on it.
The real-time path exists but inverts the architecture: SDK events
(`PRESCRIPTION_SIGNED`, `POST_COMMAND_COMMIT`, note lock/unlock) fire on native
acts, which means the log lives inside a Canvas plugin.

### C8. Engine outputs have no home in Canvas (3 screens)
QALY figures, reclassification odds, risk scores and bands. FHIR `Observation`
create is **restricted to a fixed vital list** — BMI is not on it, nor body fat,
HRV, sleep duration, steps, or VO₂max — and has **no update**, so a re-scored
value appends forever.
**The one live option worth an hour:** whether the SDK's `CREATE_OBSERVATION` /
`UPDATE_OBSERVATION` effects carry the same category restriction as the FHIR
endpoint. If they do not, that is the answer for every score in the set.
Otherwise: metadata for ids and current values, recompute-on-demand for the
derivations.

---

## Part 3 — Required changes register

142 changes across 12 screens. Severity: **A** = architectural (changes what gets
built), **F** = field or integration work, **C** = copy or fixture fix.

### v2/care-plan.html — 13 changes *(212 data points)*
| # | Change | Sev |
|---|---|---|
| 1 | `Update existing` disposition has no API path → rewire to SDK `Assess` | **A** |
| 2 | Diagnostic-certainty axis unwritable; `monitoring` is not a Canvas value | F+C |
| 3 | Act 1 names the wrong Canvas object → `CREATE_NOTE`/`SIGN_NOTE` | **A** |
| 4 | Act 2 authorizes six intents with four different lifecycles under one button | F+C |
| 5 | Deferral/override reason → `UPSERT_NOTE_METADATA` before `SIGN_NOTE` | F |
| 6 | `Dx:` on Task rows cannot be written | C |
| 7 | "A physician-added order needs a diagnosis association" is Aleron's rule, not Canvas's | C |
| 8 | QALY / reclassification / action-map coordinates have no Canvas home | **A** |
| 9 | Per-problem plans and the narrative both write to one `narrative` field | **A** |
| 10 | No screen surfaces whether the physician has a Canvas practitioner id | F |
| 11 | `Refer` priority and diagnosis codes drawn but unconfirmed | C |
| 12 | "The pharmacy will call you" — transmission has not happened | C |
| 13 | Canvas note id exists at creation, not "on release" | C |

### v3/care-plan.html — 12 changes *(205 data points, 24 `WRONG` — the highest rate in the set)*
| # | Change | Sev |
|---|---|---|
| 1 | **Step-3 independence claim is false for the locked case** | C (large consequence) |
| 2 | Say when the Canvas note is created — no step creates one | C (large consequence) |
| 3 | Decide what "5 intents, all unsent" means: staged commands or Aleron rows | F |
| 4 | Counts wrong: 4 problems vs 3; "5 orders" where 4 are authorizable | C |
| 5 | Retire "cannot be rejected" — three surfaces still carry it | C |
| 6 | Deferral-reason gap overstated; `DetectedIssue.mitigation` exists | C |
| 7 | "Links on release" — the note id exists at lock | C |
| 8 | **"The pharmacy will call you" — patient-safety line on an unsigned Rx** | C |
| 9 | Add the missing Canvas-practitioner-id blocker | C |
| 10 | `Refer` priority, `Dx:` on Task/Goal, `MedicalHistory` takes no ICD-10 | C |
| 11 | Third fixture patient violates BRIEF | C |
| 12 | FIB-4 is computed, not ordered | C |

### v2/orders.html — 16 changes *(180 data points)*
| # | Change | Sev |
|---|---|---|
| 1 | Route strip promises result values the screen never renders | **A** |
| 2 | **`Refer` has no `send()`** — "signed and sent" is false | C |
| 3 | Imaging "sign is also what sends it" is two calls | C+F |
| 4 | Prescription fields cannot produce a `Prescribe` command (5 controls) | F |
| 5 | Imaging has no diagnosis-code control; referral no service-provider | F |
| 6 | Junction's required `patient_details` block appears nowhere | F |
| 7 | Note field is capped at 120 chars and does not say so | C |
| 8 | Status column mixes three vocabularies, covers no failure states | F |
| 9 | `licensed in CA, NY, TX` has no read source | F |
| 10 | **Screening half contradicts the ledger** — HbA1c resulted Jun 2026, screening says Aug 2024 | C |
| 11 | "the one place an order is authorised" is now false | C |
| 12 | `Last: never` overstates a read | C |
| 13 | **Order ids 4471–4523 span three systems — Aleron keeps a cross-system ledger** | **A** |
| 14 | Result signature has no home (`LabReview` + `SIGN_NOTE`, needs a note id) | F |
| 15 | API vocabulary on the product surface (BRIEF violation) | C |
| 16 | Timeline's pinning rule does not match its own dots | C |

### v2/risk-models.html — 12 changes *(151 data points)*
| # | Change | Sev |
|---|---|---|
| 1 | **The risk numbers are right; the audit panel that claims to derive them is invented.** See [the verification](audit/VERIFY-prevent-arithmetic.md) | F+C |
| 1b | **The modifier layer multiplies hazard ratios onto an absolute probability** — not a valid risk transformation, and the result exceeds the published ceiling | **A** |
| 2 | A6 fires on one measurement while the screen says it needs two | **A** |
| 3 | Four of six rail domains print a score from a model the screen says isn't materialised | **A** |
| 4 | Cancer cell shows `4 engines` where siblings show a probability | F |
| 5 | The run is 71 days old and nothing says so | **A** |
| 6 | No engine output has a Canvas home, and the screen implies one | **A** |
| 7 | ABPM and 12-lead ECG have no order path | **A** |
| 8 | Vitality PROs are not a residency violation — **they do not exist**. `QuestionnaireResponse` is their home once collected; today the rows have no source | F |
| 9 | Group D asserts four negatives from unreadable data → `not assessed` | F |
| 10 | Confidence has two vocabularies and no scale | C |
| 11 | Pipeline facts on the product surface | C |
| 12 | **No fixture object — 146 values hardcoded across 953 lines** | F |

### v2/risk-actions.html — 14 changes *(178 data points, 34 acts audited)*
| # | Change | Sev |
|---|---|---|
| 1 | Retatrutide and CagriSema are investigational — no FDB code, no `Prescribe` | F |
| 2 | **The two highest-odds diagnostics cannot be ordered** | **A** |
| 3 | OGTT cannot go through Junction (timed load-and-serial-draw) | F |
| 4 | "Actionable" overstates every drug row | C (large meaning) |
| 5 | "Send to care plan" has no CarePlan behind it — it is read-only | C |
| 6 | Alcohol-reduction mark nudged 78 px across the act floor | C |
| 7 | Three value-of-information figures are not odds × QALY | C |
| 8 | Engine internals on the product surface | C |
| 9 | "The remaining thirteen sit below threshold" is false in both directions | C |
| 10 | Tab counts do not reconcile with the marks plotted | C |
| 11 | The ECG carries three different evidence labels | C |
| 12 | Two-act marks need unbundling | F |
| 13 | Six diagnostics carry a confidence that exists only as an x-coordinate | C |
| 14 | Resmetirom's gate cannot close — arrives as a report, not structured data | C |

### v2/emr.html — 13 changes *(100 data points + 20 capability claims)*
| # | Change | Sev |
|---|---|---|
| 1 | Strike the resolved spike — `SIGN_NOTE` exists | C |
| 2 | Fix the referral row — `Refer` has no `send` | C |
| 3 | Release row has no implementable carrier | F |
| 4 | "Checked 11:55" implies a poll that cannot detect two of the states shown | F |
| 5 | Move `ServiceRequest`, `canvas_patient_id`, repo paths off the product surface | C |
| 6 | Rename both order rows — "Lab order authorization" is the invented resource | C |
| 7 | Row 2's "1 update existing" contradicts its own prov text | C |
| 8 | **EPCS asserted on tirzepatide, which is not DEA-scheduled** | C |
| 9 | Restate the genetics root cause as a provisioning failure | C |
| 10 | Add a prescription return leg, or admit there is none | **A** |
| 11 | Third fixture patient violates BRIEF | C |
| 12 | "returns values rather than a scanned report" — Junction returns both | C |
| 13 | Disclosure says three write shapes; annotations say two | C |

### v2/inbox.html + v2/panel.html — 13 changes *(92 data points)*
| # | Change | Sev |
|---|---|---|
| 1 | **Panel's default density demands 9 engine runs on first paint** | **A** |
| 2 | **Adopt Canvas `Task` as the queue primitive, explicitly** | **A** |
| 3 | "Blocked or on hold **1**" contradicts two rows in blocked states | C |
| 4 | "Seven items" is a hardcoded word for a live count | C |
| 5 | Patient code embeds age into an immutable identifier | F |
| 6 | Two names for one state within the inbox | C |
| 7 | Inbox and panel use different words for the same states | C |
| 8 | Fixture disclaimer on the product surface inside `role="status"` | C |
| 9 | Repo path on both product surfaces | C |
| 10 | "137 more patients, all in states with no physician act" asserts unfetched rows | C |
| 11 | Both sort controls sort a page and present it as a ranking | F |
| 12 | "Coronary calcium gate resulted overnight" cannot come from Junction | C |
| 13 | Confirm whether a germline genetics kit is a Junction order at all | F |

### v2/journal.html + v2/reviews.html — 10 changes *(153 data points, 33 `NONE` — the highest in the set)*
| # | Change | Sev |
|---|---|---|
| 1 | The same four orders cannot be both Junction orders and Canvas `ServiceRequest`s | F |
| 2 | Two Device orders have no ordering path | F |
| 3 | `custodian: Canvas EMR` on an external faxed consult | C |
| 4 | "Signed entries never change" — Canvas Notes have a documented unlock | C |
| 5 | `DocumentReference` has no `relatesTo` — addenda have no link field | F |
| 6 | "carried as fixtures" is reviewer copy on the product surface | C |
| 7 | **One ordering axis across three clocks** | **A** |
| 8 | **Decide where the Aleron act log lives — 33 data points have no home** | **A** |
| 9 | Spike whether Canvas `Provenance` fires on UI-originated acts | F |
| 10 | Verify the genetics path — `BiomarkerResult` has no shape for a variant call | F |

### v2/patient-data.html — 10 changes *(158 data points, only 1 `WRONG` — the cleanest screen in the set)*
| # | Change | Sev |
|---|---|---|
| 1 | `sleep regularity 58 of 100` is an invented metric | C |
| 2 | Three device-provenance strings describe webhook-only state (firmware, backfill, last sync) | C |
| 3 | Genetics panel is not a Junction order; sleep test is not orderable | F |
| 4 | Wearable coverage stated three ways: `26 nights`, `87 %`, `82 %` | C |
| 5 | Decide per lab row whether the source is Canvas or Junction | F |
| 6 | **Own the banding tables explicitly — 11 Aleron thresholds render like lab-supplied flags** | F |
| 7 | Nadir is not a Junction operation — 4 values are per-window minima of a raw timeseries | **A** |
| 8 | **Add allergies, medications, problem list** — all FHIR-readable, all absent | F |
| 9 | Say which sleep field `6.4 h` is (`total` and `duration` differ by ~1 h) | C |
| 10 | Define "active minutes" — Junction gives low/medium/high separately | C |

### v2/standing-orders.html — 8 changes *(76 data points)*
| # | Change | Sev |
|---|---|---|
| 1 | **The NPI caption is false — no `physician` object is sent to Junction** | F (compliance) |
| 2 | **The fail-soft caption is inverted — the write fails *closed*, so no record exists** | C (important) |
| 3 | PHP symbol on the product surface | C |
| 4 | Signature dates and countersignatory exist in no system | C |
| 5 | Physician's name inferred from the session; config holds a bare NPI | C |
| 6 | **Catalog never reconciled against Junction — "14 orderable" counts env vars** | **A** |
| 7 | Counseling attestation lives only in Aleron's DB | F |
| 8 | **Nobody enforces licensed-states against the patient's address** | F |

### v2/messages.html + v2/aleron-ai.html — 15 changes *(159 data points)*
| # | Change | Sev |
|---|---|---|
| 1 | **Say which system carries the message and where the patient reads it** | **A** |
| 2 | Audit-log claim — `Provenance` is read-only, there is no audit-write effect | C |
| 3 | Unread count — Aleron can read it but can never clear it | F |
| 4 | `ops also on thread` — Communication search excludes practitioner↔practitioner | F |
| 5 | A message's reference has no Canvas field | F |
| 6 | Cuff-shipment data points have no resource in either system | C |
| 7 | NPI is resolved live, not stamped at send | C |
| 8 | **Adopted / dismissed AI claims have no home** | **A** |
| 9 | HOMA-IR cited as a lab field; it is derived from glucose and insulin | C |
| 10 | `packet.*` paths on the product surface | C |
| 11 | "the only reading on file" → "in the chart" | C |
| 12 | Two consultation lists disagree | C |
| 13 | `Consult` reads as a referral beside Adopt and Dismiss | C |
| 14 | **Declare that PHI leaves Aleron for an external model, per consultation** | C |
| 15 | Resolve the genetics read path | F |

### v0 / v1 regression sweep — 6 undocumented regressions
**v2 is a genuine superset of v0 and v1 on almost every axis.** Most expected
regressions are present, often improved. Six are not, two materially:

| # | Lost capability | Sev |
|---|---|---|
| 1 | **Numeric clinical targets per action** (`LDL-C < 70 mg/dL`, `HbA1c < 5.7 %`, `VO2max ≥ 33 at 12 months`). Zero target strings exist anywhere in v2 or v3. QALY is the value of doing the thing, not the number the follow-up lab is measured against. v2 orders a repeat lipid panel at 12 weeks with no threshold for a good result. | F |
| 2 | **The register toggle.** v0 ships a working day/flight-deck switch on every signed-in page; v2 hard-codes flight-deck with no control, while BRIEF P1 keeps day live "for print and consult-room reading". | F |
| 3 | v1's full-proposal-space-by-objective grid | C |
| 4 | v1's genetic-finding source detail (NCCN citations, quantified lifetime risks) | C |
| 5 | v0's `manual review` pattern flag — v2 now has the queue v0 lacked | F |
| 6 | v1's "notes that carry no orders" doctrine | C |

**Two `dropped` annotations misdescribe reality** — the criticality-pill counts
do not survive in the action map, and the "six PREVENT endpoints as tiles" grid
v2 says it dropped is not in the v0 record.

**A third was reported as wrong and turns out to be right, which is a correction
to this audit rather than to the design.** The sweep flagged v2's claim that "v0
records no patient-reported outcome anywhere" as contradicted by v0's systemic
panel printing four PRO scores, and called that proven-in-production evidence.
It is not. Verified against both repositories: `energy`, `cognitive_clarity`,
`mood` and `body_ease` return zero hits as field names; there is no slider or
rating widget in any of 127 Dart files; all 64 migrations were enumerated and the
only intake table holds single-timepoint nullable strings with no score column;
and the Systemic engine's input list is closed and contains no PRO source. v0's
`energy 4/10` are hand-written fixtures. **The v2 annotation was correct.**

Two traps worth recording for anyone who repeats the search: `vitality` in
`Aleron-Web/app` is engine *output* — an action-priority bucket — not patient
input; and `users.effort_capacity` reads like a self-rated score but no route or
client ever writes it.

---

## Part 4 — Alternative pathways

*Where an action is not available to Aleron as a third-party application, this is
what is.* Ranked by preference within each row.

### Prescriptions — the one unavoidable redirect

**Settled, and more cheaply than this section originally proposed.** The four
options below were all over-built. The physician is the trigger: they leave, they
sign, they come back, and the page reads exact state on that render through the
plugin ORM (`Prescription.objects.filter(status=SIGNED)`). No callback, no
scheduled job, no acknowledged table. A cross-patient list reads live through a
plugin route at list scope and self-heals on the next view.

The copy this document flagged as promising a mechanism —
*"Open the chart and come back; the plan holds its place"* — **is now simply
true.** The plan does hold its place and coming back does refresh the state.

Kept for the record, since each was considered and rejected: inverting the embed
(solves it but changes the product shape); `SHOW_ACTION_BUTTON` +
`LaunchModalEffect` with a `POST_COMMIT` callback (correct mechanism, but plugin
outbound HTTP swallows transport failures, so it has no failure signal); polling
`MedicationRequest` (works, stale for one interval, unnecessary once the render
reads through); linking to the chart root (honest, worse).

Getting *to* the right note is a separate matter: a constructed deep link from
`noteKey`, falling back to chart root on 404, since the Note API returns a stable
key but documents no permalink. See Part 5, decision 9.

### Device orders — no path, but the objective survives

| Drawn as | Reachable alternative | What changes clinically |
|---|---|---|
| Home BP confirmation (65 % odds) | `Instruct` (technique, twice daily, 7 days) + `FollowUp`. Readings return as `VitalSignReading` / `CREATE_OBSERVATION`, readable back as `Observation`. For true 24-h ABPM: `Refer` to a hypertension service — originates **and signs** | The gate closes on patient-entered readings, not a validated device. Weakens the 65 % claim; say so on the row |
| Home sleep apnea test (35 % odds) | `Questionnaire` for STOP-BANG, then `Refer` to sleep medicine — originates and signs | AHI never returns as structured data. The gate is opened by a physician reading a note, not by a webhook |
| Patch / Holter | `Refer` to cardiology; the ECG half stays `Perform` with CPT 93000 | Same manual gate closure |
| Overnight oximetry, CGM trial | Place natively in Canvas; Aleron reads back `ServiceRequest` and flips the row | **This is a real, verifiable return leg** and needs no deep link |

### Genetics — the path is not Junction

`BiomarkerResult` has no shape for a variant call. The genetics path is the
**Canvas genetics integration**: the report lands as a `DiagnosticReport` with a
`presentedForm` PDF, which Aleron reads back. The structured finding
(`ATM heterozygous P/LP`, zygosity, ACMG class) has no FHIR field — it goes in
`UPSERT_PATIENT_METADATA` keyed to the report id, or Aleron re-parses the PDF on
every load. **Until a structured genomics feed exists, the honest render is
"panel report available, 23 Jun"** rather than a parsed variant string.

### Aleron-owned facts with no FHIR field

> **Every metadata row below needs the plugin.** There is no externally-callable
> note- or patient-metadata write; the only external custom-key store is
> `Patient.identifier`, which is per-patient and not surfaced on the chart.
> Settled by Part 5, decision 1. Where a row says metadata and the data must be
> queried across patients, the answer is a Custom Data Model instead — metadata
> is not cross-patient searchable, CDMs are.

| Fact | Home | Why |
|---|---|---|
| Deferral / override reasons | `UPSERT_NOTE_METADATA` keyed by order id, written **before** `SIGN_NOTE` | Must survive the lock. The human-readable half already persists free as note prose |
| Deferred preventive-care obligation (Z12.11) | **`DetectedIssue.mitigation`** — full FHIR CRUD | The correct resource, and no plugin needed |
| Package / run / plan / signature ids | One `UPSERT_NOTE_METADATA` carrying the whole lineage block | Only meaningful as a set — do not split across patient and note metadata |
| Vitality PROs | **`QuestionnaireResponse`** — create/read/update, confirmed on the instance | The Canvas layer is the easy part. **But no PRO data exists to write** — greenfield on five layers, see Part 3. This is the home when there is something to put in it, not a fix available today |
| Cross-cycle suppression keys | `UPSERT_PATIENT_METADATA` | Patient-level, must cross notes |
| Lifecycle / queue state | **Canvas `Task`** with free-text `input` labels | Cross-patient searchable; keeps identifiers in Canvas |
| Supersession of a released package | `DocumentReference.status: superseded` | The field's actual meaning, readable back |
| Program config and banding tables | **Aleron, legitimately** | Program configuration is not patient data — the constraint does not apply |
| Clinician licensure roster | **Aleron, legitimately** | Credentialing is Aleron's business function, not Canvas's clinical record |
| Junction ↔ Canvas patient join | Junction `resolve-user` with the Canvas patient id | Derivable per request; **no storage at all** |
| Standing-order id on a Junction order | Junction `passthrough` — round-trips with the order and returns on the webhook | No Canvas write, no Aleron storage |

### Where no alternative should be invented

- **Retatrutide and CagriSema.** Investigational agents have no prescribable
  form. Do not manufacture a path — move them to a horizon panel with no send
  affordance.
- **Caching risk tiers in Aleron** to populate the panel. It stores derived
  clinical inference about a named patient and goes stale silently the moment a
  lab lands, so a physician scans tiers that no longer describe anyone. **Refuse
  it rather than pricing it.**
- **Junction `consents[]` for the counseling attestation.** Closed enum with no
  genetic or counseling member. Do not stretch `telehealth-informed-consent`.
- **FHIR `Consent` for the counseling attestation.** A counseling
  acknowledgment is a *physician attestation of fact*, not a patient consent.
  Modelling it as Consent puts the physician's attestation in the patient's
  consent ledger where an auditor reads it as the patient consenting.

---

## Part 5 — Decisions taken

**Settled 4 September 2026.** Part 5 previously listed these as open questions.
They were worked through as a dependency tree, root first, with the facts each
one needed fetched rather than guessed. Where a decision went against the
recommendation, the recommendation is recorded too, so the reasoning is
auditable rather than just the outcome.

### Architecture

| # | Decision | Notes |
|---|---|---|
| 1 | **Thin Canvas plugin as an HTTP shim; Aleron stays a standalone portal** | Not embedded in Canvas. Forced by fact rather than preference: every command and effect is plugin-gated, so without a plugin there are no referrals, imaging orders, prescriptions, `Goal`, `Assess` or metadata writes at all. |
| 2 | **Strict data residency — nothing patient-linked in Aleron, no exceptions** | Chosen over a policy-plus-exception-register. Consequences are real and are listed below. |
| 3 | **Engine output → CDM as system of record, `CustomCommand` as the chart surface** | `RiskAssessment` was the preference and does not exist. Observations were the fallback and fit one of five data kinds — only the 10-yr probability has a truthful LOINC code (`99055-6`); the headline 30-yr figure has none. Publishing one number and not the other would split one clinical concept across two homes by LOINC coverage. Revisit only if a Canvas protocol needs to consume a score. |
| 4 | **Order ledger: unified in a CDM, identity and route only, status derived live** | The CDM holds the Aleron id, route and foreign key. Status is read through to Canvas and Junction on every render, so nothing caches and nothing goes stale. |
| 5 | **Release package: CDM in the plugin namespace** | `DocumentReference` cannot carry per-action status and has no update. A CDM is Canvas-hosted PostgreSQL, cross-patient queryable, and it is what makes the reviews screen survive decision 2. |
| 6 | **Both CDM schemas prototyped on `aleronmd-dev` first** | CDM tables can never be dropped and fields never altered or removed. This is the most irreversible commitment in the plan. |

### Prescriptions and the Canvas handoff

| # | Decision | Notes |
|---|---|---|
| 7 | **Prescriptions are still staged; the physician signs in Canvas** | SPI and EPCS attach to the prescriber. Unavoidable. |
| 8 | **Detection by read-on-render through the plugin ORM** | **No callback, no CronTask, no acknowledged table.** The physician is the trigger: they leave, they sign, they come back, the page reads exact state. This was the user's correction to a recommendation for push infrastructure, and it is better — it also makes plugin egress and the `PRESCRIPTION_SIGNED`/DrFirst ambiguity irrelevant, since no event is subscribed. A cross-patient list reads live through a plugin route at list scope and self-heals on the next view. |
| 9 | **Constructed note deep link from `noteKey`, falling back to chart root on 404** | The Note API returns a stable `noteKey` but documents no permalink, so the URL shape has no contract. The fallback converts a silent dead end into a graceful degrade. |

### Orders and notes

| # | Decision | Notes |
|---|---|---|
| 10 | **Orders while the note is open — the intended flow, and it holds** | Commands live in a note and an open note accepts them, so a physician can keep the note open and start investigations immediately. |
| 11 | **After lock, a later order opens a new note for the same episode** | Drawn as an ordinary flow, not an error. Matches how a paper chart works. Note the interaction with `ENTER_IN_ERROR_OBSERVATION`, which fails on anything belonging to a locked note. |
| 12 | **Junction gets no `physician` object for now; the false caption is corrected this week** — superseded by the [ordering master document](ORDERING-DESIGN-AND-INTEGRATION.md), which reverses the direction: the APIs constrain the design, not the reverse | *"This is the NPI Junction receives, whoever places the order"* is false — verified in `JunctionController.php:294-299`. **Parked with the medical director:** whether to start sending it, which moves order and result-review responsibility onto the named physician and makes Aleron responsible for licensed-states enforcement with no vendor backstop. |

### Screens

| # | Decision | Notes |
|---|---|---|
| 13 | **Numeric clinical targets restored on both surfaces** | The risk-actions evidence ledger *and* the care-plan Plan field. They answer different questions: the ledger target is the engine's commitment, the plan target is what the next lab is judged against. |
| 14 | **AI thread ephemeral** | Under decision 2 the only homes were metadata stores no Canvas view surfaces. Ephemeral is honest for a thinking aid: adoption hands to the care plan in-session. `thr-al47m-0114` and `2 open thoughts · 0 adopted` come off the screen. |
| 15 | **Day register dropped; BRIEF P1 rewritten** | Chosen over restoring the toggle. P1's "kept live for print and consult-room reading" is the thing that was wrong, not the product. |
| 16 | **PRO felt half kept, annotated as greenfield** | The design is sound; the pipeline does not exist. Greenfield on five layers — no collection widget in 127 Dart files, no repeated-measure table, not an engine input, no physician surface, no Canvas write. `QuestionnaireResponse` (full CRUD, confirmed on the instance) is the easy layer. |
| 17 | **Read receipts as a Canvas `Communication` `received` timestamp** | Semantically exact and Canvas-resident. Constraint to design around: `Communication` search is `patient`, `recipient`, `sender`, `_id` only — no date filter, no status, no sort, and no update. |

### What decision 2 costs, explicitly

Strict residency was chosen with these consequences understood:

- **The panel's risk-tier column becomes on-demand per row.** No cached tiers, ever. The default density must flip off `With risk by domain`, which currently ships as `aria-checked="true"` and would demand nine engine runs on first paint.
- **Read receipts, the AI thread and every Aleron-owned fact** move to Canvas resources, Canvas metadata, or a CDM — or cease to exist.
- **The order ledger cannot use an Aleron-side table**, which is why decision 4 puts it in a CDM and derives status rather than storing it.
- Still legitimately Aleron's, because none of it is patient data: the clinician licensure roster, program configuration, and the eleven banding tables that produce the thresholds on `patient-data`.

### Tests outstanding — facts, not decisions

| Test | What it settles |
|---|---|
| The constructed note URL shape on `aleronmd-dev` | Whether decision 9's deep link works before the fallback is the only path |
| Is the genetics panel a Junction order or the Canvas genetics integration? | Gates rows on four screens; `BiomarkerResult` has no shape for a variant call |
| Does `$create-lab-report` exist undeclared? | Not in the instance CapabilityStatement. If absent, Junction results reach the chart only through the plugin's `CREATE_LAB_REPORT` effect |
| Do events fire for externally-staged commands? | Now low-stakes — decision 8 subscribes to no events |


## Part 6 — Spikes

Ranked by value per hour.

| # | Question | Why it matters |
|---|---|---|
| 1 | Does SDK `CREATE_OBSERVATION` carry the same category restriction as the FHIR endpoint? | If not, it is the home for **every** engine score, BMI, body fat, HRV and VO₂max in the set |
| 2 | Does Canvas `Provenance` fire on UI-originated human acts? | Everything in "acts Aleron never sees" depends on it |
| 3 | Can a command be inserted into a locked note? | Docs say a locked note is non-editable but do not explicitly forbid it. Design against it either way |
| 4 | Does a constructed note-permalink URL work? | The Note API returns a stable `noteKey` but documents no permalink. A deep link is constructible by convention with no contract behind it |
| 5 | Is the genetics panel a Junction order or a Canvas integration? | Gates rows on four screens |
| 6 | Does `GET /v3/lab_tests` reconcile against the configured catalog? | "14 orderable in this environment" is currently a claim about `.env` presented as a claim about the world |
| 7 | Is Junction Sense available to this account? | Decides whether nadir/windowing is server-side or a 30-night client-side computation per page load |

---

## Appendix — evidence

Per-screen audits, with the full data-point tables:

- [v2-care-plan.md](audit/v2-care-plan.md) · [v3-care-plan.md](audit/v3-care-plan.md)
- [v2-orders.md](audit/v2-orders.md) · [v2-standing-orders.md](audit/v2-standing-orders.md)
- [v2-emr.md](audit/v2-emr.md) · [v2-journal-reviews.md](audit/v2-journal-reviews.md)
- [v2-risk-models.md](audit/v2-risk-models.md) · [v2-risk-actions.md](audit/v2-risk-actions.md)
- [v2-patient-data.md](audit/v2-patient-data.md) · [v2-inbox-panel.md](audit/v2-inbox-panel.md)
- [v2-messages-ai.md](audit/v2-messages-ai.md) · [v0-v1-regression.md](audit/v0-v1-regression.md)

Follow-up verifications, each answering one question the screen audits raised:

- [VERIFY-prevent-arithmetic.md](audit/VERIFY-prevent-arithmetic.md) — recomputed the risk model against the published PREVENT coefficients
- [VERIFY-sdk-reach.md](audit/VERIFY-sdk-reach.md) — which Canvas write surfaces an external app can reach
- [VERIFY-plugin-mechanics.md](audit/VERIFY-plugin-mechanics.md) — signature events, plugin egress, custom data models
- [VERIFY-observation-spike.md](audit/VERIFY-observation-spike.md) — whether Observations can hold engine risk output
- [VERIFY-pro-data.md](audit/VERIFY-pro-data.md) — whether the shipped platform has PRO data

### Capability reference, and how to re-check it

[API-GROUND-TRUTH.md](API-GROUND-TRUTH.md) is the working reference. Its Canvas
half is pinned to [canvas-capability-snapshot.json](canvas-capability-snapshot.json),
taken from the live `aleronmd-dev` CapabilityStatement rather than from a docs
page — the docs describe Canvas in general, the CapabilityStatement describes the
instance being integrated with.

```bash
node scripts/verify-canvas.js
```

Diffs the instance against the snapshot and exits non-zero on drift, including if
one of the four load-bearing absences (`RiskAssessment`, `FamilyMemberHistory`,
`AuditEvent`, `Subscription`) ever appears — each of those would reopen a
decision. The endpoint is unauthenticated, so it needs no credentials.

**The snapshot confirmed every interaction in the hand-built matrix**, with one
deletion: `Allergen` is documented but not present on the instance. It also
confirmed, from the instance rather than from docs, that `Task` search exposes
`owner`, `status` and `label` — which is what makes the cross-patient work queue
in finding C4 real — and that `Provenance` exposes `agent`.

### Corrections applied to agent findings

Findings were spot-checked rather than taken on trust. Three were corrected
before compilation:

- **Rejected.** `ROLE_AND_RELEASE_MATRIX_V1.md` was reported as nonexistent. It
  exists, in `aleron-canonical-documents/docs/product/`. The agent searched only
  the designs repo.
- **Softened.** Device orders were reported as having no path. Ordering the
  *device* has none; the clinical objective has adjacent reachable acts, which
  is now Part 4. "Cannot be ordered" would have killed the largest movable
  PREVENT term on the board.
- **Qualified.** The locked-note constraint was reported as settled. Canvas
  documents non-editability but does not explicitly forbid command insertion —
  spike 3.

- **Overturned, and this is the most consequential correction in the audit.** One
  agent recomputed the PREVENT model from the screen's own β table, got 29.8 %
  against the reported 16.0 %, and concluded the fixture had been built
  backwards from the adjusted figure — i.e. that the engine might be wrong. A
  dedicated verification agent recomputed it independently in Python, then went
  further: it recovered the real published PREVENT coefficient tables from the
  binary `R/sysdata.rda` in the CRAN package `preventr`, reimplemented them, and
  validated the reimplementation against that package's documented worked
  example, reproducing all four AHA-supplemental expected values exactly.

  **The engine is sound. The provenance panel is decorative.** For this patient
  the real published values are 30-yr ASCVD **16.18 %** (screen: 16.0 %) and
  10-yr ASCVD **2.74 %** (screen: 2.7 %). Both headline figures are correct
  PREVENT **ASCVD** outputs. What is invented is the audit trail beneath them:
  the β table matches neither published male 30-yr table, **omits the age² term
  the 30-year equations require** (20 terms shown, 24 needed), carries three
  coefficients with the wrong sign, and states three transforms incorrectly —
  age is `(age−55)/10` not `ln(age/55)`, SBP≥110 centers at **130** not 110,
  eGFR≥60 centers at **90** not 60.

  So the claims that the coefficients come from the "published AHA PREVENT 2024
  supplementary tables" and are "fixture-validated" are false as printed. That
  is a documentation defect rather than a broken model — but it is worse than a
  mislabel, because auditability is the panel's entire purpose. The first
  agent's arithmetic was right and its diagnosis was wrong; both had to be
  checked to know which.

  **Two further findings fell out of the verification**, neither in the original
  scope. The two endpoint labels are wrong: the table is headed
  `β, male 30-yr total CVD` while its output is attributed to 30-yr ASCVD (two
  different tables, 23.72 % vs 16.18 %), and 2.7 % is labelled 10-yr total CVD
  when it is the 10-yr ASCVD value. And more seriously, the modifier layer
  multiplies hazard ratios onto an **absolute probability**
  (`16.0 % × 1.835 → 29.4 %`), which is not a valid risk transformation at
  p = 0.16 — the 29.4 % result sits above the 23.7 % published 30-yr *total*-CVD
  ceiling for this patient, which a broader endpoint should bound. That is
  change 1b and it deserves its own look.

- **Reversed after verification, and it was the audit's own error.** The v0/v1
  sweep reported that v2's annotation "v0 records no patient-reported outcome
  anywhere" was contradicted by v0 printing four PRO scores, and called that
  proven-in-production evidence. Checked against both repositories: no PRO field
  names, no rating widget in 127 Dart files, no score column in any of 64
  migrations, and a closed engine input list with no PRO source. v0's numbers are
  fixtures and **the v2 annotation was right.** This is the clearest case in the
  exercise of a replica being mistaken for a pipeline.
- **Corrected in this document's own reference.** `Task` was listed as a Canvas
  command. It is not — it is a FHIR resource with Task *effects* in the SDK, and
  there is no Task command. Any recommendation phrased as "a `Task` command"
  should read "a FHIR `Task` write" or "a Task effect".
- **Downgraded.** `POST /DiagnosticReport/$create-lab-report` was stated here as
  an external surface needing no plugin. It is **not declared on the instance** —
  the only operation in the whole CapabilityStatement is `Group/$group-export`.
  Treat it as untested.
- **Overstated, now corrected.** v3's ordering claim was described as broken. It
  over-claims by one state out of three; orders while the note is open — the
  intended flow — holds completely. Commit `a0749a7`'s message carries the
  original overstatement and cannot be edited; this document supersedes it.

**Confirmed by reading shipped code** rather than documentation:
`JunctionController.php:294-299` sends exactly five fields to Junction —
`user_id`, `patient_details`, `patient_address`, `order_set`,
`collection_method`. No `physician`, no `icd_codes`, no `clinical_notes`, no
`billing_type`. This is the strongest finding in the audit and it makes three
other debates moot for now.
