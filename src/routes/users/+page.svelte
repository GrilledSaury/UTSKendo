<script>
  import { onMount } from 'svelte'
  import { collection, getDocs } from 'firebase/firestore'
  import { goto } from '$app/navigation'
  import { AIcon } from 'ace.svelte'
  import { mdiHome, mdiChevronRight } from '@mdi/js'
  import { db } from '$lib/firebase'
  import { userProfile } from '$lib/stores'
  import { online } from '$lib/sync'
  import { PERMISSIONS } from '$lib/club'

  const myPerms = $userProfile.permissions ?? []
  const allowed = myPerms.includes('profile') || myPerms.includes('admin')

  let users   = $state([])
  let loading = $state(true)
  let error   = $state('')
  let search  = $state('')

  const permLabel = key => PERMISSIONS.find(p => p.key === key)?.label ?? key

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  })

  onMount(async () => {
    if (!allowed) { goto('/home'); return }
    try {
      const snap = await getDocs(collection(db, 'user'))
      users = snap.docs
        .map(d => {
          const data = d.data()
          return {
            uid: d.id,
            name: data.name ?? '',
            email: data.email ?? '',
            phone: data.phone ?? '',
            permissions: Array.isArray(data.permissions) ? data.permissions : [],
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch (err) {
      error = $online ? err.message : 'You are offline — the member list needs a connection.'
    }
    loading = false
  })
</script>

<div class="w-screen min-h-screen bg-gray-100 p-4 md:px-16 md:py-8">
  <button onclick={() => goto('/home')} title="Home">
    <AIcon path={mdiHome} size="36px" class="text-gray-500"></AIcon>
  </button>
  <div class="flex items-baseline gap-3 my-3">
    <div class="text-2xl font-bold">Users</div>
    {#if !loading && !error}<div class="text-sm text-gray-500">{users.length}</div>{/if}
  </div>

  {#if loading}
    <div class="text-gray-400">Loading…</div>
  {:else if error}
    <div class="text-red-500">{error}</div>
  {:else}
    <input
      class="w-full sm:max-w-md px-3 py-2 rounded border mb-3"
      type="search" placeholder="Search by name or email" bind:value={search}
    >
    {#each filtered as u (u.uid)}
      <button
        class="w-full text-left px-4 py-2 bg-white shadow rounded my-2 flex items-center gap-3 sm:max-w-2xl"
        onclick={() => goto('/profile?uid=' + encodeURIComponent(u.uid))}
      >
        <div class="min-w-0 grow">
          <div class="font-bold truncate">{u.name || '(no name)'}</div>
          <div class="text-sm text-gray-600 truncate">{u.email}{u.phone ? ', ' + u.phone : ''}</div>
          {#if u.permissions.length}
            <div class="flex flex-wrap gap-1 mt-1">
              {#each u.permissions as p}
                <span class="text-xs font-semibold rounded-full px-2 py-0.5 {p === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">{permLabel(p)}</span>
              {/each}
            </div>
          {/if}
        </div>
        <AIcon path={mdiChevronRight} class="text-gray-400 shrink-0" />
      </button>
    {:else}
      <div class="text-gray-400">No one matches “{search}”.</div>
    {/each}
  {/if}
</div>
