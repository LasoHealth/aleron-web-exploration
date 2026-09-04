# Verification: does the PREVENT β table reproduce 16.0 %?

**Verdict:** **(b)** — the β table as printed reproduces **29.76 %**, not 16.0 %; the coefficients shown cannot produce the headline figure. But the finding is *not* "the fixture was built backwards": 16.0 % is independently **correct** as the real published PREVENT male 30-yr ASCVD value for this patient (I get 16.18 % from the actual AHA coefficient tables). The broken artefact is the β table and centering block, which match **no** published PREVENT table.

---

## What the screen shows

All line numbers are `C:\LASOHealth\apps\aleron-physician-portal-designs\v2\risk-models.html`.

**Headline figures — L313, L315**

```
313:  <div><span class="pval pval--xl">16</span><span class="pval__u">% absolute</span></div>
315:  <div class="rm-score__h">30-yr ASCVD<br>AHA PREVENT base<br>10-yr total CVD <span class="pval">2.7<span class="pval__u">%</span></span></div>
```

**Inputs and base P — L497–498**

```
497:  <dt>Inputs</dt><dd>age 47 yr · sex male · total-C 205 mg/dL · HDL-C 40 mg/dL · SBP 142 mmHg
                        · eGFR 93 mL/min/1.73m² · non-diabetic · never smoked · no BP treatment · no statin</dd>
498:  <dt>Base P</dt><dd>16.0 % at the 30-yr ASCVD endpoint · 2.7 % at 10-yr total CVD</dd>
```

**Link function — L502** (explicitly plain logistic, no baseline-survival form)

```
502:  logit(p) = α + β_logAge·ln(age/55) + β_nonHDL·(non-HDL_mmol − 3.5) + β_HDL·((HDL_mmol − 1.3)/0.3)
             + β_SBP−·((min(SBP,110) − 110)/20) + β_SBP+·((max(SBP,110) − 110)/20) + β_DM·DM + β_smk·smk
             + β_eGFR−·((min(eGFR,60) − 60)/−15) + β_eGFR+·((max(eGFR,60) − 60)/−15) + β_BPtx·BPtx
             + β_statin·statin + 8 interaction terms (logAge × {nonHDL, HDL, SBP+, DM, smk, eGFR−};
               BPtx × SBP+; statin × nonHDL);  then p = 1 / (1 + exp(−logit))
```

**Centering — L503**: "Cholesterol converted mg/dL to mmol/L at 38.67 … Age on ln(age/55), non-HDL on 3.5 mmol/L, HDL on 1.3 mmol/L scaled by 0.3, SBP piecewise at 110 mmHg scaled by 20, eGFR piecewise at 60 … scaled by −15."

**β table — header L510, rows L517–536**

```
510:  <th scope="col" data-role="value">β, male 30-yr total CVD</th>
517:  intercept α          −1.518587      not applicable
518:  logAge               +0.4995532     −0.1568
519:  nonHDL               +0.0535040     +0.7677 mmol/L
520:  HDL                  −0.0772942     −0.8845
521:  SBP−                 −0.3525616      0.0000
522:  SBP+                 +0.2901171     +1.6000
523:  diabetes             +0.6526438      0
524:  smoking              +0.3848590      0
525:  eGFR−                +0.1041018      0.0000
526:  eGFR+                −0.0288403     −2.2000
527:  BP treatment         +0.2403751      0
528:  statin               −0.0653779      0
529:  BPtx × SBP+          −0.0810419      0.0000
530:  statin × nonHDL      −0.1011477      0.0000
531:  logAge × nonHDL      −0.0498938     −0.1204
532:  logAge × HDL         +0.0763795     +0.1387
533:  logAge × SBP+        −0.3360432     −0.2509
534:  logAge × diabetes    −0.4137391      0.0000
535:  logAge × smoking     −0.1395175      0.0000
536:  logAge × eGFR−       +0.0644619      0.0000
```

**Provenance claims — L538 and L731**

```
538:  Coefficients are the published AHA PREVENT 2024 supplementary tables (Khan SS et al., PMID 37947085).
731:  <dt>Validation</dt><dd>Coefficients are fixture-validated against the AHA PREVENT online calculator.
                             That validation is the acceptance gate and it is not a clinical clearance.</dd>
```

**Adjustment chain — L571, L592, L615, L636, L645–649**

