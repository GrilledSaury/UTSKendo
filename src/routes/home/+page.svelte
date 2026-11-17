<script>
  import { mdiLogout, mdiBullhorn, mdiBullhornOutline, mdiAccount, mdiAccountGroup, mdiCalendarCheck, mdiCalendarMonth, mdiCalendarBlank, mdiQrcodeScan, mdiCloudUploadOutline, mdiChevronRight, mdiWifiOff } from '@mdi/js'
  import { AIcon } from 'ace.svelte'
  import { goto } from '$app/navigation'
  import { signOut } from 'firebase/auth'
  import Swal from 'sweetalert2'
  import { onMount } from 'svelte'
  import { auth } from '$lib/firebase'
  import { userProfile } from '$lib/stores'
  import { fetchAnnouncements, syncViewed } from '$lib/announcements'
  import { pending, online } from '$lib/sync'

  // Apps visible to everyone
  const baseApps = [
    { label: 'Announcements', icon: mdiBullhorn, color: 'text-orange-500', href: '/announcements', badge: 'announcements' },
    { label: 'My Attendance', icon: mdiCalendarMonth, color: 'text-green-500', href: '/attendance' },
    { label: 'Schedule', icon: mdiCalendarBlank, color: 'text-teal-500', href: '/schedule' },
    { label: 'My Profile', icon: mdiAccount, color: 'text-blue-500', href: '/profile' },
  ]

  // Apps shown only when the user holds one of the listed permissions
  const permissionApps = [
    { permissions: ['profile', 'admin'], label: 'Users', icon: mdiAccountGroup, color: 'text-blue-700', href: '/users' },
    { permissions: ['announcement'], label: 'Manage Announcements', icon: mdiBullhornOutline, color: 'text-orange-600', href: '/announcements/admin' },
    { permissions: ['attendance'], label: 'Sessions', icon: mdiCalendarCheck, color: 'text-green-600', href: '/sessions' },
  ]

  let apps = $derived([
    ...baseApps,
    ...permissionApps.filter(a => a.permissions.some(p => $userProfile.permissions?.includes(p))),
  ])

  // "new" on the Announcements tile: a live announcement this member hasn't opened.
  // viewedAnnouncements lives on their user doc, so it follows them across devices.
  let liveIds = $state([])
  let hasNewAnnouncement = $derived.by(() => {
    const viewed = new Set($userProfile.viewedAnnouncements ?? [])
    return liveIds.some(id => !viewed.has(id))
  })

  async function checkAnnouncements() {
    try {
      // From Firestore's local cache when offline
      const { items, fromServer } = await fetchAnnouncements()
      await syncViewed(items, fromServer)
      liveIds = items.map(a => a.id)
    } catch { /* offline with nothing cached: no label */ }
  }

  // Checked when home opens, and again whenever the app comes back to the foreground
  // (an installed PWA can sit on this page for days without reloading)
  onMount(() => {
    checkAnnouncements()
    const onVisible = () => { if (document.visibilityState === 'visible') checkAnnouncements() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  })

  async function logout() {
    if ($pending.length > 0) {
      const { isConfirmed } = await Swal.fire({
        title: 'Sign out?',
        text: `You have ${$pending.length} check-in${$pending.length === 1 ? '' : 's'} that haven't been submitted yet. They stay on this phone and will be submitted the next time you sign in here.`,
        confirmButtonText: 'Sign out',
        confirmButtonColor: '#ef4444',
        showCancelButton: true,
      })
      if (!isConfirmed) return
    }
    await signOut(auth)  // the root layout redirects to the sign-in page
  }
</script>

<div class="min-h-screen w-screen bg-gray-100 flex flex-col p-3 sm:p-10">
  <div class="flex items-center mb-4">
    <h1 class="text-gray-700 font-bold text-3xl m-3">Welcome, {$userProfile.name}</h1>
    <div class="grow"></div>
    {#if !$online}
      <span class="flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-200 rounded-full px-2 py-1 mr-2">
        <AIcon path={mdiWifiOff} size="14px" />Offline
      </span>
    {/if}
    <button onclick={logout} title="Sign out"><AIcon class="text-red-500" path={mdiLogout}></AIcon></button>
  </div>

  {#if $pending.length > 0}
    <button
      class="mx-2 mb-3 px-4 py-3 rounded shadow bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-3 text-left sm:max-w-md"
      onclick={() => goto('/pending')}
    >
      <AIcon path={mdiCloudUploadOutline} class="shrink-0" />
      <div class="grow">
        <div class="font-bold">Pending check-ins: {$pending.length}</div>
        <div class="text-xs">Not submitted yet — tap to review or submit now</div>
      </div>
      <AIcon path={mdiChevronRight} class="shrink-0" />
    </button>
  {/if}

  <button
    class="mx-2 mb-3 px-4 py-4 rounded shadow bg-blue-500 text-white font-bold text-lg flex items-center justify-center gap-3 sm:max-w-md"
    onclick={() => goto('/scan')}
  >
    <AIcon path={mdiQrcodeScan} />Scan attendance QR
  </button>

  <div class="flex flex-wrap items-center">
    {#each apps as app}
      <button
        class="border-2 border-gray-100 m-2 px-3 py-2 rounded shadow bg-white transition-all flex items-center sm:justify-center"
        onclick={() => goto(app.href)}
      >
        <AIcon path={app.icon} class="{app.color} mr-3 sm:mr-1"/>
        {app.label}
        {#if app.badge === 'announcements' && hasNewAnnouncement}
          <span class="ml-2 text-xs font-bold uppercase text-red-500">new</span>
        {/if}
      </button>
    {/each}
  </div>
</div>
