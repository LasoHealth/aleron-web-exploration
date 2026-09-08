# Plugin mechanics: signature events, egress, custom data models

Sources: `docs.canvasmedical.com` as of 2026-09-04. Page "Last updated" stamps noted per claim.
Everything in quotes is verbatim from the docs. Everything labelled **[INFERRED]** is mine.

---

## 1. Which event fires on prescription signature?

**Answer:** Both `PRESCRIPTION_SIGNED` and `PRESCRIBE_COMMAND__POST_COMMIT` are real, documented
events, and they are different things. `PRESCRIPTION_SIGNED` is a **record status-change** event on
the `Prescription` model (fires when `Prescription.status` becomes `signed`); it carries the
**prescription id**. `PRESCRIBE_COMMAND__POST_COMMIT` is a **command lifecycle** event; it carries
the **command uuid** and the full field payload. Generic `POST_COMMAND_COMMIT` also exists and fires
"After **any** command is committed."

The commit/sign distinction the team was worried about **does not exist for the Prescribe command**.
The docs define sign *as* the commit transition:

> `sign_action` | command is in review | "Signs the prescription, transitioning it from staged to
> committed state."  — /sdk/commands/ (2 Sep 2026)

> "The command must be committed/signed before it can be sent electronically."
> — /sdk/commands/, Prescribe section

So for Prescribe, sign == the staged→committed transition, and `PRESCRIBE_COMMAND__POST_COMMIT`
is the commit-time hook. There is **no separate signature-only command event.**

### The "No COMMIT" red herring — resolved

The thing that probably caused the confusion:

> Prescribe | `*_PRESCRIBE_COMMAND` | "**No COMMIT.** Supports SEND and REVIEW"
> — /sdk/effects/ command effects table (2 Sep 2026)

> "Commands that do not support committing (Reason For Visit, **Prescribe**, Refill, Adjust
> Prescription, Refer, and Order commands) will ignore this parameter."
> — /sdk/commands/, `originate(commit=...)`

That table and that sentence are about **effects** — what a *plugin* is allowed to emit. A plugin
cannot commit a Prescribe command itself; only a human (or `sign_action`) can. It says nothing about
which **events** fire. `PRESCRIBE_COMMAND__PRE_COMMIT` / `POST_COMMIT` are both listed on
/sdk/events/. The asymmetry is deliberate: plugins can stage and send, humans commit.

Confirmed by grep of the events page HTML — the full `PRESCRIBE_COMMAND__*` set exists:
`PRE/POST_ORIGINATE`, `PRE/POST_UPDATE`, `PRE/POST_COMMIT`, `PRE/POST_DELETE`,
`PRE/POST_ENTER_IN_ERROR`, `PRE/POST_EXECUTE_ACTION`, `POST_VALIDATION`,
`POST_INSERTED_INTO_NOTE`, `AVAILABLE_ACTIONS`.

### The table

| Event | Fires on | Payload (documented) | Fires for externally-staged commands? | Evidence |
|---|---|---|---|---|
| `PRESCRIPTION_SIGNED` | "Occurs when a prescription has been signed." | target `{"id": prescription_id, "type": Prescription}`; context `{"patient": {"id": pt_id}}` | **[INFERRED] Yes** — record lifecycle events are described purely in terms of the record changing, with no origination scoping | /sdk/events/ (2 Sep 2026); release note 4 Mar 2026 |
| `PRESCRIBE_COMMAND__POST_COMMIT` | "After any command is committed" — for Prescribe, that is `sign_action` / `sign_send_action` / `print_action` | target `{"id": command_uuid, "type": Command}`; context `note.uuid`, `patient.id`, and `fields` (prescribe, indications, sig, days_supply, quantity_to_dispense, type_to_dispense, refills, substitutions, pharmacy, prescriber, note_to_pharmacist) | **[INFERRED] Yes** — see below | /sdk/events/ |
| `PRESCRIBE_COMMAND__POST_EXECUTE_ACTION` | "After an action is executed on any command." | Same as POST_COMMIT: `fields` + `note.uuid` + `patient.id`. **No action name documented in the context.** | [INFERRED] Yes | /sdk/events/ |
| `POST_COMMAND_COMMIT` (generic) | "After any command is committed." | Base context: `note.uuid`, `patient.id`, `fields` | [INFERRED] Yes | /sdk/events/ |
| `PRESCRIPTION_RECEIVED` / `_INQUEUE` / `_TRANSMITTED` / `_DELIVERED` / `_ERRORED` etc. | later e-Rx network statuses | same shape as `PRESCRIPTION_SIGNED` | n/a | /sdk/events/ |

