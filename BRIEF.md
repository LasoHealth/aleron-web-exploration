# Shared brief — Aleron MD physician portal wireframes

Read this fully before building any screen. It applies to every file in this
repo. Your screen assignment says which files to produce and what goes in
them; this file is the shared rules, so the whole set feels like one system.

## What this is

Four parallel versions of the Aleron MD **physician** web portal, built as
high-fidelity static HTML you open directly in a browser. The first three are
complete sets; v3 is a single screen posing one question:

| | What it is | Source of truth |
|---|---|---|
| **v0** | A faithful replica of the portal as it stands today | `C:\LASOHealth\apps\Aleron-Web` |
| **v1** | The canonical reference surface, recreated | `aleron-canonical-documents/system-design/diagrams/aleron-actionmap-al47m-ds.html` |
| **v2** | v1, plus every v0 capability that v1 has no home for | both, plus the role/release matrix |
| **v3** | v2’s care plan again, opt-in instead of opt-out, with its four acts split into steps | v2, plus the open question in `docs/canvas/ORDERING-DESIGN-AND-INTEGRATION.md` (in `Meridian-Web`) |

They exist to be demoed side by side. v0 is the baseline you are arguing
against; if v0 does not look like the thing the team uses today, the argument
is worthless. **v0 is not a proposal and must never be improved.** Where the
shipped app violates the design system, the replica violates it too, and the
violation gets a comment saying so.

The patient side of this product already has its wireframe set at
`C:\LASOHealth\apps\aleron-wireframes` (the member Cabin register).
This repo is its physician sibling and follows the same conventions, with one
deliberate improvement: everything shared lives in `physician-chrome.css`
instead of being copy-pasted into each file's `<style>` block.

## The product (so copy and tone are right)

Aleron is a physician-directed longevity program. The member-facing app is
warm and plain-spoken. **This surface is not that.** The physician register
states its own premise:

> The chart is an instrument. The member reads; the physician scans,
> mid-clinic, then drills where the instrument points. Parse speed still
> decides every contest, but here it serves triage: find the abnormal, see
> what it changes, act.

Voice on this surface: precise, unhedged, and honest about what it does not
know. The reference surface's most characteristic habit is that it never
hides a gap. `Not emitted`, `Provenance missing`, `model provenance pending`,
`Insufficient data to compute this domain`, `An unassessed risk is not a low
risk` — these are real strings, they stay visible where a value would be, and
you should reach for them rather than dropping a row.

Real terminology, used consistently:

- **register** — the visual mode. `day` (warm paper) and `flight-deck`
  (navy). Not a dark mode: it is a per-surface design decision.
- **the action map** — the scatter that prices every lever and gate on one
  patient-QALY scale.
- **gate** / **gated** — a diagnostic whose result unlocks or resequences an
  action.
- **the ledger** — the evidence table under the action map.
- **required channel** — an obligation (genetics, preventive rules) that is
  not ranked against opportunities. It **must be dispositioned**, which is not
  the same as *must be accepted*: it can be included, deferred with a reason, or
  excepted with a reason, and it can never be dropped silently. Whether an
  override is permitted at all is a property of the individual obligation, the
  way Canvas puts `can_be_snoozed` on each protocol rather than having one
  global rule. A genetics P/LP finding and a USPSTF age threshold do not carry
  the same force, so do not write copy that says they do.
- **release** — the physician act that makes a plan patient-visible. Signing
  the note and authorizing orders are *separate acts* from releasing.
- **the packet** — `patient_packet.v1`, the validated bundle the engine reads.
- **SPAR engine** — physician/system context only, never patient-facing.

Physician character is **Dr. A. Okafor** (from the reference surface's journal
entries). Do not invent another. The patient set's physician is Dr. Thompson;
that is the member's doctor and belongs on member surfaces, not here.

No em dashes in any user-facing prose. Anywhere.

## The design system

Established and ratified. Build against it; do not explore visual directions.

**Every screen links exactly these, in this order:**

```html
<link rel="stylesheet" href="https://kito-laso.github.io/aleron-canonical-documents/product-design-system/tokens.css">
<link rel="stylesheet" href="https://kito-laso.github.io/aleron-canonical-documents/product-design-system/components.css">
<link rel="stylesheet" href="../physician-chrome.css">
```

