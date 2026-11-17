// Announcements shared by the home tile, the member page and the manage page.
//
// An announcement is shown for ANNOUNCEMENT_MONTHS after it is published; the
// deleteExpiredAnnouncements Cloud Function then deletes it (daily). Pages filter by
// the same cutoff, so an expired one disappears on time even before that runs.
//
// Each member's user doc holds viewedAnnouncements: the ids they have opened.
// Ids of announcements that no longer exist are pruned from it.
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, orderBy, query, updateDoc, where, Timestamp } from 'firebase/firestore'
import { get } from 'svelte/store'
import { db } from '$lib/firebase'
import { userProfile, useProfile } from '$lib/stores'

// Keep in sync with ANNOUNCEMENT_MONTHS in functions/index.js
export const ANNOUNCEMENT_MONTHS = 2

// Published before this → expired
export function announcementCutoff(now = new Date()) {
  const d = new Date(now)
  d.setMonth(d.getMonth() - ANNOUNCEMENT_MONTHS)
  return d
}

// When an announcement stops being shown
export function announcementExpiry(publishedAt) {
  const d = new Date(publishedAt)
  d.setMonth(d.getMonth() + ANNOUNCEMENT_MONTHS)
  return d
}

// Live announcements, newest first. fromServer is false when the answer came from the
// offline cache, which may be incomplete.
export async function fetchAnnouncements() {
  const snap = await getDocs(query(
    collection(db, 'announcement'),
    where('publishedAt', '>=', Timestamp.fromDate(announcementCutoff())),
    orderBy('publishedAt', 'desc'),
  ))
  const items = snap.docs.map(d => {
    const data = d.data({ serverTimestamps: 'estimate' })
    return {
      id: d.id,
      title: data.title ?? '',
      content: data.content ?? '',
      publishedAt: data.publishedAt?.toDate() ?? null,
      updatedAt: data.updatedAt?.toDate() ?? null,
    }
  })
  return { items, fromServer: !snap.metadata.fromCache }
}

function setViewed(ids) {
  const p = get(userProfile)
  if (p) useProfile({ ...p, viewedAnnouncements: ids })
}

export function viewedIds() {
  const v = get(userProfile)?.viewedAnnouncements
  return Array.isArray(v) ? v : []
}

// Records that the member opened an announcement. Offline, Firestore queues the write.
export function markViewed(id) {
  const p = get(userProfile)
  if (!p || viewedIds().includes(id)) return
  setViewed([...viewedIds(), id])
  updateDoc(doc(db, 'user', p.uid), { viewedAnnouncements: arrayUnion(id) }).catch(() => {})
}

// Refreshes the viewed list from the user doc (it may have changed on another device),
// then removes ids whose announcement is gone. Pruning only uses a list that came from
// the server: an offline cache can be missing announcements that still exist.
export async function syncViewed(items, fromServer) {
  const p = get(userProfile)
  if (!p) return
  try {
    const snap = await getDoc(doc(db, 'user', p.uid))
    const remote = snap.data()?.viewedAnnouncements
    if (Array.isArray(remote)) setViewed(remote)
  } catch { /* offline with nothing cached: keep the local copy */ }

  if (!fromServer) return
  const live = new Set(items.map(a => a.id))
  const gone = viewedIds().filter(id => !live.has(id))
  if (!gone.length) return
  setViewed(viewedIds().filter(id => live.has(id)))
  updateDoc(doc(db, 'user', p.uid), { viewedAnnouncements: arrayRemove(...gone) }).catch(() => {})
}
