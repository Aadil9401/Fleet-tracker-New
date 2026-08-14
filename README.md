# Fleet Tracker

A simple Android app for CSPC to manage daily field staff: clock in/out with
vehicle mileage, fuel spend logging (with receipt photo), vehicle service
reminders, and an admin dashboard with email alerts.

## What's in this project

| Folder | What it is |
|---|---|
| `app/` | The Android app (Kotlin + Jetpack Compose) |
| `web/` | Browser-based admin portal (same Firebase project and data) |
| `functions/` | Firebase Cloud Functions (creates employee logins, sends email alerts) |
| `firestore.rules`, `storage.rules` | Security rules so employees can only see/edit their own data |
| `.github/workflows/build-apk.yml` | Automatically builds the installable APK on GitHub |

## Features

**Employees** log in with details created by the admin, then can:
- Start time (clocks in + records vehicle's starting odometer reading)
- Knock off (clocks out + records ending odometer reading)
- Log fuel spent (amount, litres, odometer, optional receipt photo)
- See if their vehicle's service is due (by km or by date)

**Admin (you)** can:
- See who has/hasn't started work today
- Add employees (paste name + surname → app generates a username & password for them)
- Add and manage vehicles, service intervals, and mark vehicles as serviced
- View fuel and time logs
- Get emailed automatically if a team member hasn't started work by a set time,
  or if a vehicle is due for a service

## Getting it running

Follow **SETUP.md** step by step — it covers creating the free Firebase
backend, deploying the email alerts, and building the installable APK via
GitHub Actions (no Android Studio needed).
