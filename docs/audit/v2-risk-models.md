# v2/risk-models.html

**Screen purpose:** Show the physician the full audit trail behind one domain risk score (AHA PREVENT base, Aleron A-D modifier layer, composite arithmetic, information gaps, provenance) plus a sixth unscored cross-domain Systemic pass.

**Data points audited:** 151 — OK 66, GAP 67, WRONG 10, UNVERIFIED 7 (of which 10 have `NONE` or partly-`NONE` as their Source)

Notation in the Note column for engine outputs: `In:` input provenance · `Home:` where the output can live if Canvas is the system of record · `Stale:` what the physician is told when an input moves.

The screen carries **no `<script>` and no fixture object**. Every value below is hardcoded in markup, so there is no data model to point an API at yet. That is a BRIEF violation in its own right and it is why the sourcing below has to be inferred from the copy.

---

## Data points

### Rail and session chrome

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 1 | `Ethan Park` | Canvas FHIR:Patient.name | OK | Read/search both available. |
| 2 | `AL-47M` | Canvas FHIR:Patient.identifier | GAP | `AL-47M` is an Aleron program id, not a Canvas MRN shape. If Aleron mints it, it must be pushed with SDK `CREATE_PATIENT_EXTERNAL_IDENTIFIER` or it exists only in Aleron, which is a patient-data-in-Aleron violation. |
| 3 | `47M` | Derived (Patient.birthDate, Patient.gender) | OK | Age recomputed per render, no staleness risk. |
| 4 | `EP` avatar initials | Derived (Patient.name) | OK | |
| 5 | `Dr. A. Okafor` | Aleron (Entra/Azure AD session) | GAP | Displaying the actor is fine. But every write this screen implies needs a Canvas Practitioner id, and Canvas has **no just-in-time provisioning** (ground truth §4): a SAML identity with no pre-existing Canvas user cannot attribute a command. Nothing on the screen says whether this actor is linked. |

### Domain rail (six tabs)

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 6 | Cardiovascular `16 %` + `moderate` | Derived (aha-prevent-v1 + tier classifier) | GAP | In: sourceable (rows 40-51). Home: no FHIR home — Observation create is restricted to vitals/panel shapes and has **no update**, so a score that changes cannot be revised; SDK `CREATE_OBSERVATION`/`UPDATE_OBSERVATION` is the only revisable route. Stale: nothing. |
| 7 | Metabolic `34 %` + `high` (ptile) | NONE | WRONG | The screen's own evidence block says Metabolic carries `model provenance pending` and that "Cardiovascular is the only domain whose baseline model is materialised". A hazard tile reading `high` is printed anyway. In: unstated. Home: none. Stale: n/a, there is no run. |
| 8 | Neuro `~5 %` + `moderate` | NONE | WRONG | Same as row 7. The tilde signals imprecision, not absent provenance. |
| 9 | Cancer `4 engines` + `moderate` | Aleron (engine registry count) | WRONG | Two faults. (a) The column is a risk figure in five of six rows and an engine count in this one, so the rail reads `4 %`-shaped at a glance. (b) BRIEF fixture is `Cancer ~5 % 10-yr modifiable-site`; this contradicts it, and the band word `moderate` still implies a score that is not shown. |
| 10 | Kidney `~3 %` + `low` | NONE | WRONG | Same as row 7. `low` on an unmodelled domain is exactly what "an unassessed risk is not a low risk" forbids. |
| 11 | Systemic `3 patterns` + `no score` | Derived (Aleron systemic pass) | GAP | In: rows 106-141. Home: patterns are narrative; nearest is SDK `CREATE_NOTE` or FHIR `DocumentReference` create, but the screen labels them `unverified narrative`, which argues against writing them to the chart at all. Stale: nothing; the run id `3f9c1a20` carries no date. |

### Cardiovascular hero

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 12 | `Current model output · one intake timepoint` | Derived (count of Observation timepoints) | GAP | In: Canvas FHIR:Observation search count per analyte. Home: n/a, presentational. Stale: this is the only near-staleness signal on the screen and it describes input density, not input age. |
| 13 | `Moderate long-horizon ASCVD risk with blood pressure and lipid drivers.` | Derived (Aleron interpretation layer) | GAP | Generated sentence with no stated generator. If LLM-produced it is unattributed on a clinical surface; if templated from the tier + top sensitivity terms, say so. Home: none. Stale: silently wrong the moment BP or lipids move. |
| 14 | Driver paragraph: age, SBP, lipid profile, kidney function as carriers; ApoB, Lp(a), inflammation, insulin resistance, CRF as modifier context | Derived (predictor set + modifier registry) | OK | Restates the ledger below; inputs all sourceable. |
| 15 | Routing statement: `PREVENT supplies the base estimate…Phenotype modifiers remain separate from the six PREVENT endpoints.` | Aleron (engine spec) | OK | Static engine fact, not patient data. But "six PREVENT endpoints" conflicts with row 49's "four tables". |
| 16 | `16` `% absolute` | Derived (aha-prevent-v1) | GAP | See row 6. Also see row 51: this figure **does not reconstruct** from the coefficient table shown below it. |
| 17 | `moderate` band (pbase) | Derived (tier classifier on base output) | GAP | In: row 16. Home: a band word is the one engine output that would fit `UPSERT_PATIENT_METADATA` cleanly. Stale: nothing. |
| 18 | `30-yr ASCVD` horizon | Aleron (engine config) | GAP | The ledger states the admitted age domain as `30 to 79 yr` (row 40), which is PREVENT's **10-yr** validity window. The published 30-yr equations are restricted to ages 30-59. Patient is 47 so the number is in range, but the frame printed beside it is the wrong one. |
| 19 | `AHA PREVENT base` model name | Aleron (engine config) | OK | Static. |
| 20 | `10-yr total CVD 2.7 %` | Derived (aha-prevent-v1, second table) | GAP | In: same packet. Home: same as row 6. Stale: nothing. Plausibility flagged in Open questions. |

### What it means here

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 21 | Actionable levers: `Cardiorespiratory fitness, Lp(a) context, HOMA-IR and hs-CRP` | Derived (modifier sensitivity ranking) | GAP | In: CRF from Junction device data; Lp(a)/hs-CRP from Junction BiomarkerResult or Canvas Observation; HOMA-IR derived from glucose + insulin. Home: an ordered lever list has no FHIR home; nearest is `UPSERT_PATIENT_METADATA` as a flat key, or `ADD_OR_UPDATE_PROTOCOL_CARD` if the physician should see it inside Canvas. Stale: reorders silently when any input changes. |
| 22 | `Age, blood pressure and eGFR carry more weight but only blood pressure is movable` | Derived (sensitivity + a movability flag) | GAP | The movability flag is an Aleron-authored property of each variable. It exists in no API and is not in the ledger's `Layer` column. Undocumented third axis. |
| 23 | `Lp(a) 25 nmol/L` | Junction:BiomarkerResult.value/unit, or Canvas FHIR:Observation | OK | If Junction-resulted, ground truth §6 step 4 says it reaches Canvas via SDK `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS`. |
| 24 | `ApoB 112 mg/dL` | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | |
| 25 | `LDL-C 132 mg/dL` | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | |
| 26 | `hs-CRP 3.0 mg/L` | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | |
| 27 | `The current fields the physician can verify in chart review.` | Claim about Canvas | GAP | This is a claim that rows 23-26 are visible in Canvas. Only true if the Junction webhook path actually ran `CREATE_LAB_REPORT`. If Aleron reads Junction directly and never writes back, the sentence is false and the physician will look for values that are not there. Nothing on the screen distinguishes the two cases. |
| 28 | `Moderate confidence, provenance visible` | Derived (Aleron confidence model) | GAP | Confidence is an Aleron-computed scalar bucketed to a word. In: unstated formula. Home: none. Stale: nothing. |
| 29 | `Single intake timepoint. Blood pressure is one clinic setting` | Derived (Observation count + Encounter class) | UNVERIFIED | Observation search gives the count. Deriving "clinic setting" needs `Encounter.class` or Observation context; Encounter is read-only but readable. Whether Canvas populates a usable class code for an intake visit is not in ground truth. |

