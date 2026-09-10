# My Daily Work Info

Daily field-staff tracking for CSPC. Staff clock in and out on an Android phone,
recording vehicle mileage and fuel spend; admins run the day from a browser
portal. Both sides share one Firebase project, so what a driver records shows up
in the portal immediately.

The repo folder, the Gradle package (`co.za.cspc.fleettracker`) and the Firebase
project still carry the app's original name, Fleet Tracker. Only the name shown
to users changed.

**Installing the phone app:** every build publishes the APK to one fixed link, which
needs no sign-in and can be opened on the phone itself.

```
https://github.com/Aadil9401/Fleet-tracker-New/releases/download/debug-latest/app-debug.apk
```

**The admin portal** is deployed by hand with `firebase deploy --only hosting`. There is
no workflow for it, so the live site sits on whatever was last deployed rather than on
whatever is on `main` — worth checking first if the portal seems to be missing a change.

## What's in this project

| Folder | What it is |
|---|---|
| `app/` | The Android app staff use (Kotlin + Jetpack Compose) |
| `web/` | The admin portal — one self-contained `index.html`, plus its tests |
| `functions/` | Firebase Cloud Functions (creates employee logins, sends email alerts) |
| `firestore.rules`, `storage.rules` | Security rules, so employees only ever see and edit their own data |
| `.github/workflows/build-apk.yml` | Builds the installable APK on GitHub |
| `.github/workflows/checks.yml` | Runs the portal and Cloud Functions checks on every push |

## Features

### Staff, on the phone

- **Start time** — clocks in, records the vehicle's opening odometer reading and
  the areas being worked
- **Knock off** — clocks out, records the closing reading and areas
- **Parking late needs a reason** — once the curfew has passed, knocking off asks why
  the vehicle is being parked late and will not let the day be closed without it. The
  admin sees it beside the minutes on the day view, so an hour late comes with its half
  of the answer
- **Not working today** — records an absence with a reason (sick, annual,
  family responsibility, unpaid, public holiday, no work allocated, vehicle in
  for service, other), rather than leaving the day looking unaccounted for
- **Log fuel spent** — amount, litres and odometer, typed in. No photo of the slip is
  taken or stored, so the paper slip is still what gets handed in.
- **Service reminders** — how far the assigned vehicle is from its next service,
  and a dealership search once it passes 95% of the window
- **My recent days** — their own history, so they can check what was recorded
- **Happy birthday** — a greeting on their home screen on the day, once an admin has
  put a date of birth on their record. Nothing on any other day, and nothing for
  somebody whose date of birth was never captured
- **Whose birthday it is** — everybody sees the day's birthdays, not only their own, so
  the team can say something. Published by an admin into `config/`, which every signed-in
  user may already read: what is shared is a first name and a day, and nothing else

### Admins, on the phone

The dashboard's Today tab carries the same eight figures as the portal's day view —
started, no entry, knocked off, hours, distance, fuel, parked late, service due — and
**tapping any of them lists what it counted**: who hasn't started, who parked past the
curfew and by how long, who drove furthest, who spent what on fuel, and which vehicles
are due with the name of whoever is driving them.

### Admins, in the browser portal

- **Day view** — who has started, knocked off, is absent, parked after the 18:30
  curfew, or has no entry at all, for any date; searchable, filterable by status,
  groupable, with fuel spent per person and per province. Entries can be corrected
  or recorded after the fact.
- **Every headline figure opens** — tap any of the eight tiles on the day view and
  it lists the people behind that number: who hasn't started, who parked late and
  by how long, who drove furthest, which vehicles are due and who's driving them.
- **Export the staff list** — the Employees tab exports to CSV: who they are, how to
  reach them, where they are posted, what they drive, and when they were last seen
  working. Follows whatever filter is on screen, and the row count is in the filename so
  a partial export cannot later be mistaken for the whole list. No passwords — none are
  stored
- **Fleet search** — find a vehicle by registration or name. Spacing is ignored, so
  `bc45` and `BC 45` both find `BC 45 DF GP`, and the count follows the filter
- **Reports** — any date range (or today / last 7 / last 30), filtered by
  employee, province or team, with totals that follow the filter
- **Cost per kilometre** — fuel spent over distance driven, per person and for the
  fleet. Distance comes from the odometer readings on the time logs, so it needs no
  assumption that anyone filled to full. Blank rather than zero when nobody logged a
  fill: that means unknown, not free. The fleet figure divides the two totals rather
  than averaging everyone's rate, which would flatter whoever drove least
- **Performance** — stock, connections, activations and commission per month, with the
  three conversion percentages between them: stock to connection, connection to
  activation, and stock to activation end to end. Each figure is its own CSV upload with
  its own template, so loading one never disturbs another. Stock, connections and
  activations are keyed on **team name** because they are a team's figures; commission and
  basic pay are keyed on **employee number** because they are a person's own. Filter by
  province, team or name
