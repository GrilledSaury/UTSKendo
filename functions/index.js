const { onCall, onRequest, HttpsError }       = require('firebase-functions/v2/https')
const { onSchedule }                          = require('firebase-functions/v2/scheduler')
const { initializeApp }                       = require('firebase-admin/app')
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore')

initializeApp()

const DEFAULT_LOCATION = 'UTS Building 4, Ross Milbourne Sports Hall, 745 Harris Street, Ultimo NSW 2007'

// How far ahead of the server clock a phone's scan time may be before we reject it
const CLOCK_SKEW_MS = 5 * 60 * 1000

// ── Attendance ───────────────────────────────────────────────────────────────
//
// Members scan a printed session QR; the phone may be offline, so the scan is
// queued on the device and submitted here later. We therefore validate the time
// the QR was *scanned* (scannedAt) against the session's check-in window, not
// the time the submission arrives.
//
// scannedAt comes from the member's phone and is trusted: someone who has the
// passcode can claim any scan time inside the window. That is an accepted
// trade-off for offline check-in.

exports.submitAttendance = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')

  const { sessionId, passcode, scannedAt } = request.data ?? {}
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(sessionId)
      || typeof passcode !== 'string' || !passcode || passcode.length > 128)
    throw new HttpsError('invalid-argument', 'Invalid QR code.')

  const scanTime = new Date(scannedAt)
  if (typeof scannedAt !== 'string' || isNaN(scanTime.getTime()))
    throw new HttpsError('invalid-argument', 'Invalid scan time.')

  const db = getFirestore()
  const [sessionSnap, secretSnap] = await Promise.all([
    db.doc(`session/${sessionId}`).get(),
    db.doc(`sessionSecret/${sessionId}`).get(),
  ])
  if (!sessionSnap.exists || !secretSnap.exists)
    throw new HttpsError('not-found', 'Session not found.')

  if (secretSnap.data().passcode !== passcode)
    throw new HttpsError('permission-denied', 'This QR code is not valid for the session.')

  const session = sessionSnap.data()
  if (scanTime < session.start.toDate() || scanTime > session.end.toDate())
    throw new HttpsError('failed-precondition', 'The QR code was scanned outside the check-in window.')
  if (scanTime.getTime() > Date.now() + CLOCK_SKEW_MS)
    throw new HttpsError('failed-precondition', 'Scan time is in the future — check the clock on your phone.')

  const ref = db.doc(`attendance/${request.auth.uid}/sessions/${sessionId}`)
  try {
    // create() fails if the doc already exists, so a retried submission can't overwrite the first
    await ref.create({
      t:           Timestamp.fromDate(scanTime),   // when the QR was scanned
      scannedAt:   Timestamp.fromDate(scanTime),
      submittedAt: FieldValue.serverTimestamp(),   // when it reached the server
    })
  } catch (err) {
    if (err.code === 6) return { status: 'already_recorded' }  // gRPC ALREADY_EXISTS
    throw err
  }
  return { status: 'ok' }
})

// ── Calendar feed ────────────────────────────────────────────────────────────

function escapeIcs(str) {
  return str.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\;').replace(/\r?\n/g, '\\n')
}

// RFC 5545 §3.1: fold lines longer than 75 octets
function foldLine(line) {
  const buf = Buffer.from(line, 'utf8')
  if (buf.length <= 75) return line
  const parts = []
  let pos = 0
  let first = true
  while (pos < buf.length) {
    const limit = first ? 75 : 74
    parts.push(buf.subarray(pos, pos + limit).toString('utf8'))
    pos += limit
    first = false
  }
  return parts.join('\r\n ')
}

function fmtIcsUtc(date) {
  const p = n => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}${p(date.getUTCMonth()+1)}${p(date.getUTCDate())}T${p(date.getUTCHours())}${p(date.getUTCMinutes())}00Z`
}

exports.calendarIcs = onRequest({ cors: true }, async (_req, res) => {
  try {
    const db  = getFirestore()
    const now = new Date()
    const past   = new Date(now); past.setDate(past.getDate() - 30)
    const future = new Date(now); future.setFullYear(future.getFullYear() + 1)

    const snap = await db.collection('session')
      .where('start', '>=', Timestamp.fromDate(past))
      .where('start', '<=', Timestamp.fromDate(future))
      .orderBy('start')
      .get()

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//UTSKC//Training Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:UTSKC Training',
    ]

    snap.forEach(d => {
      const data  = d.data()
      // start/end are the QR check-in window; the calendar shows the actual training times
      const start = (data.trainingStart ?? data.start).toDate()
      const end   = (data.trainingEnd   ?? data.end).toDate()
      const isEvent = data.type === 'event'
      const summary = isEvent
        ? (data.label || 'UTSKC Event')
        : ('UTSKC Training' + (data.label ? ` – ${data.label}` : ''))
      const location = data.location || (isEvent ? 'TBD' : DEFAULT_LOCATION)

      lines.push('BEGIN:VEVENT')
      lines.push(`DTSTAMP:${fmtIcsUtc(now)}`)
      lines.push(`DTSTART:${fmtIcsUtc(start)}`)
      lines.push(`DTEND:${fmtIcsUtc(end)}`)
      lines.push(foldLine(`SUMMARY:${escapeIcs(summary)}`))
      lines.push(foldLine(`LOCATION:${escapeIcs(location)}`))
      lines.push(foldLine(`UID:${d.id}@utskc`))
      lines.push('END:VEVENT')
    })

    lines.push('END:VCALENDAR')

    res.set('Content-Type', 'text/calendar; charset=utf-8')
    // Must be private: Firebase Hosting's CDN caches `public` responses and keeps serving them after a redeploy
    res.set('Cache-Control', 'private, max-age=3600')
    res.send(lines.join('\r\n') + '\r\n')
  } catch (err) {
    console.error(err)
    res.status(500).send('Error generating calendar')
  }
})


// ── Announcements ────────────────────────────────────────────────────────────
//
// An announcement is shown for ANNOUNCEMENT_MONTHS after publishing (the app filters
// by the same cutoff), then deleted here once a day. Members' viewedAnnouncements
// entries for deleted ones are pruned by the app the next time it loads the list.

// Keep in sync with ANNOUNCEMENT_MONTHS in src/lib/announcements.js
const ANNOUNCEMENT_MONTHS = 2

async function deleteExpired(now = new Date()) {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - ANNOUNCEMENT_MONTHS)
  const db = getFirestore()
  let deleted = 0
  // Batches of 400 stay under Firestore's 500-writes-per-batch limit
  for (;;) {
    const snap = await db.collection('announcement')
      .where('publishedAt', '<', Timestamp.fromDate(cutoff))
      .limit(400).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
    deleted += snap.size
  }
  return deleted
}

exports.deleteExpiredAnnouncements = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Australia/Sydney' },
  async () => {
    const n = await deleteExpired()
    console.log(`Deleted ${n} expired announcement(s)`)
  },
)
