# Aleron MD physician portal wireframes

Three complete, parallel versions of the physician web portal, as static HTML
you can open in a browser. Built for side-by-side review before anyone writes
portal code.

Start at [`index.html`](index.html).

| | What it is |
|---|---|
| **v0** baseline | A replica of the portal as it stands today, in its own visual language |
| **v1** canonical | The reference surface the canonical documents already designed |
| **v2** proposed | v1's chart plus the queue, ordering, release and audit surfaces v0 has |
| **v3** open question | The same care plan with an opt-in model instead of opt-out, and its four acts separated into steps |

`npm run check` prints the current screen and link counts. They are deliberately
not written down here: every count in this repo had drifted from the files it
described, and one of them sat inside a rule agents follow.

## Running it

Open any `.html` file directly. To browse with working relative links:

```bash
npm install
npm start
```

Then open `http://localhost:4173`. That is an Express static server over the
repo root; `PORT` overrides the port. A network connection is needed the first
time, to fetch the canonical stylesheets and the typeface.

## Published

<https://lasohealth.github.io/aleron-web-exploration/>

Pages serves `main` from the repository root, so the set publishes as it
stands and needs no build step. Two things keep it working:

**`.nojekyll` is required, not optional.** Pages runs the legacy Jekyll build
by default, and Jekyll drops any path whose name begins with an underscore.
All four flow maps are `_flow.html`, so all four returned 404 on the published
site while every screen linking to them returned 200: a break that is invisible
locally, because nothing about it is wrong on disk. `scripts/check.js` now fails
if `.nojekyll` goes missing while any underscored file exists.

**Links are checked with exact case.** Pages serves from Linux and is case
sensitive; this repo is authored on Windows, where `fs.existsSync` is not. A
link whose case did not match its file passed the old check and would have
404ed only once published. The check now reads the real directory entries and
reports a case mismatch as its own kind, separately from a link that points at
nothing.

`dist/` is deliberately not published. The live set links the canonical
stylesheets by URL and those are served from Pages too, so the online version
needs no inlining; `dist/` exists for demos with no network.

For a demo with no network, or to publish somewhere that blocks external
stylesheets:

```bash
node scripts/build-offline.js --refresh
```

That writes self-contained copies into `dist/`, with every stylesheet inlined
in the same load order. `dist/index.html` opens the whole set. Drop
`--refresh` to reuse the cached canonical CSS instead of re-fetching it.

## Layout

```
index.html              hub, and the v0/v1/v2 capability matrix
BRIEF.md                the binding rules every screen follows
physician-chrome.css    ALL shared chrome, in three labelled sections
v0/  v0-tokens.css      the baseline's own visual language, scoped to .v0
     _flow.html         flow map
     *.html             the version's screens
v1/  _flow.html         flow map
     *.html             the version's screens
v2/  _flow.html         flow map
     *.html             the version's screens
v3/  _flow.html         what v3 asks, and why it is one screen
     care-plan.html     the opt-in alternative
scripts/check.js        standing rule checks, non-zero exit
scripts/serve.js        local Express static server
scripts/build-offline.js  inlines everything into dist/
```

## The three versions

**v0 is a record, not a proposal.** Where the shipped Laravel app breaks a
design-system rule, the replica breaks it too and annotates it. It ships
skeleton loaders (forbidden outright), uses the mono audit face across every
surface (retired by P4), renders four different variants of the same tab strip
on five pages, and has no rail at all. Do not fix any of that. A baseline that
quietly improves the thing it is baselining proves nothing at a demo.

**v1 is the ratified reference surface, recreated.**
`product-design-system/physician-register.html` section 03 names
`system-design/diagrams/aleron-actionmap-al47m-ds.html` as the surface
"physician chart work derives from instead of re-deciding", so that is what v1
recreates: six rail sections, the action map, the evidence ledger, the vitality
model, the journal doctrine. Its later app build at `apps/physician/` added
Screening and the progressive commit workflow, and dropped Vitality as out of
scope; those deltas are v2 material, not v1.

**v2 is not a third design.** It is v1's chart with v0's job attached: the work
queue, lab and genetics ordering, standing orders, the Canvas bridge, patient
messaging, and the release flow the role matrix specifies. Every v2 screen ends
with an annotation list saying what changed and where it came from.

**v2 has since had a compression pass** to cut clicks for a physician working
mid-clinic. Three screens merged away: Vitality into Patient Data, hinged on the
HRV block the reference surface already calls the bridge; Screening into Orders,
because a screening schedule is a forward order plan; and the release surface
back into Care Plan, which is how `apps/physician/src/dashboardApp.js:961`
composes it in the first place. That returns the chart rail to the six sections
register O4 fixes, and takes the core loop from three navigation clicks to one.
The three commit acts stay three separately attested acts: the compression is in
navigation, never in the doctrine.