### Next moves

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 30 | `Current BP 142/90 mmHg` | Canvas FHIR:Observation (vital-signs) | OK | Read/search available. Written by SDK `VitalSignReading` command if Aleron captured it. |
| 31 | `the single largest movable term in the linear predictor` | Derived (sensitivity × movability) | GAP | Same undocumented movability flag as row 22. |
| 32 | `The gate is scored on the action map at 65 % reclassification odds` | Derived (Aleron action-map / SPAR) | GAP | In: engine posterior + a utility model, no third-party input. Home: no Canvas resource holds a reclassification probability. Stale: recomputed only on a run; this one is 71 days old (row 96). |
| 33 | `ApoB 112 mg/dL` (repeat) | Junction / Canvas FHIR:Observation | OK | |
| 34 | `LDL-C 132 mg/dL` (repeat) | Junction / Canvas FHIR:Observation | OK | |
| 35 | `non-HDL enters PREVENT directly, ApoB does not` | Aleron (engine spec) | OK | Static model fact. |
| 36 | `Lp(a) 25 nmol/L is normal here` | Junction / Canvas FHIR:Observation + Aleron reference range | OK | `normal` derives from Junction's `reference_range` / `is_above_max_range` if Junction-resulted, else from an Aleron range table. |
| 37 | `Measured once` | Derived (Observation search count, Lp(a)) | GAP | Count is obtainable from Canvas Observation search **only if every historical Lp(a) reached Canvas**. A Junction result that never got a `CREATE_LAB_REPORT` is invisible to that count, so "once" can be wrong in both directions. |

### Variables ledger

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 38 | Column `Reference frame` (12 values, e.g. `90 to 200 mmHg, split at 110`) | Aleron (engine admitted domain) | OK | Static per-model config. |
| 39 | Column `Model sensitivity` bar widths (11 values: 100/82/66/54/46/36/22/60/28/24/20 %) | Derived (Aleron sensitivity analysis) | GAP | In: coefficients + the input distribution the sensitivity was run against, which is never named. Home: none. Stale: these are model-level, not patient-level, so they do not go stale with the patient — but the footnote (row 52) is the only thing saying so, and the bars sit in a patient row. |
| 40 | Age `47 yr` / frame `30 to 79 yr` / `base` | Canvas FHIR:Patient.birthDate | OK | Frame is wrong for the 30-yr endpoint, see row 18. |
| 41 | Systolic BP `142 mmHg` + `stage 2` tile | Canvas FHIR:Observation (vital-signs) | OK | `stage 2` derived from ACC/AHA thresholds, Aleron-owned. |
| 42 | eGFR `93 mL/min/1.73m²` | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | |
| 43 | Total-C / HDL-C `205 / 40 mg/dL` | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | |
| 44 | Diabetes `no` + `HbA1c 6.0 % is below the 6.5 % flag. Post-load status not emitted.` | Canvas FHIR:Condition + Observation (HbA1c) | OK | Condition read/search available; absence of an active diabetes Condition plus HbA1c under threshold is a defensible `no`. `not emitted` is honest. |
| 45 | Smoking `never` | Canvas FHIR:Observation (social history) | UNVERIFIED | Ground truth confirms Observation read/search but does not confirm Canvas stores smoking status as a social-history Observation with LOINC 72166-2 rather than as a Condition or a questionnaire answer. Verify before relying on it. |
| 46 | BP medication / statin `no / no` | Canvas FHIR:MedicationRequest (read) + MedicationStatement | OK | Both readable. Note this is prescribed-not-taken: MedicationRequest is read-only, so Aleron cannot record an adherence correction. |
| 47 | Cardiorespiratory fitness `28 mL/kg/min` + `low`, frame `1st to 99th percentile for age and sex` | Junction:device data (Sense aggregate) | UNVERIFIED | Ground truth names the Devices/Wearables and Junction Sense groups but not the VO₂max field path. Newly-verified field path needed. Percentile table is Aleron-owned. |
| 48 | Lp(a) `25 nmol/L`, frame `5 to 400 nmol/L` | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | |
| 49 | ApoB / LDL-C discordance `112 / 132 mg/dL` + `Concordant. The A4 discordance modifier needs ApoB above 130 with LDL-C below 130.` | Derived (rows 24-25 + spec §3.1 A4) | OK | Well-formed negative: names the rule, the values, and why it did not fire. |
| 50 | HOMA-IR / hs-CRP `4.3` / `3.0 mg/L`, frames `0.5 to 8` / `0.2 to 12 mg/L` | Derived (fasting glucose × insulin / 405) + Junction:BiomarkerResult | OK | HOMA-IR is computed by Aleron from two Junction/Canvas biomarkers; neither its inputs nor the divisor are shown anywhere on the screen. Minor provenance gap only. |
| 51 | Social deprivation index `not emitted` / `1 to 100 percentile` / `enhanced base` / `not scored` | NONE | OK | Correctly declared absent. No API in scope supplies ADI: it needs a geocode of `Patient.address` against an external index. Canvas Patient read gives the address; the index itself is out of scope for both vendors. Honest `NONE`, and the only row on the screen that handles absence correctly. |
| 52 | `Layer` column: `base` ×7, `modifier` ×4, `enhanced base` ×1 | Aleron (engine taxonomy) | OK | |
| 53 | Footnote `Bar length is model sensitivity, not effect size, and not a patient-specific projection.` | Aleron | OK | P7 done right. |

