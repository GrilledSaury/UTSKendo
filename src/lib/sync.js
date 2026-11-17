// Drains the offline check-in queue into the submitAttendance Cloud Function.
import { writable } from 'svelte/store'
import { httpsCallable } from 'firebase/functions'
import { doc, getDoc } from 'firebase/firestore'
import { db, functions } from './firebase'
import { enqueue, getPending, markRejected, remove } from './offlineQueue'

export const pending = writable([])   // this member's queued check-ins (waiting or rejected)
export const syncing = writable(false)
export const online  = writable(typeof navigator === 'undefined' ? true : navigator.onLine)

// Errors where retrying the same submission can never succeed
const PERMANENT = new Set([
  'functions/invalid-argument', 'functions/not-found',
  'functions/permission-denied', 'functions/failed-precondition',
])

const RETRY_MS = 60_000

let currentUid = null
let chain = Promise.resolve()  // serialises flushes so two triggers can't submit the same item twice

export async function refreshPending() {
  pending.set(currentUid ? await getPending(currentUid) : [])
}

async function flush(uid, retryRejected) {
  const results = {}  // sessionId → 'synced' | 'already' | 'pending' | 'rejected'
  const submit = httpsCallable(functions, 'submitAttendance', { timeout: 20_000 })
  syncing.set(true)
  try {
    for (const item of await getPending(uid)) {
      if (item.error && !retryRejected) { results[item.sessionId] = 'rejected'; continue }
      if (!navigator.onLine)            { results[item.sessionId] = 'pending';  continue }
      try {
        const res = await submit({ sessionId: item.sessionId, passcode: item.passcode, scannedAt: item.scannedAt })
        await remove(item.key)
        results[item.sessionId] = res.data?.status === 'already_recorded' ? 'already' : 'synced'
        // The record was written by the server, so read it once to get it into the local
        // Firestore cache — otherwise My Attendance wouldn't show it while offline.
        getDoc(doc(db, 'attendance', uid, 'sessions', item.sessionId)).catch(() => {})
      } catch (err) {
        if (PERMANENT.has(err?.code)) {
          await markRejected(item, err.message)
          results[item.sessionId] = 'rejected'
        } else {
          results[item.sessionId] = 'pending'  // offline, timeout, server hiccup — try again later
        }
      }
    }
  } finally {
    syncing.set(false)
    if (uid === currentUid) await refreshPending()
  }
  return results
}

// Try to submit everything queued for the signed-in member. `retryRejected` is for the manual button.
export function syncNow({ retryRejected = false } = {}) {
  const uid = currentUid
  if (!uid) return Promise.resolve({})
  const run = chain.then(() => flush(uid, retryRejected))
  chain = run.catch(() => {})
  return run
}

// Save a validated scan on this device, then try to submit it straight away.
// Resolves to 'synced' | 'already' | 'pending' | 'rejected'; on 'rejected' the reason is in the pending store.
export async function recordScan(uid, payload, scannedAt = new Date()) {
  await enqueue({ uid, sessionId: payload.sessionId, passcode: payload.passcode, scannedAt: scannedAt.toISOString() })
  await refreshPending()
  const results = await syncNow()
  return results[payload.sessionId] ?? 'pending'
}

export async function dismiss(item) {
  await remove(item.key)
  await refreshPending()
}

// Called by the root layout whenever the signed-in user changes (null on sign-out)
export function setSyncUser(uid) {
  currentUid = uid
  refreshPending().then(() => { if (uid) syncNow() })
}

// Auto-sync: on reconnect, when the app comes back to the foreground, and on a slow timer
export function startAutoSync() {
  const onOnline  = () => { online.set(true); syncNow() }
  const onOffline = () => online.set(false)
  const onVisible = () => { if (document.visibilityState === 'visible') syncNow() }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(() => syncNow(), RETRY_MS)
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
  }
}
