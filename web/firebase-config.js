// Firebase config for the WEB admin portal.
//
// Most of this is already filled in from your project. You only need the two
// PASTE_ME values, which come from registering a *web* app in Firebase:
//
//   1. https://console.firebase.google.com/project/fleet-tracker-9c05d/settings/general
//   2. Under "Your apps", click the web icon  </>
//   3. Nickname it e.g. "Admin portal", click Register app (skip Hosting for now)
//   4. It shows a firebaseConfig block — copy apiKey and appId from it below
//
// These values are safe to commit: Firebase web config is public by design, and
// access is controlled entirely by the Firestore security rules.

export const firebaseConfig = {
  apiKey: "PASTE_ME",
  authDomain: "fleet-tracker-9c05d.firebaseapp.com",
  projectId: "fleet-tracker-9c05d",
  storageBucket: "fleet-tracker-9c05d.firebasestorage.app",
  messagingSenderId: "1026164039379",
  appId: "PASTE_ME"
};
