# v2/emr.html

**Screen purpose:** The door into Canvas plus a reconciliation table of every Aleron artefact pushed into the legal record and whether the push landed.
**Data points audited:** 100 — OK 67, GAP 11, WRONG 11, UNVERIFIED 9, NONE 2

## Data points

### Rail and header chrome
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 1 | `aleron.md/chart/AL-47M/emr` | Aleron | OK | Aleron-owned route. |
| 2 | `Ethan Park` | Canvas FHIR:Patient.name | OK | Read. |
| 3 | `AL-47M · 47M` | Aleron | OK | Aleron MRN + derived age/sex. |
| 4 | `EP` avatar | Derived | OK | From name. |
| 5 | `Dr. A. Okafor` (rail actor) | Aleron | OK | Entra/Aleron session identity, not the Canvas user. See #20. |
| 6 | `Open in Canvas ↗` destination | Claim | UNVERIFIED | `href="emr.html"` is a fixture. A patient-chart deep link into Canvas is plausible but not in the ground truth; only note-level deep links are explicitly called undocumented. |
| 7 | `Canvas patient cvs-8841207` (phead aside) | Canvas FHIR:Patient.id | OK | Aleron must store the mapping; that is an Aleron-held field, which sits oddly with "Aleron stores none". |

### Deep-link card (carried from v0)
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 8 | `Canvas patient cvs-8841207` (second instance) | Canvas FHIR:Patient.id | OK | Duplicated from #7 in the same viewport. |
| 9 | "launches Canvas in a new tab, scrolled to this patient" | Claim | UNVERIFIED | See #6. |
| 10 | "Opening the chart signs you in to Canvas through Aleron MD single sign-on. While SSO is being enabled you may see a one-time Canvas sign-in." | Claim | WRONG | SAML 2.0 with Entra is supported, but **there is no just-in-time provisioning**. A one-time Canvas sign-in does not create the user either. If the physician has no pre-existing Canvas user, this button fails, and this is the same root cause as the genetics row (#44). |

### Reconciliation table — header
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 11 | `Checked 31 Aug 2026, 11:55` | Derived | GAP | Implies a poll of Canvas. Canvas has no read-back for the two states that matter most (#43 never-ran command, #68 unsigned prescription), so "checked" cannot mean what it looks like. See required change 4. |

### Row 1 — Locked note
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 12 | "Locked note, baseline review cycle 1" | Aleron | OK | |
| 13 | `NOTE-47M-0001` | Aleron | OK | Aleron note id, not a Canvas id. |
| 14 | "locked 31 Aug 2026, 11:48" | Aleron | OK | |
| 15 | `DocumentReference` | Canvas FHIR:DocumentReference | OK | Create/read/search supported. |
| 16 | `cvs-doc-4471aa` | Canvas FHIR:DocumentReference.id | OK | Returned by create. |
| 17 | "Written 11:49" | Derived | OK | Create response / `meta.lastUpdated`. |
| 18 | "Legal-record PDF attached" | Canvas FHIR:DocumentReference.content | OK | `application/pdf` base64 is the documented shape. |
| 19 | "Attribution: Dr. A. Okafor" | Canvas FHIR:DocumentReference author | OK | |
| 20 | `prac-9f2c41` | Canvas FHIR:Practitioner.id | OK | Note: FHIR `Practitioner` **can** be created, but a Practitioner resource is not the same thing as a Canvas *user* who can be attributed a command. That distinction is what row 4 trips on. |

### Row 2 — Problem-list decisions
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 21 | "2 of 4 problems" | Aleron | OK | |
| 22 | "1 add to active list, **1 update existing**, 2 note only" | Derived | WRONG | The only Condition update Canvas accepts is marking one `entered-in-error`. This sub-line still says "update existing" while the prov text two cells over says it was assessed, not rewritten. The screen contradicts itself and its own `fixed` annotation. |
| 23 | `Conditions` | Canvas FHIR:Condition | OK | |
| 24 | `cvs-cond-7712` | Canvas FHIR:Condition.id | OK | The R73.03 create. |
| 25 | `cvs-cond-3390` | Canvas FHIR:Condition.id | GAP | This is a **pre-existing** Canvas condition Aleron did not write. What Aleron actually created here is an `Assess` command; its command id is the artefact that landed and it is not shown. The "Linked as" cell is naming the wrong resource for half the row. |
| 26 | "Written 11:49" | Derived | OK | |
| 27 | "R73.03 created" | Canvas FHIR:Condition.code | OK | Prediabetes, consistent with HbA1c 6.0 %. |
| 28 | "Z15.09 matched an existing condition and was assessed against it rather than rewritten" | Canvas SDK:Assess | OK | `Assess` takes `condition_id`. Correct mechanism. |
| 29 | "The two note-only problems are deliberately absent" | Aleron | OK | Good P7 behaviour. |

### Row 3 — Lab order authorization, blood order 4521
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 30 | "**Lab order authorization**, blood order 4521" | Aleron | GAP | The `fixed` annotation at line 442 says "Lab Order Authorization is not a Canvas resource" and claims both rows were corrected. It was removed from the *Canvas resource* column only. It is still the row's own name, in the leftmost column, on both order rows. The invented resource survived the fix. |
| 31 | "HbA1c, Fasting Insulin" | Junction:order.order_set.lab_test_ids / lab_test.name | OK | |
| 32 | `SO-BLOOD-2026-01` | Aleron | OK | Aleron standing-order id. |
| 33 | "no Canvas order record" | Derived | OK | Correct. Junction-placed orders produce nothing in Canvas by design. |
| 34 | "ordered through Junction" | Junction | OK | |
| 35 | "not created" | Derived | OK | |
| 36 | "documented, not ordered in Canvas" | Aleron | OK | Aleron-owned state word. |
| 37 | "Canvas does take an order through the plugin command API, where originating a lab order stages it in a note" | Claim | OK | True: `LabOrder.originate()` exists. See claims table C3. |
| 38 | "`ServiceRequest` is read only, which closes the FHIR route only" | Claim | WRONG | The statement is true; its **placement** is the defect. BRIEF: "Never put the API on the product surface... Do not put a field name, its writability, or its permitted values in front of a physician." This is a resource name, its writability, and the word "FHIR", rendered in `<code>` inside a `pledger__prov` on the product surface. The screen's own `fixed` annotation at line 436 says exactly this content was moved to the annotations. It was not. |

### Row 4 — Lab order authorization, genetic order 4472
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 39 | "genetic order 4472" | Aleron | OK | |
| 40 | "Invitae 160-Gene Panel" | Junction:order.lab_test.name | UNVERIFIED | Junction is labs-only, which admits genetic panels in principle, but Invitae as a Junction lab partner is not established in the ground truth and not checked here. |
| 41 | `SO-GEN-2026-02` | Aleron | OK | |
| 42 | "no Canvas order record" / "not created" | Derived | OK | |
| 43 | "failed soft, 8 Jun" | Aleron | GAP | No year on the date, in a table where every other date carries one implicitly from the 2026 header. More importantly: nothing in Canvas can report this state, so the value is Aleron-side only and cannot be reconciled by definition. |
| 44 | "The genetics record has no Canvas practitioner id" | Aleron | GAP | The proximate fact is right, the root cause is not stated. Per the ground truth, Canvas SSO is SAML with **no JIT provisioning**: the Canvas user has to exist first. So this is not a missing field on an Aleron record to be back-filled, it is a Canvas user that was never created. Fixing it is an onboarding step, not a data fix, and the screen's "recovery" framing hides that. |
| 45 | "the order command had no clinician to attribute and never ran" | Claim | OK | Consistent: order commands take `ordering_provider_key`, and there is no valid key. |
| 46 | "The order itself transmitted to the vendor and resulted normally" | Junction:order.status = `completed` | OK | Junction status vocabulary supports this exactly. |

### Row 5 — Imaging order 4522
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 47 | "Imaging order 4522" | Aleron | OK | |
| 48 | "MRI abdomen, without contrast" | Canvas SDK:ImagingOrder.image_code | OK | |
| 49 | "Imaging order command, in the note" | Canvas SDK:ImagingOrder | OK | |
| 50 | "no vendor, no requisition to reconcile" | Derived | OK | |
| 51 | `cvs-cmd-4522ai` | Canvas SDK:CommandAPI command id | OK | |
| 52 | "Written and signed 28 Aug" | Canvas SDK:ImagingOrder originate + sign | OK | `ImagingOrder` is one of only two commands with `sign`. |
| 53 | "signed it as Dr. A. Okafor" | Canvas SDK:ImagingOrder.ordering_provider_key | OK | Same practitioner-id dependency as #44; it happens to be satisfied here. |
| 54 | "and sent it" | Canvas SDK:ImagingOrder.send | OK | `send` exists on `ImagingOrder`. |
| 55 | "the radiologist's report returns to this chart rather than to Aleron" | Canvas FHIR:DiagnosticReport (read) | OK | Read-only, so Aleron can see it but cannot write it. Statement is about routing and holds. |

### Row 6 — Referral 4473
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 56 | "Referral 4473" | Aleron | OK | |
| 57 | "Genetic counselling" | Canvas SDK:Refer.specialty | OK | |
| 58 | "Referral command, in the note" | Canvas SDK:Refer | OK | |
| 59 | `cvs-cmd-4473rf` | Canvas SDK:CommandAPI command id | OK | |
| 60 | "Written and signed 24 Jun" | Canvas SDK:Refer originate + sign | OK | `Refer` has `sign`. |
| 61 | "Same one act as the imaging order" | Claim | WRONG | Not the same. `ImagingOrder` has `send`; `Refer` does **not**. Whatever transmits the referral after signature is not the command API, and the screen does not say what it is. |
| 62 | "The consult note came back 14 Jul and is on the chart" | Canvas FHIR:DocumentReference (read) | UNVERIFIED | Plausible landing place; not established that an external consult note arrives as a readable DocumentReference rather than as a fax/PDF in a Canvas-native inbox. |

### Row 7 — Prescription 4523
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 63 | "Prescription 4523" | Aleron | OK | |
| 64 | "tirzepatide 2.5 mg/0.5 mL · 4 pens · no refills" | Canvas SDK:Prescribe (sig, quantity_to_dispense, refills) | OK | Every field has a home. |
| 65 | "Prescription command, in the note" | Canvas SDK:Prescribe | OK | |
| 66 | "staged, not signed" | Derived | OK | |
| 67 | `cvs-cmd-4523rx` | Canvas SDK:CommandAPI command id | OK | |
| 68 | "waiting on a signature here" | Aleron | GAP | **Nothing tells Aleron the signature happened.** There is no documented webhook and no FHIR read that reveals a staged command's state. The nearest signal is a `MedicationRequest` (read-only, searchable) appearing for this patient, which is inference rather than reconciliation. This row cannot leave this state on its own. |
| 69 | "The signature needs the prescriber's Surescripts identifier" | Claim | OK | Surescripts SPI attaches to the prescriber, not to the calling app. |
| 70 | "and EPCS enrolment for a controlled substance" | Claim | WRONG | **Tirzepatide is not a DEA-scheduled substance.** In a row whose only drug is tirzepatide, this reads as an assertion about this prescription and it is false. The general statement is fine; here it is attached to the wrong drug. |
| 71 | "This is the only thing Aleron produces that finishes somewhere else" | Claim | OK | Consistent with the write matrix. |
| 72 | The return leg from Canvas after signing | NONE | NONE | The row sends the physician to Canvas and offers "Back to orders" (an Aleron link), not a way back from Canvas. Deep-linking into Canvas to a specific note is undocumented, and nothing brings the signed state back. This is the known unsolved gap and the screen does not confess it. |

### Row 8 — Release package
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 73 | "Release package" | Aleron | OK | |
| 74 | `REL-47M-0001` | Aleron | OK | |
| 75 | "preview hashed, not released" | Aleron | OK | |
| 76 | Canvas resource: "**Canvas note id**" | Canvas FHIR:DocumentReference / NONE | WRONG | Row 1 wrote the note as a **DocumentReference**, which is not a Canvas *Note*. The two rows name two different objects for the same artefact. If it is a DocumentReference, `UPSERT_NOTE_METADATA` does not apply to it; if it is a Canvas Note (`CREATE_NOTE` + `SIGN_NOTE`), row 1 is wrong. Pick one. |
| 77 | "links on release" | NONE | NONE | **No Canvas resource carries this link.** DocumentReference has no update, so the id pair cannot be added to the written note afterwards. There is no FHIR field for "Aleron release id". As drawn, this cell promises a Canvas write that has nowhere to land. |
| 78 | "patient visibility withheld" | Aleron | OK | Aleron-owned gate. |
| 79 | "Section 7: visibility opens only after both the Aleron release authorization and the required Canvas linkage are satisfied" | Aleron | OK | Policy, not API. But see #77: the precondition references a linkage with no storage. |

### Second specimen — no Canvas record
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 80 | "Marcus Bell" | Aleron fixture | GAP | BRIEF names exactly two fixtures and says v1/v2 default to AL-47M; the four extra names are sanctioned for v0 cohorts only. A third patient on a v2 screen is a fixture-discipline break, even for an empty state. |
| 81 | "AL-39M" | Aleron fixture | GAP | Same. |
| 82 | "This patient is not linked to a Canvas record yet" | Derived | OK | Correct consequence of no `Patient` resource. |
| 83 | "Missing: `canvas_patient_id`" | Aleron field name | WRONG | A database column name on a physician surface. BRIEF forbids exactly this. Say "no Canvas record for this patient yet". |
| 84 | "Request Canvas sync" | Canvas FHIR:Patient create | OK | `Patient` supports create, so the button is implementable. |

### Disclosure — what Canvas owns, what Aleron owns
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 85 | Source: `docs/product/ROLE_AND_RELEASE_MATRIX_V1.md` section 7 | Aleron | GAP | An internal repo path rendered in `<code>` on the product surface. Also: the document is now [a Confluence page](https://lasohealth.atlassian.net/wiki/spaces/AL/pages/525860888/Aleron+MD+Role+and+Release+Matrix+v1), so the path a physician sees resolves to nothing. |
| 86 | Current decision: "Do not assume embedded Canvas signing works." | Claim | WRONG | Stale for notes. `SIGN_NOTE` is a published SDK effect. See C7. |
| 87 | "Written into Canvas: the locked note, and the problem-list decisions" | Canvas FHIR:DocumentReference + Condition | OK | Both creates exist. |
| 88 | "Written and signed by Aleron: Imaging orders and referrals, as commands in the note. **One act each**" | Claim | WRONG | Two calls, not one: `originate(commit=True)` is silently ignored for order commands, so signing is a separate call. The screen's own `finding` annotation records this trap and the product surface then contradicts it. Also folds `Refer` in with `ImagingOrder` despite `Refer` having no `send` (#61). |
| 89 | "nothing comes back to Aleron to sign" | Claim | OK | |
| 90 | "Lab and genetic orders, through Junction, **which returns values rather than a scanned report**" | Junction:BiomarkerResult | WRONG | Junction returns structured results **plus a PDF report when the lab provides one**. The contrast is overdrawn, and it matters because the next sentence in the same disclosure promises the chart gets "the requisition". |
| 91 | "Junction carries no imaging, no radiology and no referrals" | Junction | OK | Confirmed scope limit. |
| 92 | "Never signed by Aleron: Prescriptions" | Canvas SDK:Prescribe (no `sign`) | OK | |
| 93 | Spike still open: "Patient context handoff" | Claim | UNVERIFIED | Canvas embedding Aleron is documented; what context an embedded app receives is not covered by the ground truth. Legitimately open. |
| 94 | Spike still open: "actor attribution for API effects" | Claim | GAP | Half resolved. Commands take explicit actor keys (`ordering_provider_key`, `prescriber_id`, `given_by_id`), so attribution is a **parameter**, not an unknown. What is genuinely open is where a valid Canvas user id comes from, which is the no-JIT-provisioning problem (#44), not an API question. |
| 95 | Spike still open: "whether an embedded app can sign notes" | Claim | WRONG | **Resolved.** `SIGN_NOTE` is a published effect. This spike is closed for the SDK path and should be struck. |
| 96 | Spike still open: "whether the native sign button is required" | Claim | UNVERIFIED | Splits by artefact: not required for notes (`SIGN_NOTE`), not required for imaging/referral (`sign()`), required for prescriptions (`Prescribe` has no `sign`). As one undifferentiated line it is misleading. |
| 97 | Spike still open: "order transmission gate behaviour" | Claim | UNVERIFIED | Correctly open, and the ground truth sharpens it: whether `send()` works on a command that was never signed is not established. |
| 98 | "there are three of them because an order does not have one shape" | Claim | UNVERIFIED | Counts write *paths* as three (FHIR, command-in-note, vendor). The screen elsewhere says there are two write paths (FHIR and SDK). Both framings appear on the same screen. |
| 99 | "A locked note and the problem-list decisions are written straight into Canvas" | Canvas FHIR | OK | |
| 100 | "the chart gets the values **and the requisition**" | Canvas SDK:CREATE_LAB_REPORT / FHIR:DocumentReference | GAP | Values: yes, via `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS`, no Canvas order required. Requisition: only as a `DocumentReference` PDF, which is a separate write the screen never names and no row in the table records. |

## Capability claims on the product surface
| # | Claim, quoted | True? | Note |
|---|---|---|---|
| C1 | "Canvas holds the legal record." | True | Foundational; consistent with BRIEF. |
| C2 | "Opening the chart signs you in to Canvas through Aleron MD single sign-on." | Partly false | SAML/Entra SSO exists; **no JIT provisioning**, so it only works for a physician who already has a Canvas user. The "one-time Canvas sign-in" fallback does not create one. |
| C3 | "Canvas does take an order through the plugin command API, where originating a lab order stages it in a note." | True | `LabOrder.originate()`. Correct, and correctly distinguished from FHIR. |
| C4 | "`ServiceRequest` is read only, which closes the FHIR route only." | True but must not be here | Accurate. Violates the BRIEF's `api-on-product-surface` rule. Move to annotations. |
| C5 | "no Canvas order record ... ordered through Junction" | True | Junction-placed orders leave nothing in Canvas by design. |
| C6 | "the order command had no clinician to attribute and never ran" | True | Order commands require an ordering-provider key. |
| C7 | "Do not assume embedded Canvas signing works." / "whether an embedded app can sign notes" | False (stale) | `SIGN_NOTE` is published. Notes can be signed from the SDK. |
| C8 | "Aleron composed it, signed it as Dr. A. Okafor and sent it" (imaging) | True | `ImagingOrder` has `sign` and `send`. |
| C9 | "Same one act as the imaging order" (referral) | False | `Refer` has `sign` but **no `send`**. |
| C10 | "Written and signed by Aleron ... One act each" | False | `originate(commit=True)` is ignored for order commands; sign is a second call. |
| C11 | "The signature needs the prescriber's Surescripts identifier" | True | SPI attaches to the prescriber. |
| C12 | "and EPCS enrolment for a controlled substance" (on a tirzepatide row) | False as applied | Tirzepatide is not DEA-scheduled. The general rule is true; the row makes it read as specific. |
| C13 | "This is the only thing Aleron produces that finishes somewhere else." | True | Only `Prescribe` lacks `sign`. |
| C14 | "links on release" (Canvas note id) | Unverified/false | No Canvas resource can carry this link post hoc. DocumentReference has no update; there is no release-id field. |
| C15 | "An EMR chart opens once the patient has a Canvas patient record." | True | `Patient` create exists, so sync is real. |
| C16 | "Junction ... returns values rather than a scanned report" | Partly false | Structured results **plus** a lab PDF when provided. |
| C17 | "Junction carries no imaging, no radiology and no referrals" | True | Confirmed scope limit. |
| C18 | "the chart gets the values and the requisition" | Partly unverified | Values yes. Requisition only as a separately written DocumentReference, which no row records. |
| C19 | "the radiologist's report returns to this chart rather than to Aleron" | True | `DiagnosticReport` is read-only for Aleron. |
| C20 | "reconciliation state is read from the adapter at page load ... a soft failure shows the moment it happens" (scaffold note, not audited as a data point but a capability claim) | False | The two soft-failure states (#43, #68) leave nothing in Canvas to read. Polling the adapter cannot surface them; only Aleron's own write log can. |

## Required changes

1. **Strike the resolved spike.** "whether an embedded app can sign notes" is closed: `SIGN_NOTE` exists. Split "whether the native sign button is required" into per-artefact answers (notes no, imaging/referral no, prescriptions yes). Rewrite "Current decision" accordingly. *Small: three lines of copy.*
2. **Fix the referral row.** `Refer` has `sign` but no `send`. Either say what transmits it, or say the transmission is out of Aleron's hands. Remove "Same one act as the imaging order". *Small.*
3. **Fix the release row (#76, #77).** Decide whether the locked note is a FHIR `DocumentReference` or an SDK Note, make rows 1 and 8 agree, and name a real carrier for the link. *Medium: it changes the architecture story, not just the copy.*
4. **Stop calling it "Checked".** The header meta implies a Canvas poll that cannot detect the two states the table exists to show. Relabel to what it actually is (last reconciliation attempt) and mark per-row which states are Canvas-confirmed and which are Aleron-asserted. *Medium: needs a fifth column or a state vocabulary change.*
5. **Move `ServiceRequest`, `canvas_patient_id` and `Aleron MD Role and Release Matrix v1` off the product surface.** All three are BRIEF `api-on-product-surface` violations, and two of them are in a `fixed` annotation that claims they were already removed. *Small.*
6. **Rename the two order rows.** "Lab order authorization" is the invented resource the `fixed` annotation says was removed. It is still the row header on both rows. Use "Blood panel order" / "Genetic panel order". *Trivial.*
7. **Fix row 2's sub-line.** "1 update existing" contradicts the same row's own prov text and the correction annotation. Say "1 added, 1 assessed against an existing entry, 2 note only". *Trivial.*
8. **Detach EPCS from the tirzepatide row.** Keep the Surescripts sentence; drop or generalise the controlled-substance clause so it does not read as a claim about this drug. *Trivial.*
9. **Restate the genetics root cause.** "has no Canvas practitioner id" reads as a back-fillable field. It is a Canvas user that was never provisioned, because SAML SSO has no JIT. The recovery is onboarding, and the screen should say so, because it also determines whether `Request Canvas sync` on the second specimen is enough. *Small copy, real consequence.*
10. **Add a prescription return leg, or admit there is none.** See alternatives below. *Large; this is the unsolved gap.*
11. **Replace Marcus Bell / AL-39M.** Use AL-56F Mara Chen for the unlinked specimen, or drop the named patient and show the state for AL-47M under a scaffold caption. *Trivial.*
12. **Correct "returns values rather than a scanned report".** Junction returns both. *Trivial.*
13. **Decide two paths or three.** The disclosure says three write shapes in one paragraph and the annotations say two write paths. Pick one vocabulary. *Small.*

## Alternative pathways

**#72 / #68 — the prescription return leg (NONE).** Four options, in order of cost:
- *Poll for the effect, not the cause.* After redirect, Aleron searches `MedicationRequest` (read-only, searchable) for this patient and drug. Its appearance means the prescription was signed and sent. Cost: latency, and a false negative if the prescriber edits the drug in Canvas. This is the cheapest thing that actually closes the row and it needs no new Canvas capability.
- *`PRESCRIBE_COMMAND__POST_COMMIT` from a plugin.* An Aleron-owned Canvas plugin listens for the command's stage event and calls back to Aleron via `SimpleAPIRoute`/HTTP. This is the correct mechanism, but it requires shipping a plugin and depends on the undocumented sandbox egress the annotations already flag.
- *The return leg itself.* Redirect the physician into Canvas to the patient chart (patient deep link is plausible; note deep link is not documented). They find the staged prescription in the note, sign it, and get back to Aleron by **switching browser tab**, because there is no documented Canvas-to-Aleron return URL. The honest wireframe shows the Canvas tab opening in a new tab and the Aleron row staying in "waiting" until poll or manual mark. Say that.
- *Drop the redirect.* Do not stage the prescription at all; show it as an Aleron recommendation and let the prescriber write it natively. Loses the annotation's own "real design option" argument, but removes an unclosable state from the reconciliation table.

**#77 / #76 — the release linkage (NONE).**
- *Best:* `UPSERT_NOTE_METADATA` on a Canvas Note (`CREATE_NOTE` + `SIGN_NOTE`), key `aleron_release_id`. Requires abandoning `DocumentReference` for the locked note, which is the correct trade anyway: DocumentReference has no update, so it can never carry any post-hoc fact.
- *If DocumentReference stays:* `UPSERT_PATIENT_METADATA` with the pair `{release_id: document_reference_id}`. Patient-scoped rather than note-scoped, so it needs a key per release, but it is the documented escape hatch and costs nothing structural.
- *Cheapest:* Aleron stores the pair itself and the Canvas side is read-only verification (search for the DocumentReference id, confirm it exists). Cost: the "Canvas linkage" precondition becomes an Aleron assertion about Canvas rather than a fact in Canvas, which is weaker than section 7 implies. Say so on the row.
- *Do not* build a Custom Data Model for this. Metadata covers it.

**#25 — the missing Assess command id (GAP).** Show two artefacts in the row: the created `Condition` id and the `Assess` command id, or split the row. Cost: one more cell. The alternative, leaving a pre-existing condition id in a column headed "Linked as", misattributes a Canvas record to an Aleron write.

**#38 / #83 / #85 — API vocabulary on the surface (WRONG).** Move verbatim into `wf-note`. Replace with reader-vocabulary equivalents: "the order lives at the vendor, so there is nothing in Canvas to compare against"; "no Canvas record for this patient yet". Zero cost.

**#10 / #44 — SSO with no JIT (WRONG/GAP).** The realistic pathway is that Canvas user provisioning is an Aleron onboarding step, not a runtime fallback. Replace "you may see a one-time Canvas sign-in" with a real precondition: if the signed-in physician has no Canvas user, the Open-chart button is disabled with the reason. Cost: Aleron must know each physician's Canvas practitioner id, which is the same field row 4 is missing, so fixing one fixes the other.

**#61 — referral transmission (WRONG).** `Refer` has no `send`. Either the referral leaves Canvas by a native mechanism after signature (fax/direct message, out of Aleron's sight), or `delegate()` is involved. `delegate()` is documented on `ImagingOrder` and `Refer` only, which is suggestive but not a send. Show the referral state as "signed in Canvas; transmission is Canvas-native" and stop claiming Aleron sent it.

**#90 / #100 — the requisition (WRONG/GAP).** If the chart is to hold the requisition, that is a `DocumentReference` create with the Junction PDF, and it deserves its own reconciliation row. Otherwise remove the promise.

## Contradictions with what the screen already claims

1. The `fixed` annotation says: *"Lab Order Authorization is not a Canvas resource. The reconciliation table listed it in the Canvas resource column for both order rows... Both rows now name `ServiceRequest`"* — but the rows no longer name `ServiceRequest` in that column (they say "no Canvas order record", which is the later and better correction), **and both rows still carry "Lab order authorization" as their row header**. The annotation describes a state the file is not in, in both directions.

2. The `fixed` annotation says: *"The reconciliation table keeps what landed and drops how the API is shaped... The facts stay recorded here in the annotations and in `BRIEF.md`."* Row 3's prov cell still reads *"`ServiceRequest` is read only, which closes the FHIR route only"* on the product surface. The removal did not happen.

3. The `fixed` annotation says: *"A matched Condition cannot be updated... The row now says the existing condition was assessed by an Assess command."* The prov text was fixed; the row's own sub-line still says *"1 add to active list, **1 update existing**, 2 note only"*.

4. The `finding` annotation says: *"Prescribe has no COMMIT action at all"*. The verified command matrix lists `commit` as available on `Prescribe`; what `Prescribe` lacks is `sign`. The annotation that exists to settle a disagreement between two earlier readings appears to have settled it wrongly. The consequence for the screen is nil (the row does not depend on it) but the annotation will mislead the implementer, which is precisely what it was written to prevent.

5. The disclosure says *"the seam is the write, and there are **three** of them"*; the `new` annotation says *"Two write paths, named separately... There are two: the FHIR API from outside, and the Plugin SDK inside Canvas."* Same screen, two counts.

6. The disclosure lists *"whether an embedded app can sign notes"* as an open spike and the `gap` annotation repeats it as the reason no signing control is drawn. `SIGN_NOTE` is a published effect. The spike is closed, and the screen's central architectural hedge rests on it.

7. The scaffold footnote says *"reconciliation state is read from the adapter at page load and is not cached, so a soft failure shows the moment it happens"*. Row 4's soft failure is a command that **never ran**, so nothing exists in Canvas to read at any polling frequency, and row 7's pending signature has no readable state either. The mechanism described cannot produce the two states the table is proudest of.

8. Row 1 writes the note as a `DocumentReference`; row 8 names the thing to be linked a *"Canvas note id"*. Two names for one artefact, and the choice between them decides whether the linkage in #77 is implementable.

9. This screen says the genetics failure means *"the order command had no clinician to attribute and **never ran**. Nothing exists in Canvas to read back."* `v2/standing-orders.html` line 307 says of the same failure: *"The order transmits; the Canvas record loses clinician attribution."* One says there is no Canvas record; the other says there is a Canvas record missing a field. The two screens the annotations say now "point at each other" describe different failures.

## Open questions for the humans

1. Is the locked note a FHIR `DocumentReference` or an SDK Note (`CREATE_NOTE` + `SIGN_NOTE`)? Everything about amendment, metadata and the release linkage turns on this and the screen currently asserts both.
2. Does Aleron intend to ship a Canvas plugin? Half the workable answers here (`SIGN_NOTE`, `UPSERT_*_METADATA`, `CREATE_LAB_REPORT`, `*_COMMAND__POST_COMMIT`) require one, and the annotations already flag plugin sandbox egress as undocumented. That single decision resolves more of this screen than any API lookup.
3. Where does a physician's Canvas practitioner id come from at onboarding, given SAML has no JIT provisioning? Rows 4 and 10 and the SSO footnote are all the same question.
4. Is "Canvas linkage satisfied" allowed to be an Aleron-side assertion, or must it be a fact stored in Canvas? Section 7 is quoted but the document is not in this workspace and cannot be checked.
5. After the physician signs a prescription in Canvas, what is the intended return? Tab-switch, poll, plugin callback, or nothing?
6. Does Junction's catalogue actually carry the Invitae 160-gene panel, and does Junction return a requisition document Aleron can push to Canvas?
7. Does a plugin-created lab report enter the Canvas clinician review queue? The annotation raises this and it decides whether results reach a person or only the chart.
8. Is tirzepatide meant to be the prescription fixture? If so the EPCS clause comes off every screen that pairs them; if the point is to show the EPCS path, the fixture should be a scheduled drug.
