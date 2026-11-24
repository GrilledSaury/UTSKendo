<script>
  import { onMount } from 'svelte'
  import { auth, configured } from '$lib/firebase'
  import {
    signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, setPersistence, browserLocalPersistence,
  } from 'firebase/auth'
  import { CLUB_NAME } from '$lib/club'

  let loading  = $state(false)
  let errorMsg = $state('')

  // Opened from the home screen (installed app). Pop-ups don't work there, iOS especially:
  // Google opens in a separate browser that can't hand the sign-in back to the app.
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

  // Pop-up errors where a full-page redirect will still work
  const USE_REDIRECT = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'])

  function showError(err) {
    if (err.code === 'auth/network-request-failed') errorMsg = 'No internet connection. You need to be online to sign in.'
    else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') errorMsg = err.message
  }

  // Back from a redirect sign-in: success is picked up by the root layout; only errors are shown here
  onMount(() => { getRedirectResult(auth).catch(showError) })

  // The root layout picks up the new auth state, creates the profile on first login, and redirects
  async function loginWithGoogle() {
    if (loading) return
    loading  = true
    errorMsg = ''
    const provider = new GoogleAuthProvider()
    try {
      await setPersistence(auth, browserLocalPersistence)
      if (standalone) { await signInWithRedirect(auth, provider); return }  // leaves the page
      await signInWithPopup(auth, provider)
    } catch (err) {
      if (USE_REDIRECT.has(err.code)) {
        try { await signInWithRedirect(auth, provider); return } catch (err2) { showError(err2) }
      } else showError(err)
      loading = false
    }
  }
</script>

<div class="h-screen w-screen bg-gray-100 flex flex-col items-center justify-center">
  <div class="text-2xl font-bold my-8 w-4/5 sm:w-1/2">{CLUB_NAME}</div>
  <div class="flex flex-col w-4/5 sm:w-1/2 justify-center">
    {#if !configured}
      <div class="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-sm text-yellow-800 mb-2">
        Firebase isn't configured yet — fill in <span class="font-mono">src/lib/firebaseConfig.js</span>.
      </div>
    {/if}
    <button
      class="rounded my-2 p-4 bg-blue-500 text-white shadow transition-all hover:shadow-md flex items-center justify-center whitespace-nowrap font-bold text-xl disabled:opacity-70 disabled:cursor-not-allowed gap-3"
      onclick={loginWithGoogle}
      disabled={loading || !configured}
    >
      {#if loading}
        <svg class="animate-spin h-5 w-5 text-white shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        Signing in…
      {:else}
        Sign in with Google
      {/if}
    </button>
    {#if errorMsg}
      <div class="text-red-600 text-sm mb-1">{errorMsg}</div>
    {/if}
    {#if !standalone}
      <div class="text-gray-500">If nothing happens, allow pop-up windows for this site and try again.</div>
    {/if}
  </div>
</div>
