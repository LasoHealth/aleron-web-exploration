# Does the shipped platform have PRO data?

**One-line answer:** No. There is no patient-reported *outcome* anywhere in the shipped code — no
collection surface, no table, no column, no engine input, no physician surface, no Canvas write.
`energy`, `cognitive clarity`, `mood`, `body ease` do not exist as identifiers in either repo. The
v0 replica's `self-reported energy 4/10` numbers are hand-written fixtures in the HTML.

What *does* exist is a one-time **self-reported lifestyle and family-history intake** (exercise
frequency, diet, sleep hours, alcohol/tobacco, six family-history yes/no items, free-text notable
details). That is history/exposure data, not an outcome measure, it has one timepoint with no
re-administration, and no physician surface renders it.

---

## Collected?

**One surface only: the Flutter onboarding chat questionnaire.** Not a PRO instrument.

`C:\LASOHealth\apps\aleron\lib\screens\onboarding\health_profile_screen.dart:212-325` — a
`static const _conversation` array of 18 steps. Every answer is a **multiple-choice chip or a wheel
picker**; there is no numeric scale anywhere. The full inventory:

| Step | Question (verbatim) | Answer shape |
|---|---|---|
| 0 | Welcome | Start button |
| 1 | `What was your assigned gender at birth?` | Male / Female |
| 2-3 | `What's your height?` / `And your weight?` | wheel picker |
| 4 | `How often do you exercise?` | Daily / 3-5x / 1-2x / Rarely or never |
| 5 | `How would you describe your diet?` | 4 options |
| 6 | `How many hours of sleep do you typically get per night?` | 4 bands |
| 7 | `How often do you drink alcohol?` | Never / Occasionally / Regularly |
| 8 | `Do you smoke — tobacco or marijuana?` | Never / Occasionally / Regularly |
| 9-10 | prescriptions / supplements gate | Yes/No → photo capture loop |
| 11-16 | six family-history items (heart disease, stroke, diabetes, hypertension, Alzheimer's, cancer before 50) | Yes / I don't know / No |
| 17 | `Last one — are there any other notable health details you want to share?` | Yes/No → free text |

**Frequency: once.** `_loadSavedOrStart()` (same file, ~line 335) checks
`onboardingProvider.completedSteps.contains(OnboardingStep.healthProfile)` and, if complete, renders
a static summary/edit view. There is no re-administration, no schedule, no reminder, no trend.

**No named instrument.** `PHQ`, `GAD`, `AUDIT-C`, `PEG-3`, `STOP-Bang`, `UCLA-3` appear **zero times**
in `Aleron-Web/app`, `Aleron-Web/database`, `Aleron-Web/routes`, `Aleron-Web/src`, `Aleron-Web/engine`,
or `aleron/lib`. They appear only in `aleron-canonical-documents/system-design/vitality-action-library.json`
and `Aleron-Web/docs/physician-portal/intake-and-consent-gate-plan.md` — design documents, not code.

**No scale widget exists in the app.** `grep -rln "Slider\|RatingBar\|scale of\|1-10\|0-10" aleron/lib`
returns nothing. The Flutter screen inventory (127 dart files) has no `check_in`, `checkin`, `survey`,
`vitality`, or `wellbeing` screen — the closest thing is `screens/signup/goals_screen.dart`, which is
a 5-chip **service preference** picker (`Genetic Counseling`, `Health Monitoring`,
`Proactive Health Insights`, `Comprehensive Panels`, `Actionable Health Plans`,
`goals_screen.dart:21-27`), persisted to `patient_profiles.goals` and read by nothing.

## Persisted?

**Migration:** `C:\LASOHealth\apps\Aleron-Web\database\migrations\2026_04_13_000001_create_patient_histories_table.php`
**Table:** `patient_histories`, one row per user (`->unique()` on `user_id`), all columns nullable strings.

```php
Schema::create('patient_histories', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
    $table->string('biological_sex', 50)->nullable();
    $table->string('height', 50)->nullable();
    $table->string('weight', 50)->nullable();
    $table->string('exercise_frequency', 100)->nullable();
    $table->string('diet', 255)->nullable();
    $table->string('sleep_hours', 50)->nullable();
    $table->string('alcohol_tobacco', 100)->nullable();
    $table->string('fh_heart_disease', 100)->nullable();
    $table->string('fh_stroke', 100)->nullable();
    $table->string('fh_diabetes', 100)->nullable();
    $table->string('fh_hypertension', 100)->nullable();
    $table->string('fh_alzheimers', 100)->nullable();
    $table->string('fh_cancer_before_50', 100)->nullable();
    $table->timestamps();
});
```

Two later additions:
`2026_04_27_000001_add_education_years_to_patient_histories.php` and
`2026_05_08_000001_add_notable_details_to_patient_histories.php`
(`$table->text('notable_details')->nullable()->after('fh_cancer_before_50')`).

Note the shape: **strings, one row, unique on user_id, no `recorded_at`, no instrument column, no
score column.** It is an upsert-in-place profile, structurally incapable of holding a repeated
measure. Write path: `PatientHistoryController::store()`
(`app/Http/Controllers/PatientHistoryController.php:56-72`) does `updateOrCreate(['user_id' => ...])`.
Client: `aleron\lib\data\profile_service.dart:124-171` (`savePatientHistory`), mapping response
indices → fields, `POST /api/mobile/patient-history`.

**No other candidate table exists.** All 64 migrations were enumerated. There is no `patient_reported_*`,
`pro_*`, `check_ins`, `surveys`, `questionnaire_responses`, `vitality_*`, or `wellbeing_*` table.
The 33 models in `app/Models` contain no PRO model.

One near-miss worth naming so it isn't mistaken for a PRO:
`2026_04_30_000002_add_effort_capacity_to_users.php` adds
`$table->unsignedTinyInteger('effort_capacity')->nullable()`. It looks like a self-rated capacity
score, but **no route, controller, or client ever writes it** — the only readers are
`app/Services/ActionLayer/ActionLayerService.php:203` (`$effortCap = $user->effort_capacity ?? null;`)
and `app/Services/ActionLayer/EffortBudget.php` (default 3), where it caps how many Tier-A actions the
Action Layer emits. It's an unexposed physician/ops knob, not a patient input.

## Reaching the engines?

**No.** The Systemic service assembles its input bundle in
`C:\LASOHealth\apps\Aleron-Web\app\Services\Systemic\DataAssemblyService.php`. The assembly is
exhaustive and enumerated in one place (lines 148-168):

```php
$sourceCounts = ['canvas' => 0, 'wearable' => 0, 'invitae' => 0, 'intake' => 0];

$this->addDemographics($user, $asOf, $rows, $sourceCounts);
$this->addLabs($user, $rows, $sourceCounts);            // raw values only — no derived biomarkers
$this->addWearableSummaries($user, $asOf, $rows, $sourceCounts);
$this->addConditions($user, $rows, $sourceCounts);
$this->addMedications($user, $rows, $sourceCounts);
$this->addFamilyHistory($user, $rows, $sourceCounts);
$this->addGenetics($user, $rows, $sourceCounts);
```

Seven adders, four sources, nothing else. Every row is `source | field | value | context | date`
(`row()`, line 604). The **only** rows carrying a self-report marker are three lifestyle strings from
`patient_histories`, in `addDemographics()` (lines 244-261):

```php
$rows[] = $this->row('intake', 'exercise_frequency', $history->exercise_frequency, 'self_reported', '');
$rows[] = $this->row('intake', 'diet_pattern',       $history->diet,               'self_reported', '');
$rows[] = $this->row('intake', 'sleep_hours_reported', (string) $history->sleep_hours, 'hours', '');
$rows[] = $this->row('intake', 'smoking_alcohol_history', $history->alcohol_tobacco, 'self_reported', '');
```

That is the entire self-reported surface visible to the Systemic model: four categorical lifestyle
strings with an **empty date field**. No `energy`, no `mood`, no `cognitive_clarity`, no `body_ease`,
no numeric self-rating of any kind. Sleep is the only felt-domain word present, and it arrives as a
band ("7-8 hours"), corroborated separately by `sleep_duration` / `sleep_efficiency` wearable
summaries (lines 306-315).

`grep -rniE "\b(energy_score|cognitive_clarity|body_ease|mood_score|felt_energy|pro_score|patient_reported_outcome)\b"`
over all of `Aleron-Web` (excluding `vendor`/`node_modules`) returns **zero matches**. So does
`grep -rniE "(energy|clarity|mood|body_ease|fatigue|sleep_quality)"` over
`app/ database/ routes/ src/ engine/ resources/views/` — the single hit in the whole repo is
`config/wearable_trust.php:43`, `'calories' => ['calories', 'kcal', 'energy']`, a unit-alias table.

**A trap to avoid:** `vitality` matches heavily in `Aleron-Web/app`, but it is not PRO data. In the
Action Layer it is an **output bucket** —
`app/Services/ActionLayer/Dto/ActionLayerResult.php:10`: `@param list<TieredAction> $vitality  S<=2
actions, tiered A/B/C` — i.e. recommended actions that improve daily function, as opposed to
`$longevity` actions that prevent death/disability. `RunActionLayer.php:124` prints
`═══ Vitality (Improving Daily Function) ═══`. Engine output, not patient input.

## Visible to a physician today?

**No — and not even the lifestyle intake is visible.**

`grep -rniE "energy|clarity|mood|body ease|vitality|self-report|patient-reported"` over the whole of
`Aleron-Web/resources/views/` returns **zero matches**. The portal is 13 Blade files:
`physician/patients/{index, emr, risk-models, care-plan, lab-orders, standing-orders}.blade.php` plus
`partials/{domain-panel, risk-summary-grid, systemic-panel}.blade.php`, auth and layouts.

Stronger: no physician controller or service ever loads the intake at all —
`grep -rn "patientHistory\|patient_history" app/Http/Controllers/Physician/ app/Services/Physician/`
returns nothing. `patient_histories` reaches the physician side only indirectly, as four
`source=intake` lines inside the Systemic model's prompt bundle, where it can surface (if at all)
as engine narrative prose, never as a field a physician can read. `emr.blade.php` is a stub whose
own heading says the full chart lives in Canvas.

## Written to Canvas?

**No. No `QuestionnaireResponse` write exists anywhere in code.**

`app/Services/Canvas/Resources/` contains exactly seven resource wrappers:
`PatientResource`, `ConditionResource`, `ObservationResource`, `MedicationRequestResource`,
`MedicationStatementResource`, `ConsentResource`, `DocumentReferenceResource`.
There is no `QuestionnaireResponseResource`, and no `CommunicationResource`.

`ObservationResource::create()` exists, but its own docblock scopes it to labs:

> `Observation` reads and writes … Wearable / vital-signs / social-history Observations stay local
> (per gap doc §4.3, §4.6).

Its only caller path is `JunctionResultObservationMapper` (lab results). So the lifestyle self-report
is explicitly *not* pushed to Canvas either.

`QuestionnaireResponse` appears **only in documentation** — never in `app/`, `src/`, `engine/`,
`database/`, `routes/`, or `aleron/lib`:

- `docs/canvas-data-mapping-and-engine-gaps.md:81` — maps `patient_histories` lifestyle fields to
  `Observation` (social-history) / `QuestionnaireResponse` and marks the row ⚠️ (gap §4.6), noting
  at line 180 that it *"requires structured capture, not the …"* free-text shape they have.
- `docs/physician-portal/intake-and-consent-gate-plan.md:79` — lists
  `QuestionnaireResponseResource (new)` as an unbuilt item, with line 110 still asking who configures
  the template.

So the audit's recommendation lands on genuinely empty ground: `QuestionnaireResponse` is a
recognized, documented, still-unbuilt gap.

## Which claim is right

**The v2 annotation is right.** `aleron-physician-portal-designs\v2\patient-data.html:1114` —
*"the current portal models five disease domains plus a systemic pass and records no patient-reported
outcome anywhere"* — is confirmed by code. So is the v1 tooltip at
`aleron-physician-portal-designs\v1\vitality.html:126`
(*"v0 has no vitality surface. Patient-reported outcomes are not collected anywhere in the shipped
portal."*).

The v0 replica's numbers are **fixtures**. What settles it, in order of force:

1. **No identifier exists.** `energy`, `cognitive_clarity`, `mood`, `body_ease` as field names return
   zero hits across both repos' code directories. A pipeline cannot exist without a name.
2. **No collection widget exists.** Zero `Slider`/`RatingBar`/`0-10` matches in `aleron/lib`. Every
   one of the 18 onboarding answers is a chip or a wheel picker. A 4/10 cannot be entered.
3. **No column exists.** All 64 migrations enumerated; `patient_histories` is the only intake table,
   it is all-strings, one row per user, no `recorded_at`, no score column.
4. **The engine input is a closed list.** `DataAssemblyService` lines 148-168 name all seven adders
   and four sources. `self_reported` appears exactly four times in the whole of `app/`, all four on
   categorical lifestyle strings with empty dates.
5. **The one word that could be mistaken for a PRO pipeline — `vitality` — is engine output**, an
   action-priority bucket (`ActionLayerResult.php:21`), not patient input.

The honest reading of v0's `self-reported energy 4/10` and `mood 6 / body ease 5`: the replica author
wrote plausible-looking clinical prose for the LLM-narrative panel. The Systemic model *is* an LLM
(`SystemicLlmCaller`, `PromptRegistry`) that emits narrative, so such a sentence looks like something
it could say — but it can only reason over the row bundle it is given, and no PRO value is ever in
that bundle. Numbers with no field, no widget, no column and no source count are fixtures.

**Verdict for the design decision:** the absence is real and is the finding. There is no PRO pipeline
to extend — a PRO surface would be greenfield: a repeating-measure table (per-timepoint rows, unlike
`patient_histories`), a collection screen in the Flutter app, an eighth adder in
`DataAssemblyService`, a physician-facing panel, and a `QuestionnaireResponseResource` for the Canvas
write. All five are missing today; the last two are already logged as known gaps in
`docs/canvas-data-mapping-and-engine-gaps.md` and
`docs/physician-portal/intake-and-consent-gate-plan.md`.
