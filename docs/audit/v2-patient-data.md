# v2/patient-data.html

**Screen purpose:** The whole intake packet on one surface: identity, clinic vitals, wearable device instruments, labs, four patient-reported outcomes, HRV recovery context, an associated-driver explorer, and a read-only order ledger.
**Data points audited:** 158 — OK 123, GAP 27, WRONG 1, UNVERIFIED 2, NONE 5

Live verifications performed for this screen (all `newly verified`, 3 Sep 2026):

| Fact | URL |
|---|---|
| Canvas FHIR `Observation` create is restricted to **vital signs and panels only**; search params `_id, patient, category, code, date, derived-from`; Canvas categories include `vital-signs`, `laboratory`, `social-history`, `survey`, `imaging`, `sdoh` | https://docs.canvasmedical.com/api/observation/ |
| The full creatable vital list: height 8302-2, weight 29463-7, **waist circumference 56086-2**, temperature 8310-5, BP 85354-9, pulse 8867-4, pulse rhythm 8884-9, respiration 9279-1, O2 sat 2708-6/59408-5, note 80339-5. **BMI is not in the list.** No body fat, no VO2max, no HRV, no steps, no sleep. | https://docs.canvasmedical.com/guides/submit-vitals-via-fhir/ |
| Canvas FHIR `DiagnosticReport` read/search only; returns `result[]`→Observation, `presentedForm` PDF, `effectiveDateTime`, `performer`, `category` (Laboratory/Radiology/…); searchable by `patient`, `category`, `code`, `date` | https://docs.canvasmedical.com/api/diagnosticreport/ |
| Junction sleep summary `GET /v2/summary/sleep/{user_id}?start_date=&end_date=&provider=` → `duration, total, deep, light, rem, awake, hr_average, hr_lowest, hr_resting, average_hrv (rmssd), respiratory_rate, efficiency, latency, recovery_readiness_score, calendar_date, source.{provider,device_id,type}`. **No sleep-regularity score.** | https://docs.junction.com/api-reference/data/sleep/get-summary.md |
| Junction activity summary `GET /v2/summary/activity/{user_id}` → `steps, calories_total, calories_active, distance, floors_climbed, low, medium, high (minutes), heart_rate.{avg,min,max,resting}_bpm, calendar_date, source.*`. **No single "active minutes" field.** | https://docs.junction.com/api-reference/data/activity/get-summary.md |
| Junction SpO2 `GET /v2/timeseries/{user_id}/blood_oxygen/grouped` → per-sample `{timestamp, value, unit "%"}` grouped by provider. **No nadir/min aggregate is offered.** | https://docs.junction.com/api-reference/data/timeseries/blood-oxygen.md |
| Junction HRV `GET /v2/timeseries/{user_id}/hrv/grouped` → `{timestamp, value, unit: "rmssd"}`. RMSSD only, no SDNN. | https://docs.junction.com/api-reference/data/timeseries/hrv.md |
| Junction VO2max `GET /v2/timeseries/{user_id}/vo2_max/grouped` → `{value, unit "mL/kg/min", start, end, source.*}` | https://docs.junction.com/api-reference/data/timeseries/vo2-max.md |
| Junction body summary `GET /v2/summary/body/{user_id}` → `weight, height, fat, body_mass_index, lean_body_mass_kilogram, waist_circumference_centimeter, visceral_fat_index, calendar_date, source.*` | https://docs.junction.com/api-reference/data/body/get-summary.md |
| Junction device/wearable webhooks: `provider.connection.created/error`, `provider.device.created/updated`, `daily.data.<type>.created/updated`, `historical.data.<type>.created`. **No disconnect event and no sync-completion event.** No firmware field anywhere. | https://docs.junction.com/_llms/devices/event-catalog.md |
| Junction Sense (aggregation / continuous queries / result tables) is **gated behind a CSM conversation, closed beta** | https://docs.junction.com/sense/using-query-api.md |
| Junction **Lab Report Parsing** `POST /lab_report/v1/parser/job` accepts PDF/JPEG/PNG and returns `test_name, value, units, min_reference_range, max_reference_range, LOINC + confidence, interpretation (normal/abnormal/critical/unknown)` and attaches to a `user_id` **without a Junction order**. Closed beta. | https://docs.junction.com/lab/report-parsing/overview |
| Junction `source_markers` means *duplicate ordered markers resolving to the same underlying result*, **not** a calculated/derived biomarker | https://docs.junction.com/lab/results/result-formats |

## Data points

### A. Patient identity and session (rail)
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| A1 | `EP` avatar initials | Derived (from `Patient.name`) | OK | |
| A2 | `Ethan Park` | Canvas FHIR:Patient (read `GET /Patient/{id}`, `name`) | OK | |
| A3 | `AL-47M` | Aleron identifier, writable as `Canvas FHIR:Patient.identifier` or SDK `CREATE_PATIENT_EXTERNAL_IDENTIFIER` | OK | Must be provisioned at patient creation; it is not a Canvas-native id. |
| A4 | `47M` | Derived (`Patient.birthDate`, `Patient.gender`) | OK | |
| A5 | `Dr. A. Okafor` (session actor) | Aleron (Entra/Azure AD claim); `Canvas FHIR:Practitioner` for the Canvas-side identity | OK | Ground truth §4: no JIT provisioning. The Canvas practitioner must pre-exist or every command on this chart is unattributable. |