### Step 1 · Baseline model

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 54 | Inputs recap: `age 47 · sex male · total-C 205 · HDL-C 40 · SBP 142 · eGFR 93 · non-diabetic · never smoked · no BP treatment · no statin` | Canvas FHIR:Patient + Observation + Condition + MedicationRequest; Junction:BiomarkerResult | OK | All ten sourceable, subject to rows 45-46. |
| 55 | `Base P 16.0 % at the 30-yr ASCVD endpoint · 2.7 % at 10-yr total CVD` | Derived (aha-prevent-v1) | WRONG | See row 61. The coefficient table printed directly beneath this line yields **29.8 %**, not 16.0 %. Either the table is the wrong endpoint or the figure is. |
| 56 | Base model `aha-prevent-v1` | Aleron (engine registry) | GAP | Home: a model id belongs with the score. `UPSERT_PATIENT_METADATA` is the named escape hatch (ground truth §3) and takes arbitrary key/value, so `risk.cvd.model = aha-prevent-v1` fits. Nothing on the screen implies it is written. |
| 57 | Engine `cvd-risk-engine-algorithm 2.1` + `total CVD, ASCVD plus heart failure, sex-specific, competing-risk adjusted` | Aleron (engine registry) | GAP | Same as row 56. |
| 58 | Predictor set `Core ten` + `UACR, HbA1c…and the social deprivation index…not consumed` | Aleron (engine config) | OK | Correct refusal-to-impute. |
| 59 | Formula (logit expression, 12 main terms + 8 interactions) | Aleron (engine spec) | OK | Static. |
| 60 | Centering constants: `38.67`, `ln(age/55)`, `3.5 mmol/L`, `1.3 mmol/L / 0.3`, `SBP at 110 / 20`, `eGFR at 60 / −15` | Aleron (engine spec) | OK | Static. Verified arithmetically consistent with row 62. |
| 61 | β column, 20 coefficients, header `β, male 30-yr total CVD` | Aleron (published PREVENT supplementary tables) | WRONG | Header says **total CVD**; the reported figure (row 55) is **30-yr ASCVD**. Running the printed β against the printed centered values gives p = 0.2976, i.e. 29.8 %. The audit trail therefore does not reconstruct the headline number, which defeats the entire purpose of the block. Suspiciously, 29.8 % is within rounding of the 29.4 % "phenotype-adjusted" figure in row 78 — check whether the fixture was built backwards from that. |
| 62 | Patient centered value column, 20 values (`−0.1568`, `+0.7677`, `−0.8845`, `+1.6000`, `−2.2000`, `−0.1204`, `+0.1387`, `−0.2509`, zeros) | Derived (row 54 + row 60) | OK | Independently recomputed: every non-zero value is correct to 4 dp against the stated centering rules. |
| 63 | `Coefficients are the published AHA PREVENT 2024 supplementary tables (Khan SS et al., PMID 37947085)` | Aleron (literature) | OK | Static citation. |
| 64 | `The engine ships four tables, sex by horizon` | Aleron (engine registry) | WRONG | Sex × horizon is four, but the screen also claims three endpoints (total CVD, ASCVD, HF) and quotes both a total-CVD β table and an ASCVD figure. Sex × horizon × endpoint is at least twelve. Row 15 says "six PREVENT endpoints". Three different counts on one screen. |
| 65 | `The engine throws rather than imputing when a core predictor is missing` | Aleron (engine behaviour) | GAP | Good behaviour, but it has an unhandled consequence: if a core input is unreadable from Canvas the panel has nothing to render, and no state on this screen covers that. |

### Step 2 · Modifier groups A to D

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 66 | Group A rule `PRODUCT · cap 2.5×` | Aleron (spec §3.1) | OK | |
| 67 | `A1 · Lp(a) continuous, 25.0 nmol/L` → `↑ 1.11×`, `PMID 19906021 · β = 0.11 on nmol/L, clamped to 1.0 to 1.5` | Derived (row 48 + spec) | GAP | In: OK. Home: a per-modifier multiplier has no FHIR field. Stale: a repeat Lp(a) would change 1.11× and therefore the composite, silently. |
| 68 | `A6 · hs-CRP ≥ 2.0 mg/L on two or more measurements` → `↑ 1.25×` | Derived (row 26 + Observation history) | WRONG | The modifier's own stated condition is **two or more measurements**. The screen elsewhere says hs-CRP was drawn once (row 90: "One draw of 3.0 mg/L"). A6 fires anyway at 1.25×, and it is the larger half of the group A composite. Either the rule text or the firing is wrong. |
| 69 | `A7 · hs-CRP ≥ 5.0 mg/L persistent` → `not fired` | Derived | OK | |
| 70 | `A4 · ApoB >130 with LDL-C <130` → `not fired` | Derived (row 49) | OK | |
| 71 | `A8 · Omega-3 index below 4 %` → `no data submitted` | NONE | GAP | Omega-3 index is a red-cell membrane assay. Junction is labs-only and could order it (`order_set.lab_test_ids`), but no Junction lab_test_id is named anywhere and `no data submitted` gives the physician no way to get it. It is also absent from the Information gaps table, so this is a declared gap with no route out. |
| 72 | `Group A composite 1.11 × 1.25 = 1.39×` | Derived | GAP | Arithmetic verified (1.3875). In: depends on row 68 being legitimate. Home: none. Stale: nothing. |
| 73 | Group B rule `PRODUCT · cap 2.0×` | Aleron (spec §3.2) | OK | |
| 74 | `B3 · Reverse dip on ABPM` → `no data submitted` | NONE | GAP | ABPM is a device study. Junction is labs + wearables, no ABPM. Canvas FHIR ServiceRequest **has no create**. Nearest real path: SDK `Refer` command (originate + sign) to a hypertension service, or Aleron collecting home-cuff readings through the member app and writing them with the SDK `VitalSignReading` command. |
| 75 | `B2 · Nocturnal dip below 10 %` → `no data submitted` | NONE | GAP | Same as row 74. |
| 76 | `B1 · Home cuff SBP SD above 15 mmHg` + `needs 14 readings inside 30 days` → `no data submitted` | Aleron (member app) | GAP | The 14-readings threshold is the only place on the screen that states a data-sufficiency rule as a number. Home cuff readings are Aleron-collected; each would need an SDK `VitalSignReading` to reach Canvas, and there are 14 of them per window. |
| 77 | `B4 to B7 · Autonomic tiers` + `thresholds are RHR above 80 bpm and RMSSD below 20 ms; measured 38 bpm and 34 ms` → `not fired` | Junction:device data (heart rate, HRV) | UNVERIFIED | Field paths for overnight RHR and RMSSD are not in ground truth; the Junction Sense group plausibly supplies them. Also note the internal tension: `not fired` is correct by the stated thresholds, yet 38 bpm is the abnormality pattern P3 is built on. The autonomic group is one-sided (high RHR only) and the screen admits this at row 95. |
| 78 | `Group B composite = 1.00× · neutral by absence, not by evidence` | Derived | OK | Best line on the screen. Correctly refuses to let absence read as reassurance. |
| 79 | Group C rule `PRODUCT of two MAX pairs · cap 2.0×` | Aleron (spec §3.3) | OK | |
| 80 | `C1 · HOMA-IR 4.30, above 3.0` → `↑ 1.15×`, `non-diabetic only` | Derived (row 50) | GAP | Home/Stale as row 67. |
| 81 | `C2 · Metabolic syndrome, 4 of 5 ATP-III criteria` → `↑ 1.20×` | Derived (waist, TG, BP, glucose, HDL) | GAP | The count `4 of 5` is itself a derived value and the screen never says which four. Inputs: waist 105 cm (row 110), TG 180 mg/dL, BP 142/90, glucose 110 mg/dL, HDL 40 mg/dL — all sourceable, but waist circumference as a Canvas vital-sign type is unverified (see row 110). |
| 82 | `C3 · HbA1c 6.0 %, prediabetic range` → `↑ 1.10×` | Junction:BiomarkerResult / Canvas FHIR:Observation | GAP | Home/Stale as row 67. |
| 83 | `C4 · HbA1c above 8.0 %` → `not fired`, `halved if the enhanced base already consumed HbA1c` | Derived | OK | |
| 84 | `C5 · SGLT2 inhibitor active` → `not fired`, `protective at 0.75×` | Canvas FHIR:MedicationRequest / MedicationStatement | OK | Read-only is sufficient here. |
| 85 | `C6 · GLP-1 receptor agonist active` → `not fired`, `protective at 0.80×` | Canvas FHIR:MedicationRequest / MedicationStatement | OK | |
| 86 | `Group C composite max(1.15, 1.20) × max(1.10, 1.00) = 1.32×` | Derived | OK | Arithmetic verified. |
| 87 | Group D rule `MAX within the variant family, then PRODUCT with one family term · cap 3.0×` | Aleron (spec §3.4) | OK | |
| 88 | `D1 · P/LP in an FH gene, LDLR / APOB / PCSK9` → `not fired`, `3.0× when present` | Canvas (genetics) | GAP | Ground truth covers no genomics resource. FHIR `MolecularSequence` is not in the matrix; the plausible homes are a genomics-profile `Observation` (read ✓) or a `DocumentReference` PDF that is not machine-readable. Asserting `not fired` requires having actually read a variant list — if the read path is a PDF, this is an unsupported negative. |
| 89 | `D3 / D4 · P/LP in an HCM or arrhythmia gene` → `not fired`, `probability override, not a multiplier` | Canvas (genetics) | GAP | Same as row 88. |
| 90 | `D6 · P/LP in another cardiovascular gene` → `not fired` + `ATM heterozygous P/LP is a cancer-predisposition finding and is not on the cardiovascular gene list` | Canvas (genetics) | GAP | Same as row 88. The ATM finding itself is the fixture's required channel, so this one variant must be machine-readable for the whole required-channel mechanism to work anywhere in the product. |
| 91 | `D7 / D8 / D9 · First-degree family history…` → `not fired` + `recorded history is T2D and hypertension` | Canvas FHIR:FamilyMemberHistory | GAP | **The verified matrix has no FamilyMemberHistory row at all.** The only family-history surface in ground truth is the write-side SDK `FamilyHistory` command. Reading structured family history back is unverified and may not exist; if it does not, `not fired` is asserted from data Aleron cannot see. |
| 92 | `Group D composite = 1.00× · ATM P/LP routes to the required channel` | Derived | GAP | The routing claim is a cross-screen promise. Nothing here says where the required channel lives or that it has been dispositioned. |

