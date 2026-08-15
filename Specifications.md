# Functional and Technical Specification

## Project, Task, and Time Tracking Application

**Revision 16** — supersedes Revision 15

*Fixes invoice payment recording: cumulative payments that reach an invoice's total now reliably flip it to Paid (cent-rounded comparison, immune to floating-point drift), a payment that would exceed the total is rejected outright instead of silently clamped, every individual payment is now kept in a visible history instead of being collapsed into one overwritable running total, and a payment can no longer be recorded on a personal invoice once it's pooled into a collective one.*

## Legend

- **(NEW)** — requirement added in this revision.
- **(REVISED)** — requirement reworded, either to match a deliberate implementation decision or to correct wording that no longer describes the intended behavior.
- **(GAP)** — the requirement is not fully met by the current implementation. See [Known Implementation Gaps](#known-implementation-gaps) at the end of this document for impact and detail.
- Unmarked items are unchanged from the prior revision.

## Summary of Changes in Revision 16

The user reported recording two partial payments on a collective invoice (740, then 700) that together should have covered its 1,440 total, but the invoice stayed "partially paid," and neither payment was visible anywhere after recording. Investigation found the second payment had actually been recorded against the *personal* invoice pooled into that collective invoice, not the collective invoice itself — two separate documents, each carrying its own total — a mix-up the product made easy to make and gave no way to notice afterward. **INV-16** is revised: recording a payment on a personal invoice that has since been pooled into a collective invoice is now rejected outright — once pooled, the collective invoice is the actual client-facing bill, so that's the only place a payment can be recorded going forward. **INV-29** is new: every individual payment (amount, date, who recorded it) is now kept in a visible history on the invoice, rather than collapsed into a single overwritable running total — recording a second payment no longer destroys the record of when the first one happened. **INV-30** is new: a payment that would push the cumulative total paid above the invoice's total is rejected with a clear remaining-balance message rather than silently clamped (the excess previously just vanished instead of being tracked or refused), and the comparison used to decide "has this invoice been fully paid" is now cent-rounded rather than an exact floating-point match, so ordinary rounding in the underlying subtotal/tax math can no longer leave a fully-paid invoice stuck as "partially paid." The one real invoice affected by this incident was corrected directly: the erroneous payment was reverted off the personal invoice and re-applied to the collective invoice it belonged on.

## Summary of Changes in Revision 15

The user asked for two changes: curved rather than straight trend-chart lines, and a similar trend chart for invoices — grouped by client and by status, with personal and collective invoices shown separately. **RPT-8** is revised: every trend chart line (time and invoice alike) now uses monotone cubic interpolation rather than straight segments, chosen specifically because it curves without overshooting past a bucket's real value the way a plain bezier curve can. **RPT-10** is new: the Reports page's Invoices tab gains its own trend charts — invoice count and invoice amount over time, grouped by client (capped at the same top-7-plus-"Other" rule as RPT-9, ranked by count rather than hours since count is the currency-agnostic quantity for invoices) or by status (draft/sent/partially paid/overdue/paid — never capped, there are only five). Personal and collective invoices are always rendered as two separate sets of charts, never combined, since a personal invoice pooled into a collective one would otherwise be counted in both. **RPT-11** is new: a draft invoice counts toward the count trend (so a manager can see how many drafts exist) but contributes 0 to the amount trend — it isn't a real claim on a client yet, the same rule the existing invoice report already applies to its money totals. When grouping by status, each status's line uses the same color already assigned to that status elsewhere in the app (the existing status-pill palette), not an arbitrary rank-assigned color, since the series literally are those statuses.

## Summary of Changes in Revision 14

The user asked for a graphical trend on the Reports page: hours and cost over time, for the selected period or the last 30 days by default, broken down separately by client, project, task, and user. **RPT-8** is new: the software must render this as a line chart per grouping dimension, one always-visible chart for hours and one per currency present for cost (never combined on one dual-axis chart), defaulting to the last 30 days when no start/end date filter is set, with bucket granularity that widens from daily to weekly to monthly as the selected period grows (so a very long range doesn't render one point per day). **RPT-9** is new: when a grouping produces more than 7 distinct entities, the lowest-ranked (by total hours) fold into a single "Other" series rather than the chart growing an unbounded, indistinguishable number of lines — the same entity keeps the same color across the hours chart and every currency's cost chart. The "User" grouping is only offered to managers (a regular user's own data never has more than one user in it, same posture as the existing "By user" table).

## Summary of Changes in Revision 13

The user asked for the collective invoice's layout to list every pooled personal invoice's own line items, grouped under a heading of that invoice's number, rather than one summary row per contributor. **INV-28** is new and **INV-12** is revised accordingly: a collective invoice's display (PDF, CSV, and the in-app detail view) now renders, for each pooled personal invoice, a heading of its invoice number followed by its own line items and manual items using the same Description/Units/Rate/Amount columns as a personal invoice (not the previous per-contributor VAT/Net/Gross aggregate columns), followed by that contributor's own Subtotal, tax line(s), and Total — reproducing what their personal invoice itself shows rather than collapsing it into one row. This revises the description carve-out in **INV-25**, which previously said a collective invoice's line-item description stays as the invoice number: that's still true of the underlying *stored* aggregate line item (used for the collective's own subtotal/total math, pooling, and unpooling — all unchanged), but the *displayed* breakdown now expands each contributor's own line items beneath their heading. The collective invoice's own grand Subtotal/Total (and, separately, any manual items added directly on the collective invoice itself) are unaffected and still appear once, after every contributor's group.

## Summary of Changes in Revision 12

The user requested specific layout changes to both invoice types' exports. **INV-25** is new: a personal invoice's line-item description, previously just `"YYYY-MM-DD — X.XXh"`, now reads `"YYYY-MM-DD, Project, Task"` (task name omitted for the small number of historical time records logged before TR-1 made a task mandatory) — a collective invoice's line-item description is unchanged (each line is still the pooled personal invoice's own invoice number). **INV-26** is new: the line-item quantity column, previously labeled "Hours" everywhere it appeared (PDF, CSV, and the in-app invoice detail view, on both invoice types), is now labeled "Units" in all of those places for consistency — this doesn't change what the column contains (hours are still what's recorded and totaled) or any other column (Rate, Amount, VAT, Net, Gross are unchanged). **INV-27** is new: on the PDF export only, the Payment details section moves from after the totals/tax note (near the bottom of the document) to the header's right-aligned metadata column, positioned directly below Period and above Due date/Payment terms — so it now renders above the Line Items table rather than below it. The CSV export already listed Payment details ahead of the line items and is unaffected by this positional change (CSV has no visual "right-justified" concept to apply).

