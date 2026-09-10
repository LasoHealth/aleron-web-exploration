# v2/risk-actions.html

**Screen purpose:** Prices every therapy, lifestyle lever and diagnostic the five risk models expose on one patient-QALY-versus-confidence surface, then offers a one-click "Send to care plan" on each ledger row.

**Data points audited:** 178 — OK 154, GAP 8, WRONG 10, UNVERIFIED 6, NONE 0

(No data point sources to `NONE`; the `NONE` findings are all in the Action reachability table, where 6 acts have no reachable API surface.)

Scope note: the file carries no `<script>`. All values are hardcoded fixtures in markup. `wf-scaffold` / `wf-ex__bubble` content (including the `.pfoot` at line 778) is excluded per instructions; `wf-annotations` were read and are answered in the Contradictions section.

One dependency is not covered by `docs/canvas/API-GROUND-TRUTH.md` (in `Meridian-Web`) and was verified live, marked `newly verified` below: Junction's lab catalogue is **marker-based** — `GET /v3/lab_tests/markers` (searchable by lab or name, with a `lab_slug` filter) and `GET /v3/lab_tests/labs` (returns `collection_methods`, `sample_types`). Source: https://docs.junction.com/api-reference/lab-testing/labs and https://docs.junction.com/changelog/lab-testing/api. This matters because an order is composed of **markers**, not of procedures.

---

## Data points

### A. Rail, patient identity, actor

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 1 | `EP` avatar initials | Derived | OK | From `Canvas FHIR:Patient.name`. |
| 2 | `Ethan Park` | Canvas FHIR:Patient | OK | `.name`. |
| 3 | `AL-47M · 47M` | Canvas FHIR:Patient | OK | Age from `.birthDate`, sex from `.gender`. `AL-47M` is an Aleron-side MRN; carry as `Patient.identifier` or `CREATE_PATIENT_EXTERNAL_IDENTIFIER`. |
| 4 | `Dr. A. Okafor` (rail foot actor) | Canvas FHIR:Practitioner / Aleron session | OK | Entra/SAML identity. No JIT provisioning in Canvas, so this practitioner must pre-exist or every command on this screen has no one to attribute. |
| 5 | Route `aleron.md/chart/AL-47M/risk/actions` | Aleron | OK | Desk-chrome, product-owned. |

### B. Header

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 6 | "Five disease models read the packet" (count: five) | Aleron | OK | Matches the fixture's five domains. |

### C. Action map — axes, frame, zones

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 7 | Y ticks `+5.0 / +4.0 / +3.0 / +2.0 / +1.0 / 0 / −0.5` | Aleron | OK | Signed patient-QALY scale. Geometry verified: 73 px per QALY, zero at y=449. |
| 8 | Y axis title `patient QALY ↑` | Aleron | OK | Unit stated. |
| 9 | X ticks `0 / 0.2 / 0.4 / 0.6 / 0.8 / 1.0` | Aleron | OK | 834 px per 1.0 confidence, origin x=86. |
| 10 | X axis caption `evidence confidence score · continuous 0-1 axis; categorical words are labels only` | Aleron | OK | P7 frame stated in place. |
| 11 | `act floor 0.67` line at x=645 | Aleron | OK | Geometry exact (86 + 0.67 × 834 = 644.8). Engine constant, not patient data. |
| 12 | Value frame `actions plot net · diagnostics plot value if reclassified` | Aleron | OK | |
| 13 | `net harmful` band (ember tile) and the sub-zero wash | Derived | OK | Purely `QALY < 0`. |
| 14 | aria-label: "22 scored actions, 6 diagnostics and the three-rung VO₂max ladder" | Aleron | OK | Verified against the markup: 22 circles, 6 squares, 3 rungs. |
| 15 | Legend: action / diagnostic / gated / candidate signal / net-harmful zone / VO₂max ladder | Aleron | OK | Shape encodes category per P2. |

### D. Action map — action marks (22 circles)

Each row covers the mark's **name, QALY figure, confidence value and gate condition** as carried in its `<title>`. All four are SPAR engine output over the packet, so `Source` is `Aleron` throughout; the Verdict is about whether the plotted claim survives. **Y-geometry was checked for all 22 and is exact to ±3 px.**

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 16 | Bariatric metabolic surgery · +2.80 QALY if eligible · conf 0.82 · gated on BMI 30 or incident T2D | Aleron | OK | x=770 exact for 0.82. |
| 17 | Tirzepatide · +1.90 QALY net · conf 0.58 | Aleron | OK | Drawn x=544; true 0.58 → x=570. Declared nudge. |
| 18 | Retatrutide · +1.80 QALY net · conf 0.35 · surrogate endpoint | Aleron | **WRONG** | Plotted as an act. Retatrutide is investigational; no dispensable product, so no FDB code and no `Prescribe`. See reachability row. |
| 19 | CagriSema · +1.60 QALY net · conf 0.35 · surrogate endpoint | Aleron | **WRONG** | Same. Investigational, no FDB code. |
| 20 | Semaglutide 2.4 mg · +1.25 QALY net · conf 0.58 | Aleron | OK | Nudged to x=596. |
| 21 | Supervised resistance training · +1.15 QALY net · conf 0.58 | Aleron | OK | Nudged 50 px (≈0.06 confidence). "A few units" understates it. |
| 22 | Resmetirom · +0.88 QALY if indicated · conf 0.58 · gated on FIB-4 then FibroScan | Aleron | OK | |
| 23 | Orforglipron · +0.85 QALY net · conf 0.35 · surrogate endpoint | Aleron | UNVERIFIED | Oral GLP-1 whose approval status determines whether an FDB code exists. If unapproved at ship, same defect as 18/19. |
| 24 | Acarbose in impaired glucose tolerance · +0.46 QALY net · conf 0.38 | Aleron | OK | x=403 exact. |
| 25 | Liraglutide · +0.44 QALY net · conf 0.82 | Aleron | OK | x=770 exact. |
| 26 | Diabetes Prevention Program lifestyle · +0.35 QALY net · conf 0.62 | Aleron | OK | x=603 exact. |
| 27 | Mediterranean dietary pattern · +0.24 QALY net · conf 0.58 | Aleron | OK | |
| 28 | Alcohol reduction · +0.21 QALY net central estimate · conf 0.58 · gated on quantified intake | Aleron | **WRONG** | Drawn at x=648. Confidence 0.58 belongs at x=570. The cosmetic nudge carries it **across the act floor at x=645**, so a below-floor lever renders above the floor. The nudge changes the reading. |
| 29 | Physical activity prescription · +0.20 QALY net · conf 0.58 | Aleron | OK | |
| 30 | SGLT2 inhibitor · +0.08 QALY net · conf 0.35 · gated on incident T2D, heart failure or albuminuria | Aleron | OK | Gate is readable: `Condition` search + UACR observation (fixture UACR 14 mg/g). |
| 31 | Metformin for prevention · +0.03 QALY net · conf 0.65 | Aleron | OK | x=628 exact; correctly left of the act floor. |
| 32 | Influenza vaccine · +0.03 QALY net · conf 0.58 | Aleron | OK | Only immunization on the board. Becomes `Immunize`, not `Prescribe`. |
| 33 | Statin, primary prevention · +0.02 QALY net · conf 0.68 | Aleron | OK | x=653 exact; correctly right of the act floor. |
| 34 | Low-dose colchicine · −0.01 QALY net · conf 0.58 | Aleron | OK | |
| 35 | PCSK9 inhibitor · −0.02 QALY net · conf 0.82 | Aleron | OK | |
| 36 | Aspirin, primary prevention · −0.12 QALY net · conf 0.35 | Aleron | OK | x=378 exact. |
| 37 | Canakinumab · −0.14 QALY net · conf 0.82 | Aleron | OK | |