v0 screens add a fourth: `<link rel="stylesheet" href="v0-tokens.css">`.

The two canonical stylesheets are linked **by URL, never hand-copied**. This
is the one deviation the team explicitly chose after the
`aleron-patient-onboarding` prototype hand-copied tokens and drifted. The URL
also serves the real Hanken Grotesk variable font, so linked screens render in
the actual typeface rather than a system fallback.

### The two rails

Register O4 fixes rails per surface family. Both are closed sets: adding an
item is a design decision, not a screen's call.

**Chart rail, six** — Patient Data · Risk · Care Plan · Orders · Journal ·
Aleron AI. `Risk` carries Models and Actions as sub-tabs. `Care Plan` carries
the three commit acts including release, composed the way
`apps/physician/src/dashboardApp.js:961` composes them. `Orders` carries active
orders and the screening schedule. The rail foot carries `Open in Canvas ↗`,
which is an outbound action, not a section.

**Inbox rail, four** — Inbox · Panel · Reviews · Messages. The rail foot
carries the practice-wide standing-order registry, which is deliberately not a
rail item: v0's own eyebrow calls it *"Practice-wide registry · LASO Wellness ·
not patient-specific"*, so it does not belong in a patient's chart.

A surface that is reached from a rail foot still needs a way back. Every such
screen carries a breadcrumb to its family.

### Register

Physician surfaces are **flight-deck**. Set `<html data-register="flight-deck">`
on v1 and v2 screens.

v0 ships in **day** (`data-register="day"`) with a working flight-deck toggle
in its header, so v0 screens use `day`. That contrast is deliberate and is one
of the findings: the current portal defaults to the member's register on a
surface the register document says should be the instrument's.

P1: *"Day is the removal of one class, kept live for print and consult-room
reading. If a state cannot be produced by the token swap alone, the component
is wrong, not the mode."* Never write a color that only works in one register.

### The eight physician laws

From `product-design-system/physician-register.html`. Violating one is a
defect, not a style choice.

- **P1 Flight-deck by default, register-clean always.** One class flips the
  whole surface. No register-specific color values.
- **P2 Color is meaning; category rides on shape.** Five signals only:
  forward gold (line and fill), advisory (text gold by day, lit gold by
  night), hazard ember, baseline slate, unmodeled indigo. On the action map a
  **circle acts, a square measures**, the ladder is the fitness course. Drug,
  lifestyle and procedure are **not hues** — the arm lives in the ledger row.
  Gold on an instrument is the selection focus, and it counts as the
  surface's one gold.
- **P3 Hazard is a tile.** Ember never runs as text on the night ground. Band
  words and status hazards are filled ember tiles with cream text at radius 4,
  in both registers. Use `.ptile`. Advisories are words in advisory color and
  never tiles, so true hazards outrank quiet advisories by construction.
- **P4 The instrument speaks voice.** Values in the voice face, tabular,
  weight 500, **with units, every time, on charts and ledgers too**. The audit
  (mono) face is retired from product surfaces; it survives only in the
  wordmark tag. This is the single hardest rule to keep, because v0 uses mono
  everywhere and it looks good. v1 and v2 give it up.
- **P5 The scan clause.** Group headers inside citation tables at density may
  run tracked caps, as waypoints for the scanning eye. **Scoped to table group
  headers and the patient-data group headers, nothing else.** Anything that
  reads as a sentence stays sentence case.
- **P6 Furniture is tokened.** Gridlines, leader lines, brackets, reference
  bands and SVG marks draw from ink alphas and the gold wash through tokens,
  never hex, so the register flip carries the whole instrument, chart and all.
- **P7 The instrument confesses its limits.** Axis captions state the value
  frame in place (*actions plot net, diagnostics plot value if reclassified*).
  AI-scored and unmodeled marks are indigo and dashed. Pending is declared,
  never blank. A chart that hides its frame is lying politely.
- **P8 Emphasis currency holds at density.** One elevated card per screen.
  Data tables stay square specimens. Selection is the inset field. Under load,
  content yields to disclosure and collapse; **air is never shrunk to fit more
  in.**

