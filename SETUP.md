# Setup guide

Do these in order. It looks long, but it's mostly clicking through free
Google/GitHub screens — budget about 45–60 minutes the first time.

**Costs:** Firebase Auth, Firestore and Hosting are free at this scale, on the
free **Spark** plan, and the app works on them. Everything in `functions/` — the
two alert emails and the admin screen's "add employee" — needs the pay-as-you-go
**Blaze** plan, because Cloud Functions are not available on Spark at all.

Blaze on a team this size sits inside the free monthly quota, so realistically
**R0/month**; it just wants a card on file as a safety net. **Staying on Spark is a
perfectly good choice** — step 5 says exactly what you give up, and nothing else in
the setup changes.

---

## 1. Create your Firebase project

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Add project**, name it e.g. `CSPC Fleet Tracker`, finish the wizard.
3. In the project, go to **Build → Authentication → Get started**, then enable the
   **Email/Password** sign-in provider.
4. Go to **Build → Firestore Database → Create database**. Choose **Production mode**
   and pick a region close to South Africa (e.g. `europe-west1`).
5. **Optional — only if you want the Cloud Functions.** Go to **Project settings
   (gear icon) → Usage and billing → Modify plan** and switch to **Blaze**. You'll add
   a payment method, but nothing is charged unless you go far beyond free usage limits.

   Skip it and stay on Spark, and everything below still works except these three,
   which are the whole of what `functions/` does:

   | Without Blaze | What happens instead |
   |---|---|
   | The "not clocked in by 9am" email | No alert. The portal's day view shows who has no entry, which is the same information, just not pushed to you |
   | The service-due email | No alert. Both the portal and the driver's phone already show a vehicle as due |
   | Admin → Add employee (Android) | The button cannot work. Staff self-register on the phone's sign-up screen instead, which the Firestore rules already allow and guard |

   Storage is deliberately not set up: nothing in the app uploads a file. Fuel figures
   are typed in and the paper slip is handed in. `storage.rules` denies everything, and
   is only still deployed in case a bucket was created earlier.

## 2. Register the Android app in Firebase

1. Still in **Project settings**, under "Your apps" click the Android icon.
2. Android package name: `co.za.cspc.fleettracker` (must match exactly).
3. Download the `google-services.json` file it gives you — keep it, you'll need it
   in step 6. **Don't commit this file to a public GitHub repo as-is** — step 6
   shows the safe way to hand it to GitHub.

## 3. Create your own admin login

The app can only auto-create *employee* logins — the very first *admin*
account (you) has to be created by hand, once:

1. In Firebase console → **Authentication → Users → Add user**. Use your real
   email (e.g. `aadil@cspc.co.za`) and choose a password.
2. Copy the **User UID** shown next to the account you just created.
3. Go to **Firestore Database → Start collection**. Collection ID: `users`.
   Document ID: paste the UID from step 2. Add these fields:

   | Field | Type | Value |
   |---|---|---|
   | name | string | Aadil |
   | surname | string | Moolla |
   | email | string | (your email) |
   | role | string | `admin` |
   | assignedVehicleId | string | (leave blank) |
   | active | boolean | true |
   | createdAt | number | 0 |

4. Create a second document to hold app settings: collection `config`, document
   ID `settings`, fields:

   | Field | Type | Value |
   |---|---|---|
   | adminEmail | string | aadil@cspc.co.za |
   | notifyIfNotStartedByHour | number | 9 |
   | notificationsEnabled | boolean | true |

## 4. Get a Gmail App Password (so the app can send you emails)

The alert emails are sent through Gmail's SMTP service, using an **App
Password** (not your normal Gmail password).

1. Use any Gmail account you're happy sending these alerts from (your own is fine).
2. Turn on 2-Step Verification if it isn't already: https://myaccount.google.com/security
3. Go to https://myaccount.google.com/apppasswords, create one named "Fleet Tracker",
   and copy the 16-character password it gives you. You'll paste it in step 7.

## 5. Deploy the backend (Firestore rules + Cloud Functions)

Easiest way — no local install needed — is Google's free browser-based **Cloud
Shell**:

1. Push this whole project to a GitHub repo first (see step 6 below), then come
   back here.
2. Go to https://console.cloud.google.com, select your Firebase project at the
   top, then click the **Activate Cloud Shell** icon (top right, `>_`).
3. In Cloud Shell, run:
   ```
   git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
   cd YOUR-REPO
   npm install --prefix functions
   firebase login
   firebase use --add        # pick your Firebase project
   ```
4. **Blaze only.** Set your email secrets (from step 4) — skip this entirely on
   Spark, since nothing will read them:
   ```
   firebase functions:secrets:set GMAIL_USER
   firebase functions:secrets:set GMAIL_APP_PASSWORD
   ```
   (paste the Gmail address, then the 16-character app password, when prompted)
5. Deploy. **On Spark:**
   ```
   firebase deploy --only firestore:rules
   ```

   **On Blaze**, add the functions:
   ```
   firebase deploy --only firestore:rules,functions
   ```

   Do not include `functions` on Spark. Firebase will stop and ask you to upgrade,
   and the command fails as a whole — so the Firestore rules do not get deployed
   either, and it looks like the rules are the problem.

   No `storage:rules` in either line, and that is deliberate: nothing in the app
   uploads a file, so step 1 never creates a Storage bucket — and asking Firebase to
   deploy rules to a bucket that does not exist fails the **whole** command, taking
   the Firestore rules and the functions down with it.

   **Only if you set this project up before fuel receipt uploads were removed**, you
   have a bucket with permissive rules still live on it. Close it once with:
   ```
   firebase deploy --only storage:rules
   ```
   `storage.rules` denies everything, so this shuts the door rather than opening one.

That's the backend done. On Blaze the attendance and service-reminder emails now run
automatically; on Spark there is nothing further to deploy, and the portal is where
you see who has not started and which vehicles are due.

## 6. Put the code on GitHub and build the APK

1. Create a free GitHub account if you don't have one: https://github.com/signup
2. Create a **new private repository** (e.g. `fleet-tracker`).
3. Upload this whole project folder to it (either drag-and-drop on the GitHub
   website's "upload files" screen, or if you're comfortable with git:
   `git init && git add . && git commit -m "Initial commit" && git remote add origin <repo-url> && git push -u origin main`).
4. In your new repo: **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `GOOGLE_SERVICES_JSON_BASE64`
   - Value: the base64 version of the `google-services.json` from step 2. To
     generate it:
     - Mac/Linux terminal: `base64 -i google-services.json | tr -d '\n'`
     - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))`
   - Paste the long output as the secret's value and save.
5. Go to the **Actions** tab of your repo — a build should already be running
   (or click **Run workflow** on "Build APK" to start one).
6. When it finishes (green tick, a few minutes), click into the run, scroll to
   **Artifacts**, and download `fleet-tracker-debug-apk` — it's a zip containing
   `app-debug.apk`.

## 7. Install the app on phones

1. Send `app-debug.apk` to each phone (WhatsApp, email, USB, Google Drive — any way).
2. On the phone, tap the file. Android will ask to allow installing from this
   source ("install unknown apps") — allow it, then install.
3. Repeat for your phone and every employee's phone.

## 8. First run

1. Open the app on your phone and sign in with the admin email/password from step 3.
2. Go to the **Vehicles** tab → add each vehicle (name, registration, current
   odometer reading, service interval).
3. Go to the **Employees** tab → **Add employee** for each person on your list
   (first name + surname). The app generates a username and password —
   write these down and hand them to that employee (they use them to sign in
   on their own phone; there's no separate signup screen).
4. Assign each employee to a vehicle from the same tab.
5. Go to **Settings** → confirm your email address and preferred alert time,
   save.
6. Done — employees can now start using **Start time / Knock off / Log fuel
   spent** on their phones, and you'll get emailed if someone hasn't started
   by your chosen time, or if a vehicle needs a service.

---

### Changing things later

- **Add more employees**: Employees tab → Add employee, any time.
- **Change alert time / email**: Settings tab.
- **Update the app itself**: change the code, push to GitHub, download the new
  APK from Actions, reinstall on phones (existing data is untouched, it all
  lives in Firebase).