### Step 3 · Composite risk

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 93 | `Sum log-HR ln(1.39) + ln(1.00) + ln(1.32) + ln(1.00) = +0.607` | Derived | OK | Verified: 0.60694. |
| 94 | `Composite modifier exp(+0.607) = 1.835` | Derived | OK | Verified: 1.83492. |
| 95 | `Group caps A 2.5×, B 2.0×, C 2.0×, D 3.0×. No group reached its cap` | Aleron (spec) | OK | |
| 96 | `Base × composite 16.0 % × 1.835 = 29.4 % phenotype-adjusted 30-yr ASCVD` | Derived | GAP | Arithmetic verified (29.36). But see row 61: 29.4 % is within rounding of what the printed coefficients actually compute for the base, which suggests the fixture may have two different numbers wearing each other's labels. Home: none. Stale: nothing. |
| 97 | `Reported figure 16.0 %, the PREVENT base output…not the number the action map prices against` | Aleron (policy) | OK | Correct and clearly stated. |
| 98 | `Tier rule…the band word is MODERATE. The adjusted product would fall in the high band, and that disagreement is the finding` | Derived (tier classifier) | OK | P7 done right. |

### Information gaps

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 99 | Home/ambulatory BP series · `Group B cannot fire at all without a night series` · `65 % reclassification odds` · `0.63 QALY` · `7 days, morning and evening` | Derived (Aleron action map) | GAP | In: engine posterior only. **No order path.** ABPM is not a Junction lab and Canvas FHIR ServiceRequest has no create; the nearest real act is SDK `Refer` to a hypertension service, or Aleron collecting home readings and pushing each with `VitalSignReading`. Home: odds and QALY have no Canvas field. Stale: the whole row is priced off a run dated 24 Jun 2026. |
| 100 | 75 g 2-hour OGTT · `Diabetes is a base-model term worth +0.653 log-HR` · `4 % reclassification odds` · `0.85 QALY` · `Once, then annual while impaired` | Derived | GAP | Orderable: Junction `POST /v3/order` with `collection_method: walk_in_test` and the OGTT `lab_test_id`. Result returns by webhook and becomes a Canvas lab report via `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS`. Canvas holds no order record for it, by design. The 4 %/0.85 QALY pairing is odd (lowest odds, highest QALY) and unexplained. |
| 101 | hs-CRP repeat · `The A6 tier requires two or more measurements above 2.0 mg/L` · `Confirms or withdraws the 1.25× A6 modifier` · `Repeat at 4 to 6 weeks` | Derived | WRONG | This row states plainly that A6 needs two measurements and that only one exists — while row 68 fires A6 at 1.25× and banks it into the group A composite and therefore into 29.4 %. The screen contradicts itself across two disclosures. Orderable through Junction. |
| 102 | FIB-4 with AST, ALT, platelets · `20 % reclassification odds` · `0.70 QALY` · `Once, then every 2 years` | Derived | GAP | Orderable: Junction `POST /v3/order`, CMP + CBC. FIB-4 itself is computed by Aleron from three biomarkers plus age; that derived value has no home in Canvas (Observation create is restricted and has no update). |
| 103 | UACR trend · `A single UACR of 14 mg/g` · `unlocks the PREVENT-enhanced coefficient set` | Junction:BiomarkerResult + Derived | GAP | Orderable through Junction. But the unlock is conditional on the deprivation index (row 51), which no API supplies, so the enhanced set can never actually unlock. The row promises something the stack cannot deliver. |
| 104 | 12-lead ECG · `Overnight RHR 38 bpm is discordant with VO₂max 28 mL/kg/min` · `15 % reclassification odds` · `0.40 QALY` · `Once, then patch or Holter if persistent` | Derived + Junction:device data | GAP | **No order path.** Junction is labs-only. FHIR ServiceRequest has no create. Nearest: SDK `Perform` command with the ECG CPT code if done in-house, or `Refer` to cardiology. A patch/Holter is DME and has neither. |

### Evidence & provenance

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 105 | Citation paragraph: PMID 37947085, PMID 19906021, JUPITER, CTT, MAPEC, NCEP ATP-III, ARIC, EMPA-REG/CANVAS/DECLARE, SUSTAIN-6/LEADER/REWIND | Aleron (literature) | OK | Static. |
| 106 | Document `cvd-risk-engine-algorithm 2.1` | Aleron (engine registry) | GAP | Home: `UPSERT_PATIENT_METADATA` or `UPSERT_NOTE_METADATA`. |
| 107 | Engine `aha-prevent-v1` with the Aleron modifier layer | Aleron | GAP | As row 106. |
| 108 | Run `24 Jun 2026 09:04` | Aleron (run record) | **GAP, the largest one** | Today is 3 Sep 2026. This panel is **71 days old** and nothing on the screen says so, marks it stale, or says whether any input has changed since. Every number above — 16 %, 1.835, 29.4 %, all six information-gap rows, all three patterns — is 71 days old. The mechanism to fix this exists: SDK `CronTask` to re-run, `[COMMAND]_COMMAND__POST_COMMIT` events to detect chart changes, `ADD_BANNER_ALERT` to say so. None is implied. |
| 109 | Packet `patient_packet.v1` | Aleron (schema id) | GAP | Home: metadata. Also: an internal schema name on a product surface, which BRIEF's "internal pipeline" test would question. |
| 110 | Schema `risk_envelope.v2` | Aleron (schema id) | GAP | As row 109. |
| 111 | `Coefficients are fixture-validated against the AHA PREVENT online calculator. That validation is the acceptance gate and it is not a clinical clearance.` | Aleron (test suite) | WRONG | Row 61 shows the printed coefficients do not reproduce the printed output. A validation claim that the fixture contradicts is worse than no claim. |
| 112 | `Metabolic, Neuro, Cancer and Kidney all carry model provenance pending. Cardiovascular is the only domain whose baseline model is materialised` | Aleron | OK | Honest, and it is the sentence that convicts rows 7-10. |