```
571:  Group A composite   1.11 × 1.25 = 1.39×
592:  Group B composite   = 1.00×   (neutral by absence, not by evidence)
615:  Group C composite   max(1.15, 1.20) × max(1.10, 1.00) = 1.32×
636:  Group D composite   = 1.00×
645:  <dt>Sum log-HR</dt><dd>ln(1.39) + ln(1.00) + ln(1.32) + ln(1.00) = +0.607</dd>
646:  <dt>Composite modifier</dt><dd>exp(+0.607) = 1.835</dd>
648:  <dt>Base × composite</dt><dd>16.0 % × 1.835 = 29.4 % phenotype-adjusted 30-yr ASCVD</dd>
649:  <dt>Reported figure</dt><dd>16.0 %, the PREVENT base output. …</dd>
```

Link function used: the plain logistic form the screen itself specifies at L502 (`p = 1/(1+exp(−logit))`). The screen names no baseline survival term and no competing-risk offset, so there is nothing else to apply.

---

## My recomputation

I ran it twice — once with the centered values exactly as printed on the screen, once with centered values re-derived from the raw inputs at L497 using the centering rule at L503. Both agree to 2 decimal places, which also confirms the printed centered values are internally consistent with the stated inputs.

### Run 1 — screen's own printed centered values

| Term | β | Centered value | Product |
|---|---|---|---|
| intercept α | −1.5185870 | — | **−1.5185870** |
| logAge | +0.4995532 | −0.1568 | −0.0783299 |
| nonHDL | +0.0535040 | +0.7677 | +0.0410750 |
| HDL | −0.0772942 | −0.8845 | +0.0683667 |
| SBP− | −0.3525616 | 0.0000 | 0.0000000 |
| SBP+ | +0.2901171 | +1.6000 | +0.4641874 |
| diabetes | +0.6526438 | 0 | 0.0000000 |
| smoking | +0.3848590 | 0 | 0.0000000 |
| eGFR− | +0.1041018 | 0.0000 | 0.0000000 |
| eGFR+ | −0.0288403 | −2.2000 | +0.0634487 |
| BP treatment | +0.2403751 | 0 | 0.0000000 |
| statin | −0.0653779 | 0 | 0.0000000 |
| BPtx × SBP+ | −0.0810419 | 0.0000 | 0.0000000 |
| statin × nonHDL | −0.1011477 | 0.0000 | 0.0000000 |
| logAge × nonHDL | −0.0498938 | −0.1204 | +0.0060072 |
| logAge × HDL | +0.0763795 | +0.1387 | +0.0105938 |
| logAge × SBP+ | −0.3360432 | −0.2509 | +0.0843132 |
| logAge × diabetes | −0.4137391 | 0.0000 | 0.0000000 |
| logAge × smoking | −0.1395175 | 0.0000 | 0.0000000 |
| logAge × eGFR− | +0.0644619 | 0.0000 | 0.0000000 |

**Linear predictor = −0.8589249**
**p = 1/(1+e^(+0.8589249)) = 0.297564 → 29.76 %**

### Run 2 — centered values re-derived from raw inputs (47 M, TC 205, HDL 40, SBP 142, eGFR 93)

| Quantity | Derived | Printed on screen |
|---|---|---|
| logAge = ln(47/55) | −0.157186 | −0.1568 |
| nonHDL = 165/38.67 − 3.5 | +0.766874 | +0.7677 |
| HDL = (40/38.67 − 1.3)/0.3 | −0.885355 | −0.8845 |
| SBP+ = (142−110)/20 | +1.600000 | +1.6000 |
| eGFR+ = (93−60)/−15 | −2.200000 | −2.2000 |
| logAge × nonHDL | −0.120541 | −0.1204 |
| logAge × HDL | +0.139165 | +0.1387 |
| logAge × SBP+ | −0.251497 | −0.2509 |

**Linear predictor = −0.8588525 → p = 0.297579 → 29.76 %**

So the screen's printed centered values are correct for its own stated rule, and the table's own output is **29.76 %**. The other agent's 0.2976 is confirmed.

For 16.0 % the linear predictor would have to be ln(0.16/0.84) = **−1.65823**. The non-intercept sum here is +0.659662, so the intercept would have to be **−2.31789** — i.e. 0.7993 lower than the −1.518587 printed at L517. No rounding, unit, or transform slip accounts for a gap that size.

### Python I ran

