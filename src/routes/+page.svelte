<script>
  import { auth, configured } from '$lib/firebase'
  import { signInWithPopup, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth'
  import { CLUB_NAME } from '$lib/club'

  let loading  = $state(false)
  let errorMsg = $state('')

  // The root layout picks up the new auth state, creates the profile on first login, and redirects
  async function loginWithGoogle() {
    if (loading) return
    loading  = true
    errorMsg = ''
    try {
      await setPersistence(auth, browserLocalPersistence)
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (err) {
      if (err.code === 'auth/popup-blocked') errorMsg = 'The sign-in pop-up was blocked. Allow pop-ups for this site and try again.'
      else if (err.code === 'auth/network-request-failed') errorMsg = 'No internet connection. You need to be online to sign in.'
      else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') errorMsg = err.message
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
    <div class="text-gray-500">Please allow pop-up windows the first time you sign in.</div>
  </div>
</div>