### The numbers

Rail 188px (`--nav-w`), rail icons 16px. Content measure 1020px. Radii:
tile 4 / control 10 / field 12 / card 16 / panel 18; data tables square.
Air ladder: `--air-row` 9 within a group, `--air-tier` 20 between sibling
blocks, `--air-group` 26 into a group, `--air-section` 44 into a section — and
between-group spacing must read as at least 2x within-group spacing.
Elevation: day gets the one Tier-1 shadow; flight-deck gets a hairline ring
(`--shadow-tier1` already resolves to the right thing in each register, so
never write a shadow by hand).

**`--s-3xs` is 2px, and it is a proposal.** The ratified ladder starts at
`--s-2xs` 4px and has no value for the gap *inside* one label: a patient name
over its code, a value over its unit, a tab title over its caption. Thirteen
screens needed one anyway and wrote a raw `2px` nineteen times. It is held in
`physician-chrome.css` section B with the other proposals. Use the token; do
not write `2px`. 4px is not a substitute, it reads as a gap between two things
rather than as one two-line label.

**There is no 1px spacing token.** The one place that needs a hairline of
padding uses `--line-thin`. If a second appears, that is an argument for a
token, not for a raw value.

### Hierarchy is not decoration

**Nothing that heads a block is smaller than the block.** The care plan had a
10.5px section heading over 15.5px prose, lighter and dimmer as well as
smaller, and it read as a footnote to the paragraph it was introducing. If a
surface is a document, its type behaves like a document: the ladder descends
from the title to the prose and never inverts.

`--size-caption` is the **chart-annotation tier**. It belongs to marks on an
instrument, secondary to a plotted value. It is not a heading size. Register O1
grants a 9.5px floor for annotation *secondary to a plotted mark*, which is the
opposite of a heading.

**Do not use a form-field label to head a document section.**
`.amd-field__label` is sized for a label above a short input. A section of a
clinical note is prose that happens to be editable, so it takes a document
heading, not a field label. Keep the canonical label for real controls: a
select, a date input, a group of buttons. Getting this right also keeps you
from restyling a canonical component to fix the size.

**One label per thing.** A single-field section already has its heading; do not
repeat it on the control. Give the control a `wf-sr-only` label so it keeps an
accessible name and let the heading do the visible work.

### Global forbidden list

- **No raw hex or px literals** in any screen's `<style>` block. Every colour,
  space, radius and line value is a `var(--...)`. The two sanctioned
  exceptions both live in `physician-chrome.css` and are labelled there: the
  desk-frame scaffold measurements, and SVG chart geometry.
- **No shadow** except `var(--shadow-tier1)`, on at most one Tier-1 element
  per screen.
- **Gold is a signal, never decoration.** At most one gold detail per screen,
  never as a button fill, card border or generic accent. On an instrument
  screen the gold budget is usually already spent on selection focus.
- **No tracked/letter-spaced caps** outside P5's scope.
- **No mono on a product surface** (P4). v0 is exempt because v0 does it.
- **Every clinical or numeric value shows its unit, every time.** Use `.pval`
  / `.pval__u`.
- **No skeleton screens, shimmer, spinners or indeterminate progress bars.**
  The canonical loading instrument is three pulsing dots (`.amd-loading`).
  v0 is exempt because v0 ships `.ds-skeleton`, and that is a tracked finding.
- **Checkbox is never used for consent.** Use `interaction.consent`
  (`.amd-consent`). Checkbox is fine for a genuine multi-select and for a
  physician attestation, which is an affirmation of fact, not a legal consent.
- No em dashes in copy. The one exception is the `<title>` tag, which is
  reviewer chrome rather than product copy and follows the patient set's
  existing `Aleron — Flow — Screen` naming. Nothing inside `<body>`.

### Icons

The canonical set is exactly six, nav-only. `icons.json`'s aliases were written
assuming the physician rail matched the member's six one for one:

| icon id | member label | physician alias in `icons.json` |
|---|---|---|
| `your-data` | Your Data | Patient Data |
| `risk` | Risk | Risk |
| `quality-of-life` | Quality of Life | Vitality |
| `plan` | Plan | Care Plan |
| `appointments` | Appointments | Journal |
| `chat` | Chat | Aleron AI |

**That assumption no longer holds.** The physician chart rail is still six, but
after the compression pass it reads Patient Data · Risk · Care Plan · Orders ·
Journal · Aleron AI. Vitality folded into Patient Data, so
`quality-of-life` is unused on this surface, and **Orders has no canonical
icon**. The two sets are the same size and no longer the same set.

Until the icon set is extended, Orders uses an inline specimen-tube glyph drawn
to the canonical recipe and labelled provisional in the markup:

```html
<!-- non-nav icon, drawn to match canonical stroke grammar; not yet a ratified icon -->
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6"/><path d="M10 3v13a2 2 0 0 0 4 0V3"/><path d="M10 11h4"/></svg>
```

This is a real gap for ratification, not a local shortcut: either
`quality-of-life` is retired from the physician alias table and an `orders`
icon is added, or the rail composition changes back.

Fetch them from
`https://kito-laso.github.io/aleron-canonical-documents/product-design-system/icons/<id>.svg`
and inline the path data. Render at 16px in the rail (`icons.json` says
`sizes.rail: 16`) on the 24px viewBox.

For any **non-nav** icon need there is no canonical set yet — a known,
documented gap. Draw a simple inline SVG in the same stroke grammar (24px
viewBox, 1.6 stroke, round caps and joins, `currentColor`, no fills except
dots 8px and under) and label it in an HTML comment:
`<!-- non-nav icon, drawn to match canonical stroke grammar; not yet ratified -->`
Never reach for Material Icons or an emoji.

## Shared chrome — use it, do not re-declare it

`physician-chrome.css` has three labelled sections:

- **A. Reviewer chrome** (`.wf-*`) — the breadcrumb, the **version switcher**,
  the desk frame, annotation callouts, flow-map nodes, the hub's cards and
  matrix. Not part of the simulated product.
- **B. Proposed components** (`.pshell`, `.prail`, `.phead`, `.pmod`,
  `.pspine`, `.pledger`, `.pdisc`, `.pfacts`, `.pval`, `.ptile`, `.pbound`,
  `.pfoot`, `.pempty`) — these **do** govern app content. `components.css`
  v0.5.0 declares 28 components and none of them is a navigation rail, yet the
  register specifies one to the pixel. Per AGENTS.md's missing-pattern rule
  that makes them design, not application: each block names the registry entry
  it proposes and traces its values to the register.
- **C. Upstream shims** — carried from the patient set's chrome file.

**Do not restyle a canonical component.** If `.amd-button` is wrong for your
screen, that is a finding for the annotation list, not a local override. Do
not invent a class that duplicates something in section B. If you genuinely
need something new and shared, add it to section B with a `PROPOSED` comment
naming the registry entry and the register clause it comes from — a per-screen
one-off in a `<style>` block is the silent dialect AGENTS.md forbids.

Per-screen `<style>` blocks are for **that screen's own layout only** — a grid
template, a chart's SVG geometry, a one-instance arrangement. If you find
yourself writing the same rule in two files, it belongs in the chrome.

## Anatomy of a screen file

```
<html data-register="flight-deck">
  <body class="wf">
    <nav class="wf-bar">        breadcrumb + version switcher   (reviewer chrome)
    <div class="wf-stage">
      <div class="wf-desk">
        <div class="wf-desk__chrome">   dots + route
        <div class="pshell">            the product starts here
          <aside class="prail">         rail: wordmark, patient, nav
          <main class="pmain"><div class="pwrap">
            <header class="phead">      h1 + one sentence
            ... modules ...
            <p class="pfoot">           provenance line
    <div class="wf-annotations">        what to look at            (reviewer chrome)
```

Every screen carries a version switcher with all three pills. A screen with no
counterpart in a version marks that pill `aria-disabled="true"` rather than
hiding it, so the gap is legible.

Every v2 screen carries annotations. Five kinds, and the kind is carried by
the word in the tag, never colour alone:

- `carried` — absorbed from v0, with the v0 file named
- `new` — comes from v1 / the reference surface
- `gap` — no canonical component exists; this is a proposal
- `dropped` — a v0 capability deliberately not carried, with the reason
- `fixed` — a defect this set found and corrected upstream in the shared chrome
  rather than locally, with what it was

## Craft floor

- **Contrast.** Body and placeholder text at least 4.5:1 on its ground, large
  text at least 3:1. Measure against the **composited** background: several of
  these grounds are `rgba`, and a checker that ignores alpha will report both
  false passes and false failures. Three ratified values fail and are corrected
  in `physician-chrome.css` (flight-deck `--text-tertiary`, day
  `--signal-advisory`, the unmodeled indigo on gunmetal) — do not re-derive
  them locally, and do not reintroduce the raw values.
- **Focus.** `--signal-forward` is 2.26:1 on paper and fails WCAG 1.4.11's 3:1
  floor for a focus indicator. The chrome resolves `--p-focus-ring` per
  register; use it, never a bare `outline: ... var(--signal-forward)`.
- **Air.** Use the ladder exactly. Squint: groups must still read as separate.
- **Type.** Reading text never below 14px, functional and caption text never
  below 10.5px. The one exception is dense SVG chart annotation, where the
  register's open decision O1 provisionally grants a 9.5px floor — use it only
  for annotation secondary to a plotted mark.
- **States.** Render the screen in its most information-complete state
  (populated, not empty-seeded) unless empty is itself the point. Where a
  component declares states you rely on, show them.
- **Copy.** Real sentences, real values, real units. Never `Lorem ipsum`, never
  `[placeholder]`. Copy too short to reveal wrapping is a defect.
- **Browser surfaces.** Theme the focus ring, the text selection colour and
  tabular numerals from the palette. No default blue focus ring.

## Canvas is the system of record, and it does not accept every write

Canvas holds all patient data; Aleron stores none. So any screen that says
Aleron put something in the chart is making a claim about a real API, and the
API refuses more than you would guess. Checked against
`docs.canvasmedical.com/api` and `/sdk`.

**There are two write paths, not one.** The FHIR API, called from outside, and
the Plugin SDK, running inside Canvas. They have different powers, and a screen
that says "writes" without saying which one is not specifying anything.

| Resource | FHIR API | Notes |
|---|---|---|
| `DocumentReference` | create, read, search | **No update.** A locked note amends by appending a new one. Needs `status: current`, `type`, `category`, `subject`, `content`, plus extensions for clinical date, reviewer and requires-signature. PDF via `application/pdf` base64. |
| `Condition` | create, read, update, search | The **only** supported update is marking one `entered-in-error`. `clinicalStatus` is `active` or `resolved`. `verificationStatus` is `confirmed`, `provisional` or `entered-in-error`, and is not writable. `category` accepts `encounter-diagnosis`, `problem-list-item`, `health-concern`, `sdoh`, `functional-status`, `disability-status`, `cognitive-status`. Omitting `encounter` creates a data-import note. |
| `Observation` | create, read, search | No update. |
| `Task`, `Coverage`, `QuestionnaireResponse` | create, read, update, search | |
| `ServiceRequest` | **read, search only** | Lab orders, imaging and referrals. **Cannot be created through the API.** Placed in the Canvas UI or by a plugin command, then read back. |
| `Goal` | **read, search only** | Created by the Goals command. Not an API write. |
| `MedicationRequest` | **read only** | Which is the actual reason e-Rx stays a native, prescriber-only act. |
| `DiagnosticReport`, `Encounter`, `CarePlan`, `Provenance`, `Procedure`, `Specimen` | **read only** | |

The Plugin SDK is where the rest lives: Commands (including Custom Command),
the Batch Originate Commands effect, `*_COMMAND__POST_COMMIT` and the other
`[COMMAND]_COMMAND__[STAGE]` events, and Custom Data (`CustomModels`,
`AttributeHubs`) for anything FHIR has no field for.

**Nor the back office.** The API rule has a `check.js` regex behind it because
API vocabulary is matchable. This one does not, and cannot: it is written in
ordinary English and only a reader can catch it. So it is a review question
instead.

