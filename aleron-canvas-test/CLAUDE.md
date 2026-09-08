# CLAUDE.md — aleron-canvas-test

Canvas and Junction integration harness: five fixture patients, a claims runner
that checks every documented assertion against the live `aleronmd-dev` instance,
and a small web app for driving the flows by hand. `README.md` covers setup, the
Canvas gotchas already handled here, and what each route does.

This file covers the ordering documents in `../docs/`. This folder is what
reproduces their claims, which is why the guide to them lives here.

## Ordering documents

The Canvas/Junction ordering design lives in **`../docs/`**, checked by the
harness in this folder. Read them in this order.

### Precedence — this order settles every conflict

1. **`../docs/INSTANCE-FINDINGS.md`** — what the
   live `aleronmd-dev` instance actually does. **Overrides everything below**,
   including Canvas's own published documentation.
2. **`../docs/ORDERING-DESIGN-AND-INTEGRATION.md`** — the master document. What the
   two APIs permit, and what the design must become as a consequence. Derived
   from the APIs, not from the screens.
3. **`../docs/API-GROUND-TRUTH.md`** — capability reference, pinned to the live
   CapabilityStatement.
4. **`../docs/API-IMPLEMENTATION-AUDIT.md`** — every physician-facing data point on
   every screen, audited against the APIs.
5. **`../docs/audit/VERIFY-*.md`** — research transcripts behind the vendor claims.
   Cite these rather than re-researching.

`../docs/DECISION-junction-ordering-physician.md` is **superseded** and kept only
because it is cited. It reasoned from the legacy controllers, which is backwards.

### Where to look for what

| Question | Section |
|---|---|
| What are the hard constraints? | ORDERING §1, the five facts F1–F5 |
| Which route does an order type take? | ORDERING §3, the routing table |
| Why does a screen look the way it does? | ORDERING §4, nine required changes |
| How should the backend work? | ORDERING §5 |
| Can Canvas store X? | API-GROUND-TRUTH, then confirm against INSTANCE-FINDINGS |
| What is still unanswered by the vendor? | ORDERING §7 |
| Where did a claim come from? | ORDERING §9, the source register |

### Rules that came from getting these wrong

- **Never reference the Junction controllers in `Aleron-Web`.**
  `JunctionController`, `GeneticsOrderService` and `PhysicianOrderPlacer` are
  built on superseded designs. They are not evidence of intent.
- **Canvas FHIR and the Canvas Plugin SDK are different write surfaces**, and
  conflating them is the most common error in this work. `CommandAPI` is a Python
  base class you subclass *inside a plugin*, not an API Canvas hosts. Commands
  and effects are plugin-gated; only FHIR and the Note API are reachable from
  outside.
- **Vendor documentation is a claim, not a fact.** Canvas's Note API page states
  that locking a note generates the PDF and its `DocumentReference`. On this
  instance it does not — signing does (INSTANCE-FINDINGS X7). Several of the seven
  corrections there contradict Canvas's own pages. **Test before you build on a
  sentence.**
- **A section with a correction banner has been overturned in part.** Read the
  banner before the section. X4–X7 each narrow or reverse something earlier.
- **Cite with a link, and check that the link resolves.** A fabricated citation
  has happened here; `../scripts/verify-doc-links.js` exists because of it.

### How to re-check any of it

```sh
node --env-file=script.env verify-api.mjs --write   # every claim, against the live instance
npm run dev                                          # then /notes for the note lifecycle by hand
```

**In that runner, `FAIL` means a document is wrong, not that Canvas is broken.**
The `--write` run currently reports **8 confirmed, 4 contradicted, 2 skipped**, and
each of the four is a recorded finding. Without `--write` the write claims skip
instead, so the counts drop to 5 and 2 — fewer failures there means less was
tested, not that something was fixed. The two skips are Junction, pending an API
key.

```sh
cd ..
node scripts/check.js             # design-system and link rules across the screens
node scripts/verify-canvas.js     # instance still matches the pinned CapabilityStatement
node scripts/verify-doc-links.js  # every external citation still resolves, both trees
```

**`script.env`, `web.env`, the Tailscale `.key`/`.crt` and
`created-patients.json` are gitignored**, and must stay that way: this repo is
published to GitHub Pages, so a committed client secret would be public. Check
with `git check-ignore -v <file>` before adding anything new that holds a
credential or a live patient id.