- **FY incentive** — its own tab and its own collection, keyed on employee number and
  stored per network. Two uploads: the **full file**, one row per person per month
  carrying each network's stock, connections and payable side by side; and **connections
  only**, for when the connections arrive without the stock

  The second exists because the first cannot do its job. A blank **count** cell is read
  as nought — correctly, since on a file carrying a stock column an empty cell means none
  was issued — so blanking the stock columns to load connections would write nought over
  every stock figure it did not mention, and the conversion percentages behind them would
  follow it down. A file with no stock column cannot do that: it writes connections and
  nothing else, merged onto the rows already there
- **Leaderboard** — on the Logs tab, ranking **teams** on connections or activations for
  a month. Positions only, no figures, on screen or in the export. Teams on equal figures
  share a position and the next one skips, so a tie for first is followed by third; a team
  with nothing uploaded is listed unranked rather than placed last, because a missing file
  is not a bad month
- **Reset a password** — the Employees tab sends Firebase's reset email, which is the only
  way an employee's password can be changed from here. Passwords are never stored — Firebase
  keeps a one-way hash — so there is nothing to look up and show
- **Employees** — add staff (the app generates a username and password and emails
  it to them), edit details, see who was last active to spot dormant and
  duplicate accounts, upload an authoritative staff list and fill details from it
  by employee number, download the current list to fill a column in and send back,
  and record a date of birth — which shows their age on their record and greets them on
  their birthday
- **Vehicles** — add individually or in bulk, set service intervals per vehicle or
  by name match across the fleet, mark a vehicle serviced and record the
  dealership
- **Export the fleet** — the Vehicles tab exports to CSV: registration, team and
  current odometer. Follows the fleet search, and the row count is in the filename, the
  same as the staff list. A vehicle carries no team of its own, so the team is read off
  whoever drives it — the admin's assignment where there is one, otherwise the
  registration the employee typed. Where a vehicle really is shared, every team is named
  rather than one of them quietly chosen
- **Insurance** — record a claim against a vehicle: incident date, claim date, claim
  status, and what became of the vehicle — awaiting assessment, being repaired, repaired
  or written off. A repairer, the day they started and the day it came back once it goes
  in; an amount paid once it is written off; nothing asked for that does not apply yet.
  **Three turnaround figures** are worked out from the dates — how long until the repair
  started, how long the repairer had it, and how long it was off the road altogether.
  Searchable, exports to CSV, and the tab averages each figure for whatever is on screen
- **Logs** — work days and fuel logs over any date range

The day view, reports and both log tables export to CSV.

### Automatic emails

- If any active employee hasn't started work by a configured hour
- If a vehicle is due, or overdue, for a service

## Getting it running

Follow **SETUP.md** step by step — it covers creating the free Firebase backend,
deploying the email alerts, and building the installable APK via GitHub Actions
(no Android Studio needed).

## Checks

The portal is one file of plain JavaScript with no build step, so these run
straight from a checkout with nothing installed:

```bash
node web/smoke-test.mjs web/index.html && node web/parser-test.mjs web/index.html && node web/render-test.mjs web/index.html && node web/service-schedule-test.mjs web/index.html service-schedule-cases.csv && node web/parking-curfew-test.mjs web/index.html parking-curfew-cases.csv && node web/plate-format-test.mjs web/index.html plate-format-cases.csv && node functions/service-schedule-test.mjs service-schedule-cases.csv && node --check functions/index.js
```

- `smoke-test.mjs` evaluates the portal's module against stubbed browser and
  Firebase APIs. `node --check` only proves the syntax parses; this catches the
  faults that kill the module at load time and leave the page inert.
- `parser-test.mjs` pins the logic where a wrong answer gets written to the
  database or emailed out — the vehicle upload's service-interval floor, and the
  service milestone maths.
- `render-test.mjs` drives the day view against stub data and checks the markup it
  produces — chiefly that all three row shapes (worked, absent, no entry) lay out on
  the same columns as the header. A row with the wrong number of cells renders
  perfectly happily, so nothing else would catch it.

Those three share the browser and Firebase stubs in `portal-harness.mjs`.

**Any check can be run as if it were another day**, which is how a fixture with a date
typed into it gets caught:

```bash
node web/at-date.mjs 2028-02-29 web/render-test.mjs web/index.html
```

Only `new Date()` and `Date.now()` move, so a date written out in full still means what
it says. `checks.yml` sweeps the whole suite this way on every push — three dates ahead
of whenever it runs, plus 29 February and the 28th of a common year, which is the day
somebody born on the 29th is greeted and aged.

