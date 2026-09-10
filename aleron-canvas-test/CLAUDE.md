# CLAUDE.md — aleron-canvas-test

Canvas and Junction integration harness: five fixture patients and a web app for
driving the flows by hand. `README.md` covers setup, the Canvas gotchas already
handled here, and what each route does.

## The ordering documents are in another repo

The Canvas/Junction ordering design is `docs/canvas/` in **`Meridian-Web`**, and
`canvas-verify/CLAUDE.md` there is the guide to it: which document answers what,
the precedence order that settles conflicts, and the rules that came from
getting them wrong. **Read that before changing anything here that asserts how
ordering, notes or results behave** — including the explanatory prose in the
routes, which cites those findings.

They moved because `Meridian-Web` is where the ordering code lives and nothing
there referenced them. The claims runner went with them, so a claim proven by
this app now gets recorded on that side.

Two of its rules bind this folder directly:

- **Vendor documentation is a claim, not a fact.** Canvas's Note API page says
  locking a note generates the PDF and its `DocumentReference`. On this instance
  signing does. Anything this app tells the user about Canvas behaviour has to
  come from a measurement, not from a vendor page.
- **Never cite a finding by its bare id.** "INSTANCE-FINDINGS X7" tells a
  first-time reader nothing. Name what it found and where it lives.

## What this folder is for

The app exists to drive flows a script cannot: `authorization_code` login, the
note lifecycle button by button, placing two orders under different providers to
see which identity sticks. It is the manual counterpart to the runner, and its
findings belong in the documents rather than in comments here.

`create-patients.mjs` stays here because the bulk delete and void acts are
fenced to the patients in `created-patients.json`, and that fence fails closed
when the file is unreadable. Moving the writer without the fence would have left
the app unable to confirm any patient as a fixture.

## How to run it

```sh
npm run create-patients   # writes created-patients.json, idempotent
npm run selftest          # CSV against the documented value sets, no network
npm run dev               # then /notes, /orders, /physician, /patient
```

The claims runner and the CapabilityStatement check now live in `Meridian-Web`:

```sh
node --env-file=canvas-verify/.env.canvas canvas-verify/verify-api.mjs --write
node canvas-verify/verify-docs.cjs
```

From this repo:

```sh
node scripts/check.js             # design-system and link rules across the screens
node scripts/verify-doc-links.js  # every citation and internal anchor resolves
```

**`script.env`, `web.env`, the Tailscale `.key`/`.crt` and
`created-patients.json` are gitignored**, and must stay that way: this repo is
published to GitHub Pages, so a committed client secret would be public. Check
with `git check-ignore -v <file>` before adding anything new that holds a
credential or a live patient id.