## Summary of Changes in Revision 11

The user found a real production instance: a DCPS task ("Training") is marked non-billable, yet a manager could still set a Revision 10 member-rate override on it, and a time record logged against it showed a nonzero calculated cost (CA$800 for 8 hours at the $100 override rate) despite being non-billable. **RB-5** is revised again: a non-billable task (CPT-14) now skips rate resolution entirely — every tier of the precedence is bypassed, not just left showing a rate that isn't charged — so `resolvedRate` and `calculatedCost` are always exactly 0 for a non-billable time record, both at creation and on any later re-resolution (a task reassignment or a time change). A new `RateSource` value, `non_billable`, records why the rate is 0 rather than reusing one of the real precedence tiers. The one existing production record affected by this bug (Ariel's August 17 Training entry) was corrected directly; no other record in the database was affected.

## Summary of Changes in Revision 10

The user asked to verify RB-5's rate precedence against their actual need: the same team member can legitimately bill different rates on different projects, or even different tasks within a project — something the previous flat per-team rate (RB-1) couldn't express. **RB-11** is new: a manager can set a rate for a specific team member scoped to a project, or further to one task within it, without touching that member's flat team-wide rate. **RB-5** is revised to a five-tier precedence — a member's task-level override, then their project-level override, then their flat team rate, then the task's own flat rate, then the project's own flat rate — so a member's own rate (at whatever specificity was configured) always wins over the task's or project's generic rate, and the more specific override always wins over the less specific one. Reassigning a time record's task (**TR-5**) now always re-resolves the rate, closing a gap where reassignment alone (without also changing the logged times) silently left the old task's rate in place.