```python
import math

beta = {
 'intercept': -1.518587, 'logAge': +0.4995532, 'nonHDL': +0.0535040,
 'HDL': -0.0772942, 'SBP-': -0.3525616, 'SBP+': +0.2901171,
 'diabetes': +0.6526438, 'smoking': +0.3848590, 'eGFR-': +0.1041018,
 'eGFR+': -0.0288403, 'BPtx': +0.2403751, 'statin': -0.0653779,
 'BPtx x SBP+': -0.0810419, 'statin x nonHDL': -0.1011477,
 'logAge x nonHDL': -0.0498938, 'logAge x HDL': +0.0763795,
 'logAge x SBP+': -0.3360432, 'logAge x diabetes': -0.4137391,
 'logAge x smoking': -0.1395175, 'logAge x eGFR-': +0.0644619,
}

# (1) centered values EXACTLY as printed on the screen
screen = {
 'logAge': -0.1568, 'nonHDL': +0.7677, 'HDL': -0.8845, 'SBP-': 0.0,
 'SBP+': +1.6000, 'diabetes': 0.0, 'smoking': 0.0, 'eGFR-': 0.0,
 'eGFR+': -2.2000, 'BPtx': 0.0, 'statin': 0.0, 'BPtx x SBP+': 0.0,
 'statin x nonHDL': 0.0, 'logAge x nonHDL': -0.1204,
 'logAge x HDL': +0.1387, 'logAge x SBP+': -0.2509,
 'logAge x diabetes': 0.0, 'logAge x smoking': 0.0, 'logAge x eGFR-': 0.0,
}

# (2) re-derived from raw inputs at L497 using the centering rule at L503
age, tc, hdl_mg, sbp, egfr, CONV = 47, 205, 40, 142, 93, 38.67
la = math.log(age/55)
nh = (tc - hdl_mg)/CONV - 3.5
hd = (hdl_mg/CONV - 1.3)/0.3
sbp_p = (max(sbp,110) - 110)/20
egp   = (max(egfr,60) - 60)/-15
derived = {**{k: 0.0 for k in screen},
 'logAge': la, 'nonHDL': nh, 'HDL': hd, 'SBP+': sbp_p, 'eGFR+': egp,
 'logAge x nonHDL': la*nh, 'logAge x HDL': la*hd, 'logAge x SBP+': la*sbp_p}

for label, vals in (('printed', screen), ('derived', derived)):
    lp = beta['intercept'] + sum(beta[k]*vals[k] for k in screen)
    print(label, 'lp=%.7f  p=%.6f (%.2f %%)'
          % (lp, 1/(1+math.exp(-lp)), 100/(1+math.exp(-lp))))
# printed lp=-0.8589249  p=0.297564 (29.76 %)
# derived lp=-0.8588525  p=0.297579 (29.76 %)

# intercept required to land on 16.0 %
nonint = -0.8589249 - (-1.518587)
print('intercept needed:', round(math.log(0.16/0.84) - nonint, 6))   # -2.31789
```

---

## The adjustment chain, checked

| Step | Screen (L571–L648) | My arithmetic | Verdict |
|---|---|---|---|
| Group A product | 1.11 × 1.25 = **1.39** | 1.3875 → 1.39 at 2 dp | correct |
| Group B | **1.00** | 1.00 (nothing fired) | correct |
| Group C | max(1.15, 1.20) × max(1.10, 1.00) = **1.32** | 1.20 × 1.10 = 1.32 exactly | correct |
| Group D | **1.00** | 1.00 (nothing fired) | correct |
| Sum log-HR | ln(1.39)+ln(1.00)+ln(1.32)+ln(1.00) = **+0.607** | 0.329304 + 0 + 0.277632 + 0 = **0.606935** → +0.607 | correct |
| Composite | exp(+0.607) = **1.835** | 1.834918 → 1.835 | correct |
| Base × composite | 16.0 % × 1.835 = **29.4 %** | 29.360 % → 29.4 % | correct |

The whole chain is arithmetically clean, including the intermediate rounding — every printed value is the correct 2-dp/3-dp rounding of the exact quantity. (Using the unrounded group A value 1.3875 gives ln-sum 0.605135 and composite 1.8315, so 16.0 × 1.8315 = 29.30 %; the screen chose to carry the rounded 1.39 forward, which is a presentational choice, not an error.) The other agent's four reported numbers for this chain are all right, and their arithmetic here matches mine.

**One caveat on the chain that the other agent did not flag:** the screen labels 1.11 and 1.25 "Effect" multipliers and then treats them as **hazard ratios** (`Sum log-HR`, L645), multiplying them onto an **absolute probability** (16.0 %). Multiplying a probability by an HR is not a valid risk transformation — it is only approximately right at small p, and at p = 0.16 the approximation is already loose. That is a modelling-layer issue separate from the β-table question and outside the scope of this check, but it is worth a note.