### B. Input readiness
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| B1 | Packet `v1` | Aleron | OK | |
| B2 | frozen `24 Jun 2026` | Aleron | OK | |
| B3 | `27 of 29 fields` | Derived (Aleron packet validator over the assembled packet) | OK | |
| B4 | Recency, labs `7 d` | Derived (max of `DiagnosticReport.effectiveDateTime` / Junction `BiomarkerResult.timestamp`) | OK | See contradiction 3. |
| B5 | Recency, wearable `1 d` | Derived (max `calendar_date` across Junction sleep/activity summaries) | OK | |
| B6 | Provenance `Synthetic representative packet` | Aleron | OK | |
| B7 | Missingness `OGTT, FIB-4 not emitted` | Derived (absence of the biomarker slugs in the packet) | OK | P7-correct: absence stated, not blanked. |
| B8 | `Abnormal findings` roll-up, five items | Derived (Aleron banding over B/D/E/F/G/J values) | OK | Junction `interpretation` gives only normal/abnormal/critical, so the *wording* of each item is Aleron's, not the lab's. |

### C. Identity line inside "Signals and labs"
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| C1 | `Ethan Park · AL-47M · 47 male` | Canvas FHIR:Patient (read) | OK | Duplicates A2-A4. |
| C2 | `metabolic-risk phenotype` | Aleron (engine label) | GAP | No FHIR field carries a phenotype label. `Canvas SDK:UPSERT_PATIENT_METADATA` is the cheap home; a `Condition` with `category: health-concern` is the expensive one and would pollute the problem list. |

