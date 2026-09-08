# The minimal Canvas plugin, scoped

**Why there has to be one.** Orders in Canvas are commands, and Canvas hosts no
command endpoint — `CommandAPI` is a base class you subclass *inside a plugin*,
which then hosts the endpoint at your own namespace
([VERIFY-commands-over-http](audit/VERIFY-commands-over-http.md) §1). Everything
else Aleron needs is already reachable: notes over the Note API, results through
`$create-lab-report` ([INSTANCE-FINDINGS](INSTANCE-FINDINGS.md) X1), and reads
over FHIR. **The plugin exists for the order commands and for nothing else.**

**Why it is small.** Canvas templates the hard part. `CommandAPI` reads the body
onto a command, validates it, and emits the effects. What is left is who may
call it and what they may write — and both are a few lines.

---

## 1. What it must do

Four things, in order of how much they matter.

| # | Requirement | Why |
|---|---|---|
| **P1** | Originate, edit and finish order commands over HTTP | The only route to an order. §2 |
| **P2** | Attribute every write to the Aleron physician | Priority 1. Needs the Authorization Code Bearer token, §3 |
| **P3** | Refuse a write to a closed note *before* sending it | A closed note answers `201` and writes nothing. §4 |
| **P4** | Constrain which actions and which notes a caller may touch | `action` reaches `getattr`; "is staff" alone authorizes any staff to write any note. §5 |

## 2. The routes

Aleron's order types and the action that finishes each, from the actions table:

| Order type | Command | Finished by | Notes |
|---|---|---|---|
| Lab | `LabOrder` | **`send`** | Not committed. Needs an electronic-ordering lab partner, patient address and phone, ordering-provider NPI |
| Imaging | `ImagingOrder` | **`sign`** (or `delegate`) | Not committed |
| Referral | `Refer` | **`sign`** (or `delegate`) | Not committed. Aleron cannot transmit it — §4.4 of [ORDERING](ORDERING-DESIGN-AND-INTEGRATION.md) |
| Prescription | `Prescribe` | **`review`** then **`send`** | Not committed. Whether `send` performs the sign is **T1, still open** |

So one class, three verbs, and an action allow-list per command:

```python
# Sketch, not a shipped file. The point is the size.
ALLOWED = {
    LabOrderCommand:      {"send", "delete", "enter_in_error"},
    ImagingOrderCommand:  {"sign", "delegate", "delete", "enter_in_error"},
    ReferCommand:         {"sign", "delegate", "delete", "enter_in_error"},
    PrescribeCommand:     {"review", "send", "delete", "enter_in_error"},
}

class AleronOrdersAPI(CommandAPI):          # auth: see §3
    PREFIX = "/v1"

    @api.post("/orders/<kind>")
    def create(self): ...                    # -> self.originate(model)

    @api.put("/orders/<kind>/<command_id>")
    def update(self): ...                    # -> self.edit(model, command_id)

    @api.post("/orders/<kind>/<command_id>/<action>")
    def act(self): ...                       # -> self.action(model, command_id, action)
```

`originate` leaves a command **staged** unless asked otherwise, which is what
the design wants: Aleron proposes, the physician finishes. That matches
[ORDERING §4.1](ORDERING-DESIGN-AND-INTEGRATION.md), which already draws the
order set as staged commands.

Pass `command_id` on originate as a UUID Aleron generates. Canvas refuses a
repeat of the same id rather than writing a second command, so **a retry is safe
and Aleron needs no id mapping** — it can ask whether an order reached the chart
by its own id.

## 3. Authentication and attribution are two decisions

**Authentication** gates the route. **Attribution** decides whose name lands on
the order, and it comes from the token, not the mixin:

> "By default, a SimpleAPI request isn't tied to a specific person … To have a
> request run as a specific Canvas staff member … call the endpoint with an
> access token obtained through the Authorization Code flow … so any effects the
> handler returns are attributed to that staff member."

**So P2 requires the physician's Authorization Code Bearer token on every call
that writes an order.** That is the per-physician OAuth enrolment in
[ORDERING §2.2](ORDERING-DESIGN-AND-INTEGRATION.md), narrowed by X4 to priority 1
only — and this is the confirmation that it really is required for commands.