For any line on a product surface, ask: **what does the physician do with
this?** Two failure modes to watch, because both read as helpful:

- *Internal pipeline.* `logged for scoring review` told a physician their
  addition enters a queue they cannot see, get no feedback from, and take no
  action on. It bought nothing and opened a question the screen did not answer:
  reviewed by whom, and does that change my patient's plan?
- *Product language in a clinical field.* The worse version. A fixture had a
  physician writing `Logged unscored for library review either way` inside their
  own **Reason not carried** textarea. No clinician writes that. When a fixture
  puts our vocabulary in the doctor's mouth, the copy is not merely leaking, it
  is misrepresenting how the field would really be used.

Keep the part the physician acts on. `A problem you add carries no score` is
real: it changes what they should expect from the action map. `and nothing is
invented to fill the gap` is P7 said out loud, and worth saying. What comes off
is the queue it lands in afterwards.

**Never put the API on the product surface.** Name the resource and the path in
an annotation, in this file, or in a `wf-scaffold` note. Do not put a field
name, its writability, or its permitted values in front of a physician. The
test is one question: *does the physician act on this?* If the answer is no
because the field is not theirs to set, it comes off the surface. Canvas and
the journal already show it.

v3 rendered `verificationStatus is not writable, and Canvas carries only
confirmed, provisional and entered in error` as a labelled axis inside a
patient's problem accordion, next to two axes that were genuine clinical data.
It read as clinical data because of where it sat, not because of what it said.
That is how implementation detail survives review: not by looking like an
argument, which the red marking catches, but by dressing as a field. `check.js`
now has an `api-on-product-surface` rule.

Say what happens, not what is written. `category: problem-list-item` and
`clinicalStatus: active` is `adds an active entry to the problem list`. Canvas
having no revise operation on a Condition is `the existing entry is added to,
never replaced`. Same fact, in the reader's vocabulary.

**So, for a screen:** name the resource, and name the path. "Aleron writes a
DocumentReference" is a checkable claim. "Written to Canvas" is not, and
"Lab Order Authorization" was a resource that does not exist. If a field has
nowhere to go, that is a `gap` annotation and a Custom Data Model, not a
sentence that implies a write.

## Script, and where data lives

These screens are static by default and most need no script. Where an
interaction is the thing under review, a screen may carry one inline
`<script>` at the foot of the file, as the patient set does. It is client only:
there is no backend behind this set, so a script holds state in the DOM and
re-renders. Nothing is persisted and nothing is sent.

When a screen does that, AGENTS.md governs the content:

> Data-bearing text comes from the data model. Example patient data belongs in
> a visible fixture object, not hardcoded in markup.

So the fixture is a plain object literal at the top of the script, readable
without running anything, and the markup carries only ids that point into it.
A rail card written as four hardcoded paragraphs is the thing that rule
forbids, and it has a practical cost as well as a formal one: it is why
`v2/care-plan.html` had a disposition panel for one problem out of four, with
nowhere for the other three to live.

Interaction rules that still apply:

- Selectors are real `<button>` elements, so Enter and Space work with no key
  handler and focus order is free.
- A region that swaps content carries `aria-live="polite"`, so the change is
  announced and not only drawn.
- `aria-pressed` on the selectors is the single source of truth for what is
  selected. The rendered pane follows it; it never disagrees with it.
- No libraries, no build step, no network.

## Fixtures — use these exact patients

Both come from the reference surface. Do not invent a third, and do not change
a value: the same patient has to read identically across v1 and v2 for the
comparison to mean anything.

**AL-47M · Ethan Park** · 47 · male · metabolic-risk phenotype

BP 142/90 mmHg (stage 2, untreated) · overnight RHR 38 bpm (low) · SpO2 nadir
89 % (desaturation) · HbA1c 6.0 % (prediabetes) · fasting glucose 110 mg/dL ·
fasting insulin 16 µIU/mL · HOMA-IR 4.3 (insulin-resistant) · TC 205 / LDL-C
132 / HDL-C 40 mg/dL · triglycerides 180 mg/dL (high) · ApoB 112 mg/dL ·
Lp(a) 25 nmol/L · hs-CRP 3.0 mg/L (high) · eGFR 93 mL/min/1.73m² · UACR
14 mg/g · height 178 cm · weight 93 kg · BMI 29.4 (overweight) · waist 105 cm ·
VO₂max 28 mL/kg/min (low) · never smoked · family history T2D + HTN ·
**ATM heterozygous P/LP** (required channel)