### E. Action map — diagnostic marks (6 squares)

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 38 | Home or ambulatory BP confirmation · 65 % reclass odds · +0.63 QALY | Aleron | OK | Values fine; the *act* is the problem — see reachability. |
| 39 | 75 g 2-hour OGTT · 4 % · +0.85 QALY | Aleron | OK | |
| 40 | FIB-4 then FibroScan · 20 % · +0.70 QALY | Aleron | OK | Two acts in one mark; they route differently. |
| 41 | Coronary artery calcium score · 25 % · +0.75 QALY | Aleron | OK | Drawn heavier (9 px) as highest-value reclassification. |
| 42 | Home sleep apnea test · 35 % · +0.45 QALY | Aleron | OK | |
| 43 | 12-lead ECG then patch or Holter · 15 % · +0.40 QALY · AI-scored candidate | Aleron | OK | Indigo dashed per P7. |
| 44 | Diagnostic **confidence** (encoded only by x-position: BP ≈0.82, OGTT ≈0.58, FIB-4 ≈0.55, CAC ≈0.51, HSAT ≈0.61, ECG ≈0.64) | Aleron | **GAP** | No diagnostic confidence appears in either ledger. Contradicts the screen's own note at line 336, "the ledger below carries the exact value for every mark." |

### F. VO₂max ladder

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 45 | `VO₂max →33 · +2.43 QALY` | Aleron | OK | Matches BRIEF fixture. y=272 exact. |
| 46 | `VO₂max →38 · +4.17 QALY` | Aleron | OK | y=145 exact. |
| 47 | `VO₂max →43 · +5.37 QALY` | Aleron | OK | y=57 exact. |
| 48 | Ladder confidence 0.58 (x=570) | Aleron | OK | Matches BRIEF; not labelled on the instrument, only positional. |

### G. Selection and gate tether

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 49 | Gold selection ring on bariatric metabolic surgery | Aleron | OK | UI state. |
| 50 | Tether `unlocks on result` from bariatric (770,245) to OGTT (570,387) | Aleron | OK | Geometry lands exactly on the OGTT square centre. |
| 51 | Nudge disclosure note: "Marks that share an evidence confidence score are nudged a few units apart… the nudge is cosmetic" | Aleron | **WRONG** | Largest nudge is 78 px ≈ 0.094 confidence (alcohol reduction) and it crosses a decision line. Not "a few units" and not cosmetic. |

### H. Evidence ledger — filter tabs

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 52 | `All 28` | Derived | OK | 22 circles + 6 squares = 28. Consistent. |
| 53 | `Diagnostics 6` | Derived | OK | |
| 54 | `Therapies 14` | Derived | **WRONG** | 22 circles minus 5 lifestyle circles = 17 non-lifestyle marks, not 14. |
| 55 | `Lifestyle 8` | Derived | **WRONG** | Only 5 lifestyle circles exist (resistance training, DPP, alcohol reduction, Mediterranean, physical activity). 8 only works if the 3 ladder rungs are counted, but then the total is 31, not 28, and Therapies cannot be 14. |

### I. Evidence ledger — All tab, 15 rows

