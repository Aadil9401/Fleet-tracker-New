/**
 * Fleet Tracker Cloud Functions
 * -----------------------------
 * 1. createEmployee   - callable, admin-only. Creates a Firebase Auth account
 *                       + Firestore profile for a new employee and returns
 *                       generated login credentials.
 * 2. checkAttendance  - scheduled hourly. Emails the admin if any active
 *                       employee hasn't clocked in by the configured hour.
 * 3. checkServiceReminders - scheduled daily. Emails the admin about any
 *                       vehicle that is due (or overdue) for a service.
 *
 * Email is sent with Nodemailer through Gmail SMTP using an App Password.
 * Set the two secrets before deploying:
 *   firebase functions:secrets:set GMAIL_USER
 *   firebase functions:secrets:set GMAIL_APP_PASSWORD
 * (see SETUP.md for the full walkthrough)
 */

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

initializeApp();
const db = getFirestore();
const auth = getAuth();

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

const TIMEZONE = "Africa/Johannesburg";

function makeTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER.value(),
      pass: GMAIL_APP_PASSWORD.value(),
    },
  });
}

async function sendAdminEmail(subject, html) {
  const settingsSnap = await db.collection("config").doc("settings").get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const enabled = settings.notificationsEnabled !== false;
  const adminEmail = settings.adminEmail;
  if (!enabled || !adminEmail) return;

  const transporter = makeTransporter();
  await transporter.sendMail({
    from: `"Fleet Tracker" <${GMAIL_USER.value()}>`,
    to: adminEmail,
    subject,
    html,
  });
}

function todayString(tz) {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz }); // yyyy-MM-dd
}

function randomPassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function slugify(value) {
  const noDiacritics = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return noDiacritics.replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// 1. createEmployee
// ---------------------------------------------------------------------------
exports.createEmployee = onCall({ secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const callerDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Only an admin can add employees.");
  }

  const name = (request.data && request.data.name || "").trim();
  const surname = (request.data && request.data.surname || "").trim();
  if (!name || !surname) {
    throw new HttpsError("invalid-argument", "Name and surname are required.");
  }

  const base = `${slugify(name)}.${slugify(surname)}`;
  let email = `${base}@cspc.local`;
  let suffix = 1;
  // Ensure the generated login email is unique.
  while (true) {
    try {
      await auth.getUserByEmail(email);
      suffix += 1;
      email = `${base}${suffix}@cspc.local`;
    } catch (e) {
      break; // no existing user with that email — good to use
    }
  }

  const password = randomPassword();

  const userRecord = await auth.createUser({
    email,
    password,
    displayName: `${name} ${surname}`,
  });

  await db.collection("users").doc(userRecord.uid).set({
    name,
    surname,
    email,
    role: "employee",
    assignedVehicleId: "",
    active: true,
    createdAt: Date.now(),
  });

  return { email, password };
});

// ---------------------------------------------------------------------------
// 2. checkAttendance - runs hourly, only actually alerts at the admin's
//    configured hour, and only once per day.
// ---------------------------------------------------------------------------
exports.checkAttendance = onSchedule(
  { schedule: "0 * * * *", timeZone: TIMEZONE, secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async () => {
    const settingsSnap = await db.collection("config").doc("settings").get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    if (settings.notificationsEnabled === false) return;

    const targetHour = typeof settings.notifyIfNotStartedByHour === "number" ? settings.notifyIfNotStartedByHour : 9;
    const currentHour = parseInt(
      new Date().toLocaleString("en-US", { timeZone: TIMEZONE, hour: "2-digit", hour12: false }),
      10
    );
    if (currentHour !== targetHour) return;

    const today = todayString(TIMEZONE);
    if (settings.lastAttendanceAlertDate === today) return; // already alerted today

    const employeesSnap = await db.collection("users").where("role", "==", "employee").where("active", "==", true).get();
    const employees = employeesSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    if (employees.length === 0) return;

    const logsSnap = await db.collection("timeLogs").where("date", "==", today).get();
    const startedUids = new Set(logsSnap.docs.map((d) => d.data().uid).filter(Boolean));

    const notStarted = employees.filter((e) => !startedUids.has(e.uid));
    if (notStarted.length === 0) return;

    const listHtml = notStarted.map((e) => `<li>${e.name} ${e.surname}</li>`).join("");
    await sendAdminEmail(
      `Fleet Tracker: ${notStarted.length} team member(s) not started by ${targetHour}:00`,
      `<p>The following team members have not clocked in yet today (${today}):</p><ul>${listHtml}</ul>`
    );

    await db.collection("config").doc("settings").set({ lastAttendanceAlertDate: today }, { merge: true });
  }
);

// ---------------------------------------------------------------------------
// 3. checkServiceReminders - runs once a day.
// ---------------------------------------------------------------------------
exports.checkServiceReminders = onSchedule(
  { schedule: "0 8 * * *", timeZone: TIMEZONE, secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async () => {
    const today = todayString(TIMEZONE);
    const vehiclesSnap = await db.collection("vehicles").get();

    const dueVehicles = [];
    for (const doc of vehiclesSnap.docs) {
      const v = doc.data();
      if (v.lastReminderNotifiedDate === today) continue;

      const kmSinceService = Math.max(0, (v.currentOdometerKm || 0) - (v.lastServiceOdometerKm || 0));
      const dueByKm = kmSinceService >= (v.serviceIntervalKm || 10000);

      let dueByDate = false;
      if (v.lastServiceDateMillis) {
        const monthsMs = (v.serviceIntervalMonths || 6) * 30 * 24 * 60 * 60 * 1000;
        dueByDate = Date.now() - v.lastServiceDateMillis >= monthsMs;
      }

      if (dueByKm || dueByDate) {
        dueVehicles.push({ id: doc.id, ...v, kmSinceService });
      }
    }

    if (dueVehicles.length === 0) return;

    const listHtml = dueVehicles
      .map((v) => `<li>${v.name || v.registrationNumber} — ${v.kmSinceService} km since last service</li>`)
      .join("");

    await sendAdminEmail(
      `Fleet Tracker: ${dueVehicles.length} vehicle(s) due for service`,
      `<p>These vehicles are due (or overdue) for a service:</p><ul>${listHtml}</ul>`
    );

    const batch = db.batch();
    dueVehicles.forEach((v) => {
      batch.set(db.collection("vehicles").doc(v.id), { lastReminderNotifiedDate: today }, { merge: true });
    });
    await batch.commit();
  }
);