### Systemic hero

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 113 | `Cross-domain synthesis · narrative, not scored` | Aleron | OK | |
| 114 | `Three cross-domain patterns the five disease models cannot see individually.` | Derived (Aleron systemic pass) | GAP | In: the union of every input above. Home: none. Stale: nothing; no date is shown at all for this pass. |
| 115 | `Each of the five domain engines reads part of this patient…it emits no score, no horizon and no tier` | Aleron | OK | |
| 116 | `Read this before the domain panels, not after.` | Aleron | OK | |
| 117 | `3` `cross-domain patterns` | Derived | GAP | As row 114. |
| 118 | `no score emitted` | Aleron | OK | |
| 119 | `Data rows 47` | Derived (packet row count) | GAP | A count of packet rows is Aleron plumbing, not a clinical fact. It tells the physician nothing they act on — BRIEF's "internal pipeline" failure mode. Also unfalsifiable: 47 of what, from where. |
| 120 | `Verification: unverified narrative` | Aleron | OK | Honest. And it is the reason this pass must not be written to Canvas as a note. |
| 121 | `Run 3f9c1a20` | Aleron (run id) | GAP | An opaque hex id with no timestamp on a product surface. Home: `UPSERT_PATIENT_METADATA` is the ground-truth-named home for engine run ids. Stale: no date, so the physician cannot even tell whether this pass is older or newer than row 108. |

### Patient picture

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 122 | `A 47-year-old man whose central adiposity sits upstream of almost everything else` | Derived (Aleron narrative layer) | GAP | Generated clinical prose with no named generator and `unverified` status. Home: writing it to Canvas as a note would give unverified narrative the standing of a signed observation; do not. |
| 123 | `an overnight oxygen nadir of 89 %` | Junction:device data (SpO₂) | UNVERIFIED | Field path not in ground truth. Capability exists (Devices/Wearables, Junction Sense). |
| 124 | `an overnight heart rate of 38 bpm` | Junction:device data (heart rate) | UNVERIFIED | Same. |

### Patterns P1 to P3

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 125 | `P1` id + `Sleep-disordered breathing as an upstream driver…` | Derived | GAP | Home: none. Stale: nothing. |
| 126 | P1 `medium confidence` | Derived (Aleron confidence model) | GAP | Three confidence words on this screen (medium/high/low) and one more in row 28 (`Moderate confidence`). Two different vocabularies for the same concept, neither with a stated scale. |
| 127 | P1 `snapshot` | Derived (temporal density flag) | OK | Useful: says the pattern rests on one timepoint. |
| 128 | P1 mechanism prose (hypoxia → sympathetic surge → BP, hepatic IR, sleep quality) | Aleron (knowledge base) | OK | Static clinical reasoning, not patient data. |
| 129 | P1 signals `SpO₂ nadir 89 % · BP 142/90 mmHg untreated · HOMA-IR 4.3 · waist 105 cm · energy 4 of 10 · clarity 4 of 10` | Junction:device data + Canvas FHIR:Observation + Derived + Aleron PRO | GAP | Six values, four sources. `waist 105 cm`: whether Canvas accepts waist circumference as a `VitalSignReading` type is unverified. `energy 4 of 10` and `clarity 4 of 10` are Aleron member-app PROs with no home in Canvas today — `QuestionnaireResponse` (create/read/update ✓) is the correct destination and would also make them visible in chart review. |
| 130 | P1 `Would settle it: STOP-BANG, then a home sleep apnea test` | Aleron + NONE | GAP | STOP-BANG is orderable: Canvas `Questionnaire` read + `QuestionnaireResponse` create, or the SDK `Questionnaire` command. **HSAT has no order path**: Junction is labs-only, FHIR ServiceRequest has no create, and an HSAT is neither imaging nor a lab. Nearest: SDK `Refer` command to sleep medicine (`originate` then `sign`, both supported). |
| 131 | P1 `35 % reclassification odds` | Derived (action map) | GAP | Present here but **absent from the Information gaps table**, which lists BP series, OGTT, hs-CRP, FIB-4, UACR and ECG but not the sleep test — even though row 133 calls the sleep gate the thing the map prices first. |
| 132 | P1 chips: `overnight oximetry`, `clinic vitals`, `fasting labs`, `patient-reported outcome` | Derived (source taxonomy) | OK | This is the closest thing on the screen to an input-provenance display, and it is the right idea in the wrong place: it appears on three narrative cards and nowhere on the 12-row variables ledger, where it would matter. |
| 133 | `P2` id + `Visceral adiposity with probable hepatic involvement that no domain stages` | Derived | GAP | |
| 134 | P2 `high confidence` | Derived | GAP | As row 126. |
| 135 | P2 `snapshot` | Derived | OK | |
| 136 | P2 mechanism prose | Aleron (knowledge base) | OK | |
| 137 | P2 signals `waist 105 cm · waist-to-height 0.59 · triglycerides 180 mg/dL · HDL-C 40 mg/dL · HOMA-IR 4.3 · hs-CRP 3.0 mg/L` | Canvas FHIR:Observation + Junction:BiomarkerResult + Derived | GAP | `waist-to-height 0.59` is derived from waist 105 / height 178 = 0.590 ✓. Height is a Canvas vital. Waist as a Canvas vital type unverified. |
| 138 | P2 `Would settle it: FIB-4…then FibroScan if indicated. It gates resmetirom` | Junction (labs) + NONE (FibroScan) + Canvas SDK:Prescribe | GAP | FIB-4 labs order fine through Junction. FibroScan is elastography: Canvas SDK `ImagingOrder` (originate + **sign**, both supported) is the correct path, not Junction. `gates resmetirom` implies a prescription: Canvas `Prescribe` command can be **originated but not signed** by a plugin — the physician must be redirected into Canvas to sign, and ground truth §6 flags the return leg as undrawn. |
| 139 | P2 chips: `anthropometry`, `lipid panel`, `inflammation`, `insulin dynamics` | Derived | OK | |
| 140 | `P3` id + `Nocturnal bradycardia discordant with measured fitness` | Derived | GAP | |
| 141 | P3 `low confidence` | Derived | GAP | As row 126. |
| 142 | P3 `trend` | Derived (temporal density flag) | GAP | `trend` implies a multi-night series from the wearable. Junction Sense continuous queries would supply it, but the field path and the window length are unstated. |
| 143 | P3 mechanism prose | Aleron (knowledge base) | OK | |
| 144 | P3 signals `overnight RHR 38 bpm · VO₂max 28 mL/kg/min · activity low · SpO₂ nadir 89 %` | Junction:device data + Aleron self-report | UNVERIFIED | `activity low` is self-reported per the mechanism text, so it is an Aleron PRO with the same no-home problem as row 129. |
| 145 | P3 `Would settle it: 12-lead ECG, then patch or Holter…` | NONE | GAP | As row 104. No order path for either. |
| 146 | P3 chips: `wearable rhythm`, `fitness estimate`, `self-report` | Derived | OK | |