### Can a handler tell which prescription, for which patient?

- `PRESCRIPTION_SIGNED`: **yes for both** — `event.target.id` is the prescription id,
  `event.context["patient"]["id"]` the patient.
- `PRESCRIBE_COMMAND__POST_COMMIT`: **yes for patient and note, but the identifier is the
  command_uuid, not a prescription id.** `Command.objects.get(id=self.target)` then gives
  `schema_key` (`"prescribe"`) and a `data` JSON blob (/sdk/data-command/).
- **The two identifier spaces do not join cleanly.** The `Prescription` data model
  (/sdk/data-prescription/, 2 Sep 2026) has `id`, `patient`, `note`, `prescriber`, `medication`,
  `status`, `committer`, `originator` — **and no foreign key to `Command`**. So a handler that
  staged command `X` and later receives `PRESCRIPTION_SIGNED` for prescription `Y` has to
  reconstruct the link through `note` + `medication` + `prescriber` + timestamps. That is a real
  correlation hazard if a note contains two prescriptions for the same drug.

**Recommendation, given the above:** if the plugin needs to recognise *its own* prescription,
use `PRESCRIBE_COMMAND__POST_COMMIT`, because the plugin controls `command_uuid` at origination:

> `command_uuid` — "On originate you can pass your own value to set it the first time"
> — /sdk/commands/, Common Attributes

That is the clean correlation key. `PRESCRIPTION_SIGNED` is the better *clinical-truth* signal but
the worse *correlation* signal.

### Explicit note: is commit-vs-sign documented for events?

**No.** This is the critical documentation gap, and it needs stating plainly:

1. **No events page text distinguishes commit from sign.** `PRESCRIBE_COMMAND__POST_COMMIT` has no
   prose description at all on /sdk/events/ — only a target/context table. The commit/sign
   equivalence for Prescribe has to be assembled from /sdk/commands/ (`sign_action` "transitioning
   it from staged to committed state") and /sdk/effects/ ("No COMMIT"). The events documentation
   itself never says which UI act triggers it.
2. **`POST_EXECUTE_ACTION` does not tell you which action ran.** The documented context for
   `PRESCRIBE_COMMAND__POST_EXECUTE_ACTION` contains only `fields`, `note`, `patient` — no action
   name. By contrast `AVAILABLE_ACTIONS` *does* document `"actions": {"name": string}`. So a handler
   cannot distinguish `sign_action` from `sign_send_action` from `print_action` from `make_changes`
   using documented context. **[INFERRED]** the action name may be present at runtime and simply
   undocumented — the docs say "you could take a look yourself by logging it out" — but it is not
   documented and must not be architecturally load-bearing without empirical confirmation.
3. **Whether `PRESCRIPTION_SIGNED` fires on the click or on the e-Rx round-trip is not documented.**
   The release note that introduced it calls the whole family "SDK events for **Prescription status
   changes**" (4 Mar 2026), and the `PrescriptionStatus` enum reads like a transmission pipeline:
   `OPEN, PENDING, ACCEPTED ("Ultimately Accepted"), ERROR, CANCEL_REQUESTED, CANCELED,
   CANCEL_DENIED, RECEIVED ("Received by DrFirst"), SIGNED, INQUEUE, TRANSMITTED, DELIVERED`.
   **[INFERRED, moderate confidence]** `SIGNED` is a local status set at sign time and the
   `RECEIVED`-before-`SIGNED` ordering in the enum is just declaration order, not a sequence — but
   the docs do not say. If `SIGNED` is only reachable via the DrFirst pipeline, a **printed** or
   **signed-but-not-sent** prescription may never emit `PRESCRIPTION_SIGNED`. Print is a real
   documented path (`print_action` — "Prints and commits the command"). **This must be tested.**

### Externally-staged commands (the load-bearing case)

**No documentation states either way.** The supporting evidence that they do fire:

- Record lifecycle events: "These events fire as a result of records being created, updated, or
  deleted." Origin-agnostic phrasing.
- Command lifecycle events: "Before/After **any** command is committed." Origin-agnostic phrasing.
- The events page defines an event as "an occurrence of an action that happens within Canvas" and
  gives "a patient being prescribed a medication" as the example.
- `AVAILABLE_ACTIONS` fires "When a command is rendered in the **UI**" — command events are wired
  into the UI path, not only the plugin path.
- Where Canvas *does* mean plugin-only, it says so explicitly. On the same Prescribe section:
  "The override applies only to `send()`-initiated (plugin-driven) prescriptions. It does not affect
  prescriptions a clinician sends from the charting UI." No such caveat appears on any
  `PRESCRIBE_COMMAND__*` event.
- The mixed-origin pattern is an advertised use case elsewhere: a Canvas guide is titled "Staying on
  Top of Tasks — Create tasks via API? Listen for completion with a plugin!"

**[INFERRED, high confidence]** command and record lifecycle events fire regardless of who
originated the record. **But it is inference, not a quote.** For an architecture with no fallback,
verify empirically: stage a Prescribe from the plugin, sign it by hand in the UI, and log
`self.event.type`, `self.event.target`, `self.event.context` for both handlers.

---

## 2. Is plugin outbound HTTP restricted?

**Answer:** There are **two** outbound paths with **different documented behavior**, and the team
should know which one they are on. Neither has a destination allowlist.

- **Protocol is restricted; destination is not.** No egress allowlist, domain restriction, customer
  firewall rule, or Canvas approval process for outbound plugin HTTP is documented anywhere.
- **A plugin can reach an arbitrary customer-controlled external host over public HTTPS.** This is
  documented-by-example, not merely un-prohibited (see below).
- **A plugin cannot reach a private/loopback/link-local address via `HttpRequestEffect`** — that is
  documented and enforced. So Aleron must be publicly resolvable, not on a VPC peer or VPN.

### Path A — `HttpRequestEffect` (documented, restricted, retrying)

/sdk/effect-http-request/ (11 May 2026). "The `HttpRequestEffect` lets a plugin ask the Canvas
platform to issue an HTTP request on its behalf."

| Control | Documented? | Quote |
|---|---|---|
| Destination allowlist | **No such thing** | — |
| SSRF / private-address block | **Yes** | "The host is resolved and rejected if it points at a private (RFC 1918), loopback, link-local (including the 169.254.169.254 cloud metadata address), multicast, reserved, or unspecified address. Both literal IPs (e.g. `http://10.0.0.1/`) and hostnames that resolve to such addresses are blocked." |
| Timeout | **Yes** | "Each request has a 30-second timeout. Requests that exceed it are aborted." |
| Retries | **Yes** | `retry_on_status_codes` + `.set_async(max_retries=...)`; the async runner "manages delay, retries, and backoff". `max_retries` — "When omitted, the platform default is applied." |
| **Connection-error handling** | **Yes — and it is the finding that matters** | "**Connection errors are swallowed.** If the upstream service is unreachable or the request fails at the transport layer, the failure is logged and the effect pipeline continues — it does not raise back into your handler." |
| Redirects | Yes | "Non-GET methods (POST, PUT, PATCH, DELETE) are made with `allow_redirects=False`" |
| Payload size limit | **Not documented** | — |
| Rate limit | **Not documented** | — |
| Logging/PHI | Yes | "the platform logs the request method, host, path, and final status code. Query strings, fragments, request headers, request bodies, and response bodies are never logged" |

Note the retry semantics precisely: `retry_on_status_codes` retries on **HTTP status codes**. A
connection failure — Aleron down, DNS gone, TLS handshake failure — is **swallowed** and your
handler is not told. Retries do not cover the transport-layer case.

### Path B — `canvas_sdk.utils.Http` (the one in the guides; almost nothing documented)

/sdk/utils/ (20 Aug 2026). `get`/`post`/`put`/`patch` taking a raw `url`.

- **No SSRF protection documented.** Absent, not stated-as-absent.
- **No per-request timeout documented.** The only timeout on the page belongs to `batch_requests`:
  "The maximum allowed value for `timeout` is 30 seconds. If `timeout` is not specified, it will be
  set to the maximum value." Single `get`/`post` take no timeout parameter and none is described.
- **No retries.** None documented, none offered.
- **No allowlist, rate limit, or payload cap documented.**

The guide /guides/creating-webhooks-with-the-canvas-sdk/ uses this path to POST to
`https://webhook.site/{self.secrets['WEBHOOK_ID']}` from a `TASK_CREATED` handler. That is Canvas's
own documentation calling an arbitrary third-party host from an event handler — the strongest
available evidence that arbitrary egress works. Worth noting the guide's own error handling:

```python
if response.ok:
    log.info("Successfully notified API of task creation!")
else:
    log.info("Notification unsuccessful. =[")
return []
```

A logged failure and nothing else. That is the reference pattern for the design under review.

### The runtime constraint that produced the quote in the brief

/guides/plugin-security-model/ (26 Jul 2026), "Runtime isolation":

> "**Constrained network surface.** Outbound communication is limited to HTTP and HTTPS through the
> SDK's supported clients. Raw sockets and non-HTTP protocol libraries are not available in the
> sandbox."

Also on that page: "Plugin code runs in a separate operating-system user and process"; "Code
executes in a RestrictedPython sandbox with an explicit allowlist of importable modules. Modules
outside that list are rejected at load time"; "Plugins have no direct database connection, no
filesystem access, and no operating-system access."

Read it carefully: the constraint is on **protocol and client**, not on **destination**. It appears
in a page written explicitly "so your security team can evaluate what plugin code can and cannot
do", under a heading enumerating every containment layer — and no destination control is listed.
Corroborated by /sdk/sandboxing-and-allowed-imports/ (14 Aug 2026): the allowlist grants
`urllib.parse` only (no `urllib.request`), no `socket`, no `requests`.

### documented-as-unrestricted vs not-documented — the split the team needs

**Documented as unrestricted (safe to rely on):**
- Destination host for `HttpRequestEffect` and `Http`, subject only to the SSRF rule. No allowlist,
  no approval process, no per-domain registration exists in the docs — and Canvas demonstrably
  *does* document allowlists where it has them (see below).
- Protocol: HTTP/HTTPS only.
- `HttpRequestEffect` 30-second timeout; SSRF block; swallowed connection errors; non-GET redirect
  behavior; retry-on-status.

**Not documented (do not build on either assumption):**
- Any rate limit on outbound plugin HTTP. Silent.
- Any request/response payload size cap. Silent. (The 1 MB and 10,000-record caps on
  /sdk/custom-data/ are storage limits, not HTTP limits.)
- Whether `canvas_sdk.utils.Http` has a default timeout, SSRF protection, or connection pooling.
  Silent — and a `SimpleAPI` route handler blocking on an un-timed-out outbound call is a plausible
  failure mode with no documented bound.
- The default value of `max_retries`. "the platform default is applied" — never stated.
- Total effect-pipeline or handler execution timeout.

**The negative-evidence argument that makes the allowlist finding solid:** Canvas *does* document a
destination allowlist for the one place it has one. `RedirectEffect`
(/sdk/effect-redirect/, 2 Aug 2026): "**Security & Allowlist** — Every destination is validated on
the server before the browser navigates … **Targets are denied by default.**" with named config
(`REDIRECT_ALLOWLIST_INTERNAL`). A house that documents its allowlists, and documents an SSRF
blocklist for `HttpRequestEffect`, and documents nothing for egress destinations, most likely has no
egress allowlist. **[INFERRED, high confidence]**

### CronTask vs SimpleAPI vs event handler

**No documented difference in outbound HTTP capability.** /sdk/handlers-crontask/ (7 Nov 2025) shows
`execute()` returning effects exactly as `compute()` does; nothing about network. The three
documented differences that *do* matter:

1. **Actor.** "For side-effect events or automated events where the action cannot be attributed to a
   specific user, the actor may be absent" (/sdk/events/). A `CronTask` has no actor — the
   `RedirectEffect` page confirms: "for example a `CronTask`, other background processing, or any
   event whose actor defaults to `canvas-bot`". Auth-sensitive outbound calls that key off the acting
   staff member cannot be made from a cron task.
2. **Transaction position.** Pre-command handlers "run synchronously inside the same database
   transaction as the command operation. Your handler can perform validation or modify data, and if
   it raises an exception, both your changes and the command operation roll back together." **Never
   make an outbound call from a `PRE_*` handler** — a slow or failing callback rolls back the
   physician's sign. Post handlers "use Django's `on_commit` mechanism and execute only after the
   outermost transaction commits successfully."
3. **Cron granularity.** `SCHEDULE = "* * * * *"` — "Run every minute, which is the most frequently
   something can run."

### Secrets for outbound credentials

/sdk/secrets/ (14 May 2026) and /guides/plugin-security-model/:

- Declared in `CANVAS_MANIFEST.json` under `variables` (`{"name": "API_TOKEN", "sensitive": true}`);
  the flat `secrets` array is deprecated. Read at runtime via `self.secrets["API_TOKEN"]`.
- "Secret values are write-only from the plugin author's perspective: they can be set and used at
  runtime, but not read back out through the interface used to configure them."
- **Trap:** "Any plugin secret that existed before Canvas 1.305.0 — or any value configured via the
  legacy `secrets:` array — is stored with `sensitive: false`. It will appear in plain text in the
  Admin UI until the owning plugin is migrated to the `variables` schema with `sensitive: true` and
  re-installed."
- **Trap:** "**uninstalling the plugin deletes its secrets**" (/sdk/custom-data-sharing-data/).
- `HttpRequestEffect` headers: "Header values are transmitted as-is — store credentials in the
  plugin's secrets and reference them here rather than hard-coding them."

---

## 3. Where do Custom Data Models store data?

**Answer:** The premise is **correct in conclusion and wrong in one important detail**. Custom data
is Canvas-hosted — it lives in **PostgreSQL schemas ("namespaces") inside the Canvas instance's own
database**, not in the plugin. The plugin genuinely has no DB of its own
("Plugins have no direct database connection, no filesystem access, and no operating-system
access"). The detail the premise misses: **that data is reachable from outside the plugin via the
Canvas PostgreSQL read replica**, which is both an escape hatch and an integration surface.

/sdk/custom-data/ (20 Aug 2026) documents two primitives:

- **`CustomModel`** — Django models producing real tables. "Build your own data model or expand the
  Canvas data model by adding fully structured tables with typed fields, relationships, and
  indexes." Full ORM: `ForeignKey`, `OneToOneField`, `ManyToManyField`, `Meta.indexes`,
  `select_related`, `prefetch_related`, `annotate`, `aggregate`.
- **`AttributeHub`** — "a key/value and document store free from the burden of defining any schema
  or linking to Canvas models", EAV-backed with typed columns (`int_value`, `decimal_value`,
  `json_value`, …).

### Where the data physically lives

> "All custom data created by a plugin — whether using CustomModels or AttributeHubs — is **scoped to
> a namespace**. This isolation ensures that plugins cannot directly access or modify another
> plugin's data."

> "# In a plugin named "my_plugin": Creates a table "specialty" in the "my_plugin" namespace"

Namespaces are PostgreSQL schemas — confirmed by the naming rule ("Cannot use reserved PostgreSQL
names (`public`, `pg_catalog`, etc.)") and by the read-replica instruction below. So: Canvas's
Postgres, in a per-plugin (or per-organization) schema, inside the customer's Canvas instance.
**Canvas-hosted. Confirmed.**

### Cross-patient queryable?

**Yes, fully — this is the real answer to what pushed the team here.** Unlike FHIR metadata,
custom data is ordinary SQL.

- /sdk/custom-data-design-considerations/ (24 Mar 2026) shows exactly the cross-patient pattern:
  a `PatientProfile(CustomModel)` with `OneToOneField(CustomPatient)` carrying `risk_score`,
  `is_vip`, `preferred_language`. "This gives you typed, indexed columns with full ORM support —
  `select_related`, reverse lookups via `related_name`, and **compound filtering in a single query**."
- Quick Reference recommends `CustomModel` for "Data requiring compound filtering, sorting, or
  aggregation" and "Data consumed by reports or analytics".
- Worked example: `Specialty.objects.filter(requires_referral=True)`
  (/sdk/custom-data-sharing-data/).
- `AttributeHub`s are cross-record queryable too, by attribute value:
  `AttributeHub.objects.filter(custom_attributes__value=...)`, `Q()`-composable, with a documented
  type-inference gotcha ("The value rewriter uses `type()` (not `isinstance()`)") and two
  unsupported forms (`custom_attributes__value=None` and `__isnull` "are not supported … and will
  raise `TypeError`"). `AttributeHub`s aren't attached to a patient at all, so cross-patient is
  trivially true.

For an outstanding-prescription queue, `CustomModel` is the right primitive: /sdk/custom-data-design-considerations/
explicitly warns against `AttributeHub` for this shape — "Storing thousands of hubs of
`type="patient_visit"` where you need to filter, sort, or paginate across them becomes expensive.
Each filter condition requires a JOIN to the attribute table."

### Can an external application read or write it directly?

Three paths, in decreasing directness:

1. **PostgreSQL read replica — direct external READ.** "All the data managed by plugin is available
   via the database read replica. To access it, alter the PostgreSQL `search_path` to include the
   namespaces that you intend to query." Read-only, and gated on the customer having read-replica
   access at all (not documented on these pages). **This is a genuine external read path and the
   premise's "invisible outside the plugin" assumption is wrong.**
2. **Through plugin code only, for WRITE.** No FHIR resource, no REST endpoint, no admin API for
   custom data is documented. The documented way to expose it is a plugin-authored `SimpleAPI` with
   its own auth — the worked example implements `authenticate()` against `self.secrets` using
   `hmac.compare_digest`. So Aleron writes custom data only by calling a plugin route the team wrote.
3. **Namespace sharing between plugins.** `read` / `read_write` access levels gated on
   `namespace_read_access_key` / `namespace_read_write_access_key`; a read-access plugin attempting a
   write gets `NamespaceWriteDenied`. Plugin-to-plugin, not external.

### Documented limits

From /sdk/custom-data/, "Limitations (for Safety)":

> "Values stored in `text` and `json` fields may not exceed **1mb** as measured by character count."
> "Bulk operations (e.g., `bulk_create`) are limited to **10,000 records** at a time."

Schema immutability — the one that will bite hardest, from /sdk/custom-data-design-considerations/:

> "tables can be added but **never dropped** via the SDK, and fields can be added but **never
> altered or removed**."
> "CustomModel tables are permanent. Once created, they cannot be dropped via the SDK."

**Get the prescription-tracking schema right the first time.** A wrong column is permanent (short of
`canvas namespace drop`, which destroys the whole schema and all its data). If the shape is not yet
settled, /sdk/custom-data-design-considerations/ advises "A single `JSONField` column or an
`AttributeHub` can hold loosely structured data until access patterns stabilize."

**Retention:** no TTL, no retention policy, no auto-expiry documented — custom data is permanent by
design. "If your use case represents transient data that should expire via TTL, use the Caching API
instead of the Custom Data features."

**Lifecycle traps** (/sdk/custom-data-namespace-lifecycle/):
- "Uninstalling a plugin **deletes its secrets** … The namespace schema and its data, however,
  **survive the uninstall**." Data outlives the plugin; the keys to it do not.
- "Because the namespace itself survives an uninstall, a later reinstall will not regenerate the
  keys, so a copy kept outside Canvas is the only way to restore access."
- "If the keys are already lost, run `canvas namespace drop <namespace> … --execute` to remove the
  namespace, then reinstall." — i.e. losing the keys means destroying the data to recover access.

### Visible to clinicians?

**No — invisible unless the plugin renders it.** No page says custom data appears in any clinical
view. What *is* documented:

- Admin-only surface: namespace access keys appear at "Settings → Plugins → … Secrets"; secret
  values are read via "the Django Admin UI (access is gated by managing-user permissions)".
  Administrative, not clinical.
- Canvas offers a rich set of effects specifically *for* surfacing plugin data to clinicians —
  `ADD_BANNER_ALERT`, `ADD_OR_UPDATE_PROTOCOL_CARD`, `PATIENT_CHART_SUMMARY__CUSTOM_SECTION`,
  `PATIENT_CHART__GROUP_ITEMS`, custom commands, applications. Their existence implies custom data
  is otherwise unrendered. **[INFERRED, high confidence]**
- Notably, `CustomModel` fields on `Patient`/`Staff` do **not** automatically become profile fields.
  Adding fields to the patient profile is a separate documented mechanism
  (`PATIENT_METADATA__CREATE_ADDITIONAL_FIELDS`).

So: a prescription sitting in a plugin-owned "waiting" table is **invisible to the physician who
signed it** unless the team also ships a banner alert, protocol card, or chart section. For a design
with no reconciliation path, that is the difference between a stuck prescription someone notices and
one nobody ever does.

---

## Risk assessment for a single-pathed callback design

Ranked by how quietly each one fails.

**1. `HttpRequestEffect` swallows connection errors. Documented, by design, silent.**
"the failure is logged and the effect pipeline continues — it does not raise back into your handler."
Aleron down for ten minutes during a clinic session → every prescription signed in that window is
lost from Aleron's view, the physician sees a normal successful sign, and the only trace is a Canvas
platform log line the team is not reading. `retry_on_status_codes` does not help: it retries on HTTP
statuses, and a transport failure produces none. On the `canvas_sdk.utils.Http` path the situation is
worse — the docs' own reference pattern is `log.info("Notification unsuccessful. =[")` and return.
**This alone breaks the no-backstop premise.** Nothing in the documented egress paths guarantees
at-least-once delivery.

**2. The sign event may not fire on the print path — undocumented.** `print_action` "Prints and
commits the command." A printed prescription commits without electronic transmission. Whether it
produces `PRESCRIPTION_SIGNED` (a status in what looks like a DrFirst transmission pipeline) is not
documented. `PRESCRIBE_COMMAND__POST_COMMIT` is much more likely to cover it, since print commits.
Choosing `PRESCRIPTION_SIGNED` as the sole trigger risks a whole clinical workflow never firing —
and print is exactly the fallback path clinicians use when e-prescribing is restricted (missing SPI,
no EPCS enrolment, controlled substance with unrecorded sex at birth — all documented restriction
cases where "in the UI a restricted prescription offers no send action at all").

**3. Command-uuid ↔ prescription-id correlation has no documented join.** `Prescription` has no FK to
`Command`. If the team triggers on `PRESCRIPTION_SIGNED` they must match on note + medication +
prescriber, which is ambiguous for two prescriptions of the same drug in one note. Silent mismatch:
Aleron marks the wrong prescription as filled. **Mitigation: set your own `command_uuid` at
origination and trigger on `PRESCRIBE_COMMAND__POST_COMMIT`.**

**4. Handler exceptions.** Post-handler failure behavior is not documented (only pre-handler rollback
is). If an unhandled exception in `compute()` before the effect is returned means the callback never
happens and nothing retries, one bad `KeyError` on an unusual prescription silently drops it. Wrap
the whole handler body and, on failure, still write the "needs reconciliation" row.

**5. `set_async` decoupling.** The recommended pattern hands the request to a platform async runner
whose queue depth, dead-letter behavior, and default `max_retries` are undocumented ("the platform
default is applied"). Exhausted retries produce no documented notification to the plugin.

**6. Private-address rejection.** If Aleron is ever moved behind a VPC peer, VPN, or private DNS
name, `HttpRequestEffect` rejects it — "hostnames that resolve to such addresses are blocked."
Documented and hard.

**7. No documented rate limit — which cuts both ways.** No documented cap means no documented
guarantee. A bulk-signing session (a physician clearing twenty refills) generates twenty concurrent
outbound calls with a 30-second timeout each and no documented concurrency bound.

**8. Invisible waiting state.** Stuck rows in a `CustomModel` appear in no clinical view.

**9. Non-GET redirects are not followed.** If Aleron ever answers a POST with a 3xx (a hostname
change, a trailing-slash rule, an ALB rule), "a 3xx response is returned as-is". Silent no-op.

### What the team would never learn

Every prescription lost to items 1, 2, 4, or 5 is invisible on both sides: Canvas shows a normally
signed prescription, Aleron shows "waiting", and no component holds a record that the two disagree.
There is no error, no alert, and no queue to inspect. The failure only surfaces when a patient calls
about a medication.

### The cheapest backstop, since it already exists

The team does not have to build reconciliation infrastructure. Two documented queries close the loop:

```python
# already-signed prescriptions, from a CronTask
Prescription.objects.filter(status=PrescriptionStatus.SIGNED)   # /sdk/data-prescription/
Prescription.objects.committed()                                # "committed and not entered in error"
Command.objects.filter(state="committed")                       # /sdk/data-command/
```

`Prescription` also carries `committer`, `written_date`, `created`, `modified`, and `note`;
`Command` carries `committer`, `state`, `schema_key`, and a plugin-settable `id`. A once-a-minute
`CronTask` (`SCHEDULE = "* * * * *"`) that diffs signed prescriptions against the plugin's own
"acknowledged" table and re-fires the callback is on the order of thirty lines, and it converts every
failure above from silent to self-healing. Refusing it is not a simpler architecture; it is the same
architecture with the reconciliation moved to a phone call from a patient.

---

## What I could not establish

1. **Whether `PRESCRIPTION_SIGNED` fires at the moment a physician clicks Sign, or only as part of
   the e-prescribing transmission pipeline.** The release note calls the family "Prescription status
   changes"; the enum interleaves local states (`SIGNED`) with network states (`RECEIVED — Received
   by DrFirst`, `INQUEUE`, `TRANSMITTED`, `DELIVERED`). **The single most important untested
   assumption in this design.** Test: sign without sending; sign-and-print; then sign-and-send.
2. **Whether `print_action` produces `PRESCRIPTION_SIGNED`.** Not documented. Almost certainly
   produces `PRESCRIBE_COMMAND__POST_COMMIT` (it "commits the command"), but confirm.
3. **Whether command/record lifecycle events fire for plugin-staged, human-signed commands.**
   Strongly implied by "any command" / "records being created, updated, or deleted" and by the
   absence of the plugin-only caveat Canvas applies elsewhere. Never stated. **Test before shipping.**
4. **Whether `POST_EXECUTE_ACTION` context carries the action name at runtime.** Not in the
   documented context table, though `AVAILABLE_ACTIONS` documents `actions[].name`. Log it.
5. **The "command type table"** referenced twice from /sdk/commands/ ("See the command type table for
   which commands support COMMIT") — I could not find it on that page. The equivalent table on
   /sdk/effects/ is what I quoted; assume they agree, verify if it matters.
6. **Any rate limit, concurrency cap, or payload-size limit on outbound plugin HTTP.** Not documented
   on /sdk/utils/, /sdk/effect-http-request/, /guides/plugin-security-model/, or in release notes
   (grepped: no `allowlist`, `egress`, or `rate limit` hits relevant to plugin HTTP).
7. **Whether `canvas_sdk.utils.Http` single requests have a default timeout, or any SSRF protection.**
   Silent. Only `batch_requests` documents 30s. Use `HttpRequestEffect` instead, where the behavior is
   at least written down.
8. **The platform default for `max_retries`,** and what happens when retries are exhausted (any
   dead-letter, any notification to the plugin). Silent.
9. **Whether post-event handler exceptions are retried, logged only, or surfaced anywhere.** Only
   pre-handler rollback behavior is documented.
10. **Whether customer PostgreSQL read-replica access is generally available**, or gated by contract.
    /sdk/custom-data/ asserts it flatly ("All the data managed by plugin is available via the database
    read replica") without saying how a customer connects. If it is real for this customer, it is a
    second, independent reconciliation path Aleron could use directly.
11. **Total handler / effect-pipeline execution timeout.** Not documented. Matters for a `SimpleAPI`
    route that calls out to Aleron synchronously.
12. **Whether any Canvas UI surface shows custom data to clinicians by default.** No page says yes;
    no page says no. The existence of dedicated surfacing effects is the evidence, not a statement.
