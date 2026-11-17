import { writable } from 'svelte/store'

// Holds the current user's Firestore profile + uid.
// Populated by +layout.svelte once after auth resolves.
// null = unauthenticated (or profile not yet loaded)
export const userProfile = writable(null)

// The profile is mirrored into localStorage so the app can start instantly — and offline
const cacheKey = uid => `utskc-profile-${uid}`

export function readCachedProfile(uid) {
  try { return JSON.parse(localStorage.getItem(cacheKey(uid))) } catch { return null }
}

// Sets the signed-in user's profile and refreshes the cached copy
export function useProfile(profile) {
  userProfile.set(profile)
  try { localStorage.setItem(cacheKey(profile.uid), JSON.stringify(profile)) } catch { /* storage full or blocked */ }
}