Risk: Cardiovascular 16 % 30-yr ASCVD (Moderate, AHA PREVENT) · **Metabolic
34 % 10-yr incident T2D (High)** · Neuro ~5 % 20-yr dementia (Moderate) ·
Cancer ~5 % 10-yr modifiable-site (Moderate) · Kidney ~3 % 5-yr incident CKD
(Low). Every domain but CVD carries `model provenance pending`.

Vitality 0-10: Energy 4 (low) · Mood 6 · Body ease 5 · Cognitive clarity 4
(low). HRV 34 ms against a 42 ms baseline, 82 % wearable coverage, `Low vs
baseline`.

VO₂max ladder: →33 (+5) +2.43 QALY · →38 (+10) +4.17 · →43 (+15) +5.37, all at
confidence 0.58.

**AL-56F · Mara Chen** · 56 · female · low-vitality Lp(a) phenotype

BP 118/72 mmHg · RHR 74 bpm · SpO2 nadir 94 % · HbA1c 5.3 % · glucose
92 mg/dL · HOMA-IR 1.1 (insulin-sensitive) · TC 188 / LDL-C 96 / HDL-C
68 mg/dL · ApoB 82 mg/dL · **Lp(a) 165 nmol/L (high)** · hs-CRP 4.8 mg/L ·
eGFR 84 · UACR 8 mg/g · ferritin 18 ng/mL (low) · TSH 4.7 mIU/L (high) ·
vitamin D 22 ng/mL (low) · BMI 23.9 · VO₂max 25 mL/kg/min · family history
premature CAD + osteoporosis · no P/LP findings.

Risk: **Cardiovascular 22 % 30-yr ASCVD (Moderate, AHA PREVENT + Lp(a)
overlay)** · Metabolic 7 % (Low) · Neuro ~7 % (Moderate) · Cancer ~6 %
(Moderate) · Kidney ~2 % (Low).

v0 screens need a cohort, so they use these two plus four more with names and
MRNs only. v1 and v2 default to **AL-47M Ethan Park**.

Every screen states its own frame in its `.pfoot`, e.g.
*"Synthetic profile · values from the intake packet · flags derive from
recorded context fields and standard reference ranges, not new interpretation."*
Reuse the reference surface's real footer strings where one fits.

## Verification

Before calling a screen done:

1. `grep -nE '#[0-9A-Fa-f]{3,8}|[0-9]+px' yourfile.html` inside the `<style>`
   block returns only SVG geometry.
2. `grep -c 'amd-\|p[a-z]*"' yourfile.html` — you are using shared classes,
   not reinventing them.
3. No `—` in any user-facing string.
4. Every numeric value has a unit.
5. Flip `data-register` between `day` and `flight-deck` and confirm nothing
   becomes unreadable. This catches P1 violations faster than anything else.
6. Open it. It has to actually look right.

## Block margins are reset

Browsers apply their own margins to block text before any stylesheet loads: a
`<p>` gets one em above and below, headings and lists get their own. Those are
zeroed in `physician-chrome.css` for the product surface, the annotation blocks
and v0.

This matters more than it sounds. The register fixes spacing to four values and
calls them the only legal vertical spends, which is only true if nothing else
is spending. Before the reset, 173 block elements in the product surface and
292 in the annotation blocks were carrying spacing no rule in this repo had
written, and a caption paragraph in a 9px grid was rendering at 20px because
the browser was quietly adding 10.5px. Four passes went into tuning an air
ladder that was being perturbed by a default.

So: **every gap comes from a token.** If a gap looks wrong, the value is wrong,
and it is in the CSS where you can find it.

v0 is reset too, which looks like a fidelity break and is the opposite. The
shipped app imports Tailwind v4, whose Preflight zeroes these margins, so a
replica that keeps them is the unfaithful one.
