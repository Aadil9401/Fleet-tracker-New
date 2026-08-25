# My Daily Work Info

Daily field-staff tracking for CSPC. Staff clock in and out on an Android phone,
recording vehicle mileage and fuel spend; admins run the day from a browser
portal. Both sides share one Firebase project, so what a driver records shows up
in the portal immediately.

The repo folder, the Gradle package (`co.za.cspc.fleettracker`) and the Firebase
project still carry the app's original name, Fleet Tracker. Only the name shown
to users changed.

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
- **Not working today** — records an absence with a reason (sick, annual,
  family responsibility, unpaid, public holiday, no work allocated, vehicle in
  for service, other), rather than leaving the day looking unaccounted for
- **Log fuel spent** — amount, litres, odometer, and an optional receipt photo
- **Service reminders** — how far the assigned vehicle is from its next service,
  and a dealership search once it passes 95% of the window
- **My recent days** — their own history, so they can check what was recorded

### Admins, in the browser portal

- **Day view** — who has started, knocked off, is absent or has no entry at all,
  for any date; searchable, filterable by status, groupable, with fuel spent per
  person and per province. Entries can be corrected or recorded after the fact.
- **Reports** — any date range (or today / last 7 / last 30), filtered by
  employee, province or team, with totals that follow the filter
- **Employees** — add staff (the app generates a username and password and emails
  it to them), edit details, see who was last active to spot dormant and
  duplicate accounts, upload an authoritative staff list and fill details from it
  by employee number
- **Vehicles** — add individually or in bulk, set service intervals per vehicle or
  by name match across the fleet, mark a vehicle serviced and record the
  dealership
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
node web/smoke-test.mjs web/index.html && node web/parser-test.mjs web/index.html && node --check functions/index.js
```

- `smoke-test.mjs` evaluates the portal's module against stubbed browser and
  Firebase APIs. `node --check` only proves the syntax parses; this catches the
  faults that kill the module at load time and leave the page inert.
- `parser-test.mjs` pins the logic where a wrong answer gets written to the
  database or emailed out — the vehicle upload's service-interval floor, and the
  service milestone maths.

Note that the service milestone rules exist in three places: `web/index.html`,
`Vehicle` in `Models.kt`, and `checkServiceReminders` in `functions/index.js`.
Nothing enforces that they agree, so a change to one needs the same change to
the other two, and `parser-test.mjs` is the table of cases all three should
satisfy.
