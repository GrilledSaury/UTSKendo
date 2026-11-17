<script>
  import '../app.css'
  import { onMount } from 'svelte'
  import { auth, db } from '$lib/firebase'
  import { onAuthStateChanged } from 'firebase/auth'
  import { doc, getDoc, setDoc } from 'firebase/firestore'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { pwaInfo } from 'virtual:pwa-info'
  import { userProfile } from '$lib/stores'
  import { setSyncUser, startAutoSync } from '$lib/sync'
  import { CLUB_SHORT } from '$lib/club'

  let { children } = $props()

  let authLoading = $state(true)

  // The profile is mirrored into localStorage so the app can start instantly — and offline
  const cacheKey = uid => `utskc-profile-${uid}`
  function readCachedProfile(uid) {
    try { return JSON.parse(localStorage.getItem(cacheKey(uid))) } catch { return null }
  }
  function useProfile(profile) {
    userProfile.set(profile)
    try { localStorage.setItem(cacheKey(profile.uid), JSON.stringify(profile)) } catch { /* storage full or blocked */ }
  }

  // Where to go after signing in: only ever a path inside this app
  function returnTo() {
    const target = page.url.searchParams.get('app')
    return target?.startsWith('/') && !target.startsWith('//') ? target : '/home'
  }

  function redirectToLogin() {
    if (page.url.pathname === '/') return
    goto('/?app=' + encodeURIComponent(page.url.pathname + page.url.search))
  }

  function enterApp() {
    authLoading = false
    if (page.url.pathname === '/') goto(returnTo())
  }

  // Reads the member's profile, creating it on their first sign-in
  async function loadOrCreateProfile(u) {
    const ref  = doc(db, 'user', u.uid)
    const snap = await getDoc(ref)
    if (snap.exists()) return { ...snap.data(), uid: u.uid }
    const profile = { name: u.displayName ?? u.email ?? 'Member', email: u.email ?? '', permissions: [] }
    await setDoc(ref, profile)
    return { ...profile, uid: u.uid }
  }

  onMount(() => {
    const stopSync = startAutoSync()

    const stopAuth = onAuthStateChanged(auth, async u => {
      if (u === null) {
        userProfile.set(null)
        setSyncUser(null)
        authLoading = false
        redirectToLogin()
        return
      }

      // Returning member: show the app straight away from the cached profile, refresh it below
      const cached = readCachedProfile(u.uid)
      if (cached) { userProfile.set(cached); enterApp() }

      try {
        if (!cached && !navigator.onLine) throw new Error('offline')
        useProfile(await loadOrCreateProfile(u))
      } catch (err) {
        // Offline or Firestore unreachable. Without a cached copy, fall back to the
        // Google account details so scanning still works; nothing is written.
        if (!cached) userProfile.set({ uid: u.uid, name: u.displayName ?? u.email ?? 'Member', email: u.email ?? '', permissions: [] })
      }
      setSyncUser(u.uid)
      enterApp()
    })

    // Service worker: caches the app shell so the PWA opens with no network
    import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {})

    return () => { stopAuth(); stopSync() }
  })
</script>

<svelte:head>
  <title>{CLUB_SHORT}</title>
  {@html pwaInfo?.webManifest.linkTag ?? ''}
</svelte:head>

{#if !authLoading && ($userProfile || page.url.pathname === '/')}
  {@render children()}
{/if}