It is there because a test built on a date somebody typed passes on the day it is written
and goes red later for a rule that never changed. Seven of those had collected: one went
red the morning after it was written, one was three weeks off, and four had only ever
been green because the current month happened to be the September their figures were
keyed to. A run on one day cannot tell any of that from a real fault.

The phone app's own logic is checked by `gradle testDebugUnitTest`, which the APK
workflow runs: the service rules, the parking curfew, and the day view's eight figures
and the rows behind each one.

## The service schedule

The rules for when a vehicle is due — milestones, progress percentage, the
kilometre and date verdicts — are needed in three places that **cannot share
code**: the phone app is Kotlin, the portal is one self-contained HTML file with
no build step, and the Cloud Functions are a separate deploy root that can reach
neither. So there are three implementations, and one specification they all
answer to.

| | |
|---|---|
| **The specification** | `service-schedule-cases.csv` — a table of cases, at the repo root |
| Phone app | `ServiceSchedule.kt`, checked by `ServiceScheduleTest` (`gradle testDebugUnitTest`) |
| Admin portal | inline in `index.html`, checked by `web/service-schedule-test.mjs` |
| Reminder job | `functions/service-schedule.js`, checked by `functions/service-schedule-test.mjs` |

**Change a rule in the CSV, then change it in all three.** CI runs every copy
against the table and names the one that disagrees. That table was written after
finding three real divergences between the copies — they are documented at the
bottom of the CSV, including one where the portal and the phone showed different
service percentages for the same vehicle.

## The parking curfew

Vehicles are meant to be parked by **18:30**. A later knock-off is flagged, never
blocked — the day still counts in full, it just carries a mark.

The same arrangement, for the same reason: the portal and the phone app both need the
rule and cannot share code.

| | |
|---|---|
| **The specification** | `parking-curfew-cases.csv` — a table of cases, at the repo root |
| Phone app | `ParkingCurfew.kt`, checked by `ParkingCurfewTest` (`gradle testDebugUnitTest`) |
| Admin portal | inline in `index.html`, checked by `web/parking-curfew-test.mjs` |

Cases are written as offsets from the curfew rather than as clock times, so **moving the
curfew needs no change to the table** — only the two one-line constants. It has moved
once already, from 18:00 to 18:30.

### A reason is required, on both sides

Knocking off after the curfew asks why, and will not close the day without an answer. The
phone has refused since it was asked for; **the portal did not**, and its Record day form
had no box for a reason at all — so a day recorded or corrected by an admin could sit past
the curfew with a permanent dash against it. That is the one row on the late list nobody
can chase up, because the person who could answer was never asked.

Both sides now refuse it. The reason box appears the moment the typed knock-off passes the
curfew, and the day cannot be saved without it. It is judged against **the day being
edited**, not today, which matters the moment the curfew moves again.

Unlike the phone, the portal cannot express a knock-off after midnight: the time is
resolved against the day being edited, and a knock-off before the start time is already
refused. A day that genuinely ended at 00:30 has to be recorded on the phone.

Neither side is enforced in `firestore.rules`. A rule would have to do curfew arithmetic
in a timezone, and getting it wrong locks every driver out of knocking off — a worse
failure than the one it guards against.

## Insurance claims

Claims are **admins only**, every way round — read, write and delete, enforced in
`firestore.rules` rather than in the page.

They were briefly readable by the team a claim belonged to, for a screen on the phone
that was then decided against: drivers do not need to see claims. The read was withdrawn
with it, because a permission granted for a reader that does not exist is one nobody
would ever notice going wrong — and what sits behind this one is what the fleet was paid
out for writing a vehicle off.

**The team is stored on the claim, not resolved through the vehicle.** Moving a vehicle
between teams next year must not quietly change who can read a claim from this one. The
form fills the team in from whoever drives the vehicle — the same rule the fleet export
uses — but only where that is a single team: a pool vehicle two teams share has no right
answer, so it asks rather than guesses. A claim cannot be saved without one, because a
claim with no team is one no employee will ever see and nobody will notice is missing.

**A team can be typed, not only picked**, so a claim can be recorded for a team nobody
has signed up for yet. The box says when you have typed a team nobody is on.

**A team already on the staff list is matched however it is capitalised and stored the way
those records spell it.** That was load-bearing while the rules matched teams as text; now
that claims are admin-only it is only tidiness, but the tidiness is worth keeping — a list
carrying `Midrand`, `midrand` and `MIDRAND` as three teams is a list nobody can total.

### Three turnaround figures, not one

A vehicle off the road for six weeks is a slow insurer or a slow repairer, and a single
total cannot say which. So the day the repairer *started* is recorded as well as the day
the vehicle came back, and the time splits in two:

| | |
|---|---|
| **To repair starting** | incident → the day the repairer took it. Assessment, authorisation, the queue — the part where nobody is working on the vehicle |
| **At the repairer** | their own clock: the day they started → the day it came back |
| **Off the road** | incident → back. The whole thing, which is what the fleet actually loses |

