# Working in this repo

Wireframes for the Aleron physician portal. Read this before reading any screen.

## Version status

| Folder | Status | Use it for |
|---|---|---|
| `v2/` | **Current.** The complete screen set. | Everything except the care plan: inbox, panel, orders, journal, emr, messages, reviews, risk, patient-data, standing-orders. |
| `v3/` | **Current, one screen.** `care-plan.html` only. | The care plan. It supersedes `v2/care-plan.html`. |
| `v1/` | **Superseded.** Absorbed into v2 in full. | Comparison and inspiration only. Never cite as current. |
| `v0/` | **Superseded.** Five capabilities absorbed into v2. | Comparison and inspiration only, plus `v0/login.html`, which is the only auth screen in the set and has no successor. |

v0 and v1 are kept deliberately, to show how the thinking moved. They are not proposals. If a v0 or v1 treatment contradicts v2 or v3, v2/v3 wins — and several do, on purpose.

Two specific traps in v0 that a reader will mistake for current design: the `TOP 3` and `ENG #1 · 8.42` badges on care-plan rows, and QALY figures printed on a row. v3 removed both on purpose (`v3/care-plan.html`, annotations near the item list). Do not reintroduce them by citing v0.

## `docs/audit/` outranks the screens

Each screen has an audit in `docs/audit/` grading every data point against vendor ground truth: **OK / GAP / UNVERIFIED / NONE / WRONG**. Where a screen's own prose disagrees with its audit, the audit is the more reliable document — the screens assert, the audits check.

Two caveats:

- **The audits lag the HTML.** Several rows graded WRONG describe copy that has since been corrected. Verify a WRONG row against the current file before filing it as a defect. GAP, NONE and UNVERIFIED rows have held up better.
- **A GAP is not a bug.** It means the screen shows something with no field behind it yet. That is information for a ticket, not an error in the design.

## Name the resource, name the path

From `BRIEF.md`: "Aleron writes a `DocumentReference`" is a checkable claim; "written to Canvas" is not. If a field has nowhere to go, that is a `gap` annotation, not a sentence that implies a write.

**This rule exists because it was broken.** An earlier iteration invented a resource called "Lab Order Authorization" that does not exist in Canvas, and it survived several revisions before an audit caught it. `BRIEF.md` keeps it as the worked example. Leave that line alone — it is the guardrail, not a mistake.

## Decisions settled outside this repo

These were argued out in the Jira epic [AL-84](https://lasohealth.atlassian.net/browse/AL-84) and the screens are still catching up. Where a screen disagrees with one of these, the screen is wrong.

- **Ordering never requires a locked note.** This is directional, not a symmetry — it does not mean the two acts work equally well in either sequence. A locked note takes no further orders.
- **A locked note is amended by unlock → change → relock → sign. Measured 15 Sep 2026, not assumed.** Canvas names the `SGN → ULK` transition *Amend*, and it maintains the chain itself: the re-signature mints a second `DocumentReference` and flips the earlier one to `status: superseded`, still listed and byte-identical. There is no separate addendum entity, and no `relatesTo` is needed because `status` carries the chain. The note is not permanently immutable, and copy calling it an "immutable snapshot" is wrong. Full record: [amending a signed note supersedes its document and mints a new one](../Aleron-Web/docs/canvas/INSTANCE-FINDINGS.md).
- **Accept / decline / defer is the default disposition on every care-plan action**, not only on obligations.
- **An obligation can be set aside, but never silently** — included, deferred with a reason, or excepted with a reason. Copy saying an obligation "cannot be rejected" or is "not declinable" is stale.
- **What makes an item an obligation comes from a CMO-maintained library** on a governance policy screen that does not exist yet. It is not a property of the test.
- **The problem-list control must default to an option that writes nothing.** An automatically added problem is a diagnosis nobody made.
- **There is no patient-consent model**, in the product or in any wireframe. What exists is three gates: Entra step-up freshness, the genetics counselling attestation — which the design is explicit is not a consent — and state licensure.
- **Nothing in Canvas or Junction can write an audit record today.** `Provenance` is read-only. Any screen claiming it appends to an audit log is asserting something that does not work yet.
- **No Canvas resource holds a risk tier**, and five of six domain risks carry `model provenance pending`. Do not design a ranking that depends on one.
- **Aleron will build a Canvas plugin.** Confirmed 15 Sep 2026, outside AL-84 — predates this note: `aleron-canvas-plugin/` already exists locally (created 8 Sep 2026) as an empty scaffold (`git init` only, no commits, no code yet). This unblocks command origination and the per-physician `authorization_code` path — the prerequisite for *testing* [F1](../Aleron-Web/docs/canvas/ORDERING-DESIGN-AND-INTEGRATION.md#22-per-physician-canvas-oauth-enrolment--gates-priority-1-only) (whether a plugin-authenticated write attributes a command to that physician), not evidence that F1 already holds. Priority 1 (physician-attributed orders) still depends on that test running once the plugin exists — see [T2](../Aleron-Web/docs/canvas/ORDERING-DESIGN-AND-INTEGRATION.md#6-tests-to-run-before-building).