Each row is split into row identity + provenance line, patient value cell, and status chip. The **Decision-logic column** is batched at #101 because every one of the 15 cells is engine narrative with the same source and verdict.

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 56 | Bariatric metabolic surgery — `Procedure · metabolic · strong evidence · selected on the map` | Aleron | OK | Evidence tier is Aleron library. |
| 57 | `+2.80 QALY` / `net, if eligible` | Aleron | OK | |
| 58 | Status `gated` | Derived | OK | From BMI 29.4 vs 30 threshold. |
| 59 | Home or ambulatory BP confirmation — `Diagnostic · cardiovascular · strong evidence` | Aleron | OK | |
| 60 | `+0.63 QALY` / `if reclassified · odds 65 %` | Aleron | OK | |
| 61 | Status `reclass gate` | Aleron | OK | |
| 62 | Tirzepatide — `Drug · metabolic · moderate evidence · weight effect −21 %` | Aleron | OK | Literature constant, no patient data. |
| 63 | `+1.90 QALY` / `net` | Aleron | OK | |
| 64 | Status `actionable` | Derived | **GAP** | "Actionable" implies Aleron can complete the act. `Prescribe` has no `sign()`. See reachability. |
| 65 | VO₂max →38 mL/kg/min — `Fitness course · rung 2 of 3 · moderate evidence` | Aleron | OK | |
| 66 | `+4.17 QALY` / `net, at +10 mL/kg/min` | Aleron | OK | Unit stated on the delta. |
| 67 | Status `actionable` | Aleron | OK | Becomes a `Goal`; genuinely completable. |
| 68 | Supervised resistance training — `Lifestyle · metabolic and musculoskeletal · moderate evidence` | Aleron | OK | |
| 69 | `+1.15 QALY` / `net` | Aleron | OK | |
| 70 | Status `actionable` | Aleron | OK | "Supervised" implies a `Refer`, which is signable. |
| 71 | 75 g 2-hour OGTT — `Diagnostic · metabolic · moderate evidence · unlocks the selected mark` | Aleron | OK | |
| 72 | `+0.85 QALY` / `if reclassified · odds 4 %` | Aleron | OK | |
| 73 | Status `reclass gate` | Aleron | OK | |
| 74 | Coronary artery calcium score — `Diagnostic · cardiovascular · moderate evidence` | Aleron | OK | |
| 75 | `+0.75 QALY` / `if reclassified · odds 25 %` | Aleron | OK | |
| 76 | Status `reclass gate` | Aleron | OK | |
| 77 | FIB-4, then FibroScan if indicated — `Diagnostic · hepatic and metabolic · moderate evidence` | Aleron | OK | |
| 78 | `+0.70 QALY` / `if reclassified · odds 20 %` | Aleron | OK | |
| 79 | Status `reclass gate` | Aleron | OK | |
| 80 | Resmetirom — `Drug · hepatic · moderate evidence · histologic surrogate` | Aleron | OK | |
| 81 | `+0.88 QALY` / `net, if indicated` | Aleron | OK | |
| 82 | Status `gated` | Aleron | OK | Gate is a FibroScan stage; not readable back from Canvas as structured data (see #163). |
| 83 | Home sleep apnea test — `Diagnostic · sleep, blood pressure and vitality · moderate evidence` | Aleron | OK | |
| 84 | `+0.45 QALY` / `if reclassified · odds 35 %` | Aleron | OK | |
| 85 | Status `reclass gate` | Aleron | OK | |
| 86 | 12-lead ECG, then patch or Holter — `Diagnostic · rhythm and safety · AI-scored candidate` | Aleron | OK | |
| 87 | `+0.40 QALY` / `if reclassified · odds 15 %` | Aleron | OK | |
| 88 | Status `candidate` | Aleron | OK | |
| 89 | Alcohol reduction — `Lifestyle · cardiovascular and hepatic · moderate evidence` | Aleron | OK | |
| 90 | `+0.21 QALY` / `net, central estimate` | Aleron | OK | |
| 91 | Status `gated` | Derived | OK | Gate = absence of a recorded intake answer; readable via `Canvas FHIR:QuestionnaireResponse` search. |
| 92 | Statin, primary prevention — `Drug · cardiovascular · strong evidence · relative risk reduction 21 %` | Aleron | OK | |
| 93 | `+0.02 QALY` / `net` | Aleron | OK | |
| 94 | Status `actionable` | Derived | **GAP** | Same as #64. |
| 95 | Aspirin, primary prevention — `Drug · cardiovascular · weak evidence` | Aleron | OK | |
| 96 | `−0.12 QALY` / `net` | Aleron | OK | |
| 97 | Status `net harm` (ember tile) | Derived | OK | P3-conformant. |
| 98 | Canakinumab — `Drug · cardiovascular · strong evidence` | Aleron | OK | |
| 99 | `−0.14 QALY` / `net` | Aleron | OK | |
| 100 | Status `net harm` | Derived | OK | |
| 101 | Decision-logic column, all 15 cells | Aleron | OK | Engine narrative. No API dependency beyond the patient values called out at 102-104. |
| 102 | Embedded: `BMI 30 … He is 29.4` (bariatric row) | Canvas FHIR:Observation | OK | Body-mass-index observation, read-only path is fine. |
| 103 | Embedded: `hs-CRP 3.0 mg/L` (canakinumab row) | Junction:BiomarkerResult.value / Canvas FHIR:Observation | OK | Either path; `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS` if it arrived via Junction. |
| 104 | Embedded: `F2 to F3 MASH` (resmetirom row) | Canvas FHIR:Condition | UNVERIFIED | Fibrosis stage is not a Condition code Canvas necessarily carries with stage granularity; likely lands as free text in a note. |
| 105 | Disabled `Send to care plan` on the two net-harm rows, with the reason in `title` | Aleron | OK | Correct refusal; the override lives in Care Plan. |
| 106 | "Fifteen of twenty-eight rows shown. The remaining thirteen sit below the 0.05 QALY patient-value threshold" | Derived | **WRONG** | Three shown rows are below 0.05 (statin +0.02, aspirin −0.12, canakinumab −0.14) and most unshown ones are far above it (semaglutide +1.25, retatrutide +1.80, CagriSema +1.60, orforglipron +0.85, acarbose +0.46, liraglutide +0.44, DPP +0.35). The count is also wrong: only 14 of the shown 15 belong to the 28 (the VO₂max rung does not), so 14 remain, not 13. |

### J. Evidence ledger — Diagnostics tab, 6 rows

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 107 | Subhead "Six scored diagnostics" | Derived | OK | Matches. |
| 108 | Home or ambulatory BP confirmation — `strong evidence · internal value of information 0.4045` | Aleron | **WRONG** | 0.65 × 0.63 = 0.4095, not 0.4045. Also unitless and four significant figures on a product surface. |
| 109 | `65 %` reclass odds | Aleron | OK | |
| 110 | `+0.63 QALY` | Aleron | OK | |
| 111 | Home sleep apnea test — `moderate evidence · internal value of information 0.1575` | Aleron | OK | 0.35 × 0.45 = 0.1575, exact. |
| 112 | `35 %` | Aleron | OK | |
| 113 | `+0.45 QALY` | Aleron | OK | |
| 114 | Coronary artery calcium score — `moderate evidence · internal value of information 0.1875` | Aleron | OK | 0.25 × 0.75 = 0.1875, exact. |
| 115 | `25 %` | Aleron | OK | |
| 116 | `+0.75 QALY` | Aleron | OK | |
| 117 | FIB-4, then FibroScan — `moderate evidence · internal value of information 0.13` | Aleron | **WRONG** | 0.20 × 0.70 = 0.14. |
| 118 | `20 %` | Aleron | OK | |
| 119 | `+0.70 QALY` | Aleron | OK | |
| 120 | 12-lead ECG, then patch or Holter — `moderate evidence · internal value of information 0.05 · AI-scored candidate` | Aleron | **WRONG** | 0.15 × 0.40 = 0.06. Also: this row says `moderate evidence`, while the All tab (#86) and the map `<title>` give the same item weak-evidence framing as an "AI-scored candidate", and the pipeline card (#137) labels the same signal `rhythm · weak evidence`. Three labels, one item. |
| 121 | `15 %` | Aleron | OK | |
| 122 | `+0.40 QALY` | Aleron | OK | |
| 123 | 75 g 2-hour OGTT — `moderate evidence · internal value of information 0.034` | Aleron | OK | 0.04 × 0.85 = 0.034, exact. |
| 124 | `4 %` | Aleron | OK | |
| 125 | `+0.85 QALY` | Aleron | OK | |
| 126 | "Decision changed" column, all 6 cells | Aleron | OK | Engine narrative. |
| 127 | Label `internal value of information` as a physician-facing term | Aleron | **GAP** | Engine vocabulary and an engine internal. The physician acts on the odds and the QALY, both already in adjacent columns; they do not act on the product of the two to four decimal places. BRIEF's "what does the physician do with this?" test fails. |

### K. AI candidate pipeline — 4 cards

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 128 | Card 1 title "Nocturnal bradycardia needs a rhythm check" | Aleron | OK | |
| 129 | Tag `rhythm · weak evidence` | Aleron | OK | Conflicts with #120, see there. |
| 130 | Chip `scored` | Aleron | OK | |
| 131 | Pattern recognised: `overnight resting heart rate 38 bpm`, `VO₂max 28 mL/kg/min` | Junction:device data | UNVERIFIED | The Devices/Wearables group exists; the exact field paths for overnight RHR and VO₂max are not in the ground truth. Confirm against Junction Sense result tables before building. |
| 132 | Scored candidate: `12-lead ECG, then patch or Holter with overnight oximetry if persistent` · `15 % odds` · `+0.40 QALY` | Aleron | OK | Values consistent with the map. |
| 133 | Map status: "Placed on the action map with AI provenance. Indigo and dashed, per P7." | Aleron | **GAP** | "Indigo and dashed, per P7" names a design-system rule to the physician. It is chrome vocabulary on a product surface, same class of leak as #127. |
| 134 | Data used: `overnight HR 38 bpm · VO₂max 28 mL/kg/min · activity low · SpO₂ nadir 89 %` | Junction:device data | UNVERIFIED | Same as #131. `activity low` is a derived band with no stated threshold. |
| 135 | AI provenance strip (card 1) | Aleron | OK | Model, run and confidence basis have no Canvas home; `UPSERT_NOTE_METADATA` is the cheap store if this must persist. |
| 136 | Card 2 title "MASLD fibrosis stage unknown" | Aleron | OK | |
| 137 | Tag `hepatic · moderate evidence` | Aleron | OK | |
| 138 | Chip `scored` | Aleron | OK | |
| 139 | Pattern recognised: `triglycerides 180 mg/dL`, `HOMA-IR 4.3`, `hs-CRP 3.0 mg/L`, central adiposity | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | HOMA-IR is `Derived` (glucose × insulin / 405), not a reported marker. |
| 140 | Scored candidate: `AST, ALT, platelets, FIB-4, then FibroScan if indicated` · `20 % odds` · `+0.70 QALY` · `Range 0.30 to 1.50` | Aleron | OK | Two different acts bundled; see reachability. |
| 141 | Map status: "Placed. It also carries the gate on resmetirom…" | Aleron | OK | |
| 142 | Data used: `waist 105 cm · triglycerides 180 mg/dL · HOMA-IR 4.3 · hs-CRP 3.0 mg/L` | Canvas FHIR:Observation / Junction | OK | Waist circumference is a standard observation; confirm it is actually captured in this deployment. |
| 143 | AI provenance strip (card 2) | Aleron | OK | |
| 144 | Card 3 title "Sleep-disordered breathing signal" | Aleron | OK | |
| 145 | Tag `sleep · moderate evidence` | Aleron | OK | |
| 146 | Chip `scored` | Aleron | OK | |
| 147 | Pattern recognised prose | Aleron | OK | |
| 148 | Scored candidate: `STOP-BANG, then a home sleep apnea test, paired with oximetry if positive` · `35 % odds` · `+0.45 QALY` | Aleron | OK | STOP-BANG becomes a `Questionnaire` command; HSAT has no order act. |
| 149 | Map status: "Drawn as an ordinary diagnostic square because the library also carries it" | Aleron | OK | |
| 150 | Data used: `SpO₂ nadir 89 % · BMI 29.4 kg/m² · BP 142/90 mmHg · HOMA-IR 4.3 · VO₂max 28 mL/kg/min` | Mixed | UNVERIFIED | BMI/BP OK from `Canvas FHIR:Observation`; SpO₂ nadir and VO₂max are the wearable paths at #131. |
| 151 | AI provenance strip (card 3) | Aleron | OK | |
| 152 | Card 4 title "OGTT may reclassify prediabetes" | Aleron | OK | |
| 153 | Tag `cardiometabolic · moderate evidence` | Aleron | OK | |
| 154 | Chip `scored` | Aleron | OK | |
| 155 | Pattern recognised: `HbA1c 6.0 %`, `fasting glucose 110 mg/dL`, family history | Junction:BiomarkerResult / Canvas FHIR:Observation | OK | Family history via `Canvas SDK:FamilyHistory` command or FHIR `Condition`. |
| 156 | Scored candidate: `75 g 2-hour OGTT; repeat if diagnostic before an audited QALY` · `4 % odds` · `+0.85 QALY` · `Range 0.30 to 1.60` | Aleron | OK | |
| 157 | Map status: "Placed, and it is the gate tethered to the selected mark." | Aleron | OK | |
| 158 | Data used: `HbA1c 6.0 % · fasting glucose 110 mg/dL · HOMA-IR 4.3 · waist 105 cm` | Junction / Canvas FHIR:Observation | OK | |
| 159 | AI provenance strip (card 4) | Aleron | OK | |
| 160 | Closing note: "Only scored candidates enter the map… an unscored signal stays in this pipeline and never reaches a plan" | Aleron | OK | |

### L. Action-changing gates — 5 rows

| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| 161 | `75 g 2-hour OGTT` | Aleron | OK | |
| 162 | `4 % · +0.85 QALY` | Aleron | OK | Consistent with #39, #72, #124. |
| 163 | Releases: "Bariatric metabolic surgery, currently gated at BMI 29.4. Incident T2D would release it and would also flip SGLT2 from gated to actionable." | Derived | OK | Both gate reads are available: `Observation` (BMI) and `Condition` search (T2D). |
| 164 | Order state `not placed` | Derived | OK | Absence, joined across Junction (`resolve-user` by client id, then order list) and `Canvas FHIR:ServiceRequest` search (read is available). |
| 165 | `FIB-4, then FibroScan if indicated` | Aleron | OK | |
| 166 | `20 % · +0.70 QALY` | Aleron | OK | |
| 167 | Releases: "Resmetirom, gated on F2 to F3 MASH…" | Aleron | UNVERIFIED | The release condition is a FibroScan stage. Nothing in Canvas returns an elastography stage as structured data; the report lands as a `DocumentReference` or free text, so the gate cannot close automatically. |
| 168 | Order state `not placed` | Derived | OK | |
| 169 | `Home or ambulatory BP confirmation` | Aleron | OK | |
| 170 | `65 % · +0.63 QALY` | Aleron | OK | |
| 171 | Releases: "Antihypertensive therapy sequencing, and every group B modifier in the cardiovascular engine…" | Aleron | **GAP** | "group B modifier" is engine internals in front of a physician. Same class as #127. |
| 172 | Order state `proposed, awaiting review` | Aleron | **GAP** | No readable Canvas state corresponds. A staged (`originate` without commit) command is not yet a `ServiceRequest`, and FHIR `ServiceRequest` is read/search only, so Aleron cannot read back "I proposed this and nobody has acted". Needs `UPSERT_NOTE_METADATA` or Aleron storage. |
| 173 | `Home sleep apnea test` | Aleron | OK | |
| 174 | `35 % · +0.45 QALY` | Aleron | OK | |
| 175 | Releases: "Reorders the whole plan if positive…" | Aleron | OK | |
| 176 | Order state `proposed, awaiting review` | Aleron | **GAP** | Same as #172. |
| 177 | `Alcohol intake in drinks per day` · value `one question` | Aleron | OK | Honest non-numeric cell. |
| 178 | Order state `not asked` | Derived | OK | Absence of a `Canvas FHIR:QuestionnaireResponse`, provided an alcohol-intake questionnaire exists in the instance. |

---

## Action reachability

| Action as shown | Becomes which API act | Reachable by Aleron? | Redirect needed? | Note |
|---|---|---|---|---|
| Tirzepatide | `Canvas SDK:Prescribe` (fdb_code, sig, days_supply, quantity, refills, pharmacy, prescriber_id) | **Partly** — originate only, no `sign()` | **Yes** | Highest-value ungated lever on the board and Aleron cannot finish it. Surescripts SPI gates the signature and attaches to the prescriber, not to Aleron. |
| Semaglutide 2.4 mg | `Canvas SDK:Prescribe` | Partly — originate only | Yes | Same. |
| Liraglutide | `Canvas SDK:Prescribe` | Partly — originate only | Yes | Same. |
| **Retatrutide** | **NONE** | **No** | n/a | Investigational. No marketed product, so no FDB code, so `Prescribe` cannot be composed. Plotting it as an *action* rather than a horizon item is a category error. |
| **CagriSema** | **NONE** | **No** | n/a | Same. |
| Orforglipron | `Canvas SDK:Prescribe` if approved and FDB-coded | UNVERIFIED | Yes if reachable | Check FDB coverage before ship; if absent it joins the two rows above. |
| Acarbose | `Canvas SDK:Prescribe` | Partly — originate only | Yes | |
| Metformin for prevention | `Canvas SDK:Prescribe` | Partly — originate only | Yes | Off-label for prevention; sig and indication are the prescriber's, not Aleron's. |
| Statin, primary prevention | `Canvas SDK:Prescribe` | Partly — originate only | Yes | |
| SGLT2 inhibitor (gated) | `Canvas SDK:Prescribe` | Partly — originate only | Yes | Class name, not a product. `Prescribe` needs a specific `fdb_code`; the physician picks the molecule. The ledger row cannot pre-fill it. |
| Resmetirom (gated) | `Canvas SDK:Prescribe` | Partly — originate only | Yes | Specialty-pharmacy and REMS-adjacent; the gate (F2-F3 MASH) is not machine-readable, so the gate can never auto-open. |
| Low-dose colchicine | `Canvas SDK:Prescribe` | Partly — originate only | Yes | Net-harm; send is correctly refused on the row. |
| PCSK9 inhibitor | `Canvas SDK:Prescribe` | Partly — originate only | Yes | Class name again; also prior-auth (`Canvas FHIR:CoverageEligibilityRequest` create is available, response read). Net-harm, send refused. |
| Aspirin, primary prevention | `Canvas SDK:Prescribe` (OTC) or `Instruct` | Partly | Yes for Prescribe | Net-harm, send refused. `Instruct` is fully committable and needs no signature, so an OTC stop/start advice is reachable end to end. |
| Canakinumab | `Canvas SDK:Prescribe` | Partly — originate only | Yes | Buy-and-bill biologic; in practice this is a `Refer` to rheumatology, which *is* signable. Net-harm, send refused. |
| **Influenza vaccine** | `Canvas SDK:Immunize` (vaccine_id, lot_id, sig, consent_given) or `ImmunizationStatement`; `Canvas FHIR:Immunization` also has create | **Yes** — originate + commit, no signature required | No | The single most completable act on this board, and it is plotted at +0.03 QALY. |
| **Bariatric metabolic surgery** (gated) | `Canvas SDK:Refer` (referral_type, specialty, service_provider) | **Yes** — originate + **sign** | No | Clean. Also supports `delegate()`. The selected mark on the map is one of the two fully reachable acts on the screen. |
| Supervised resistance training | `Canvas SDK:Refer` (exercise physiology / PT) + `Canvas SDK:Goal` | **Yes** — Refer signs; Goal commits | No | "Supervised" is what makes it a referral rather than advice. |
| Diabetes Prevention Program lifestyle | `Canvas SDK:Refer` (to a recognised DPP) + `Goal` | **Yes** | No | |
| Mediterranean dietary pattern | `Canvas SDK:Goal` + `Canvas SDK:Instruct` | **Yes** | No | FHIR `Goal` is read-only; the SDK `Goal` command is the only write. |
| Physical activity prescription | `Canvas SDK:Goal` + `Instruct` | **Yes** | No | |
| Alcohol reduction (gated) | Gate: `Canvas SDK:Questionnaire` or `Canvas FHIR:QuestionnaireResponse` create. Action: `Goal` + `Instruct` | **Yes** | No | The screen is right that this is the cheapest gate: it is the only one that needs no order and no signature. |
| VO₂max ladder rung (→33 / →38 / →43) | `Canvas SDK:Goal` (`goal_statement` free text carries the target and unit; `due_date`, `priority`) | **Yes** for the goal. **Verification act: partly** | No for the goal | Re-measuring VO₂max is a CPET (`Perform`, cpt 94621, in-office only) or a `Refer` to exercise physiology, or a wearable estimate. Only one rung may enter a plan, and `Goal` has no field enforcing that — it is Aleron's job. |
| **Coronary artery calcium score** | `Canvas SDK:ImagingOrder` (image_code, diagnosis_codes, priority, service_provider) | **Yes** — originate + **sign** | No | The other fully reachable act. Highest-value diagnostic on the board and it is completable end to end. |
| **75 g 2-hour OGTT** | Intended: `Junction POST /v3/order`. Actually: **NONE via Junction** | **No via Junction; partly via Canvas** | Yes for the Canvas route | *newly verified*: Junction composes an order from **markers** (`GET /v3/lab_tests/markers`), with `collection_method` ∈ testkit / walk_in_test / at_home_phlebotomy / on_site_collection. A 2-hour OGTT is not a marker — it is a timed protocol with a 75 g glucose load and serial draws. No `collection_method` expresses "administer a load, draw at 0 and 120 minutes". Fallback is `Canvas SDK:LabOrder`, which has **no `sign()`** and where `originate(commit=True)` is silently ignored, so it also needs a redirect. |
| **FIB-4** | `Junction POST /v3/order` with AST, ALT and platelet markers; FIB-4 itself is `Derived` | **Yes** for the draw | No | Standard markers, on-catalogue. The score is arithmetic over the results plus age. |
| **FibroScan (transient elastography)** | Not imaging in the radiology sense; **`Canvas SDK:Refer` to hepatology/GI** | Partly | No, if routed as Refer | `ImagingOrder` requires an `image_code`; FibroScan bills as a medicine CPT (91200), not a radiology code, so whether the Canvas imaging catalogue accepts it is UNVERIFIED. Referral is the safe route and it signs. Bundling FIB-4 and FibroScan into one ledger mark hides that they are two acts on two different surfaces. |
| **Home or ambulatory BP confirmation** | **NONE** as an order | **No** | n/a | Junction is labs only. Not imaging, not a referral. Canvas has no DME or device-order command. The reachable substitute is `Canvas SDK:Instruct` (home readings, technique, schedule) + `Canvas SDK:FollowUp` or `Task`, with results returning as `VitalSignReading` commands or the `CREATE_OBSERVATION` effect. True 24-hour ABPM needs a `Refer`. The board's largest movable term is the one Aleron cannot order. |
| **Home sleep apnea test** | **NONE** as a device order | **No** | n/a | Same shape as ABPM. Reachable substitute is `Canvas SDK:Refer` to sleep medicine, which signs, plus `Questionnaire` for STOP-BANG. |
| **12-lead ECG** | `Canvas SDK:Perform` (cpt_code 93000) if done in office | **Yes** — originate + commit | No | |
| **Patch or Holter monitor** | **NONE** as a device order | **No** | n/a | `Refer` to cardiology is the substitute. Second bundled mark hiding two acts. |
| STOP-BANG questionnaire | `Canvas SDK:Questionnaire` (questionnaire_id, answers) | **Yes** if the instrument is loaded | No | UNVERIFIED that a STOP-BANG `questionnaire_id` exists in the instance. |
| Alcohol intake, drinks per day | `Canvas SDK:Questionnaire` or `Canvas FHIR:QuestionnaireResponse` create | **Yes** | No | |
| **"Send to care plan"** (every row) | The care plan itself: `Canvas FHIR:CarePlan` is **read/search only** | **No** as a CarePlan | n/a | The screen's central verb has no CarePlan write behind it. What it actually becomes is a set of `Goal` commands plus a `Plan` narrative command inside a note, plus the staged order commands above. Say that, or the button promises a resource that does not accept writes. |
| Order state "proposed, awaiting review" | No API act; it is a state | **No** | n/a | A staged command is invisible to FHIR until it commits. Needs `UPSERT_NOTE_METADATA`. |

---

## Required changes

1. **Three plotted "actions" are not prescribable.** Retatrutide and CagriSema are investigational; without a marketed product there is no FDB code and `Prescribe` cannot be composed. Orforglipron is unresolved. Move them to a separate, visibly non-actionable class (a horizon band, or an unmodeled-indigo treatment) or drop them. **Medium**: three marks, three ledger rows, one new legend entry.
2. **The board's two highest-odds diagnostics cannot be ordered.** Home/ambulatory BP confirmation (65 %, +0.63 QALY, the largest movable PREVENT term) and the home sleep apnea test (35 %, +0.45) are device orders. Junction is labs only, Canvas has no device-order command, and FHIR `ServiceRequest` has no create. Both currently render `proposed, awaiting review`, which asserts an act Aleron cannot perform. Re-express both as `Instruct` + `FollowUp` (home BP) and `Refer` to sleep medicine (HSAT). **Large**: changes the Order-state column's meaning and the gates table.
3. **The OGTT cannot go through Junction.** Junction builds orders from markers; a 75 g 2-hour OGTT is a timed load-and-serial-draw protocol, which no `collection_method` expresses. Either confirm an on-site OGTT panel exists on the chosen lab account, or route it through `Canvas SDK:LabOrder` — which has no `sign()` and therefore also needs a Canvas redirect. **Medium**, but it changes which vendor the screen's second-most-tethered mark belongs to.
4. **"Actionable" overstates what Aleron can complete for every drug row.** `Prescribe` originates but does not sign. Split the chip: `actionable` for acts that commit or sign inside the SDK (Goal, Instruct, Immunize, Refer, ImagingOrder, Perform), and a distinct state for acts that stage and hand off. **Small in markup, large in meaning.**
5. **"Send to care plan" has no CarePlan behind it.** `Canvas FHIR:CarePlan` is read-only. Either rename the act to what it produces, or document in the annotation that the plan is a `Goal` set plus a `Plan` narrative in a note. **Small.**
6. **Fix the nudge that crosses the act floor.** Alcohol reduction (confidence 0.58, true x=570) is drawn at x=648, past the 0.67 act floor at x=645. Cap the nudge so it can never cross a decision line, or nudge vertically. **Small**, and it is the difference between a cosmetic offset and a misread.
7. **Three value-of-information figures are wrong.** BP 0.4045 should be 0.4095, FIB-4 0.13 should be 0.14, ECG 0.05 should be 0.06 — if the figure is odds × QALY, which the other three confirm. Fix the numbers or state the different formula. **Small.**
8. **Remove `internal value of information`, `group B modifier`, and `Indigo and dashed, per P7` from the product surface.** Engine internals and design-system vocabulary in front of a physician. The odds and QALY columns already carry what they act on. **Small.**
9. **The row-count sentence is false.** "The remaining thirteen sit below the 0.05 QALY patient-value threshold" — three shown rows are below it and seven unshown rows are far above it. Recount, and rewrite the reason for what is hidden. **Small.**
10. **Tab counts do not reconcile.** Therapies 14 + Lifestyle 8 = 22, but the marks split 17 / 5. Recount. **Small.**
11. **The ECG carries three different evidence labels** across the map `<title>`, the All ledger, the Diagnostics ledger and the pipeline card. Pick one. **Small.**
12. **Unbundle the two-act marks.** "FIB-4, then FibroScan" is a Junction lab order plus a hepatology referral; "12-lead ECG, then patch or Holter" is a `Perform` plus a cardiology referral. One mark, one act, or the send button cannot do what it says. **Medium.**
13. **Publish diagnostic confidence in the ledger.** Six diagnostics carry a confidence encoded only as x-position, contradicting the screen's own claim that the ledger carries the exact value for every mark. **Small.**
14. **Resmetirom's gate cannot close.** It is gated on an F2-F3 MASH fibrosis stage that arrives as a report, not as structured data. Either say the gate is opened by the physician, or accept it will never auto-flip. **Small copy change, real consequence.**

---

## Alternative pathways

**Home or ambulatory BP confirmation (NONE).** Replace the order with `Canvas SDK:Instruct` (coding + comment: cuff technique, twice daily, seven days) plus `Canvas SDK:FollowUp` with a `requested_date`. Both commit inside the SDK, no signature, no redirect. Readings return as `VitalSignReading` commands or the `CREATE_OBSERVATION` effect and are readable back as `Canvas FHIR:Observation`. For a true 24-hour ABPM, `Canvas SDK:Refer` (specialty: cardiology or hypertension clinic) originates and **signs**. Cost: the gate closes on patient-entered readings rather than a validated device, which weakens the 65 % reclassification claim; say so on the row.

**Home sleep apnea test (NONE).** `Canvas SDK:Questionnaire` for STOP-BANG (commits, no signature), then `Canvas SDK:Refer` to sleep medicine, which signs. The AHI never returns as structured data — the sleep study lands as a report — so the +0.45 QALY reclassification is opened by a physician reading a note, not by a webhook. Cost: manual gate closure.

**Patch or Holter monitor (NONE).** `Canvas SDK:Refer` to cardiology. Same signable path. The ECG half stays as `Perform` cpt 93000.

**Retatrutide and CagriSema (NONE).** No workaround exists and none should be invented: an investigational agent has no prescribable form. Drop them from the action class. If the intent is to show the pipeline the engine is watching, put them in a separate horizon panel drawn in unmodeled indigo, with no send affordance, and state that they are not yet orderable.

**75 g OGTT (WRONG vendor).** Two options. (a) Verify with the Junction account whether an on-site OGTT panel exists via `GET /v3/lab_tests/markers?lab_slug=…` with `collection_method: on_site_collection`; if it does, `POST /v3/order` works and results return by the `labtest.result.critical` / order-updated webhooks into `CREATE_LAB_REPORT` + `ATTACH_LAB_REPORT_RESULTS`. (b) Otherwise `Canvas SDK:LabOrder` — originate, then **redirect the physician into Canvas** to sign. Cost of (b): the return leg is the known unsolved gap.

**Every prescription (WRONG to call "actionable").** `Canvas SDK:Prescribe` originates a staged command inside a note. The redirect lands the physician on that note in Canvas, where they review and sign; Surescripts SPI gates the signature, EPCS for anything controlled. **The return leg does not exist**: deep-linking back into Aleron at the row they came from is not documented, and neither is deep-linking *into* Canvas at a specific note. The honest interim is a one-way handoff with the row left in a "handed to Canvas" state, written with `UPSERT_NOTE_METADATA` so a later Aleron run can read what it staged. Cost: the physician loses their place; the ledger cannot show completion without polling `Canvas FHIR:MedicationRequest` (read-only, but readable) to see whether the prescription materialised.

**"Send to care plan" (WRONG resource).** `Canvas FHIR:CarePlan` refuses writes. The plan becomes: one `Canvas SDK:Goal` command per lifestyle lever, one `Canvas SDK:Plan` narrative command for the sequencing story, and the staged order commands for everything else — all inside one note, closed with the `SIGN_NOTE` effect (which does exist; that spike is resolved). Cost: none, but the annotation currently claims a connection to a plan that is really a note.

**Order state "proposed, awaiting review" (GAP).** A staged command is invisible to FHIR. Use `UPSERT_NOTE_METADATA` on the note holding the staged commands, keyed by engine run id and mark id, and read it back on the next render. This is cheaper than a Custom Data Model and stores no patient data in Aleron. Cost: the state lives in Canvas, so it disappears if the note is deleted.

**Junction ↔ Canvas patient join.** Aleron stores no patient data, so it cannot keep a mapping table. Use Junction `resolve-user` with the Canvas patient id as the client user id, so the join is derivable on every request. No storage, no cost.

**Resmetirom's fibrosis gate and the FibroScan stage (UNVERIFIED).** No structured elastography stage returns from Canvas. Either the physician opens the gate explicitly (a documented decision, like the net-harm override already modelled on this screen), or the stage is stored as `UPSERT_PATIENT_METADATA` when a physician records it. Cost of the metadata route: an Aleron-owned clinical fact living outside the chart's structured record.

**Wearable inputs (UNVERIFIED).** Overnight RHR 38 bpm, SpO₂ nadir 89 %, VO₂max 28 mL/kg/min and the `activity low` band drive three of the four pipeline cards. Junction's Devices and Junction Sense groups exist but the ground truth does not enumerate these field paths. Verify before building; if any is absent, the card that depends on it has no signal and must render the reference surface's `Insufficient data to compute this domain` rather than a scored candidate.

---

## Contradictions with what the screen already claims

> "Marks that share an evidence confidence score are nudged a few units apart horizontally so they do not sit on top of each other. The nudge is cosmetic; the ledger below carries the exact value for every mark."

Two claims, both false as drawn. The nudge reaches 78 px (≈0.094 confidence) on alcohol reduction and carries it across the act floor, so it is not cosmetic. And the ledger carries no confidence value at all for the six diagnostics — the only place a diagnostic's confidence exists is its x-position, which is exactly the value the sentence promises the ledger will hold.

> "Fifteen of twenty-eight rows shown. The remaining thirteen sit below the 0.05 QALY patient-value threshold and are reachable from the Therapies and Lifestyle tabs."

Contradicted by the screen's own marks. Semaglutide +1.25, retatrutide +1.80, CagriSema +1.60, orforglipron +0.85, acarbose +0.46, liraglutide +0.44 and DPP +0.35 are all unshown and all far above 0.05. Statin +0.02, aspirin −0.12 and canakinumab −0.14 are all shown and all below it. The count is also wrong: only 14 of the 15 shown rows belong to the 28.

> `All 28` / `Diagnostics 6` / `Therapies 14` / `Lifestyle 8`

28 and 6 are right. 14 and 8 are not: the map plots 17 non-lifestyle circles and 5 lifestyle circles.

> "Placed on the action map with AI provenance. Indigo and dashed, per P7."

A physician-facing card citing a design-system law by number. This is the same leak BRIEF.md names — implementation detail surviving review by dressing as a field.

> Annotation: "The affordance is refused on a net-harmful row, because overriding a negative score is a documented decision and not a one-click send."

Correct and well-built, and it makes the opposite omission louder: the affordance is *not* refused on a row whose act Aleron cannot perform at all. Aspirin at −0.12 QALY is refused; retatrutide, which has no prescribable form, offers a live send button.

> Annotation: "Screening has no canonical icon. The magnifier with a plus is drawn inline in the canonical stroke grammar and flagged provisional in the markup."

No magnifier-with-plus glyph exists anywhere in this file. The only non-nav inline SVG is the Orders specimen tube in the rail. Stale annotation, carried from another screen.

> `internal value of information 0.4045`

Also a P4/BRIEF violation on its own terms: a numeric value with no unit, at four significant figures, in a `.pledger__prov` line. The other five VOI figures are given at two to four figures inconsistently (0.1575, 0.1875, 0.13, 0.05, 0.034).

---

## Open questions for the humans

1. **Does the Junction lab account carry a timed 75 g OGTT?** Markers are the unit of ordering; a load-and-serial-draw protocol is not a marker. If the answer is no, the OGTT belongs on the Canvas `LabOrder` path and the screen's second-most-important gate acquires a redirect.
2. **Are home BP monitoring, HSAT and cardiac patch meant to be Aleron acts at all?** Nothing in either API places a device order. If the answer is "the physician does it in Canvas", the Order-state column should say so rather than `proposed, awaiting review`.
3. **What is the return leg from a Canvas redirect?** Every prescription on this board needs one. Neither deep-linking into Canvas at a specific note nor coming back to the Aleron row is documented. Until this is answered, "Send to care plan" on a drug row is a one-way door.
4. **What is the intended formula for value of information?** Three of six figures equal odds × QALY exactly and three do not. If there is a cost or disutility term, name it; if not, three numbers are wrong.
5. **Should investigational agents appear on an action map at all?** They carry the two highest ungated QALY figures on the board (+1.80 and +1.60) and neither can become an order.
6. **Which Canvas instance holds STOP-BANG and an alcohol-intake instrument as questionnaires?** Two gates and one pipeline card depend on `questionnaire_id` values existing.
7. **Does FibroScan have an `image_code` in the Canvas imaging catalogue,** or is a hepatology referral the intended route? This determines whether one ledger row is one act or two.
8. **Where does an Aleron engine run id live** so a later render can tell which staged commands it created? `UPSERT_NOTE_METADATA` is the cheap answer, but it makes the note the system of record for Aleron's own bookkeeping.
