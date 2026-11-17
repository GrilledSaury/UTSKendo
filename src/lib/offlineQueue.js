// Check-ins waiting to reach the server, kept in IndexedDB so they survive the app
// being closed. One entry per member per session.
import { get, set, del, entries } from 'idb-keyval'

const PREFIX = 'checkin:'
const keyFor = (uid, sessionId) => `${PREFIX}${uid}:${sessionId}`

// item: { uid, sessionId, passcode, scannedAt: ISO string }
export async function enqueue(item) {
  const key = keyFor(item.uid, item.sessionId)
  const existing = await get(key)
  // Scanning the same session again keeps the first scan time, unless that attempt was rejected
  if (existing && !existing.error) return
  await set(key, item)
}

// Every queued check-in for this member, oldest first
export async function getPending(uid) {
  return (await entries())
    .filter(([k, v]) => String(k).startsWith(PREFIX) && v?.uid === uid)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
}

// The server refused this check-in for good; keep it so the member can see why
export async function markRejected(item, message) {
  const { key, ...rest } = item
  await set(key, { ...rest, error: message })
}

export async function remove(key) { await del(key) }