---

## Verdict in full

**(b)**, with an important correction to the other agent's diagnosis.

**What is confirmed.** The β table plus centered values, run through the link function the screen itself specifies at L502, gives **p = 0.29756 → 29.76 %**. It does not give 16.0 %. The closing gap is ~0.80 in the linear predictor, entirely in the intercept. The 16.0 % headline therefore does **not** follow from the coefficients printed at L517–536, and the L538 claim that those coefficients are "the published AHA PREVENT 2024 supplementary tables" and the L731 claim that they are "fixture-validated against the AHA PREVENT online calculator" are both false as printed.

**Where the other agent's inference is wrong.** Their theory was that the β table reproduces the *adjusted* figure (29.4 %) and so the fixture was built backwards. It does not: 29.76 % vs 29.36 % is a 0.4 pp gap. A table reverse-fitted to the adjusted figure would land on 29.36 % essentially exactly. The near-agreement is a coincidence, not evidence of an inverted fixture. And critically:

**The 16.0 % is right.** I recovered the actual published PREVENT coefficient tables from the binary `R/sysdata.rda` of the CRAN package `preventr` (github.com/martingmayer/preventr — which implements Khan SS et al. 2024, the same PMID 37947085 the screen cites), reimplemented them, and validated my reimplementation against the package's own documented worked example (50 F, SBP 160, on BP tx, TC 200, HDL 45, DM, eGFR 90, BMI 35 → expected 10-yr total CVD 14.7 %, 10-yr ASCVD 9.2 %, 30-yr total CVD 53.0 %, 30-yr ASCVD 35.4 %; my code reproduces all four exactly, and those expected values come from the AHA supplemental Excel file). Running the screen's patient through it:

| Endpoint (male) | Real PREVENT | Screen |
|---|---|---|
| **30-yr ASCVD** | **16.18 %** | **16.0 %** (L313, L498) |
| 30-yr total CVD | 23.72 % | — |
| **10-yr ASCVD** | **2.74 %** | **2.7 %** (L315, L498, labelled "10-yr total CVD") |
| 10-yr total CVD | 3.87 % | — |

Both headline numbers on the screen are the correct published PREVENT **ASCVD** outputs for this patient. The base risk figure is sound; the fixture's *outputs* validate. It is the displayed β table and centering block that are the invented part.

**How the β table is wrong.** It matches neither published male 30-yr table:

| Term | Screen (L517–536) | Real 30-yr total CVD | Real 30-yr ASCVD |
|---|---|---|---|
| age | +0.4995532 | +0.4627309 | +0.3994099 |
| **age²** | **absent** | **−0.0984281** | **−0.0937484** |
| nonHDL | +0.0535040 | +0.0836088 | +0.1744643 |
| HDL | −0.0772942 | −0.1029824 | −0.1202030 |
| SBP<110 | −0.3525616 | −0.2140352 | −0.0665117 |
| SBP≥110 | +0.2901171 | +0.2904325 | +0.2753037 |
| diabetes | +0.6526438 | +0.5331276 | +0.4790257 |
| smoking | +0.3848590 | +0.2141914 | +0.1782635 |
| eGFR<60 | +0.1041018 | +0.1155556 | −0.0218789 |
| eGFR≥60 | **−0.0288403** | **+0.0603775** | **+0.0602553** |
| BP tx | +0.2403751 | +0.2327140 | +0.1421182 |
| statin | −0.0653779 | −0.0272112 | +0.0135996 |
| BPtx × SBP+ | −0.0810419 | −0.0384488 | −0.0218265 |
| statin × nonHDL | **−0.1011477** | **+0.1341920** | **+0.1013148** |
| age × nonHDL | −0.0498938 | −0.0511759 | −0.0312619 |
| age × HDL | +0.0763795 | +0.0165865 | +0.0206730 |
| age × SBP+ | −0.3360432 | −0.1101437 | −0.0920935 |
| age × diabetes | −0.4137391 | −0.2585943 | −0.2159947 |
| age × smoking | −0.1395175 | −0.1566406 | −0.1548811 |
| age × eGFR− | **+0.0644619** | **−0.1166776** | **−0.0712547** |
| intercept | −1.518587 | −1.148204 | −1.736444 |

Three coefficients have the wrong **sign** (eGFR≥60, statin × nonHDL, age × eGFR<60). The **age² term the 30-year equations require is missing entirely** — the 30-yr PREVENT models have 24 terms, the screen shows 20. And the transforms at L502/L503 are wrong in three places against the published spec:

