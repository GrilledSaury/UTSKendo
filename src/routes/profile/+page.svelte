<script>
  import { onMount } from 'svelte'
  import { doc, getDoc, updateDoc } from 'firebase/firestore'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Swal from 'sweetalert2'
  import { AIcon } from 'ace.svelte'
  import { mdiHome, mdiArrowLeft } from '@mdi/js'
  import { db } from '$lib/firebase'
  import { userProfile, useProfile } from '$lib/stores'
  import { online } from '$lib/sync'
  import { PERMISSIONS } from '$lib/club'

  // /profile is your own profile; /profile?uid=… is someone else's (opened from the Users page)
  const profileId = page.url.searchParams.get('uid') || $userProfile.uid
  const isSelf    = profileId === $userProfile.uid
  const myPerms   = $userProfile.permissions ?? []
  const canGrant  = myPerms.includes('admin')
  const canEdit   = isSelf || canGrant || myPerms.includes('profile')

  let loading     = $state(true)
  let saving      = $state(false)
  let name        = $state('')
  let email       = $state('')
  let email2      = $state('')
  let phone       = $state('')
  let permissions = $state([])

  onMount(async () => {
    if (!canEdit) { goto('/home'); return }
    try {
      const snap = await getDoc(doc(db, 'user', profileId))
      if (!snap.exists()) {
        await Swal.fire('Profile not found', '', 'error')
        goto(isSelf ? '/home' : '/users')
        return
      }
      const d = snap.data()
      name        = d.name ?? ''
      email       = d.email ?? ''
      email2      = d.email2 ?? ''
      phone       = d.phone ?? ''
      permissions = Array.isArray(d.permissions) ? [...d.permissions] : []
      loading     = false
    } catch (err) {
      await Swal.fire('Could not load profile', $online ? err.message : 'You are offline.', 'error')
      goto(isSelf ? '/home' : '/users')
    }
  })

  function togglePermission(key) {
    permissions = permissions.includes(key) ? permissions.filter(p => p !== key) : [...permissions, key]
  }

  async function save() {
    if (!name.trim()) { Swal.fire('Name is required', '', 'warning'); return }
    if (!$online) { Swal.fire('You are offline', 'Reconnect and try again.', 'warning'); return }

    const data = { name: name.trim(), phone: phone.trim(), email2: email2.trim() }
    if (canGrant) data.permissions = permissions

    saving = true
    try {
      await updateDoc(doc(db, 'user', profileId), data)
      name = data.name; phone = data.phone; email2 = data.email2
      // Keep the signed-in user's own profile (home greeting, tiles) in step with the edit
      if (isSelf) useProfile({ ...$userProfile, ...data })
      Swal.fire({ title: 'Saved', icon: 'success', timer: 1200, showConfirmButton: false })
    } catch (err) {
      Swal.fire('Could not save', err.code === 'permission-denied' ? 'You do not have permission to make this change.' : err.message, 'error')
    }
    saving = false
  }
</script>

<div class="w-screen min-h-screen bg-gray-100 p-4 md:px-16 md:py-8">
  <button onclick={() => goto(isSelf ? '/home' : '/users')} title={isSelf ? 'Home' : 'Back to users'}>
    <AIcon path={isSelf ? mdiHome : mdiArrowLeft} size="36px" class="text-gray-500"></AIcon>
  </button>
  <div class="text-2xl font-bold my-2">{isSelf ? 'My Profile' : 'Profile'}</div>

  {#if loading}
    <div class="text-gray-400 my-4">Loading…</div>
  {:else}
    <div class="max-w-xl">
      <label class="block my-3">
        <div class="text-sm text-gray-600 mb-1">Name</div>
        <input class="w-full px-2 py-1.5 rounded border" bind:value={name} maxlength="80">
      </label>
      <label class="block my-3">
        <div class="text-sm text-gray-600 mb-1">Email (Google account)</div>
        <input class="w-full px-2 py-1.5 rounded border bg-gray-50 text-gray-500" value={email} disabled>
      </label>
      <label class="block my-3">
        <div class="text-sm text-gray-600 mb-1">Second email</div>
        <input class="w-full px-2 py-1.5 rounded border" type="email" bind:value={email2} maxlength="120">
      </label>
      <label class="block my-3">
        <div class="text-sm text-gray-600 mb-1">Phone</div>
        <input class="w-full px-2 py-1.5 rounded border" type="tel" bind:value={phone} maxlength="30">
      </label>

      {#if canGrant}
        <div class="border-t pt-4 mt-5">
          <div class="font-bold text-gray-700 mb-2">Permissions</div>
          {#each PERMISSIONS as p}
            <!-- An admin can't remove their own Admin: that could leave the club with nobody able to grant it back -->
            {@const locked = isSelf && p.key === 'admin'}
            <label class="flex items-start gap-3 my-2 {locked ? 'opacity-60' : 'cursor-pointer'}">
              <input
                type="checkbox" class="mt-1 w-4 h-4"
                checked={permissions.includes(p.key)}
                disabled={locked}
                onchange={() => togglePermission(p.key)}
              >
              <div>
                <div class="font-medium">{p.label}</div>
                <div class="text-xs text-gray-500">{p.desc}{locked ? ' — ask another admin to remove yours' : ''}</div>
              </div>
            </label>
          {/each}
          <div class="text-xs text-gray-400 mt-2">Changes take effect the next time that person opens or reloads the app.</div>
        </div>
      {/if}

      <button
        class="bg-blue-500 font-bold hover:shadow rounded px-4 py-1.5 text-white my-5 disabled:opacity-50"
        onclick={save} disabled={saving}
      >{saving ? 'Saving…' : 'Save'}</button>

      <div class="text-gray-400 font-mono text-xs break-all">ID: {profileId}</div>
    </div>
  {/if}
</div>