### Root causes, open questions, excluded

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 147 | `Root causes` hypothesis prose | Derived (Aleron narrative) | GAP | |
| 148 | `Open questions`: bradycardia cause · alcohol intake · hs-CRP chronic or acute | Derived | GAP | Alcohol intake is a Canvas social-history item; the same UNVERIFIED question as row 45 applies. |
| 149 | `Absent but expected: Ambulatory night BP series · FIB-4 · alcohol intake in drinks per day · 12-lead ECG · a second hs-CRP` | Derived | GAP | Five items; two of them (ABPM, ECG) have no order path anywhere in the stack. |
| 150 | `Noise excluded: eGFR 93 mL/min/1.73m² and UACR 14 mg/g…Lp(a) 25 nmol/L…Never-smoker status` | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | Values sourceable. The exclusion audit trail is the right instinct. |
| 151 | `Verification: unverified narrative · 47 data rows assembled · run 3f9c1a20` | Aleron | GAP | Repeats rows 119-121. Still no date. |

> Counting note: rows 38-39 collapse the variables ledger's `Reference frame` and `Model sensitivity` columns (12 and 11 values) into one row each, and rows 61-62 collapse the coefficient table's two columns (20 values each) into one row each, since provenance is identical down every column. Expanded per-value, the screen shows roughly 220 distinct values.

---

## Engine input provenance

| Input | Supplied by | Verdict | Note |
|---|---|---|---|
| Age, sex | Canvas FHIR:Patient (birthDate, gender) | OK | Read/update both available. |
| Systolic / diastolic BP | Canvas FHIR:Observation (vital-signs) | OK | Read ✓. Aleron-captured readings write via SDK `VitalSignReading` command. |
| Height, weight, BMI | Canvas FHIR:Observation (vital-signs) | OK | |
| Waist circumference | Canvas FHIR:Observation / SDK:VitalSignReading | UNVERIFIED | `vital_sign_type` enum membership for waist is not in ground truth. Feeds C2 (metabolic syndrome), P1 and P2. Verify before shipping. |
| Total-C, HDL-C, LDL-C, non-HDL | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | Junction results reach Canvas via SDK `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS`. |
| ApoB, Lp(a), hs-CRP, triglycerides | Junction:BiomarkerResult | OK | `reference_range`, `is_above_max_range`, `interpretation` give the band words for free. |
| HbA1c, fasting glucose, fasting insulin | Junction:BiomarkerResult | OK | |
| HOMA-IR | Derived (glucose × insulin / 405) | OK | Aleron-computed. The derivation is not shown anywhere on the screen. |
| eGFR, UACR | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | |
| Diabetes status | Canvas FHIR:Condition + Observation (HbA1c) | OK | Condition read/search ✓. |
| Smoking status | Canvas FHIR:Observation (social history) | UNVERIFIED | Storage shape not confirmed by ground truth. Core PREVENT term, so this must be resolved. |
| BP medication, statin, SGLT2, GLP-1 | Canvas FHIR:MedicationRequest (read) / MedicationStatement | OK | Read-only is enough for engine input. |
| Family history (T2D, HTN, premature CAD) | Canvas FHIR:FamilyMemberHistory | **GAP** | Not in the verified matrix at all. Only surface in ground truth is the write-side SDK `FamilyHistory` command. D7/D8/D9 assert `not fired` from data with no confirmed read path. |
| ATM heterozygous P/LP and the CV gene panel | Canvas (genetics) | **GAP** | No genomics resource in ground truth. Candidates: genomics-profile `Observation` (read ✓, shape unverified) or a `DocumentReference` PDF that is not machine-readable. Group D's four `not fired` rows and the whole required-channel mechanism depend on this. |
| Overnight RHR, RMSSD/HRV, SpO₂ nadir, VO₂max, activity | Junction:device data / Junction Sense | UNVERIFIED | Capability confirmed (Devices/Wearables + Sense continuous queries); field paths not in ground truth. Feeds B4-B7, CRF modifier, P1, P3. |
| Vitality PROs (energy 4/10, clarity 4/10, self-reported activity) | Aleron (member app) | **GAP** | No Canvas home today. `QuestionnaireResponse` (create/read/update ✓) is the correct destination and is the only one that also makes them verifiable in chart review. Until then Aleron is holding patient data, which the brief forbids. |
| Social deprivation index | NONE | NONE | Needs a geocode of `Patient.address` against an external ADI dataset. Neither vendor supplies it. The screen declares it `not emitted`, correctly. |
| Ambulatory / nocturnal BP series | NONE | NONE | Blocks all of group B. No Junction path (not a lab, not a wearable metric), no FHIR ServiceRequest create. |
| Omega-3 index | Junction (lab, unnamed) | GAP | Orderable in principle; no `lab_test_id` named and no route offered on the screen. |
| Fibrosis stage (FIB-4, FibroScan) | Junction (labs) + Canvas SDK:ImagingOrder | GAP | FIB-4 inputs orderable through Junction; the FIB-4 value itself has no Canvas home. |
| 12-lead ECG, Holter, patch | NONE | NONE | No order path in either vendor. Nearest acts are SDK `Perform` (in-house, CPT-coded) or `Refer`. |
| Encounter setting ("one clinic setting") | Canvas FHIR:Encounter (read) | UNVERIFIED | Readable; whether the class code is usable for this distinction is unconfirmed. |

---

## Required changes

1. **The audit trail does not reconstruct the headline number. Large.** The β table is headed `β, male 30-yr total CVD`; running it against the printed centered values gives p = 29.8 %, while the panel reports 16.0 % 30-yr ASCVD. Either print the ASCVD coefficient table, or change the reported figure to total CVD. This defeats the block's entire purpose and it is one line of arithmetic for any reviewer to find. Related: reconcile `four tables, sex by horizon` (row 64) with `six PREVENT endpoints` (row 15) — sex × horizon × endpoint is at least twelve.

2. **A6 fires on one measurement while the screen says it needs two. Large.** Row 68 fires hs-CRP A6 at 1.25×; row 101 says A6 requires two or more measurements and that only one draw exists. 1.25× is the larger half of the group A composite, so it propagates into 1.39×, 1.835× and 29.4 %. Either the firing rule is wrong or the gap row is. Fix before demo.

3. **Four of six rail domains print a score and a band with no materialised model. Large.** Metabolic `34 % high`, Neuro `~5 % moderate`, Cancer `moderate`, Kidney `~3 % low`. The screen's own evidence block says only Cardiovascular is materialised. Replace the value and band with the reference surface's own `model provenance pending` string in the rail, or the surface is doing exactly what "an unassessed risk is not a low risk" forbids.

4. **The Cancer rail cell shows an engine count where every sibling shows a probability. Medium.** `4 engines` where the other five read `16 %`, `34 %`, `~5 %`, `~3 %`, `3 patterns`. It also contradicts the BRIEF fixture (`Cancer ~5 % 10-yr modifiable-site`). Make it `model provenance pending` per change 3.

5. **The run is 71 days old and the screen never says so. Large.** `24 Jun 2026 09:04` against today's 3 Sep 2026. Add a staleness state: age of run, which inputs have changed since, and whether a re-run is needed. Mechanism exists — SDK `CronTask` for scheduled re-runs, `[COMMAND]_COMMAND__POST_COMMIT` events to detect chart writes, `ADD_BANNER_ALERT` to surface it inside Canvas. The Systemic pass shows a run id with no date at all, which is worse.

6. **No engine output has a home in Canvas, and the screen implies one. Large.** `The current fields the physician can verify in chart review` is only true if the Junction results were pushed with `CREATE_LAB_REPORT`. Decide and state: (a) scores and bands via SDK `CREATE_OBSERVATION` / `UPDATE_OBSERVATION` — note FHIR Observation has create-only and no update, so the SDK is the only revisable path; (b) run id, model id, packet and schema versions via `UPSERT_PATIENT_METADATA`, the ground-truth-named escape hatch; (c) the modifier tables and composite arithmetic, which fit nothing — see Alternative pathways.

