// Club-specific constants and the helpers every attendance page shares.

export const CLUB_NAME  = 'UTS Kendo Club'
export const CLUB_SHORT = 'UTSKC'

// Keep in sync with DEFAULT_LOCATION in functions/index.js (used by the ICS feed)
export const DEFAULT_LOCATION = 'UTS Building 4, Ross Milbourne Sports Hall, 745 Harris Street, Ultimo NSW 2007'

// The check-in window opens this long before training starts
export const OPEN_BEFORE_MINS = 30

// Fallback for the admin-editable settings stored in Firestore at config/attendance.
//   windowMode: 'day'  → check-in closes at 23:59 on the training day
//               'week' → check-in closes at 23:59 on the Sunday of that week
//   schedule:   weekday (0=Sun … 6=Sat) → { start: 'HH:MM', end: 'HH:MM' }, used by "Generate Standard"
export const DEFAULT_SETTINGS = { windowMode: 'day', schedule: {} }

// Permissions an admin can grant on the Users page. Keep the keys in sync with firestore.rules.
export const PERMISSIONS = [
  { key: 'admin',      label: 'Admin',    desc: 'Grant and remove permissions, including Admin' },
  { key: 'profile',    label: 'Users',    desc: 'View all members and edit their details' },
  { key: 'attendance', label: 'Sessions', desc: 'Manage sessions, QR codes and attendance' },
  { key: 'announcement', label: 'Announcements', desc: 'Publish, edit and remove announcements' },
]

export const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const COLORS = [
  { key: 'purple', tw: 'bg-purple-100 text-purple-700', swatch: 'bg-purple-500', rgb: [120, 60, 200] },
  { key: 'orange', tw: 'bg-orange-100 text-orange-700', swatch: 'bg-orange-500', rgb: [194, 80, 10]  },
  { key: 'blue',   tw: 'bg-blue-100 text-blue-700',     swatch: 'bg-blue-500',   rgb: [29, 100, 210] },
  { key: 'green',  tw: 'bg-green-100 text-green-700',   swatch: 'bg-green-500',  rgb: [22, 120, 60]  },
  { key: 'red',    tw: 'bg-red-100 text-red-700',       swatch: 'bg-red-500',    rgb: [190, 30, 30]  },
  { key: 'yellow', tw: 'bg-yellow-100 text-yellow-700', swatch: 'bg-yellow-400', rgb: [160, 100, 0]  },
  { key: 'pink',   tw: 'bg-pink-100 text-pink-700',     swatch: 'bg-pink-500',   rgb: [190, 24, 93]  },
  { key: 'teal',   tw: 'bg-teal-100 text-teal-700',     swatch: 'bg-teal-500',   rgb: [15, 118, 110] },
]
export const COLORS_MAP = Object.fromEntries(COLORS.map(c => [c.key, c]))
export function labelTw(color) { return COLORS_MAP[color]?.tw ?? 'bg-gray-100 text-gray-600' }

export function addMins(date, mins) { return new Date(date.getTime() + mins * 60 * 1000) }

// Local-time YYYY-MM-DD
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Session ids are the local training date plus weekday, e.g. "2025-07-10-Thu" — one session per day
export function sessionIdFor(date) { return `${dateKey(date)}-${DAY_ABBR[date.getDay()]}` }

// Local midnight of the day a session id refers to (null if the id isn't in that format)
export function sessionIdToDate(id) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(id ?? '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}

// QR check-in window for a training session. Stored on the session doc as start/end,
// enforced by the submitAttendance function, and printed into the QR for offline validation.
export function checkinWindow(trainingStart, windowMode) {
  const end = new Date(trainingStart)
  if (windowMode === 'week') end.setDate(end.getDate() + (7 - end.getDay()) % 7)  // → Sunday (weeks run Mon–Sun)
  end.setHours(23, 59, 59, 0)
  return { start: addMins(trainingStart, -OPEN_BEFORE_MINS), end }
}

export function fmtDate(d) {
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
export function fmtShortDate(d) {
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}
// e.g. "17 Nov 2026, 6:45 pm"
export function fmtDateTime(d) {
  return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
export function fmtTime(d) {
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}