## Conventions

Every screen links the canonical stylesheets **by URL**:

```html
<link rel="stylesheet" href="https://kito-laso.github.io/aleron-canonical-documents/product-design-system/tokens.css">
<link rel="stylesheet" href="https://kito-laso.github.io/aleron-canonical-documents/product-design-system/components.css">
<link rel="stylesheet" href="../physician-chrome.css">
```

Nothing is hand-copied, so nothing can silently drift from the design system.
This is the one deviation the team explicitly chose after the
`aleron-patient-onboarding` prototype hand-copied tokens and drifted. The same
URL serves the real Hanken Grotesk variable font. v0 screens add a fourth link,
`v0-tokens.css`.

v1 and v2 set `data-register="flight-deck"`. v0 sets `day`, because that is
what the shipped app defaults to.

**The version switcher** in every screen's top bar flips the same screen
between v0, v1 and v2 in place. Where a version has no counterpart the pill is
struck through rather than hidden, so the gap stays legible.

**What will not ship** is markable on any screen. The reviewer bar carries a
`Mark what will not ship` toggle; ticking it turns every piece of
product-surface text that is *wireframe explanation* red with a dotted
underline. That covers the staging footers, the rail's
`Synthetic staging profile. Clinical use prohibited.`, the simulation and
illustrative-schedule advisories, the specimen labels, and the disclosures that
argue for the design rather than state product doctrine. Everything left in its
normal colour is copy a physician would actually be shown.

A **block** explanation is never in flow. The staging footer cost 146px with
its own border and a 44px margin, and the Simulation advisory cost 67px across
the full 1020px measure; blocks like that change what a viewer thinks the
product looks like. So each one renders as a 24px pin where the block was, and
its text floats out as a bubble on hover or focus. On v3's plan step that takes
485px of explanation out of the layout. Turning the marks on adds 63px of pins
back, and nothing else moves.

**Inline** marks are left in place. A 14px run inside a line costs nothing and
reads fine as red text, so `· matrix act 1, sign plan` and the nine
`· illustrative` tokens stay where they are.

The pin is a real `<button>`, so hover is not the only way in: focus opens the
same bubble, and `aria-describedby` puts the text on the pin for a screen
reader. That is why a closed bubble is `opacity: 0` and not
`visibility: hidden`, which would drop it out of the accessibility tree and
leave the description pointing at nothing. The bubble is absolutely positioned
in every state, so it can never move the surface, and it opens upward on the
staging footer because `.wf-desk` is `overflow-y: clip` and a downward bubble
at the foot of the desk would lose its bottom half.

One exception: v2/emr's `Second specimen: no Canvas record` head stays in flow.
It carries the section's `<h2>`, and floating it leaves the section below
untitled, which is worse than the 50px it costs.

Off by default, because the clean product render is what the register review
measures. No script: the toggle is a visually hidden checkbox at the top of
`<body>` and the marks key off a sibling combinator, so all 31 screens needed
markup and nothing else. The one cost is that the state does not survive
navigating from one screen to the next.

The mark is `.wf-scaffold`, and it is deliberately **not** one of P2's five
signals. It is reviewer chrome that sits inside the product frame, the same
supported placement `.pshell .wf-note` takes, so a red that was one of the five
would make scaffolding read as a hazard. Two cues, never colour alone: the red
and the dotted underline. Both values measured on every ground the marked text
sits on, day and flight-deck, page and card and inset, minimum 5.41:1.

Eight v0 screens show no toggle at all. That is a fact about v0, not an
omission: it replicates the shipped app, so its copy *is* production copy, and
it carries no staging chrome outside the two care-plan footers. The control is
hidden by `body:not(:has(.wf-scaffold))` rather than stripped from those files,
so it returns by itself the first time one of them gains a mark.

The `.pshell` `wf-note` blocks are not marked. They already render as
annotations rather than as copy, so reddening them would say nothing new.

**Annotations** below each screen use four kinds, and the kind is carried by
the word in the tag, never colour alone: `carried` names the v0 file a feature
was absorbed from, `new` comes from the reference surface, `gap` marks a
component the design system has not declared, `dropped` records a v0 capability
deliberately left behind with the reason.

## physician-chrome.css

One file, three sections that answer to different authorities:

- **A. Reviewer chrome** (`.wf-*`) — breadcrumb, version switcher, desk frame,
  annotations, flow-map nodes, hub cards, capability matrix. Not part of the
  simulated product. The patient wireframe set duplicated its flow-map styling
  into six `<style>` blocks and they drifted within a month; centralising it is
  the one structural improvement this set makes.
- **B. Proposed components** (`.pshell`, `.prail`, `.phead`, `.pmod`,
  `.pspine`, `.pledger`, `.pcommit`, `.preason`, `.pattest`, …) — these **do**
  govern app content. `components.json` v0.5.0 declares 28 components and none
  of them is a navigation rail, yet the register fixes its width, icon size and
  selection treatment. Per `AGENTS.md`'s missing-pattern rule that makes them
  design rather than application, so each block names the registry entry it
  proposes and the register clause its values come from. **These are what
  ratification would move upstream.**
- **C. Upstream shims** — carried from the patient set's chrome file, same gaps.

Do not restyle a canonical component. If `.amd-button` is wrong for a screen,
that is a finding for the annotation list, not a local override.

## Three contrast corrections carried in the chrome

Building the set meant rendering every screen in both registers and measuring
contrast against the composited background. That surfaced three failures in
ratified values. All three are corrected in `physician-chrome.css` with the
measurement in the comment, so the diff against upstream stays small.

| Token | Ratified | Measured | Corrected to | Where it fails |
|---|---|---|---|---|
| flight-deck `--text-tertiary` | `rgba(245,241,232,0.55)` | **4.17:1** | `0.62` → 4.73:1 | every eyebrow, unit suffix, table header and provenance line, roughly 350 elements |
| day `--signal-advisory` | `--text-gold` | **4.45 / 4.30:1** | `--gold-800` → 6.52:1 | advisory band words and the wordmark tag on tinted surfaces |
| flight-deck unmodeled indigo | `#8CA6D8` | **4.45:1** | `#93ABDB` → 4.73:1 | only on `--surface-card` gunmetal; it passes on both navy grounds |

The first two were **already known**: Aleron-Web's own `resources/css/tokens.css`
carries both corrections, with the same measurements, under a header comment
asking that they be taken upstream when the flight-deck register is ratified.
So v0, the version everyone calls the old one, is currently the accessible one,
and v1 and v2 inherited the failures precisely by linking the canonical kit
faithfully. That is an argument for the correction, not against the linking.

After the corrections: **zero contrast failures across 36 renders** (18 screens
in both registers), disabled controls excluded per WCAG 1.4.3.

## Open questions this set surfaces

1. **The rail is undeclared.** Section B's `domain.chart-rail` is the largest
   proposal here. Ratify it, or replace the anatomy.
2. **Russet is a sixth signal.** P2 fixes five, and the reference surface's
   VO₂max ladder uses a russet outside them. Either the ladder rides on shape
   alone or the palette grows. Held as `--p-ladder` so the decision stays
   visible.
3. **Attestation is not consent.** `interaction.consent` forbids a checkbox for
   consent. An attestation is a statement about what the physician reviewed,
   not a legal consent, and both prior surfaces render it as a checkbox.
   Section B's `domain.attestation` proposes making that distinction explicit.
4. **Register O1 through O4** are still open in the register itself. This set
   builds on the provisional calls: the 9.5px chart-annotation floor, the single
   action circle, the scan clause as written, and rails fixed per surface family.
5. **The 44px control floor on a pointer-only surface.** Nine screens needed a
   dense row action, which cannot be 44px inside a table row without breaking
   P8's "air is never shrunk to fit more in". Section B proposes a
   `data-density="row"` variant at 32px with a `pointer: coarse` guard that
   restores the full floor on touch. If ratification rejects it, the answer is
   that dense row actions become text links, not that they become 44px.
6. **The design system declares no link.** A bare `<a>` on the flight-deck
   ground inherits the user agent's blue at 1.16:1. The chrome sets a default
   (ink plus a hairline underline, deliberately not gold, because gold is a
   signal and a link is not one), but this belongs in `components.json`.