7. **Two orders on the screen have no order path at all. Large.** ABPM/home BP series (blocks the entire group B and is the top-priced gate at 65 %) and 12-lead ECG / Holter (the only route to settling P3). Junction is labs-only; FHIR ServiceRequest has no create. Either route them through SDK `Refer` / `Perform`, or stop pricing them as if they were orderable.

8. **Vitality PROs have no Canvas home. Medium.** `energy 4 of 10`, `clarity 4 of 10`, `activity low` feed P1 and P3 and live only in Aleron. Write them as `QuestionnaireResponse` (create/read/update all supported). This is the cheapest fix on the list and it removes a real patient-data-residency violation.

9. **Group D asserts four negatives from data with no confirmed read path. Medium.** Genomics has no resource in the verified matrix and FamilyMemberHistory is not in it either. Until both reads are verified, `not fired` should read `not assessed`, which is the opposite claim.

10. **Confidence has two vocabularies and no scale. Small.** `Moderate confidence` in the meaning strip; `medium` / `high` / `low` on the pattern cards. Pick one and state what produces it.

11. **`Data rows 47` and `run 3f9c1a20` are pipeline facts on a product surface. Small.** BRIEF's "internal pipeline" test: the physician acts on neither. Either give the run id a date so it becomes a staleness signal, or take both off. `patient_packet.v1` and `risk_envelope.v2` sit closer to the line but are inside a collapsed provenance disclosure, which is defensible.

12. **The screen has no fixture object. Medium.** 146 values are hardcoded across 953 lines of markup, in direct violation of the BRIEF's data-model rule. Every value in this audit had to be located by reading HTML. Nothing can be wired to an API until they live in one object.

---

## Alternative pathways

**Row 7-10 · four unmodelled domain scores (WRONG).** Drop the value and the band; print `model provenance pending` in the rail cell, which is a real reference-surface string and already what the evidence block says. Cost: the rail loses its at-a-glance triage value for four of six domains, which is the honest state of the product. No API work.

**Row 9 · Cancer `4 engines` (WRONG).** Same fix. If the engine count matters to someone it belongs in the evidence disclosure, not in the score column.

**Row 55 / 61 / 111 · coefficient table vs reported figure (WRONG).** Import and print the male 30-yr **ASCVD** coefficient table. Cost: one more coefficient table in the engine, and the "four tables" line becomes twelve. No external API involved — this is entirely Aleron-owned.

**Row 64 · `four tables` (WRONG).** Corrected by the above.

**Row 68 / 101 · A6 firing on one draw (WRONG).** If the rule stands, A6 does not fire, group A composite drops from 1.39× to 1.11×, the composite modifier drops from 1.835 to 1.47, and the phenotype-adjusted figure drops from 29.4 % to 23.5 % — which lands in a different band and changes the finding in row 98. Worth checking that the demo's headline argument survives the fix.

**Row 51 · social deprivation index (NONE).** Correct as declared. If Aleron ever wants it: geocode `Patient.address` (Canvas FHIR:Patient read) against a public ADI file held by Aleron. That is Aleron holding a derived patient attribute — a residency violation unless it is written straight back with `UPSERT_PATIENT_METADATA` and never retained. Cheapest answer is to keep printing `not emitted` and never unlock the enhanced predictor set.

**Row 74-76, 99 · ABPM / nocturnal dip / home cuff series (NONE).** Three routes, in order of preference. (a) **Aleron collects it**: the member app captures 14 home-cuff readings in 30 days, and each is pushed with SDK `VitalSignReading` (`originate` + `commit`) so it lands in Canvas and Aleron retains nothing. This unlocks B1 but not B2/B3, which need a night series. (b) **Redirect into Canvas**: SDK `Refer` command to a hypertension service, `originate()` then `sign()` — both supported on `Refer`, so this can complete without leaving Aleron. Nothing returns to Aleron; the consult note lands in the chart. (c) **Drop group B entirely** and stop printing four `no data submitted` rows plus a `neutral by absence` composite for a group that can never fire. Option (a) plus a narrowed group B is the honest version.

**Row 104, 145, 149 · 12-lead ECG, Holter, patch (NONE).** (a) If done in clinic: SDK `Perform` command with the ECG CPT code, originate + commit. (b) If not: SDK `Refer` to cardiology, originate + sign. Neither returns data to Aleron, so P3 stays open on this surface until the report lands in Canvas and Aleron reads it back as a `DiagnosticReport` (read ✓). Say that on the screen — the physician needs to know the pattern will not close itself. **Return leg:** there is none for the `Refer` path; ground truth §6 flags deep-linking back into Canvas as undrawn. The physician acts inside Canvas and comes back to Aleron by browser history or the rail's `Open in Canvas ↗` in reverse, which is not a mechanism.

**Row 130 · home sleep apnea test (GAP, no path).** STOP-BANG is fine: SDK `Questionnaire` command or FHIR `QuestionnaireResponse` create. HSAT: SDK `Refer` to sleep medicine, originate + sign. Do **not** attempt it through Junction — ground truth §5 states the scope limit explicitly (labs only, no imaging, no referrals). Cost: the 35 % odds figure prices a gate whose result never comes back to Aleron automatically.

**Row 138 · FibroScan and resmetirom (GAP).** FibroScan: SDK `ImagingOrder`, originate + sign, both supported. Resmetirom: SDK `Prescribe`, **originate only — the command does not support `sign()`**. The physician is redirected into Canvas to sign, gated by Surescripts SPI on the prescriber. **Return leg: undrawn.** Also note the ground-truth trap: `originate(commit=True)` is silently ignored for order commands, so a naive implementation leaves a staged command nobody signed, with no error.

**Row 71 · omega-3 index (GAP).** Junction `POST /v3/order` with the appropriate `lab_test_id` in `order_set`. Requires `patient_details` (name, dob, gender, phone, email) and `patient_address` with a 5-digit zip — all readable from Canvas FHIR:Patient. Or drop A8: it is the only group-A modifier with no route offered and it is absent from the Information gaps table.

**Rows 6, 16-17, 20, 96 · engine scores and bands (GAP, no home).** SDK `CREATE_OBSERVATION` for the score, `UPDATE_OBSERVATION` on re-run. FHIR Observation is create-only with no update, so the FHIR route strands the first score forever. If the physician should see the score inside Canvas rather than only in Aleron, pair it with `ADD_OR_UPDATE_PROTOCOL_CARD` or `PATIENT_CHART_SUMMARY__CUSTOM_SECTION`. Cost: an unvalidated risk score becomes a chart Observation, which will be read as clinical data by anyone downstream who does not know its provenance.

**Rows 56-57, 106-110, 121 · model ids, run ids, packet and schema versions (GAP).** `UPSERT_PATIENT_METADATA` — the ground truth names engine run ids as exactly the case this exists for. Flat key/value, so `risk.cvd.run_id`, `risk.cvd.run_at`, `risk.cvd.model`, `risk.cvd.schema` all fit. No Custom Data Model needed. Cheapest item on this page.

