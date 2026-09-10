# Applying commands from the API: what Canvas actually documents

Researched 2026-09-08 against `docs.canvasmedical.com`. Prompted by
[INSTANCE-FINDINGS X8: an order row is reachable without a plugin, a signable
order is not](../INSTANCE-FINDINGS.md#x8-x9-x10--orders-end-to-end):
`POST /api/LabOrder/` creates an
order row from outside Canvas but the order never becomes a command, so nothing
is signable. The question that raised was whether Canvas documents a supported
route for applying commands over HTTP.

**It does, and it has since at least 13 Aug 2026.** The answer is `CommandAPI`,
and it settles F1, F3 and T6 in Canvas's own words.

Sources, both read as raw HTML rather than through a summarizer:

- [Writing Commands Over HTTP](https://docs.canvasmedical.com/guides/writing-commands-over-http/) — "Last updated: 13 Aug 2026"
- [SimpleAPI (HTTP handlers)](https://docs.canvasmedical.com/sdk/handlers-simple-api-http/)
- [Commands API reference](https://docs.canvasmedical.com/sdk/handlers-simple-api-commands/)

---

## 1. There is a supported HTTP route, and you still host it

> "Writing to a patient's chart from outside Canvas — from a custom charting
> surface, a scribe, an intake form, a back-office tool — used to mean building
> the API yourself: a SimpleAPI route per command … **Canvas has now built it for
> you. `CommandAPI` is that endpoint, templated:** it reads the body onto a
> command, validates it against that command, and emits the effects. All you add
> is the part that should be yours — who may call it, and what they are allowed
> to write."

**But `CommandAPI` is a `SimpleAPI`**, so the endpoint lives in a plugin you
deploy, at your own namespace:

```
POST https://example.canvasmedical.com/plugin-io/api/my_plugin/v1/hpi
```

**Canvas hosts no command endpoint of its own.** This is exactly F2, and it is
why `/api/Command/`, `/api/Prescribe/`, `/api/Refer/` and `/api/ServiceRequest/`
all answer `404` on our instance while `/api/LabOrder/` — a row, not a command —
answers `201`.

## 2. Three operations, and `action` is where a command is finished

`originate` puts a new command in a note, `edit` revises it while staged, and
`action(model, command_id, action)` runs the method that finishes it. `action`
takes no body and answers `200 {"command_uuid": …, "mode": "commit"}`.

| Action | What it does | Required state |
|---|---|---|
| `commit` | Signs the staged command into the note | staged |
| `delete` | Removes the staged command | staged |
| `enter_in_error` | Marks a committed command entered in error | committed |
| `review` | Places the command into review status | per command |
| `send` | Transmits to an external system | per command |
| `delegate` | Delegates the order for someone else to complete | per command |
| `sign` | Signs the order | per command |

> "No command supports all of them, and **not even `commit` is universal** …
> `review` and `send` belong to Prescribe, Refill and Adjust Prescription, and
> **`send` also to Lab Order. Those four are not committed — sending is how they
> are finished.** `delegate` and `sign` belong to Imaging Order and Refer, which
> are not committed either."

Also: Reason for Visit takes `originate`, `edit` and `delete` only; Chart Section
Review "is committed as it is originated"; custom commands are neither edited
nor committed.

**Consequence for [X8](../INSTANCE-FINDINGS.md#x8-x9-x10--orders-end-to-end),
which found that an order row is reachable without a plugin but a signable order
is not.** A Lab Order has no `commit` and no `sign` — it is
finished by `send`. So the absent commit route was not a gap to find; a lab
order has nothing to commit by design. **F3 stands**, and gains the detail that
`sign` *is* reachable over HTTP via `action()` for Imaging Order and Refer. The
earlier phrasing — that `sign_action` is a UI button and not an HTTP action —
is true of `sign_action` but should not be read as "signing is unreachable".

## 3. Attribution comes from the token, not the mixin

The SimpleAPI page, verbatim:

> "**By default, a SimpleAPI request isn't tied to a specific person**, so any
> effects it returns — such as creating, locking, or signing a note — are
> recorded as **Canvas Bot** rather than a clinician. To have a request run **as
> a specific Canvas staff member** — for example, so a note is signed under the
> treating provider's name — call the endpoint with an access token obtained
> through the **Authorization Code flow**. That flow issues a token that
> represents the staff member who signed in and approved it. Send it as a Bearer
> token in the `Authorization` header, and Canvas identifies the user from the
> token and treats the request as coming from them, so any effects the handler
> returns are **attributed to that staff member**."

With the worked example:

```
POST /plugin-io/api/my_plugin/note/<note-id>/sign
Authorization: Bearer <access-token>
```

> "In this example the note is signed and recorded in Canvas as signed by the
> staff member who authorized the access token, not by Canvas Bot."

**This is F1, confirmed verbatim, and it is the answer to priority 1.**

The commands guide adds a scheme table which reads slightly differently:

| Scheme | Identifies a person | The command is attributed to |
|---|---|---|
| `StaffSessionAuthMixin` | yes — a staff member | that staff member |
| `PatientSessionAuthMixin` | yes — a patient | that patient |
| An Authorization Code access token | yes | the staff member who authorized it |
| `APIKeyAuthMixin` | no — a shared key | Canvas Bot |
| `BasicAuthMixin` | no — a shared secret | Canvas Bot |

**The two pages are reconcilable but not identical, and the difference matters
to us.** The SimpleAPI page says a request is untied to a person *by default*;
the commands guide says a staff *session* does identify one. Both can hold — a
browser session carries `canvas-logged-in-user-*` headers that the guide
describes reading. **For Aleron only the token row is usable**, because Aleron
calls server-to-server and has no Canvas browser session to borrow.

> **A caution about how this was gathered.** A first pass at this section came
> from a WebFetch summary, which produced a confident table asserting
> `StaffSessionAuthMixin → Canvas Bot`. That is **not** on the page. The raw
> HTML was fetched and grepped before anything here was written, and the
> summarizer's table was discarded. The prose above is verbatim.

Canvas also sets two headers on a session-backed request,
`canvas-logged-in-user-type` and `canvas-logged-in-user-id`, and they cannot be
forged: "plugin-io strips both if they arrive from the client and sets them only
from a session it has verified itself." There is no built-in `caller()` — the
guide shows the one-line helper to write.

## 4. The silent success is documented

> "Canvas already refuses a command bound for a note that has been deleted or
> cancelled, or that is signed and no longer writable … What it cannot do is
> tell your caller. Nothing in canvas-plugins reads the note's state, and
> command effects are applied after your response has already gone back. **A
> closed note therefore answers `201` with a `command_uuid` and then writes no
> command.** Checking before you write is the only way the caller ever finds
> out."

**This is T6, answered without needing to run it.** The pre-check is the
caller's job, and the guide supplies the open-state list to check against:
`NEW`, `PUSHED`, `CONVERTED`, `UNLOCKED`, `RESTORED`, `UNDELETED`.

## 5. One security note worth carrying into the build

`action` is passed to `getattr` on the command class:

> "The action usually arrives from the request, and it is passed to `getattr` on
> the command. **Check it against a set you control first** … or a caller can
> name any attribute of the command class."

And on authorization, as distinct from authentication:

> "An endpoint gated only on 'is staff' lets **any staff member write any command
> to any note**. That may be exactly right — it is roughly what the chart itself
> allows — but decide it rather than inherit it."

## What this changes

| Was | Now |
|---|---|
| F1 believed, cited to two pages | **Confirmed verbatim**, with a worked `curl` for a signed note |
| F3 phrased around `sign_action` being a UI button | **Stands**, and `sign` is reachable via `action()` for Imaging Order and Refer; Lab Order is finished by `send` |
| T6 listed as a test to run | **Answered in the documentation** |
| T1 — does `send` perform the sign for Prescribe | Still open, but narrowed: Prescribe takes `review` and `send` and is "not committed — sending is how they are finished" |
| "A plugin is unavoidable" | True, and it is **thin**: three routes, one auth mixin, a note-state pre-check and an action allow-list. Scoped, with the build steps, in [AL-100](https://lasohealth.atlassian.net/browse/AL-100) |