### D. Blood pressure and sleep
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| D1 | `142/90 mmHg` | Canvas FHIR:Observation (read, `category=vital-signs`, LOINC 85354-9; `component` carries systolic/diastolic) | OK | Also creatable via FHIR or `Canvas SDK:VitalSignReading`. |
| D2 | `stage 2` tile | Derived (ACC/AHA thresholds over D1) | OK | Not a Canvas or Junction field. |
| D3 | note `Untreated` | Derived (no antihypertensive in `MedicationRequest` / `MedicationStatement` read) | OK | Absence-based inference; brittle if the patient's meds live outside Canvas. |
| D4 | note `single clinic setting` | Derived (count of BP `Observation` rows in the window) | OK | Needs a `date`-ranged `Observation` search, not a single read. |
| D5 | `89 % SpO₂ nadir` | Junction:`/v2/timeseries/{user_id}/blood_oxygen/grouped` → `groups.{provider}[].value` | GAP | Junction returns **samples, no min aggregate**. Aleron must page every overnight sample for 30 nights and take the min itself. |
| D6 | `nadir across the trailing 30 nights` | Derived (window definition is Aleron's) | GAP | Same call, plus night-boundary segmentation Junction does not do for you. Junction Sense would do it server-side but is closed beta. |
| D7 | `desaturation` tile | Derived | OK | |

### E. Device instruments
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| E1 | RHR `38 bpm` | Junction:`/v2/summary/sleep/{user_id}` → `sleep[].hr_resting` (alt `/v2/summary/activity` → `heart_rate.resting_bpm`) | OK | Note says "Overnight", so `sleep[].hr_resting` is the right field of the two. |
| E2 | RHR sparkline, 9 plotted points | Junction: same field over a `start_date`/`end_date` range | OK | One ranged call returns the whole series. |
| E3 | RHR `building_baseline` | Derived (Aleron trend-state vocabulary) | OK | Not a Junction concept. |
| E4 | RHR `9 of 14 prior-window nights` | Derived (count of rows returned vs window length) | OK | Honest and cheap; this is the right shape for P7. |
| E5 | RHR `low` tile | Derived | OK | |
| E6 | HRV `34 ms` | Junction:`sleep[].average_hrv` (unit rmssd) or `/v2/timeseries/{user_id}/hrv/grouped` → `data[].value` | OK | |
| E7 | HRV sparkline, 9 points | Junction: same, ranged | OK | |
| E8 | HRV `building_baseline · 9 of 14 prior-window nights` | Derived | OK | |
| E9 | HRV `low vs baseline` | Derived (vs M4) | OK | |
| E10 | Sleep duration `6.4 h` | Junction:`sleep[].total` (seconds of registered sleep) | OK | `duration` is the whole in-bed period and would read ~7.4 h. Pick one and say which; the two differ by `awake`. |
| E11 | Sleep sparkline, single-point stub | Derived | OK | Correctly refuses to draw a line from one point. |
| E12 | Sleep `snapshot_only · single snapshot, no trend yet` | Derived | OK | |
| E13 | `Staging only began emitting at the 29 Jun firmware update` | — | **NONE** | Junction exposes `source.provider`, `source.type`, `source.device_id`. **No firmware version, no firmware-change date, no per-metric availability start.** Nothing in the device webhook catalog carries it either. |
| E14 | Steps `3,800 steps/d` | Junction:`/v2/summary/activity/{user_id}` → `activity[].steps` | OK | |
| E15 | Steps sparkline, 9 points | Junction: same, ranged | OK | |
| E16 | Steps `11 of 14 prior-window days` | Derived | OK | |
| E17 | Steps `below target` | Derived against an Aleron-owned step target | GAP | The target itself has no home. `UPSERT_PATIENT_METADATA` or a Canvas `Goal` command (SDK) if it is a real care-plan goal. |
| E18 | Active minutes `14 min/d` | Junction:`activity[].low + .medium + .high` | GAP | **There is no `active_minutes` field.** The screen shows a single number whose composition is an Aleron decision (does `low` count?). State the definition or show the three bands. |
| E19 | Active minutes stub sparkline + `snapshot_only` | Derived | OK | |
| E20 | `The wrist device reports a daily total and did not backfill history at pairing` | Junction: `historical.data.activity.created` webhook (or its absence) + Team Data Pull Preferences | GAP | Backfill outcome is delivered as an **event**, not as a readable per-user state field. Aleron cannot query "did this user backfill?" on page load; it would have to have recorded the webhook. |
| E21 | Coverage `nights 26` | Derived (row count of sleep summaries in window) | OK | |
| E22 | Coverage `step days 24` | Derived (row count of activity summaries) | OK | |
| E23 | `last sync 30 Jun 2026 08:12` | — | **NONE** | No documented per-user or per-connection last-sync timestamp. The nearest readable things are `created_at`/`updated_at` on the newest data row, which is the time Junction wrote the record, not the time the device synced. |

### F. Metabolic
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| F1 | HbA1c `6.0 %` | Junction:`BiomarkerResult.value` + `.unit` **or** Canvas FHIR:Observation (`category=laboratory`) / DiagnosticReport `result[]` | OK | Which one depends on who ordered it. See required change 5. |
| F2 | `prediabetes` advisory | Derived (ADA band) | GAP | Junction `interpretation` is only `normal`/`abnormal`/`critical`; Canvas `Observation.interpretation` is an HL7 code (`H`/`L`/`A`). **Neither shape can say "prediabetes."** Aleron owns the band table. |
| F3 | Fasting glucose `110 mg/dL` | Junction:`BiomarkerResult` / Canvas Observation | OK | "Fasting" is an AOE/specimen attribute; Junction carries it via `aoe_answers` on the order, Canvas via `Specimen`. Neither is shown, so the fasting claim rides on the order. |
| F4 | `impaired` advisory | Derived | GAP | Same as F2. |
| F5 | Fasting insulin `16 µIU/mL` | Junction:`BiomarkerResult` / Canvas Observation | OK | |
| F6 | HOMA-IR `4.3` | Derived (F3 × F5 / 405) | OK | **Not** obtainable from `source_markers` — that field means duplicate ordered markers, not calculations. Requires F3 and F5 from the same draw, which nothing on the screen asserts. |
| F7 | `insulin-resistant` tile | Derived | OK | |

### G. Lipids and inflammation
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| G1 | Total cholesterol `205 mg/dL` | Junction:`BiomarkerResult` / Canvas Observation | OK | Shown composited into one cell with G2/G3; three separate results in both APIs. |
| G2 | LDL-C `132 mg/dL` | as G1 | OK | |
| G3 | HDL-C `40 mg/dL` | as G1 | OK | |
| G4 | Triglycerides `180 mg/dL` | as G1 | OK | |
| G5 | `Reference below 150 mg/dL` | Junction:`max_range_value` (or `reference_range` string) / Canvas `Observation.referenceRange.high` | OK | The one place on this screen a lab-supplied range is actually used. |
| G6 | Triglycerides `high` tile | Junction:`is_above_max_range` / `interpretation` | OK | |
| G7 | ApoB `112 mg/dL` | Junction:`BiomarkerResult` / Canvas Observation | OK | Shown with no reference range and no flag, though ApoB 112 is above most lab ranges. |
| G8 | Lp(a) `25 nmol/L` | as G7 | OK | |
| G9 | Lp(a) note `Normal.` | Junction:`is_above_max_range`/`is_below_min_range` | OK | |
| G10 | Lp(a) note `Measured once` | Derived (count of historical Lp(a) results) | OK | Requires a full-history lab query, not the current packet. |
| G11 | hs-CRP `3.0 mg/L` | Junction:`BiomarkerResult` / Canvas Observation | OK | |
| G12 | `High-risk tertile at 3 mg/L and above` | Aleron-owned band (AHA/CDC tertiles) | GAP | This is **not** the lab reference range and must not be sourced from `reference_range`. Aleron owns the table; there is no field for it in either API. |
| G13 | hs-CRP `high` tile | Derived from G12 | OK | |

### H. Renal
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| H1 | eGFR `93 mL/min/1.73m²` | Junction:`BiomarkerResult` / Canvas Observation (`category=laboratory`) | OK | eGFR is lab-calculated and comes back as its own marker. |
| H2 | UACR `14 mg/g` | as H1 | OK | |
| H3 | note `Both within range` | Derived (`is_above_max_range` false on both) | OK | |

### I. Body
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| I1 | Height `178 cm` | Canvas FHIR:Observation (read/create, LOINC 8302-2) **or** Junction:`/v2/summary/body` → `height` | OK | Canvas default unit is **inches**; cm accepted. |
| I2 | `5 ft 10 in` alt | Derived (unit conversion) | OK | Arguably the native value and 178 cm the derived one, given Canvas's default. |
| I3 | Weight `93 kg` | Canvas FHIR:Observation (LOINC 29463-7) **or** Junction:`body[].weight` | OK | Canvas default unit is **ounces**; kg accepted. |
| I4 | `205 lb` alt | Derived | OK | |
| I5 | BMI `29.4 kg/m²` | Derived (I1, I3) **or** Junction:`body[].body_mass_index` | OK | **Canvas cannot store BMI** — it is not in the creatable vital list. Read it back only by recomputing from height and weight. |
| I6 | `overweight` advisory | Derived | OK | |
| I7 | `Body fat approximately 30 %` | Junction:`body[].fat` | GAP | Canvas has **no body-fat vital**; `Observation` create rejects it. Junction only has it if a smart scale or DEXA feed is connected, which nothing on this screen declares. |
| I8 | Waist `105 cm` | Canvas FHIR:Observation (LOINC 56086-2, creatable, cm default) **or** Junction:`body[].waist_circumference_centimeter` | OK | `newly verified` that Canvas accepts waist as a vital. |
| I9 | `41 in` alt | Derived | OK | |
| I10 | `Waist-to-height 0.59` | Derived (I8 / I1) | OK | |
| I11 | `above the 0.5 threshold` | Derived (Aleron-owned threshold) | OK | |

### J. Fitness
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| J1 | VO₂max `28 mL/kg/min` | Junction:`/v2/timeseries/{user_id}/vo2_max/grouped` → `data[].value`, unit `mL/kg/min` | OK | **Canvas has no VO₂max vital and no place to store it.** It is a device estimate, not a lab, and the screen correctly says "estimate". |
| J2 | `low` tile | Derived | OK | |
| J3 | `Roughly the 10th to 15th percentile for age and sex` | Derived against an Aleron-held norm table (ACSM/Cooper) | GAP | No API supplies percentiles. Aleron must ship the norm table and version it, and the note hedges ("roughly", "10th to 15th") in a way a physician cannot act on precisely. |
| J4 | Activity `low` (self-report) | Canvas FHIR:QuestionnaireResponse (create/read) → `Observation` `category=social-history` or `survey` via `derived-from` | UNVERIFIED | Plausible and supported in shape; not confirmed that Aleron's intake instrument is registered as a Canvas `Questionnaire`. |

### K. Context
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| K1 | Smoking `never` | Canvas FHIR:Observation (read, `category=social-history`, smoking-status LOINC 72166-2) | OK | |
| K2 | Family history `T2D + HTN` | `Canvas SDK:FamilyHistory` command (write) | GAP | **`FamilyMemberHistory` is not in Canvas's FHIR resource matrix**, so there is no documented read-back. Aleron can write it and cannot re-read it as structured data. |
| K3 | Genetics `ATM heterozygous P/LP` | Canvas genetics integration (per `Aleron-Web/CLAUDE.md`) | GAP | Canvas FHIR has no `MolecularSequence` and no genomics Observation profile in the matrix. Junction is labs-only (ground truth §5). The realistic landing zones are `DocumentReference` (the report PDF, no update) or `Observation` `category=laboratory` via `Canvas SDK:CREATE_LAB_REPORT`, neither of which carries zygosity or ACMG classification as a field. |
| K4 | `required channel` tag | Aleron | GAP | Aleron-owned obligation state. `UPSERT_PATIENT_METADATA` is the cheap home. |
| K5 | Anti-obesity pharmacotherapy `eligible, BMI ≥ 27 with comorbidity` | Derived (I5 + problem list via `Condition` read) | OK | Correctly labelled eligibility, not a recommendation. |

### L. Felt experience (four PRO cards)
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| L1 | Energy `4 of 10` | Canvas FHIR:QuestionnaireResponse (create ✓, read ✓, update ✓) → `Observation` `category=survey` | OK | This is the one clean Canvas write path on the whole screen. |
| L2 | Energy `low` tile | Derived (vs L3) | OK | |
| L3 | Energy `desired range 6.5 to 10` | Aleron-owned band | GAP | `QuestionnaireResponse` has no reference-range field, and the derived `survey` Observation is **not creatable via FHIR** (vitals and panels only). Band lives in Aleron or in `UPSERT_PATIENT_METADATA`. |
| L4 | Energy series: one dot at Intake, `−28d…−7d` empty | Derived (`QuestionnaireResponse` search by `authored`/date) | OK | Honest: an empty pre-intake window is drawn as empty. |
| L5 | Mood `6 of 10` | as L1 | OK | |
| L6 | Mood `mid band` | Derived | OK | |
| L7 | Mood `desired range 6 to 10` | Aleron | GAP | as L3 |
| L8 | Mood series | Derived | OK | |
| L9 | Body ease `5 of 10` | as L1 | OK | |
| L10 | Body ease `mid band` | Derived | OK | |
| L11 | Body ease `desired range 6.5 to 10` | Aleron | GAP | as L3 |
| L12 | Body ease series | Derived | OK | |
| L13 | Cognitive clarity `4 of 10` | as L1 | OK | |
| L14 | Cognitive clarity `low` tile | Derived | OK | |
| L15 | Cognitive clarity `desired range 6.5 to 10` | Aleron | GAP | as L3 |
| L16 | Cognitive clarity series | Derived | OK | |
| L17 | Fixed x-scale `−28d … 180d` with ghost dots at `30d / 90d / 180d` | Aleron (measurement schedule) | OK | Future windows are a schedule, not data. Could be Canvas `Appointment` or `Task` if the schedule is real. |

### M. Recovery context (HRV block)
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| M1 | HRV `34 ms` | Junction:`sleep[].average_hrv` / `hrv/grouped` `data[].value` | OK | Duplicates E6. The screen shows `ms`; Junction labels the unit `rmssd`, which is a metric name and not a unit. Aleron supplies "ms". |
| M2 | `Low vs baseline` advisory | Derived | OK | |
| M3 | Metric `RMSSD` | Junction:`unit` field on the HRV timeseries | OK | |
| M4 | Baseline `42 ms` | Derived (28-day personal mean) | OK | Requires a ranged fetch of `average_hrv`, then Aleron computes. Junction offers no baseline. |
| M5 | Coverage `82 % wearable` | Derived | GAP | Contradicts E21 and Q10 (26 of 30 nights = 87 %). Also: 82 % of what denominator, over what window? Not derivable from anything else on the screen. |
| M6 | HRV chart series, 5 points at `−28d, −21d, −14d, −7d, Intake` (≈45 → 34 ms) | Junction:`sleep[].average_hrv`, aggregated into 7-day windows | OK | The 7-day windowing is Aleron's; Junction returns per-night rows. |
| M7 | `personal baseline range 40 to 46 ms` band | Derived | OK | Two more numbers Aleron must define and version (mean ± what?). |
| M8 | y-axis ticks `50 / 45 / 40 / 35 / 28 ms` | Derived (chart furniture) | OK | |
| M9 | Three ghost future windows `30d / 90d / 180d` | Aleron | OK | |
| M10 | `Compare the next 28-day recovery window against the intake baseline` | Aleron | OK | |

### N. Associated drivers (tab list)
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| N1 | Sleep-disordered breathing · `High` · `SpO₂ 89 % · oxygen nadir signal` | Junction:`blood_oxygen/grouped` → min, Derived band | GAP | Same nadir problem as D5. |
| N2 | Cardiorespiratory fitness · `Low` · `28 mL/kg/min · VO₂max estimate` | Junction:`vo2_max/grouped` → `value` | OK | |
| N3 | Sleep regularity · `Low` · `58 of 100 · regularity score` | — | **NONE** | Junction's sleep summary carries `efficiency`, `latency` and `recovery_readiness_score`. **There is no sleep-regularity score and no 0-100 regularity field.** Nothing in Canvas holds one either. |
| N4 | Iron status · `Pending` · `not yet measured · ferritin` | Derived (absence of the `ferritin` biomarker slug) | OK | |
| N5 | Movement · `Low` · `3,800 steps/d · daily average` | Junction:`activity[].steps`, averaged by Aleron | OK | See contradiction 5: this promotes a device number to a ranked driver. |
| N6 | Thyroid status · `Pending` · `not yet measured · TSH` | Derived (absence) | OK | |
| N7 | Strength and lean mass · `Pending` · `baseline needed · functional reserve` | — | **NONE** | `functional reserve` is not emitted by anything. Junction's `body[].lean_body_mass_kilogram` is the nearest field and is not the same measure; grip strength, gait speed and chair-stand are not in either API. |
| N8 | Pain burden · `Conditional` · `screen if persistent · PEG-3` | Aleron (conditional instrument) → Canvas FHIR:Questionnaire read / QuestionnaireResponse create | OK | |
| N9 | Mood and anxiety burden · `Conditional` · `not dominant today · PHQ / GAD` | as N8 | OK | Canvas scores PHQ/GAD into `Observation` `category=survey` via `derived-from`, which is readable. |

### O. Open driver detail (Sleep-disordered breathing)
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| O1 | `High` tile | Derived | OK | |
| O2 | `89 % SpO₂ nadir` | Junction:`blood_oxygen/grouped` → min | GAP | as D5 |
| O3 | `baseline: slight desaturation, SpO₂ nadir 89 %` | Derived | OK | "slight" conflicts with the ember `High` tile beside it. |
| O4 | `coverage: overnight wearable plus intake` | Derived | OK | |
| O5 | Chart series, 3 points at `−14d, −7d, Intake` (93 → 89 %) | Junction:`blood_oxygen/grouped`, per-window nadir | GAP | Three nadirs = three full-window sample pulls plus Aleron-side min per window. Junction Sense would do this in one query; it is closed beta. |
| O6 | Two ghost points at `−28d, −21d` labelled `no device data` | Derived (empty response for that range) | OK | Exactly right, and the best P7 moment on the screen. |
| O7 | `expected overnight range 92 to 98 %` | Aleron-owned band | GAP | Not a lab reference range and not a Junction field. Aleron owns and versions it. |
| O8 | y-axis ticks `98 / 93 / 89 / 86 %` | Derived | OK | |
| O9 | `The gate is scored on the action map at 35 % reclassification odds` | Aleron (SPAR engine) | OK | |

### P. Orders ledger
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| P1 | `Comprehensive metabolic panel` | Junction:`order.lab_test.name` (or `order_set`) | OK | If it was a Canvas-placed order instead, `Canvas FHIR:ServiceRequest` read. |
| P2 | `Standing order SO-BLOOD-2026-01` | Aleron identifier | GAP | Standing orders are an Aleron concept; neither API has a field. `UPSERT_PATIENT_METADATA` per order, or `passthrough` on the Junction order (which round-trips but is not searchable). |
| P3 | Placed `8 Jun 2026` | Junction:`order.created_at` | OK | |
| P4 | `resulted 22 Jun, reviewed` | Junction:`order.status = completed` + `events[].created_at`; "reviewed" from `Canvas SDK:LabReview` command | GAP | Junction gives the result date cleanly. **"reviewed" has no read-back**: `LabReview` is a write command with no documented queryable state. Nearest readable proxy is a Canvas `Task` or the note the command committed into. |
| P5 | `MBTA 163-gene panel` (implied Junction order) | — | **WRONG** | Ground truth §5 is explicit: Junction is **labs only, no imaging, no radiology, no referrals, no prescriptions**, and its ordering surface is lab panels. A 163-gene hereditary panel is not a Junction lab test, and the platform's own genetics path is the **Canvas genetics integration**. Attributing this row to the Junction order flow is a misroute. |
| P6 | `Standing order SO-GEN-2026-02` | Aleron | GAP | as P2 |
| P7 | Placed `8 Jun 2026` | depends on P5 | UNVERIFIED | Cannot be `order.created_at` if the order was never a Junction order. |
| P8 | `resulted 23 Jun, ATM P/LP, required channel` | Canvas genetics integration + Aleron | GAP | The date is readable as `DiagnosticReport.effectiveDateTime`; **"ATM P/LP" as a structured finding is not** (K3), and "required channel" is Aleron state (K4). |
| P9 | `Home sleep apnea test` as an orderable | — | **NONE** | Junction: labs only, no DME and no sleep studies. Canvas FHIR `ServiceRequest`: **no create**. No `Canvas SDK` command covers HSAT — `LabOrder` is lab-partner scoped, `ImagingOrder` takes an `image_code`, `Refer` is a referral not a device order. There is no API that places this order. |
| P10 | `Gate on the action map` | Aleron | OK | |
| P11 | `not placed` | Derived (absence) | OK | |
| P12 | `proposed, awaiting review` | Aleron (proposal state) | OK | Aleron-side, pre-Canvas, so no storage-constraint problem. |

### Q. Disclosures
| # | Data point as shown | Source | Verdict | Note |
|---|---|---|---|---|
| Q1 | Composite `None emitted` | Aleron | OK | |
| Q2 | Comparison `Within-person only` | Aleron | OK | |
| Q3 | Device role `Corroboration` sentence | Aleron | OK | |
| Q4 | Cadence `30, 90 and 180 days` | Aleron | OK | |
| Q5 | Source `Intake survey · patient_packet.v1 · frozen 24 Jun 2026` | Aleron | OK | |
| Q6 | `frozen 24 Jun 2026 after baseline results and genetics` | Aleron | OK | See contradiction 2. |
| Q7 | `packet-validator 2.4.0` | Aleron | OK | |
| Q8 | `29 checks passed, 0 failed` | Aleron | OK | |
| Q9 | `Synthetic representative packet · staging` | Aleron | OK | |
| Q10 | `wearable_summary.v1 · 26 of 30 nights present` | Derived (Junction sleep row count) | OK | Contradicts M5. |
| Q11 | `prior-window personal baseline still forming` | Derived | OK | |
| Q12 | `7 d and 30 d means against a prior 28 d personal baseline` | Derived | OK | Three windows (7/30/28) that Aleron computes client-side from ranged Junction pulls. |
| Q13 | `Not emitted: 75 g OGTT, FIB-4` | Derived (absence) | OK | |

## Required changes

1. **Remove or re-source the sleep-regularity driver (N3).** `58 of 100 · regularity score` exists in no API this platform uses. Either drop the driver, or replace the metric with something Junction actually emits — `sleep[].efficiency` (%) or bedtime-start variance computed by Aleron from `bedtime_start` across the window. **Small** if you swap the metric, **trivial** if you drop it.
2. **Remove the three unsourceable device-provenance strings (E13, E20, E23).** `firmware update`, `did not backfill history at pairing` and `last sync 30 Jun 2026 08:12` all describe device-connection state that Junction exposes only as webhooks, never as readable fields. They are the most physician-plausible lines on the screen and the least implementable. Replace with what *is* readable: `source.provider`, `source.type` (ring/watch/phone), and the row count already shown. **Small**, but it changes copy in three places.
3. **Fix the Junction/Canvas split on the order ledger (P5, P9).** The genetics panel is not a Junction order and the home sleep apnea test is not orderable through any API in this stack. Decide per row which system places it and label the ledger accordingly. **Medium** — it is a data-model decision, not a copy edit.
4. **Reconcile wearable coverage (M5 vs E21/Q10).** Three numbers describe the same thing and disagree. Pick one denominator, compute it once, show it in one place. **Trivial** to fix, and it is the kind of arithmetic a physician will check.
5. **Decide, per lab row, whether the source is Canvas or Junction, and say so in the annotation.** Junction only has what Junction ordered. Anything predating Aleron must come from `Canvas FHIR:DiagnosticReport` / `Observation?category=laboratory` reads. `Lp(a) measured once` (G10) and `Recency: labs 7 d` (B4) both need the full history, so both need the Canvas read regardless. **Medium** — it doubles the lab-fetch path.
6. **Own the banding tables explicitly (F2, F4, G12, I11, J3, L3/L7/L11/L15, O7, E17).** Eleven visible values are Aleron-defined thresholds that no API returns: prediabetes, impaired glucose, hs-CRP tertile, waist-to-height 0.5, VO₂max percentile, four PRO desired ranges, the SpO₂ expected range, the step target. They must be a versioned, reviewable table, and the `.pfoot` should say so. It currently says flags "derive from recorded context fields and standard reference ranges", which understates it. **Medium** — a real artefact, not a copy change.
7. **Nadir is not a Junction operation (D5, D6, N1, O2, O5).** Four visible values are per-window minima of a paginated raw timeseries. Budget for the sample volume (30 nights of overnight SpO₂ per patient per page load) and for the night-boundary segmentation, or escalate Junction Sense with the CSM. **Large** if done client-side, **medium** if Sense opens up.
8. **Add allergies, medications and the problem list.** All three are FHIR-readable (`AllergyIntolerance`, `MedicationRequest`/`MedicationStatement`, `Condition`) and none is on a screen called "Patient data" that finds room for daily step counts. This is the cheapest high-value addition on the list. **Small.**
9. **Say which sleep field `6.4 h` is (E10).** `total` and `duration` differ by the awake time and would read about an hour apart. **Trivial.**
10. **Define "active minutes" (E18).** Junction gives `low`/`medium`/`high` separately. Either show the three or state the sum's composition. **Trivial.**

## Alternative pathways

**E13 `firmware update` (NONE).** Nearest workable: drop the sentence and keep only the trend-state word, which already says `snapshot_only`. If the fact matters clinically, Aleron would have to record `provider.device.updated` webhook payloads over time and diff them, which means Aleron storing device history — **a direct violation of "Aleron stores no patient data"**, and a weak one to break the rule for. Recommend: **drop**.

**E20 `did not backfill history at pairing` (GAP, effectively NONE for read).** Junction delivers `historical.data.activity.created` on backfill completion. Aleron can subscribe, but to *display* it later it must remember it. Cheapest compliant home: `Canvas SDK:UPSERT_PATIENT_METADATA` with a `junction.backfill.activity` key — the fact lives in Canvas, Aleron stores nothing, and the metadata escape hatch is exactly what ground truth §3 nominates for Aleron-owned facts with no FHIR field. Cost: a metadata key per metric per patient, and no query surface across patients.

**E23 `last sync` (NONE).** Replace with a derivable equivalent: `latest calendar_date across sleep and activity summaries`, rendered as "wearable data through 30 Jun 2026". It is honest, costs one field of the call already being made, and does not claim a sync event. Recommend: **rephrase**.

**N3 `sleep regularity 58 of 100` (NONE).** Two workable substitutes, both from the call already in flight: `sleep[].efficiency` (a real percentage Junction returns) or an Aleron-computed bedtime-start standard deviation from `bedtime_start` across the window. The second is closer to what "regularity" means clinically and costs no extra request. Recommend: **swap to bedtime-variance, label it as Aleron-computed**.

**N7 `functional reserve` / `strength and lean mass` (NONE).** Junction's `body[].lean_body_mass_kilogram` covers lean mass only when a body-composition device is connected, which this patient's device set does not imply. Strength has no API at all — grip dynamometry and chair-stand are in-clinic measures. Options: (a) keep the driver as `Pending` with `baseline needed` and no metric name, which is what the screen almost does; (b) route it to a Canvas in-clinic capture — `Canvas SDK:VitalSignReading` cannot hold it either (not in the creatable vital list), so it would be a `Questionnaire`/`PhysicalExam` command with the measurement as an answer. Recommend: **(a) now, (b) when the measure is defined**.

**P5 `MBTA 163-gene panel` attributed to Junction (WRONG).** Redirect: the genetics path in this platform is the **Canvas genetics integration**, not Junction. The report lands in Canvas as a `DiagnosticReport` with a `presentedForm` PDF; Aleron reads it back by `GET /DiagnosticReport?patient={id}&category=GE` (or LAB, depending on how the integration categorises it) and renders the PDF link. The physician **lands in Canvas** on the report itself via the rail foot's `Open in Canvas ↗`. **The return leg does not exist** — ground truth §6 names deep-linking back into Aleron from a Canvas note as undrawn. In practice the physician alt-tabs back to the still-open Aleron tab, which is a habit and not a mechanism. The structured finding (`ATM heterozygous P/LP`, zygosity, ACMG class) has no FHIR field; it goes in `UPSERT_PATIENT_METADATA` keyed to the report id, or Aleron re-parses the PDF on every load. Cost of the metadata route: the finding is stored as an opaque Aleron-shaped key inside Canvas, invisible to Canvas's own clinical logic.

**P9 `Home sleep apnea test` as an orderable (NONE).** No API places it. Three options, in order of preference: (1) **Redirect into Canvas** — the physician clicks through to the Canvas chart and places the order natively in the Canvas UI, where `ServiceRequest` is created by the application rather than the API; Aleron reads it back afterwards with `GET /ServiceRequest?patient={id}` and flips the ledger row from `proposed` to `placed`, which is a real, verifiable return leg and does not need deep-linking. (2) `Canvas SDK:Refer` with `referral_type` set to a sleep-medicine service provider, which is signable via the SDK but converts an order into a referral and changes what happens to the patient. (3) `Canvas SDK:Task` assigned to staff with the order text in `comment` — cheap, honest, and gives the ledger something to poll. Recommend: **(1), with (3) as the tracking mechanism.** Do not implement it as a Junction order.

**Standing-order ids P2/P6 (GAP).** `UPSERT_PATIENT_METADATA` keyed by order, or Junction's `passthrough` field on `POST /v3/order` which round-trips the id with the order and comes back on the result webhook. `passthrough` is better here: no Canvas write, no Aleron storage, and it survives the whole order lifecycle. For Canvas-placed orders there is no equivalent, so those fall back to metadata.

**PRO desired ranges L3/L7/L11/L15 and every band in required change 6 (GAP).** These are *program configuration*, not patient data, so Aleron holding them breaks no constraint — the constraint is on patient data. State that distinction in the annotation, keep the tables in Aleron, version them, and stamp the version in `.pfoot` next to `packet-validator 2.4.0`. This is the recommendation for all eleven.

**`metabolic-risk phenotype` C2, `required channel` K4 (GAP).** `UPSERT_PATIENT_METADATA`. These are per-patient facts, so Aleron holding them *would* break the constraint; the metadata effect keeps them in Canvas at the cost of being unreadable to Canvas's own protocols.

**`reviewed` state P4 (GAP).** `Canvas SDK:LabReview` writes but does not read back. Pair it with a `Canvas SDK:Task` (readable through `GET /Task?patient={id}`) whose completion is the queryable "reviewed" flag. Cost: two writes per review, and the Task and the LabReview can drift.

**Body fat I7, VO₂max J1 (GAP for the record, OK for display).** Junction serves both. Canvas can hold neither — neither is in the creatable vital list. So these two values exist on the screen with **no system of record behind them**: they are read live from Junction on every page load, and if the Junction connection lapses they vanish from the chart with no Canvas trace. Alternative: `Canvas SDK:CREATE_OBSERVATION` (the SDK effect, unlike FHIR, is not documented as restricted to the vital list — **unverified**, and worth a spike), or `UPSERT_PATIENT_METADATA` as a dated snapshot. Do not cache them in Aleron.

## Contradictions with what the screen already claims

1. **Wearable coverage is three different numbers.** The spine says `Coverage · nights 26 · step days 24`; the disclosure says `wearable_summary.v1 · 26 of 30 nights present`; the HRV block says `Coverage 82 % wearable`. 26 of 30 is 87 %, not 82 %. The 82 % is carried unchanged from the BRIEF fixture; the nightly counts are new to this screen. One of them is wrong on this patient.
2. **The frozen packet contains data from after it froze.** The header says `Packet v1 · frozen 24 Jun 2026`, and the disclosure says `frozen 24 Jun 2026 after baseline results and genetics`. But the device group says `last sync 30 Jun 2026 08:12` and `Staging only began emitting at the 29 Jun firmware update`. Either the packet is not frozen, or the wearable rows are outside it. The screen's own framing sentence, *"The intake packet in two halves"*, asserts everything on the surface came from the packet.
3. **The recency figures do not fit the dates on the screen.** `Recency · Labs 7 d, wearable 1 d` puts "today" at 1 Jul 2026 given the 30 Jun sync. The ledger says the metabolic panel `resulted 22 Jun`, which is 9 days, not 7.
4. **A device number is ranked as a driver while the screen says device numbers do not rank.** The boundary sentence reads: *"Device instruments corroborate recovery and sleep; they do not replace patient-reported outcomes or determine protocol state."* Three of the nine driver tabs are pure device numbers — `Movement · Low · 3,800 steps/d`, `Cardiorespiratory fitness · Low · 28 mL/kg/min`, `Sleep-disordered breathing · High · SpO₂ 89 %` — and the last of those is the open one, carrying a `High` ember tile and a scored gate at `35 % reclassification odds`. Corroboration is doing protocol work here.
5. **The same finding is graded twice, differently.** The spine tiles SpO₂ 89 % as `desaturation` and the abnormal roll-up calls it `overnight oxygen desaturation`; the driver detail heads it `High` and then describes the baseline as *"slight desaturation, SpO₂ nadir 89 %"*. Slight and High on the same number.
6. **The rail comment and the annotations disagree about the rail.** The HTML comment above the nav says *"Seven sections in v2: v1's six plus Screening, inserted after Vitality"*, and a `gap` annotation says *"Screening has no canonical icon."* The rendered rail has six items and no Screening, and a `new` annotation says *"The rail returns to the six sections that register O4 fixes."* Two of the three are stale. Not an API issue, but it is in the annotations and it misdescribes the screen.

## Open questions for the humans

1. **Which system of record holds a wearable value?** Canvas cannot store HRV, sleep duration, steps, active minutes, VO₂max, BMI or body fat — verified against the creatable-vital list. So either those values live only in Junction and the chart shows data Canvas has never seen, or Aleron caches them and breaks the storage constraint. This is the single largest unresolved question on the screen and it affects fifteen rows.
2. **Does `Canvas SDK:CREATE_OBSERVATION` carry the same vitals-and-panels restriction as the FHIR endpoint?** Ground truth notes the SDK effect exists and that `UPDATE_OBSERVATION` exists where FHIR has none. If the effect is unrestricted, most of question 1 dissolves. Worth a one-hour spike.
3. **Who owns the banding tables, and are they reviewed?** Eleven visible flags are Aleron-defined thresholds presented in the same visual register as lab-supplied `is_above_max_range` flags. A physician cannot tell which is which. Should they be able to?
4. **Is there a Junction Sense agreement, or not?** Every windowed aggregate on this screen (SpO₂ nadirs, 7/30/28-day means, coverage counts, personal baselines) is either a Sense query or a large client-side pull. Sense is closed beta and CSM-gated. The answer sets the cost of six of the seven charts.
5. **Where do pre-Aleron labs come from, and has anyone tried the read?** `Canvas FHIR:DiagnosticReport` search is documented but says nothing about externally imported reports. If imported reports come back without structured `result[]` Observations — PDF only — then `Lp(a) measured once` and every historical comparison on this screen is unimplementable, and Junction's closed-beta Lab Report Parsing API becomes the fallback.
6. **What actually places a home sleep apnea test?** No API in this stack does. The screen shows it as `proposed, awaiting review`, which is honest, but nothing downstream of that state has a mechanism.
7. **Why does a screen called Patient data show no allergies, no medications and no problem list?** All three are FHIR-readable today. Was this a deliberate scope call, or did the merge with Vitality crowd them out?
8. **Which lab values on this patient came from a Junction order and which from Canvas?** The answer changes the fetch path for eleven lab rows and is currently invisible on the surface and in the annotations.
