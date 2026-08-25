/**
 * The service schedule rules, for the daily reminder job.
 *
 * These rules exist three times over — here, in the admin portal, and in Vehicle.kt on
 * the phone — because the three cannot share code: two languages and three separate
 * deploy roots. The specification they all answer to is service-schedule-cases.csv at
 * the repo root, and service-schedule-test.mjs beside this file runs this copy against
 * it. Change a rule there, change it in all three.
 *
 * Deliberately free of any firebase-admin import, so the test can require it without
 * initialising an app or reaching for credentials.
 */

/**
 * The interval as stored, with 0 meaning the vehicle has none.
 *
 * This used to fall back to 15 000, inventing a schedule nobody had set: the job
 * emailed reminders for a vehicle the driver's phone treated as untracked.
 */
function intervalKm(vehicle) {
  return Math.max(0, Number(vehicle.serviceIntervalKm || 0));
}

/**
 * Services fall on absolute odometer milestones — every 15 000 km on the clock by
 * default, so 15 000 / 30 000 / … Once a service is recorded the schedule steps on
 * from the milestone that service satisfied: servicing at 149 000 counts as having
 * done the 150 000 service, so the next falls at 165 000.
 *
 * Returns 0 for a vehicle with no interval, which means "not tracked by kilometres"
 * rather than "due immediately" — see isServiceDueByKm.
 */
function nextServiceAtKm(vehicle) {
  const interval = intervalKm(vehicle);
  if (interval <= 0) return 0;
  const last = Number(vehicle.lastServiceOdometerKm || 0);
  const current = Number(vehicle.currentOdometerKm || 0);
  return last > 0
    ? Math.ceil(last / interval) * interval + interval
    : (Math.floor(current / interval) + 1) * interval;
}

/**
 * 0 just after a service, 100 when the next is due, null when no service has ever been
 * recorded — there is then nothing to measure from, and a fabricated 0% reads as
 * "just serviced".
 *
 * Truncated rather than rounded, matching the phone.
 */
function percentToNextService(vehicle) {
  const last = Number(vehicle.lastServiceOdometerKm || 0);
  if (intervalKm(vehicle) <= 0 || last <= 0) return null;
  const next = nextServiceAtKm(vehicle);
  if (next <= last) return 100;
  const current = Number(vehicle.currentOdometerKm || 0);
  const pct = Math.trunc((current - last) / (next - last) * 100);
  return Math.max(0, Math.min(100, pct));
}

/**
 * The interval guard is not decoration: an untracked vehicle's next milestone is 0,
 * and every reading is at or above 0 — without it the job would email that the entire
 * fleet is overdue.
 */
function isServiceDueByKm(vehicle) {
  return intervalKm(vehicle) > 0
    && Number(vehicle.currentOdometerKm || 0) >= nextServiceAtKm(vehicle);
}

/** 0 months means "judge by kilometres only". `|| 6` would turn an explicit 0 into 6. */
function isServiceDueByDate(vehicle, nowMillis) {
  const last = Number(vehicle.lastServiceDateMillis || 0);
  const months = typeof vehicle.serviceIntervalMonths === "number"
    ? vehicle.serviceIntervalMonths
    : 6;
  if (last <= 0 || months <= 0) return false;
  return nowMillis - last >= months * 30 * 24 * 60 * 60 * 1000;
}

function isServiceDueAt(vehicle, nowMillis) {
  return isServiceDueByKm(vehicle) || isServiceDueByDate(vehicle, nowMillis);
}

module.exports = {
  intervalKm,
  nextServiceAtKm,
  percentToNextService,
  isServiceDueByKm,
  isServiceDueByDate,
  isServiceDueAt
};