- age is `(age − 55)/10`, **not** `ln(age/55)`
- SBP≥110 is `(max(SBP,110) − 130)/20`, **not** `− 110`
- eGFR≥60 is `(max(eGFR,60) − 90)/−15`, **not** `− 60`

(The cholesterol conversion is fine: the package uses ×0.02586, the screen's ÷38.67 is the same to 5 sf.)

**Most likely origin of the error.** This looks like a **wireframe that carries real, validated output numbers over an invented provenance panel** — not a broken engine. The 16.0 % / 2.7 % pair was almost certainly obtained from the real AHA PREVENT calculator (as L731 claims) and pasted in, while the β table, the formula string, and the centering paragraph beneath it were written to *look* like the published table and were never round-tripped against it. Everything about them is plausible-shaped and wrong in detail: right number of significant figures, right term names, right piecewise structure, wrong values, wrong centering constants, missing age². This is not "the fixture was constructed backwards"; it is "the audit trail is decorative."

**Secondary finding — the endpoint labels are muddled**, and this one is independently checkable:
- L510 heads the table `β, male 30-yr total CVD`, but L498 and L648 attribute its output to the **30-yr ASCVD** endpoint. Those are different published tables (real intercepts −1.148204 vs −1.736444) and different answers for this patient (23.72 % vs 16.18 %).
- L315 and L498 label 2.7 % as **10-yr total CVD**. Real 10-yr total CVD for this patient is 3.87 %; 2.7 % is the **10-yr ASCVD** figure (2.74 %). The value is right, the endpoint label is wrong.

So the correct framing is: **the two reported risk figures are validated and correct 30-yr and 10-yr ASCVD PREVENT outputs; the adjustment chain arithmetic is correct; the β-coefficient table, the formula, the centering block, and two endpoint labels are wrong.** That is a documentation/provenance defect on a wireframe, not a wrong risk score — smaller than "the model is broken," but larger than a mislabel, because the panel's whole purpose is auditability and L538/L731 make a specific, false provenance claim that a physician or reviewer would take at face value.

---

## Clinical plausibility

Here the evidence is unusually clean, because I could run the real equations rather than reason about them.

For a 47-year-old male, TC 205 mg/dL, HDL 40 mg/dL, SBP 142 mmHg untreated, eGFR 93, non-diabetic, never-smoker, no statin, the published AHA PREVENT equations give **30-yr ASCVD 16.2 %** and **30-yr total CVD 23.7 %**. So:

- **16.0 % is the correct and clinically expected answer** for the endpoint the screen headlines (30-yr ASCVD). A cardiologist would find it unremarkable — moderate long-horizon risk in a middle-aged man whose only real drivers are stage-2 hypertension and a mildly unfavourable lipid panel. The "moderate" band word at L313/L315 is appropriate.
- **~29.8 % would look wrong** as a *base* PREVENT figure. It exceeds even the 30-yr **total CVD** value (23.7 %), which is the broader endpoint and is by construction the ceiling of ASCVD. Any base-model number above 23.7 % for this patient is impossible on the published equations regardless of endpoint.
- The **29.4 % phenotype-adjusted** figure is a different claim and I take no view on it — it comes from the Aleron modifier layer, not from PREVENT, and validating a 1.835× composite HR for HOMA-IR 4.3 / metabolic syndrome / HbA1c 6.0 / hs-CRP 3.0 / Lp(a) 25 is outside this check. I will note only that it lands above the published 30-yr total CVD ceiling for this patient, and that the layer multiplies hazard ratios onto an absolute probability (see the caveat above), so it deserves its own scrutiny.

Confidence: high on the base-figure call (my reimplementation reproduces the AHA supplemental Excel values exactly on the package's documented example, so it is a faithful reference). No view on the modifier layer.

**Sources**

- [Development and Validation of the American Heart Association's PREVENT Equations (Khan SS et al., Circulation 2024) — PMID 37947085](https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.123.067626)
- [`preventr` R package — reference implementation of PREVENT; coefficient tables in `R/sysdata.rda`, transforms in `R/estimate_risk.R`](https://github.com/martingmayer/preventr)
- [AHA PREVENT calculator overview](https://professional.heart.org/en/guidelines-and-statements/about-prevent-calculator)
- [ACC CVD Risk Estimator Plus](https://tools.acc.org/cvd-risk-estimator-plus/)