The table shows the total with the split beneath it; the export gives all three as their
own columns, so a spreadsheet can sort on whichever question is being asked.

**A blank is not a nought**, and it matters on four columns now. A vehicle that was
repaired has no payout. One still at the panel beater has no repair time yet — though it
*does* already know what it waited, and that half is shown. A written-off vehicle has no
repair timeline at all. A nought in any of those would be a confident-looking lie, and in
a turnaround column it would sort as the fastest repair on record — putting the vehicle
still costing money at the top of the list of the ones that came back quickest.

The averages are taken over the claims that have the dates for each figure, which is not
the same set for all three: a vehicle at the repairer right now has a wait to average and
no repair time yet. Averaging each over its own claims is the only honest way to do it.

## Birthdays and ages

A date of birth is captured once, by an admin, and read two ways: the employee is
greeted on the day, and their **age** shows on their record. The phone shows the age and
**never the date of birth** — that is what was asked for, and it is the useful reading
anyway, since the age is what anybody would work out from the date every time they looked.

Derived, never stored. An age written into the database is wrong for up to a year and
nobody can tell which part of the year it is wrong in. So there is nothing to maintain
and nothing scheduled — which also means nothing to break, and nothing that needs a Cloud
Function on the free plan.

Everything fails quiet. A date that cannot be read means no greeting and no age, never a
guess: most records have no date of birth at all, and a 0 on those would be read as fact.
A date in the **future** gives no age rather than a negative one. The one deliberate
exception is a date of **today**, which gives 0 — typing this year by mistake is the
likeliest slip when a few hundred dates are entered by hand, and "0 years" beside a name
is obvious nonsense that gets noticed, where refusing it would look exactly like a date
nobody has filled in yet.

Somebody born on **29 February** is greeted, and ages, on the 28th in the three years out
of four that have no 29th. Those two are the same rule on purpose: a card saying "happy
birthday" beside an age that has not moved reads as a bug.

| | |
|---|---|
| **The specification** | `birthday-cases.csv` — a table of cases, at the repo root |
| Phone app | `Birthday.kt`, checked by `BirthdaySpecTest` (`gradle testDebugUnitTest`) |
| Admin portal | inline in `index.html`, checked by `web/birthday-spec-test.mjs` |

The portal greets nobody, so it answers only the age column. Both facts share one file
because of the 29 February rule above.

## What an employee owes

Staff take stock on account. An invoice is a NUMBER, and it is grouped on that number
reduced to letters, digits and single spaces — "INV-1042" and "INV 1042" are one invoice.
They were once grouped as typed while the document id used the reduced form, so a second
line silently replaced the first and the screen showed two invoices with the payment on
only one of them.

What is left on an invoice is rounded to the cent **before** it is judged settled,
because 0.1 + 0.2 is not 0.3 in binary and an invoice paid to the last cent must read as
settled rather than as owing R0,00. Part payments come off the invoice, not off a line,
because that is how people pay. Invoices are listed unsettled first, then oldest, then by
number: somebody opening the screen wants to know what they owe.

| | |
|---|---|
| **The specification** | `debt-cases.csv` — a table of cases, at the repo root |
| Phone app | `Debt.kt`, checked by `DebtSpecTest` (`gradle testDebugUnitTest`) |
| Admin portal | inline in `index.html`, checked by `web/debt-spec-test.mjs` |

The three rollups the phone screen needs — a balance, what has been paid to date, the age
of the oldest unpaid — are not in the table. They are the phone's alone, and each returns
nothing rather than nought, because "paid up" and "R0,00 owing" are different sentences.

## Registration plates

Registrations are typed by hand in three places — the vehicle upload, the admin's
vehicle form and the employee's own sign-up — so the same car arrives as `BC45DFGP`,
`bc 45 df gp` and `BC-45-DF-GP`. Every Gauteng plate is **displayed** as
`XX 77 XX GP`.

Display only. The stored value keeps whatever was typed, and matching a plate to a
vehicle still strips everything that is not a letter or digit — spacing has never been
part of a plate's identity and must not become part of it. A shape the rule does not
recognise is tidied but never reshaped, because guessing would turn a plate that was
merely untidy into one that is wrong.

| | |
|---|---|
| **The specification** | `plate-format-cases.csv` — a table of cases, at the repo root |
| Phone app | `PlateFormat.kt`, checked by `PlateFormatTest` (`gradle testDebugUnitTest`) |
| Admin portal | inline in `index.html`, checked by `web/plate-format-test.mjs` |

Both tests also assert that formatting a plate never changes what it reduces to — if it
did, a vehicle would stop matching the employee who drives it and the day view would
report it as having no driver.