While implementing this, the exact same rate-editing UI pattern (an inline "click to edit, type a number, Save" control, present since Revision 5's original **RB-1** rate-setting UI) was found to be silently broken everywhere it was used, including on the pre-existing Team Members page — a manager typing a new rate and clicking Save did nothing, with no visible error. The cause: Vue 3.4 changed `<input type="number">` to auto-convert its `v-model` value to a JavaScript number even without the `.number` modifier, but the save handler assumed a string and called `.trim()` on it, throwing silently. Fixed everywhere the pattern occurs.

## Summary of Changes in Revision 9

This revision fixes a reported bug: a task's status was purely a UI label with no backend effect, so a user could still log time against a task marked complete. **CPT-12** renames the third status value from "done" to "complete" (matching the naming already used for project status, CPT-7) and existing records were migrated. **CPT-15** is new: the backend now rejects creating a time record against a completed task, and rejects reassigning an existing time record's task to a completed one, both with a dedicated `TASK_COMPLETE` error code; the time-entry form's task dropdown filters out completed tasks so the option is never offered in the first place. This complements CPT-14's existing server-side enforcement — task status changes and assignment (CPT-12's "who may change it," CPT-13) remain UI-only restrictions; see [Known Implementation Gaps](#known-implementation-gaps). The user considered whether "open" and "in progress" were redundant statuses and decided to keep both as-is.

## Summary of Changes in Revision 8

This revision changes who controls whether logged time is billable. Previously (TR-6, Revision 5) each team member chose billable/non-billable per time entry. Now that control moves to the task: **CPT-14** gives every task a billable flag, changeable only by a manager and enforced server-side (not just hidden in the UI, unlike the still-open CPT-12/CPT-13/RB-4 gaps on a task's other fields) — and a time record inherits that setting as an immutable snapshot the moment it's created (**TR-6**, revised), the same pattern already used for a record's resolved rate and currency. Task selection on a time record is now mandatory (**TR-1**, revised) rather than optional, since there's otherwise nothing to inherit from. Records logged before this revision, when tasks were optional, keep their own already-set billable value and are not retroactively required to have a task.

## Summary of Changes in Revision 7

This revision adds the Notifications and Automation section (NOTIF-1 through NOTIF-6): a fixed catalog of rule types, evaluated on a recurring schedule, that notify a user in-app (and, if they opt in and the deployment has real email configured, by email) about things worth their attention — an overdue invoice, a quiet week with little logged time, a managed project approaching its end date, or an approval backlog. Each rule's own parameters and on/off state are configurable per user, and manager-scoped rules only appear for users who actually manage a team. Building the "invoice overdue" rule also closed a gap noted against **INV-16** in Revision 6: a sent invoice past its due date now transitions to overdue status automatically, rather than that status being reachable but never actually set by anything.

## Summary of Changes in Revision 6

This revision documented two things. First, the invoicing enhancements built after Revision 5: separate personal and collective bank account details per user (supporting EU IBAN/SWIFT and North American routing/account formats, plus a free-text fallback), invoice due dates and payment terms, a free-text tax/legal note for reverse-charge and exemption mentions, an auto-derived supply/service period on personal invoices, and a phone number on a contractor's incorporation profile. Second, a full audit of every Revision 5 requirement against the deployed application. Several requirements were reworded **(REVISED)** to match deliberate implementation decisions — for example, time-record overlap is enforced as a hard block rather than a warning, and MongoDB multi-document transactions were replaced with a two-phase write/reconcile pattern because the database runs as a standalone instance without a replica set. Others were marked **(GAP)** where the implementation did not yet fully satisfy the written requirement, each listed with its practical impact in [Known Implementation Gaps](#known-implementation-gaps) so open work stays visible rather than silently assumed done. (The RB-7 gap noted here was closed shortly after, still under this revision; Revision 7 has since also closed INV-16.)

---

## Time Recording

- **TR-1** *(REVISED)* — The software must record the time that a user does work. Every time record must be associated with exactly one project and exactly one task — a task is mandatory going forward (see TR-6), not optional as in earlier revisions. Time records logged before this rule remain valid without a task; see CPT-14.
- **TR-2** — The software must not use a live timer.
- **TR-3** — The user must write time data manually into a digital form.
- **TR-4** — The frontend software must use a calendar widget to let the user select the date and the time.
- **TR-5** — The software must let the user change recorded time data, except where the record has been approved and locked (see UA-16).
- **TR-6** *(REVISED)* — A time record's billable status must not be set directly by the user. It is inherited from its task's billable setting (see CPT-14) at the moment the record is created, as an immutable snapshot — the same pattern already used for a record's resolved rate and currency (RB-6/RB-10) — so a manager later changing a task's billable setting never silently alters an already-logged entry.
- **TR-7** — The software must record time to a minimum granularity of one minute, and must reject a time record where the end time is not later than the start time.
- **TR-8** *(REVISED)* — The software must prevent (not merely warn against) saving a new or edited time record that overlaps an existing time record for the same user on the same date — checked across every project and task the user has logged time against that day, not only the same project and task.
- **TR-9** — The software must let the user attach a free-text note (up to 1,000 characters) to a time record.
- **TR-10** — The backend software must retain a change history for each time record, capturing the prior value, the new value, the user who made the change, and the timestamp of the change.

## Clients, Projects, and Tasks

- **CPT-1** — The software must let the user with the manager role make a new client record.
- **CPT-2** — A client record must contain a name, a billing contact person, a billing email address, a billing address, and, where applicable, a tax identification number.
- **CPT-3** — The software must let the user with the manager role make a new project.
- **CPT-4** — The software must connect a project to one client record.
- **CPT-5** — The software must let the user with the manager role make new tasks for a project.
- **CPT-6** *(REVISED)* — The software must let the user with the manager role change the status of a project, subject to a defined set of allowed transitions — complete and cancelled are terminal states that cannot transition to any other status.
- **CPT-7** — The project status options are active, on hold, complete, and cancelled.
- **CPT-8** *(REVISED)* — The software must prevent new time records from being created against a project with a status of on hold, complete, or cancelled, or with a date falling outside that project's configured start/end date range (see CPT-9).
- **CPT-9** — The software must let the user with the manager role set a start and end date for a project.
- **CPT-10** *(GAP)* — The software must let a manager optionally set an estimated-hours or monetary budget for a project, and must let a manager view recorded time or cost against that budget.
- **CPT-11** — The backend software must calculate the total time recorded for a project.
- **CPT-12** *(REVISED, GAP)* — A task must have a status of open, in progress, or complete. The status may be set by a manager or by the team member assigned to the task.
- **CPT-13** *(GAP)* — The software must let a manager assign a task to one member of the collaborative team.
- **CPT-14** *(NEW)* — A task must have a billable flag (default: billable), settable only by a manager — enforced server-side, unlike CPT-12/CPT-13/RB-4's still-open gaps for a task's other fields (see Known Implementation Gaps). This is the single point of control for whether time logged against it can be invoiced (see TR-6, INV-1), rather than each team member deciding per entry.
- **CPT-15** *(NEW)* — The software must not let a time record be created, or an existing time record's task reassigned, against a task whose status is complete — enforced server-side, distinct from CPT-12's still-open gap over who may change a task's status in the first place. The time-entry task-selection UI must not offer a completed task as an option.

## Rates and Billing

- **RB-1** — The software must let a user with the manager role set an hourly monetary rate for a team member.
- **RB-2** — The software must let a user with the manager role set the currency for the project.
- **RB-3** — The software must let a user with the manager role set an hourly monetary rate for a project.
- **RB-4** *(GAP)* — The software must let a user with the manager role set an hourly monetary rate for a specific task.
- **RB-5** *(REVISED)* — For a time record logged against a billable task, the backend software must resolve exactly one rate using the following precedence: (1) the member's rate override for the specific task, if set; (2) otherwise the member's rate override for the project, if set; (3) otherwise the member's flat team-wide rate, if set; (4) otherwise the task's flat rate, if set; (5) otherwise the project's flat rate. The resolved rate must be used for cost calculation. Reassigning a time record's task must re-resolve the rate under this precedence, not just at creation. A time record logged against a non-billable task (CPT-14) must skip this precedence entirely — its resolved rate and calculated cost must always be 0, regardless of any rate configured at any tier.
- **RB-6** — The backend software must calculate the cost of a time record using the resolved rate at the time the record is created, and must store the calculated cost on the record. A later change to a team member's, project's, or task's rate must not retroactively alter the cost of previously calculated time records.
- **RB-7** — The software must let the user group and view total cost by project, by task, or by user, subject to the access rules in Section 6.
- **RB-8** *(GAP)* — The software must not let the regular user view the hourly rate of other users, or of a project or task.
- **RB-9** *(GAP)* — The software must let a regular user view the calculated cost of their own time records without exposing the underlying hourly rate of a user, project, or task they are not authorized to view.
- **RB-10** *(REVISED)* — The software must calculate and store each time record's cost using the currency configured for its project at the moment the record is created, and must retain that currency as an immutable snapshot on the record even if the project's currency setting is changed afterward. Any view or export that aggregates cost across multiple time records or invoices — reports, invoice pools, budget totals — must group and total by each record's own currency rather than summing figures from different currencies together.
- **RB-11** *(NEW)* — A manager may set a rate for a specific team member that overrides that member's flat team-wide rate (RB-1), scoped either to a project or to one task within a project — letting the same person bill different rates on different projects, or different tasks within the same project. Enforced server-side, manager-only, same as CPT-14 rather than extending the CPT-12/CPT-13/RB-4 UI-only gaps.

## Invoices

- **INV-1** — The software must make an invoice from billable time records that have not already been included on another invoice.
- **INV-2** — The software must group the time records by client to make the invoice.
- **INV-3** — The software must let the user add manual text to the invoice.
- **INV-4** — The software must let the user add manual cost items to the invoice.
- **INV-5** — The software must let the user change the invoice data before transmission.
- **INV-6** — The software must let the user export the invoice to a CSV file.
- **INV-7** — The software must let the user export the invoice to a PDF file.
- **INV-8** — The software must let the user record the date when the client pays the invoice.
- **INV-9** *(REVISED)* — The software must let any team member generate a personal invoice for their own approved, billable, un-invoiced time on a project — not limited to contractors billing B2B.
- **INV-10** — The software must store a user's personal invoice in a collective invoicing pool for the project.
- **INV-11** — The software must let the user with the manager role create, view, and transmit a collective invoice to the client.
- **INV-12** *(REVISED)* — The collective invoice must group and include all personal invoices from the invoicing pool for a selected period, displaying each one's own line items under a heading of its invoice number (see INV-28) rather than a single summary row per contributor.
- **INV-13** *(REVISED)* — The software must build a collective invoice exclusively from personal invoices that their owner has already created and sent — direct inclusion of un-invoiced time records by the manager, as specified in Revision 5, has been removed from product scope. Every contributor must issue and send their own personal invoice before their time can be consolidated into a collective invoice.
- **INV-14** — The software must mark a time record as invoiced once it is included on any invoice, and must exclude invoiced time records from future invoice generation. If a draft invoice is deleted before transmission, its time records must be unmarked as invoiced.
- **INV-15** *(REVISED)* — The software must assign each invoice a sequential invoice number, unique within its team, in the format `yyyymmdd-NNNNNN` (creation date plus a 6-digit, zero-padded, per-team sequence that never resets or reuses a number).
- **INV-16** *(REVISED)* — An invoice must have a status of draft, sent, paid, partially paid, or overdue, and must support recording a partial payment amount. A sent invoice must transition to overdue automatically once its due date has passed, checked by the recurring scan described in NOTIF-2. A payment must not be recordable on a personal invoice that has been pooled into a collective invoice (see INV-10) — once pooled, the collective invoice is the client-facing bill, and that is the only place a payment may be recorded against that work.
- **INV-17** *(REVISED)* — The software must let the user choose one or more concurrent tax rules (name and rate) on a personal invoice, applied at creation or while it remains a draft. A collective invoice has no tax rate of its own — its total is the sum of each pooled personal invoice's own gross amount, with each retaining the tax rate its owner applied.
- **INV-18** *(NEW)* — The software must let a user record two separate sets of bank account details on their profile: a personal account, used on personal invoices they create, and a collective account, used on collective invoices they issue as a manager on the team's behalf.
- **INV-19** *(NEW)* — A bank account record must support both EU-style details (IBAN, SWIFT/BIC) and North American-style details (routing number, account number), plus a free-text field for any other routing scheme (sort code, IFSC, correspondent bank information, etc.). An account is considered complete only once it has an account holder name, bank name, country, and at least one of: an IBAN, a routing number plus account number, or free-text details.
- **INV-20** *(NEW)* — The software must block a manager from creating a collective invoice if their profile's collective bank account is not complete (see INV-19), with an error distinct from the existing incorporation-profile guard (see INV-9 predecessor requirements) so the user can tell which is missing.
- **INV-21** *(NEW)* — The software must let the user set a due date and free-text payment terms (for example, "Net 30") on a personal or collective invoice, displayed on the invoice detail view and included in its PDF and CSV exports.
- **INV-22** *(NEW)* — The software must let the user attach a free-text tax/legal note to an invoice (for example, a reverse-charge or exemption reference for an intra-EU transaction), displayed prominently on the invoice and included in its PDF and CSV exports.
- **INV-23** *(NEW)* — For a personal invoice, the software must automatically derive its supply/service period from the minimum and maximum date of its included time records, recalculated whenever a time record is added to or removed from the draft — the period must never be manually entered on a personal invoice. A collective invoice retains its own manually chosen period, set at creation.
- **INV-24** *(NEW)* — A contractor's incorporation profile must support an optional phone number, printed alongside the company's other details on invoice exports.
- **INV-25** *(NEW)* — A personal invoice's line-item description must read as the date (`yyyy-mm-dd`), the project name, and the task name, comma-separated (task name omitted if the underlying time record has no task, for records logged before a task became mandatory). A collective invoice's line-item description is unchanged — each line remains the pooled personal invoice's own invoice number.
- **INV-26** *(NEW)* — The line-item quantity column, on both invoice types and in every export/view (PDF, CSV, and the in-app invoice detail view), must be labeled "Units" rather than "Hours." This is a label change only — the column still contains and totals hours; no other column is affected.
- **INV-27** *(NEW)* — On the PDF export, the Payment details section must be positioned in the header's right-aligned metadata column, directly below Period and above Due date/Payment terms — above the Line Items table rather than after the totals. Applies to both personal and collective invoices, which share the same PDF layout code.
- **INV-28** *(NEW)* — In every place a collective invoice's contents are shown (PDF export, CSV export, and the in-app invoice detail view), each pooled personal invoice must be displayed as a heading of its own invoice number, followed by its own line items and manual items (same Description/Units/Rate/Amount columns as a personal invoice), followed by that contributor's own Subtotal, tax line(s), and Total. This is a display-only requirement — it does not change how the collective invoice's own totals are stored or computed, nor the pooling/unpooling behavior of INV-10/INV-13.
- **INV-29** *(NEW)* — The software must retain every individual payment recorded against an invoice (amount, date, and who recorded it) as a visible history on the invoice, in the order recorded — not just a single running total that a later payment silently overwrites.
- **INV-30** *(NEW)* — The software must reject a payment that would bring an invoice's cumulative recorded payments above its total, with a message stating the remaining balance, rather than silently capping the recorded amount at the total. Whether an invoice's cumulative payments have reached its total (and it should therefore be marked Paid) must be compared with cent-level rounding, not exact floating-point equality, so ordinary rounding in the underlying subtotal/tax calculation cannot leave a fully-paid invoice stuck at a lesser status.

## Reports and Data

- **RPT-1** — The software must show a summary of the recorded time and the total cost.
- **RPT-2** — The software must let the user select a start date and an end date for the summary.
- **RPT-3** — The software must filter the data by user, by client, by project, and by task.
- **RPT-4** — The software must let the user export the data to a CSV file.
- **RPT-5** — The software must let the user export the data to a PDF file.
- **RPT-6** — Report and export data must be scoped by the access rules in Section 6: a regular user must see only their own data; a manager must see only the data of their collaborative team.
- **RPT-7** *(NEW)* — The software must provide a separate invoice-focused report: invoice counts by status, and totals invoiced/paid/outstanding grouped by currency and broken down by client, with the same CSV/PDF export and access-rule scoping as RPT-4 through RPT-6.
- **RPT-8** *(REVISED)* — The software must show a graphical trend of hours and cost over time on the Reports page, for the selected date range or the last 30 days by default when no range is set, broken down separately by client, project, task, or user (one grouping viewed at a time). Hours and cost must never share one chart/axis — a separate chart for hours, and a separate chart per currency present for cost. Bucket granularity must widen as the selected period grows (daily for short ranges, then weekly, then monthly) so a long range doesn't render one point per day. Every trend chart line must use curved (monotone cubic) interpolation rather than straight segments, chosen so the curve never overshoots past a bucket's actual value.
- **RPT-9** *(NEW)* — When a trend grouping (RPT-8) produces more than 7 distinct entities, the lowest-ranked entities by total hours must fold into a single "Other" series rather than the chart growing an unbounded number of lines. The same entity must be represented by the same color across the hours chart and every currency's cost chart for a given grouping. The "user" grouping is available only to a manager (mirrors RPT-6's access scoping — a regular user's own data never spans more than one user).
- **RPT-10** *(NEW)* — The Reports page's invoice report must show a graphical trend of invoice count and invoice amount over time, for the selected date range or the last 30 days by default, grouped separately by client or by status (one grouping viewed at a time). Personal and collective invoices must always be rendered as two separate sets of charts, never combined — a personal invoice pooled into a collective one must not be counted in both. Client grouping follows the same top-7-plus-"Other" cap as RPT-9, ranked by invoice count (the currency-agnostic quantity, mirroring RPT-9's use of hours rather than cost for ranking); status grouping is never capped (there are only five possible statuses) and each status's series must use that status's existing color from elsewhere in the app (the status-pill palette) rather than an arbitrary rank-assigned color.
- **RPT-11** *(NEW)* — A draft invoice must count toward the invoice-count trend (RPT-10) but must contribute 0 to the invoice-amount trend — the same rule already applied to the existing invoice report's money totals (RPT-7), since a draft isn't yet a real claim on a client.

## Notifications and Automation

- **NOTIF-1** *(NEW)* — The software must provide a configurable automation backbone: a fixed catalog of built-in rule types, each evaluated on a recurring schedule, that creates an in-app notification for a user when its condition is met for them.
- **NOTIF-2** *(NEW)* — The rule catalog must include, at minimum: an invoice becoming overdue (notifying both the invoice's owner and any manager of its team, and transitioning the invoice's own status to overdue — see INV-16); a user not having logged enough time by a configurable point in the week; an active project, for its managers, approaching its configured end date; and time records that have sat pending approval longer than a configurable threshold, for the team's managers.
- **NOTIF-3** *(NEW)* — The software must let each user independently enable or disable every rule type that applies to them, and tune that rule's own parameters (for example: grace days, which weekday, minimum hours, days-ahead threshold). A manager-scoped rule type must only be offered to a user who currently manages at least one team.
- **NOTIF-4** *(NEW)* — The software must provide a dedicated Notifications page where a user can view their own notifications (read and unread), mark one or all as read, and — where the notification concerns a specific invoice or project — jump directly to it.
- **NOTIF-5** *(NEW)* — The software must not create a duplicate notification for the same user and the same underlying occurrence within that rule's own re-notification window (for example: once per invoice, once per calendar week, once per day) — since the system does not send email by default, the in-app notification store is the definitive record of what's still open.
- **NOTIF-6** *(NEW)* — If a user opts in to email delivery for a rule type, and the deployment's email provider is configured for real delivery (not the console/mock provider), the software must additionally send that notification by email, addressed to that user.

## User Access and Collaborative Teams

- **UA-1** — The software must operate as a self-managed system without a central administrator.
- **UA-2** — The software must let a person register a new user account using an email address, and must send a verification link to that address. The account must remain inactive until the email address is verified.
- **UA-3** — The software must generate a unique, 24-character hexadecimal user identification string (UID) for each user, using a cryptographically secure random source generated independently of any database primary key.
- **UA-4** — The software must let a registered user make a collaborative team.
- **UA-5** — The software must let a user be a member of more than one collaborative team.
- **UA-6** — The software must let a user search the system for other registered users by an exact, full match on their user identification string (UID).
- **UA-7** — The software must let a user add a searched user to their collaborative team.
- **UA-8** — The software must let a user assign the manager role to one or more members of their collaborative team.
- **UA-9** *(GAP)* — The software must let the team creator, or a user with the manager role, remove a member from the collaborative team, revoke a member's manager role, and delete a team.
- **UA-10** — A user must see only their own time records.
- **UA-11** — A manager must see time records of their collaborative team.
- **UA-12** — A manager must be able to approve a time record for a team member.
- **UA-13** — A manager must be able to reject a time record for a team member.
- **UA-14** — A rejected time record becomes editable by the user.
- **UA-15** — The backend software must lock an approved time record.
- **UA-16** — A user must not change a locked time record.
- **UA-17** — The software must let an unauthenticated user request a password reset by providing a verified email address, without requiring intervention from another user.
- **UA-18** *(REVISED — removed)* — A manager may approve their own time record. The Revision 5 restriction against self-approval (except for a sole team member) has been removed from product scope.
- **UA-19** *(REVISED / GAP)* — The software must let a user file a request for account deletion, which records the request timestamp on their account for review, subject to statutory retention requirements for financial records; invoiced time records may be retained in an anonymized form. (See [Known Implementation Gaps](#known-implementation-gaps): the request is currently recorded but not yet acted on automatically.)
- **UA-20** *(NEW)* — A user must be able to view, read-only, their own time records logged across every collaborative team they belong to — not only the team currently selected — to help them understand a cross-team overlap block (see TR-8).

## Technical Specifications and Architecture

- **TECH-1** — The system must use a client-server architecture.
- **TECH-2** — The developer must write the backend software in TypeScript using Node.js and the Express framework.
- **TECH-3** — The developer must write the frontend software in TypeScript using Vite and Vue.js.
- **TECH-4** — The frontend software must not use React.
- **TECH-5** — The frontend software must use Tailwind CSS for the visual design.
- **TECH-6** — The system must use JSON Web Tokens (JWT) for authentication.
- **TECH-7** *(GAP)* — The system must issue short-lived JWT access tokens (recommended maximum lifetime: 15 minutes) paired with a refresh-token mechanism, and must support revoking a refresh token on logout or role change.
- **TECH-8** — The frontend software must send the JWT in the header of each API request.
- **TECH-9** — The backend software must store the primary data in a MongoDB database.
- **TECH-10** — The backend software must use Mongoose to model the MongoDB data.
- **TECH-11** *(REVISED / GAP)* — Because the system runs MongoDB as a standalone instance without a replica set, native multi-document ACID transactions are not available to it. Instead, any operation that writes to more than one collection as part of a single business action (for example, invoice generation) must use a two-phase write pattern: the primary document is saved in an unreconciled state, dependent documents are then updated, and the primary document is finally marked reconciled. A reconciliation pass must detect and repair — or safely discard, if stale — any operation left unreconciled by a crash or restart. (See [Known Implementation Gaps](#known-implementation-gaps): this reconciliation pass currently runs only at server startup and via a manual internal endpoint, not on a recurring schedule.)
- **TECH-12** — The developer must put the frontend software, the backend software, and the databases into Docker containers. The backend software must use persistent storage volumes to retain database data outside of the container lifecycle.
- **TECH-13** — The software must run in a container platform as self-managed Docker processes.
- **TECH-14** — The front end must communicate with the backend using a REST API.
- **TECH-15** *(GAP)* — Client-server communication must use TLS terminated at the load balancer. Inter-service communication inside the container platform does not require TLS. Sensitive fields, including password hashes, must be encrypted at rest.
- **TECH-16** — Passwords must be stored using a modern adaptive hashing algorithm (Argon2) with a unique per-user salt.
- **TECH-17** — The backend must apply rate limiting to authentication and registration endpoints.
- **TECH-18** *(GAP)* — The system must run automated daily backups of the MongoDB data with a defined retention period, and must support point-in-time restore.
- **TECH-19** — The REST API must be versioned in its URL path (for example, `/api/v1/...`).
- **TECH-20** *(REVISED)* — The backend must emit structured logs and expose health (`/healthz`) and readiness (`/readyz`, including live database connectivity) endpoints, consumed by the container platform's own health-check mechanism — currently Docker Compose, rather than Kubernetes.
- **TECH-21** *(GAP)* — The system must maintain separate development, staging, and production environments.
- **TECH-22** *(NEW)* — The backend must attach a correlation ID to each incoming request and include it in that request's structured log entries.
- **TECH-23** *(NEW)* — The backend must apply standard HTTP security headers, and the reverse proxy must apply a request-rate limit across the entire API surface in addition to the backend's own per-endpoint limiting (see TECH-17).

## Non-Functional Requirements

- **NFR-1** — For the initial release, the system does not require specific uptime or response time metrics.
- **NFR-2** — The system must comply with applicable data protection regulation (for example, GDPR) for any personal data it stores, including support for data access and deletion requests (see UA-19).
- **NFR-3** *(GAP)* — The frontend should meet WCAG 2.1 AA accessibility guidelines where practicable.
- **NFR-4** *(GAP)* — The frontend must be usable for time entry on mobile viewport widths down to 375 pixels.
- **NFR-5** — Dates and times must be displayed according to the user's locale; monetary values must be displayed using the currency stored on the record or invoice being shown (see RB-10).
- **NFR-6** *(REVISED / GAP)* — The backend must retain an immutable audit log of rate changes (team member, project, and task), time record approvals/reversions/rejections, and invoice generation events, each denormalized with enough context (actor, entity names, previous/new values) to read clearly on its own. The system must provide an Audit Log page, scoped to a team and filterable by event type, entity type, and date range, visible only to that team's managers — the closest equivalent to an "administrator" in this system, which otherwise has none (see UA-1). The system must enforce a built-in 7-year data retention policy.

---

## Known Implementation Gaps

This section lists every requirement above marked **(GAP)**, with its practical impact, so open work stays visible to stakeholders rather than being silently assumed complete.

- **CPT-10** — A project's budget-vs-actual view only totals cost in the first currency it encounters. If a project's currency is changed after time has already been logged against it, the budget progress display silently ignores cost recorded in the earlier currency.
- **CPT-12, CPT-13** — Task status changes and task assignment are restricted to managers / the assigned member only in the UI. The underlying API does not yet enforce this — any authenticated team member calling the API directly could change any task's status or reassign it, and there is no server-side check that an assignee is even a member of the team. (CPT-14's `billable` field and, since Revision 9, the completed-task time-entry block described in CPT-15 are the task-related behaviors that *are* properly enforced server-side — this gap covers who is allowed to set a task's status or assignee in the first place, not what a completed status then does.)
- **RB-4** — Setting a task's hourly rate has the same gap as CPT-12/13: the API does not restrict this to managers, though the UI does.
- **RB-8, RB-9** — Hourly-rate redaction for non-managers is enforced only in the frontend (a UI component hides the value unless the viewer is a manager). The API itself returns each time record's full resolved rate regardless of the caller's role, so a regular user calling the API directly could read a rate they're not authorized to view.
- **UA-9** — The team record does track its original creator, but authorization currently checks only the current manager role. If a creator is later demoted from manager by someone else, they lose the ability to remove members, revoke roles, or delete the team that the written requirement intends them to keep.
- **UA-19** — Filing a deletion request only timestamps the account for manual review; there is no automated pipeline yet that actually erases account data, anonymizes invoiced time records, or otherwise acts on the request.
- **TECH-7** — Revoking a refresh token on a role change is not implemented (logout-time revocation is). Impact is limited because role is looked up live from the database on every request rather than being embedded in the access token, but the written requirement is not literally met.
- **TECH-11** — The reconciliation pass for the two-phase write pattern (see main entry above) runs only at server startup and via a manual, non-public internal endpoint. An operation interrupted mid-way (for example, by a crash) stays unreconciled until the next restart or a manual trigger — there is no recurring scheduled sweep.
- **TECH-15** — Beyond password hashing, no field-level encryption at rest exists for other sensitive fields introduced by this and prior revisions — bank account numbers/IBANs (INV-18/19), tax IDs, and similar data are stored as plain strings.
- **TECH-18** — A backup script exists and performs a real, retention-aware `mongodump`, but it is not wired into any scheduler, cron job, or CI/CD pipeline — it must be run manually. "Automated daily backups" and point-in-time restore are not yet in place.
- **TECH-21** — Only a single Docker Compose configuration exists. There is no separate staging or production environment, configuration, or infrastructure — this remains aspirational.
- **NFR-3** — Accessibility support is inconsistent: some components have ARIA attributes, focus styling, and screen-reader-only text, but there is no systematic accessibility coverage or testing across the frontend.
- **NFR-4** — No dedicated mobile time-entry layout or 375px breakpoint testing was found; the frontend relies on Tailwind's general responsive utilities rather than a verified mobile-specific design.
- **NFR-6** — Audit log coverage is now complete (rate changes, time record approvals/reversions/rejections, and invoice generation all write to the immutable audit log, and a manager-only Audit Log page exists to view them). What remains open: the 7-year retention-enforcement function exists in code but is never invoked by anything — no scheduled job, startup hook, or route calls it, so the policy is defined but not actually enforced.