7. **Zero patient data in Aleron's own databases, against the read-model in
   the canonical design.** The stated intent is that Canvas holds all patient
   data. `system-design/diagrams/aleron-canvas-note-loop.html:803` describes
   something else: an "Order read-model · ALERON LAYER", "fed by
   `*_COMMAND__POST_COMMIT` -> webhook -> Aleron store · outside the EMR ·
   Canvas stays system of record". What that store holds is patient data:
   per-patient order titles with transmission state, `rejected · suppressed
   next cycle` which has to survive between visits, and the patient app's own
   feed, "the signed plan is visible in Ethan's app, from Aleron's read-model".
   "System of record" is a weaker claim than "zero patient data"; a read-model
   is still a copy, and serving the patient app from it makes Aleron a PHI
   serving path.

   Three things these screens draw have no home in Canvas FHIR:
   **diagnostic certainty** (`Condition.verificationStatus` is documented read
   and search only, and carries only confirmed, provisional and
   entered-in-error), **decline reasons and suppression** (v3's "Reason not
   carried", and the note loop's "suppressed next cycle"), and **the
   attestation binding** in act 3, which cannot be verified later if the
   preview hash is not durable.

   Canvas Custom Data Models are the path that keeps the intent: a plugin
   defines models that persist inside Canvas infrastructure, namespaced and
   linkable to a patient, with reads through the Data module and writes only
   through Effects and the FHIR API. The draft needs no local storage either,
   since staged commands in an unsigned Canvas note are what the note loop
   already draws as "committed · not transmitted".

   The cost is real and should be decided, not discovered: it makes the
   physician surface a Canvas plugin, so a second EMR means reimplementing the
   storage layer; and patient-facing reads go through SMART on FHIR, which
   serves FHIR resources rather than plugin custom data, so anything the
   patient app shows must be expressible as FHIR or it needs a serving layer,
   which is where the copy returns.

## Two defects found in the source surfaces

Recreating something faithfully is a good way to find out it is broken.

1. **The reference surface's action map is broken for its own primary patient.**
   `aleron-actionmap-al47m-ds.html:948`, `rerunActionLibraryScoring` opens with
   `if (derived) return derived.map(...)`, an early return that bypasses
   `ACTION_LIBRARY_V2_ADDITIONS` six lines below it. For Ethan Park the engine
   set spans −0.058 to +0.033 QALY while the skipped additions are GLP-1/GIP
   +1.48, supervised resistance training +1.10 and BP pharmacotherapy +0.63.
   Since the VO₂max ladder plots at +2.43 to +5.37, every library action
   collapses into a hairline at zero. The file contradicts itself: its on-chart
   label dictionary, its care-plan note and its AI "top action" all assume the
   larger set. v1 and v2 plot the library set and annotate the divergence.
2. **v0's modifier groups are off by one.** `portal.js`'s `groupRule()` and
   `groupDescription()` treat group C as genetic, but the engine's C is
   `MetabolicGlycemicDomain` and D is `GeneticFamilialDomain`. The shipped CVD
   panel prints the genetics prose and applies the `MAX` rule against three
   metabolic terms, which is a wrong composite, not just wrong copy. v0
   reproduces it exactly and flags it; v2 uses the engine's grouping.

## Sources

- v0: `C:\LASOHealth\apps\Aleron-Web`
- v1: `aleron-canonical-documents/system-design/diagrams/aleron-actionmap-al47m-ds.html`
  and its app build at `aleron-canonical-documents/apps/physician/`
- Design law: `aleron-canonical-documents/product-design-system/physician-register.html`
- Workflow law: [Aleron MD Role and Release Matrix v1](https://lasohealth.atlassian.net/wiki/spaces/AL/pages/525860888/Aleron+MD+Role+and+Release+Matrix+v1)
  and [Aleron MD production patient to physician workflow strategy](https://lasohealth.atlassian.net/wiki/spaces/AL/pages/525729795/Aleron+MD+production+patient+to+physician+workflow+strategy)
- Sibling set: the patient wireframes at `C:\LASOHealth\apps\aleron-wireframes`

## v3 is one screen, on purpose

`v3/care-plan.html` is not a fourth version. It exists to settle a single
question that v2 had answered by inheritance rather than by decision: should the
care plan open empty and be filled by the physician, or open drafted and be
pruned by them?

The sources disagree. The shipped portal is opt in: a blank note, engine
suggestions checked in, a running tally of what is actually in the record. The
reference surface and `apps/physician/src/carePlanView.js` are both opt out,
with per-item include and remove controls inline on every problem and order.

Under opt out, an engine draft is the default content of a document that becomes
a signed legal record, and it stays there unless a physician intervenes. Under
opt in it cannot be, but the physician does more work on every patient and a
correct suggestion can be lost to omission rather than rejected on purpose.

What is not defensible is what v2 had before v3 was built: opt out with the
include and remove controls moved into the workbench rail, reachable only by
selecting an item. That made the draft the default and the objection expensive,
by misapplying the reference surface's rule that basis and disposition sit
beside the document. That rule is about basis, and about problem-list
disposition. It is not about whether an item is in the draft at all.

Everything below the document is identical in v2 and v3. If v3 wins, only the
top of the screen changes.