**Rows 66-92 · the A-D modifier tables, 19 rows with multiplier, effect and citation (GAP).** These do not fit metadata: it is flat key/value and this is a nested, ordered, per-run table. Three options. (a) **Attach to a note**: `UPSERT_NOTE_METADATA` on the note the risk panel produced, plus `upsert_custom_html()` (available on every command) to render the table inside Canvas. (b) **Custom Data Models** (`CustomModels` / `AttributeHubs`) — correct shape, heaviest build. (c) **Do not store it**: treat the modifier layer as a view over inputs that Aleron recomputes on demand and never persists. (c) is the only option that keeps Aleron storing nothing, and it is compatible with everything else here as long as the inputs are all readable from Canvas — which today they are not (genetics, family history, PROs).

**Rows 99-104, 131 · reclassification odds and QALY figures (GAP).** No Canvas resource holds a probability-of-reclassification or a QALY. Same three options as above; (c) recompute-on-demand is right, since these are pure functions of the posterior and change on every run anyway.

**Rows 114-122, 125-151 · the Systemic narrative and three patterns (GAP).** The screen labels the whole pass `unverified narrative`. Writing unverified narrative into the chart as `CREATE_NOTE` + `SIGN_NOTE`, or as a `DocumentReference`, gives it the standing of a clinical note — and `DocumentReference` **has no update**, so an amendment is a second immutable resource. Keep it Aleron-side as a view, or promote individual patterns to `Assess` / `Diagnose` commands only after a physician acts on them. The chips (rows 132, 139, 146) are the right idea and belong on the variables ledger, where the sourcing question actually bites.

**Row 129, 144 · Vitality PROs (GAP).** FHIR `QuestionnaireResponse`, create/read/update all supported. Aleron defines the instrument, posts each response, reads it back. Removes the residency violation and makes `energy 4 of 10` verifiable in chart review, which is what row 27 already promises.

**Rows 88-91 · genetics and family history (GAP).** Verify against live docs before designing around either. If genomics arrives only as a `DocumentReference` PDF, group D cannot assert any negative and the honest render is `not assessed` on all four rows. If FamilyMemberHistory has no read, the same applies to D7-D9, and the SDK `FamilyHistory` command becomes the only way structured family history exists — meaning Aleron must have written it first.

**Row 2 · `AL-47M` (GAP).** SDK `CREATE_PATIENT_EXTERNAL_IDENTIFIER` puts the Aleron program id in Canvas so both systems can name the same patient. Otherwise the id lives only in Aleron.

**Row 5 · `Dr. A. Okafor` (GAP).** No API fix. Canvas has no just-in-time provisioning, so the Canvas user must be created before SSO works. This is a provisioning runbook item, not a design one, but every command on every screen in this set fails without it.

---

## Contradictions with what the screen already claims

**The evidence block convicts the rail.**

> "Metabolic, Neuro, Cancer and Kidney all carry `model provenance pending`. Cardiovascular is the only domain whose baseline model is materialised, which is why this panel opens first."

Four rail cells above it read `34 %` / `high`, `~5 %` / `moderate`, `moderate`, `~3 %` / `low`. The `high` is a filled hazard tile. A screen cannot say a model is not materialised and print its output as a hazard in the same view.

**A6 contradicts A6.**

> "A6 · hs-CRP at or above 2.0 mg/L on **two or more measurements** — ↑ 1.25×"

> "The A6 tier requires **two or more measurements** above 2.0 mg/L. **One draw** of 3.0 mg/L cannot separate chronic inflammation from an acute phase."

One of these is wrong, and the answer changes 1.39× → 1.11×, 1.835 → 1.47, 29.4 % → 23.5 %, and the band-disagreement finding in Step 3.

**The coefficient table contradicts the number it is meant to explain.**

> "Base P — 16.0 % at the 30-yr ASCVD endpoint"

> "β, **male 30-yr total CVD**"

> "Coefficients are fixture-validated against the AHA PREVENT online calculator. That validation is the acceptance gate."

The printed β against the printed centered values gives 0.2976. Not 0.160.

**Three counts of the same thing.**

> "Phenotype modifiers remain separate from the **six PREVENT endpoints**."

> "The engine ships **four tables**, sex by horizon."

Sex × horizon × endpoint is at least twelve.

**Chart review is promised without a write.**

> "The current fields the physician can verify in chart review."

True only if the Junction biomarkers were pushed with `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS`. Nothing on the screen or in the annotations says they were.

**The engine's own honesty standard is not applied to itself.**

> "An unassessed risk is not a low risk."

Kidney reads `~3 %` `low` from a model the same screen says is not materialised.

**The most-priced gate is missing from the gaps table.**

> "those three are what the action map sequences first"

> "Scored on the action map at 35 % reclassification odds" (P1, the sleep gate)

The Information gaps table lists BP series, OGTT, hs-CRP, FIB-4, UACR and ECG. The sleep test is not in it.

**The annotations claim a fidelity the file does not have.**

> "the real AHA PREVENT formula, the real male 30-yr coefficient table"

The formula and the centering are correct and I verified the centered values to 4 dp. The table is real but it is the wrong endpoint for the figure beside it.

**One claim the annotations get right and the audit confirms:** the group letters. The annotation says v0's `portal.js` labels C as genetic and v2 uses the engine's `MetabolicGlycemicDomain` / `GeneticFamilialDomain`. The rendered groups match the engine. Good catch, correctly carried.

---

## Open questions for the humans

1. Is the reported 16.0 % the ASCVD endpoint or the total-CVD endpoint? The label says one, the coefficient table says the other, and the number matches neither cleanly. Note that the value the printed coefficients actually produce, 29.8 %, is within rounding of the 29.4 % "phenotype-adjusted" figure — was the fixture built backwards from that?
2. Is `2.7 % 10-yr total CVD` right for a 47-year-old man with SBP 142, TC 205, HDL-C 40, non-diabetic, never-smoker? It reads low. Outside my API brief, but it sits in the headline.
3. AHA PREVENT's 30-year equations are published for ages 30-59; the ledger states the admitted domain as `30 to 79 yr`, which is the 10-year window. Which frame is the engine enforcing?
4. Does A6 fire on one hs-CRP draw or two? This changes the composite and the demo's central finding.
5. How does Aleron read a P/LP variant list from Canvas — a genomics-profile `Observation`, a `MolecularSequence`, or a PDF `DocumentReference`? If it is the PDF, group D's four `not fired` rows are unsupported and the ATM required channel has no machine-readable source.
6. Does Canvas FHIR expose `FamilyMemberHistory` for read? It is absent from the verified matrix and D7-D9 depend on it.
7. Are Junction biomarker results actually pushed into Canvas with `CREATE_LAB_REPORT`, or does Aleron read them straight from Junction? The whole "verify in chart review" claim, and the `Measured once` count, turn on this.
8. What is the Junction field path for overnight RHR, RMSSD, SpO₂ nadir and VO₂max? Five modifiers and two of the three Systemic patterns depend on them and none is in ground truth.
9. Is waist circumference a supported Canvas `VitalSignReading` type? It feeds C2, P1 and P2.
10. Where should Vitality PROs live? `QuestionnaireResponse` is available and free; is there a reason it is not already the destination?
11. What re-runs the engine, and what tells the physician the panel is 71 days old? `CronTask` plus `ADD_BANNER_ALERT` is the obvious shape; is anything built?
12. Do `patient_packet.v1`, `risk_envelope.v2`, `3f9c1a20` and `Data rows 47` pass BRIEF's "does the physician act on this?" test, or are they the internal-pipeline failure mode in a collapsed disclosure?
13. Should the source chips (`overnight oximetry`, `fasting labs`, `patient-reported outcome`) move from the three narrative pattern cards onto the twelve-row variables ledger, where input provenance is the actual open question?
