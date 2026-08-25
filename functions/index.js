/**
 * My Daily Work Info Cloud Functions
 * ----------------------------------
 * 1. createEmployee   - callable, admin-only. Creates a Firebase Auth account
 *                       + Firestore profile for a new employee, emails the
 *                       generated login details to the employee's own address,
 *                       and returns them to the admin as well.
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
const { randomInt } = require("node:crypto");
const nodemailer = require("nodemailer");
// The service rules live in their own module, tested against service-schedule-cases.csv
// at the repo root — the same table the portal and the phone app are tested against.
const { nextServiceAtKm, isServiceDueAt } = require("./service-schedule");

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

/** Sends to any address. Used to deliver login details to a new employee. */
async function sendEmail(to, subject, html) {
  const transporter = makeTransporter();
  await transporter.sendMail({
    from: `"My Daily Work Info" <${GMAIL_USER.value()}>`,
    to,
    subject,
    html,
  });
}

async function sendAdminEmail(subject, html) {
  const settingsSnap = await db.collection("config").doc("settings").get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const enabled = settings.notificationsEnabled !== false;
  const adminEmail = settings.adminEmail;
  if (!enabled || !adminEmail) return;

  await sendEmail(adminEmail, subject, html);
}

function todayString(tz) {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz }); // yyyy-MM-dd
}

/**
 * The alphabet leaves out I, l, 1, O and 0 on purpose: these passwords get read off a
 * screen and typed on a phone, so a character nobody can tell apart costs a support call.
 *
 * randomInt rather than Math.random, because this is a real account credential.
 * Math.random is a fast PRNG, not a secure one — its output is predictable from enough
 * observed values, and every employee sees one of these values. randomInt draws from
 * the OS entropy source and is free of the modulo bias a naive % would introduce.
 */
function randomPassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}

/** Must match employeeNumberKey() in FleetRepository.kt so both agree on identity. */
function employeeNumberKey(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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

  const data = request.data || {};
  const name = (data.name || "").trim();
  const surname = (data.surname || "").trim();
  const employeeNumber = (data.employeeNumber || "").trim();
  const province = (data.province || "").trim();
  const teamName = (data.teamName || "").trim();
  const contactEmail = (data.contactEmail || "").trim().toLowerCase();

  if (!name || !surname) {
    throw new HttpsError("invalid-argument", "Name and surname are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new HttpsError(
      "invalid-argument",
      "A valid email address is required — the login details are sent there."
    );
  }

  // Employee number is the uniqueness key for self sign-up, so admin-created accounts
  // must reserve it too — otherwise someone could later sign up with the same number.
  const numberKey = employeeNumberKey(employeeNumber);
  if (!numberKey) {
    throw new HttpsError("invalid-argument", "An employee number is required.");
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

  // create() fails if the document already exists, which is what makes this the
  // duplicate check rather than a racy read-then-write.
  try {
    await db.collection("employeeNumbers").doc(numberKey).create({ uid: userRecord.uid });
  } catch (e) {
    // Don't leave an orphaned login behind.
    await auth.deleteUser(userRecord.uid).catch(() => {});
    throw new HttpsError(
      "already-exists",
      `Employee number ${employeeNumber} is already registered to someone else.`
    );
  }

  await db.collection("users").doc(userRecord.uid).set({
    name,
    surname,
    email,
    contactEmail,
    employeeNumber,
    province,
    teamName,
    role: "employee",
    assignedVehicleId: "",
    active: true,
    createdAt: Date.now(),
  });

  // The account already exists at this point, so a mail failure must NOT fail the
  // whole call — the admin still gets the credentials back to hand over by hand.
  let emailSent = false;
  let emailError = "";
  try {
    await sendEmail(
      contactEmail,
      "Your My Daily Work Info login details",
      `<p>Hi ${name},</p>
       <p>An account has been created for you on <b>My Daily Work Info</b>.
       Use these details to sign in on your phone:</p>
       <p><b>Username:</b> ${email}<br>
          <b>Password:</b> ${password}</p>
       <p>Please keep them private. If you lose them, ask your admin to reset your account.</p>`
    );
    emailSent = true;
  } catch (e) {
    emailError = e.message || String(e);
    console.error(`Could not email login details to ${contactEmail}:`, e);
  }

  return { email, password, contactEmail, emailSent, emailError };
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
    // Someone who marked themselves "not working today" is accounted for, so they
    // must not appear on the chase-up list.
    const accountedFor = new Set(
      logsSnap.docs
        .filter((d) => (d.data().startTimeMillis || 0) > 0 || d.data().notWorking === true)
        .map((d) => d.data().uid)
        .filter(Boolean)
    );

    const notStarted = employees.filter((e) => !accountedFor.has(e.uid));
    if (notStarted.length === 0) return;

    const listHtml = notStarted.map((e) => `<li>${e.name} ${e.surname}</li>`).join("");
    await sendAdminEmail(
      `My Daily Work Info: ${notStarted.length} team member(s) not started by ${targetHour}:00`,
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

      // Both rules — kilometres and elapsed months — live in ./service-schedule so
      // this job, the portal and the phone app can be held to one shared table of
      // cases. They used to be written out here, and had drifted from the app.
      if (!isServiceDueAt(v, Date.now())) continue;

      dueVehicles.push({
        id: doc.id,
        ...v,
        nextServiceAtKm: nextServiceAtKm(v),
        current: v.currentOdometerKm || 0
      });
    }

    if (dueVehicles.length === 0) return;

    const listHtml = dueVehicles
      .map((v) => `<li>${v.name || v.registrationNumber} — on ${v.current} km, ` +
        `service was due at ${v.nextServiceAtKm} km` +
        (v.lastServiceProvider ? ` (last serviced at ${v.lastServiceProvider})` : '') +
        `</li>`)
      .join("");

    await sendAdminEmail(
      `My Daily Work Info: ${dueVehicles.length} vehicle(s) due for service`,
      `<p>These vehicles are due (or overdue) for a service:</p><ul>${listHtml}</ul>`
    );

    const batch = db.batch();
    dueVehicles.forEach((v) => {
      batch.set(db.collection("vehicles").doc(v.id), { lastReminderNotifiedDate: today }, { merge: true });
    });
    await batch.commit();
  }
);
