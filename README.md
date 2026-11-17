# UTSKC Tools

Club tools for **UTS Kendo Club** — Phase 1 is attendance tracking. Modelled on the UNSWKC tools.

SvelteKit (Svelte 5, client-only SPA) + Firebase (Auth, Firestore, Cloud Functions, Hosting) + Tailwind CSS v3, installable as a PWA.

## What it does

| Route | Who | What |
| --- | --- | --- |
| `/` | everyone | Google sign-in. The `user/{uid}` profile is created on first login. |
| `/home` | members | App tiles, **Scan attendance QR**, and a "Pending check-ins" banner. |
| `/scan` | members | Camera QR scanner. Also the landing page when the QR is scanned with the phone's own camera. |
| `/pending` | members | Check-ins saved on the phone that haven't reached the server, with **Submit now**. |
| `/attendance` | members | Year heatmap + session list. Holders of `attendance` can search any member. |
| `/schedule` | members | Monthly calendar and calendar (ICS) subscription. |
| `/sessions` | `attendance` permission | Club settings, session management, QR codes (PDF/PNG), attendance viewer, manual marking. |
| `/announcements` | members | Unviewed and Viewed tabs listing title and published time; tapping one opens its content and moves it to Viewed. The home tile shows "NEW" while anything is unviewed. |
| `/announcements/admin` | `announcement` permission | Add, edit and remove announcements, written in markdown with a preview. |
| `/profile` | members | Your own name, second email and phone. |
| `/users` | `profile` or `admin` permission | Member list with search; open a member to edit their details. Holders of `admin` also tick that member's permissions there. |

### How check-in works

1. An admin creates sessions and prints the QR book (one A4 page per session).
2. A member scans the session QR. The QR is self-contained — session id, passcode and the check-in window — so the phone validates the time window **without a network connection**.
3. The scan is saved to IndexedDB and submitted to the `submitAttendance` Cloud Function straight away.
4. If the phone is offline, the check-in stays queued and is submitted automatically on reconnect, when the app is re-opened, and on a one-minute timer. Until then it shows as **Pending**.
5. The function checks the passcode and that the **scan time** (not the submission time) falls inside the session's window, then writes `attendance/{uid}/sessions/{sessionId}`.

The check-in window opens 30 minutes before training and closes at the end of the training day, or at the end of that week (Sunday) — an admin chooses under **Club settings**. The window is fixed when a session is created.

> The scan time comes from the member's phone, so someone who has a session's QR code can claim any scan time inside its window. That is the accepted trade-off for offline check-in.

### Data model

```
user/{uid}                              { name, email, email2?, phone?, permissions[], viewedAnnouncements[]? }
announcement/{autoId}                   { title, content (markdown), publishedAt, updatedAt?, author }
config/attendance                       { windowMode: 'day' | 'week', schedule: { <weekday 0-6>: { start, end } } }
session/{YYYY-MM-DD-Ddd}                { start, end, trainingStart, trainingEnd, type, label, color, location }
sessionSecret/{sessionId}               { passcode }
attendance/{uid}/sessions/{sessionId}   { t, scannedAt, submittedAt }   (manual marks: { t, p: 'manual', markedBy })
```

`session.start` / `session.end` are the check-in window; `trainingStart` / `trainingEnd` are the actual training times. Events (`type: 'event'`) appear on the schedule only and have no passcode.

### Announcements

- An announcement is shown for **2 months** after it's published. The `deleteExpiredAnnouncements` Cloud Function deletes expired ones every day at 3 am Sydney time; the app hides them from the moment they expire, so the daily timing doesn't matter. The length is `ANNOUNCEMENT_MONTHS` in `src/lib/announcements.js` and `functions/index.js`.
- `viewedAnnouncements` on a member's user doc holds the ids they've opened, so viewed/unviewed follows them across devices. When the app loads the list from the server, ids whose announcement no longer exists are removed from it.
- Scheduled functions need the Blaze plan (already required for the other functions); the first deploy enables Cloud Scheduler.

### Permissions

| Permission | Shown as | Allows |
|---|---|---|
| `admin` | Admin | Grant and remove any permission, including `admin`, and edit member details. Grants nothing else by itself. |
| `profile` | Users | View the member list and edit names, second emails and phones. |
| `attendance` | Sessions | Manage sessions, QR codes, club settings and attendance. |
| `announcement` | Announcements | Publish, edit and remove announcements. |

Members can edit their own name, second email and phone, never their own permissions. An admin can't untick their own Admin in the app. A permission change reaches the affected person the next time they open or reload the app. The list lives in `PERMISSIONS` in `src/lib/club.js` and is enforced in `firestore.rules`.

## Setup

```
npm i
cd functions && npm i
```

1. **Create the Firebase project**, then enable *Authentication → Google*, *Firestore* and *Functions* (Functions needs the Blaze plan).
2. **Web config** — paste the project's web app config into `src/lib/firebaseConfig.js`.
3. **Select the project** — `firebase use --add`.
4. **Deploy** — `npm run deploy` (builds, then deploys rules, functions and hosting).
5. **Make yourself an admin** — sign in once, then in the Firebase console open `user/{your uid}` and set `permissions` to `["admin", "profile", "attendance"]`. This is only needed for the first admin; after that, permissions are granted in the app under **Users**.
6. In the app, open **Sessions → Club settings** and set the training days and the check-in window.

Print QR codes from the deployed site, not from `localhost`: the QR contains the address of the site it was generated on.

## Development

```
npm run dev          # against the real Firebase project
```

To work without touching real data, run the Firebase emulators (needs Java) and point the app at them:

```
npm run emulators    # Auth, Firestore and Functions emulators
npm run dev:emu      # the app, wired to the emulators
```

The service worker is only active in production builds (`npm run build`).

## Things to confirm with the club

- Training days and times, and end-of-day vs end-of-week check-in — both are set in the app under **Club settings**.