Consequences the design has to absorb:

- **A physician who has not consented cannot have an order attributed to them.**
  One-time, theirs alone, and nobody can do it for them. Already drawn on
  `standing-orders.html` as the first credential row.
- **A background job cannot place an attributed order**, because it holds no
  physician token. An API key or shared secret is recorded as **Canvas Bot**.
- **Token lifetime becomes a design problem.** An order placed at the end of a
  long session needs a live token, so refresh handling is in scope.

Note the distinction from the note surface: the Note API takes
`client_credentials` and names the clinician in `providerKey` (X4), and the
order row inherits `orderingProvider` from the note (X8). **Neither of those is
the same as an attributed command.** Three identities, and only the command's
committer needs the token.

## 4. The pre-check is not optional

A command bound for a closed note answers **`201` with a `command_uuid` and
writes nothing** — the effect is applied after the response has gone back, and
nothing in `canvas-plugins` reads the note's state. So the plugin must read it:

```python
OPEN_STATES = (NoteStates.NEW, NoteStates.PUSHED, NoteStates.CONVERTED,
               NoteStates.UNLOCKED, NoteStates.RESTORED, NoteStates.UNDELETED)
```

Refuse anything else with a real status, so Aleron's confirm surface can say
*this order did not land* instead of showing a success it did not get. This is
**T6, and it is answered by documentation** — no test needed, but the check is.

## 5. Authorization, which Canvas has no opinion on

> "An endpoint gated only on 'is staff' lets any staff member write any command
> to any note. That may be exactly right … but decide it rather than inherit
> it."

Two rules worth deciding before the first route ships:

1. **Only the note's own provider may write to it**, which keeps
   `orderingProvider` and the committer from disagreeing —
   [ORDERING §4.8](ORDERING-DESIGN-AND-INTEGRATION.md) requires Aleron to enforce
   that consistency itself, since Canvas does not validate it at sign time.
2. **Actions come from an allow-list**, never straight from the request:
   `action` is passed to `getattr` on the command class.

## 6. What is explicitly out of scope

Keeping this list short is the point of the document.

| Not in the plugin | Where it lives instead |
|---|---|
| Writing lab results to the chart | `$create-lab-report`, externally callable (X1) |
| Creating, locking or signing notes | Note API and `/api/NoteStateChangeEvent/` (X7) |
| Reading anything | FHIR |
| Engine risk output | Not an Observation (C1); see ORDERING §8 |
| Prescription signing UI | A redirect, ORDERING §4.7 |
| Result polling | Junction, ORDERING §4.9 |

## 7. What it costs, honestly

**Build:** one plugin, one `CommandAPI` subclass, four command maps, an
open-state pre-check, an action allow-list, and a provider check. The
[note-lifecycle-example](https://docs.canvasmedical.com/sdk/handlers-action-buttons/)
plugin is a working reference for the footer-button half if a Canvas-side UI is
ever wanted.

**Operate:** a deployed plugin is a release artefact with its own lifecycle, and
plugin code runs in a RestrictedPython sandbox with an allowlist of importable
modules ([VERIFY-plugin-mechanics](audit/VERIFY-plugin-mechanics.md)).

**The real cost is P2, not the code.** Per-physician OAuth consent is a rollout
problem, not an engineering one: every physician who places orders must complete
it once, and until they do their orders cannot carry their name.

## 8. What to settle before building

1. **T1** — does `send` on a Prescribe perform the sign? Decides whether the
   prescription redirect survives. The one contradiction the research never
   resolved.
2. **T2** — call a plugin route with a physician's token, originate and sign an
   `ImagingOrder`, and read back `originator`, `committer` and
   `Provenance.agent`. This is F1 in practice and **it is the first thing the
   plugin should be used to test**, before anything is built on it.
3. **T3** — set `ordering_provider_key` to someone other than the token holder
   and see whether Canvas refuses or writes the self-contradicting record.
4. Whether a Canvas-side footer button (`NoteStateActionButton`) is wanted at
   all, or whether every act starts in Aleron.
