<script>
  import { onMount } from 'svelte'
  import { collection, getDocs, orderBy, query } from 'firebase/firestore'
  import { goto } from '$app/navigation'
  import { AIcon } from 'ace.svelte'
  import { mdiHome, mdiChevronRight, mdiClose, mdiPencil, mdiBullhorn } from '@mdi/js'
  import { db } from '$lib/firebase'
  import { userProfile } from '$lib/stores'
  import { online } from '$lib/sync'
  import { fmtDateTime } from '$lib/club'
  import Markdown from '$lib/components/Markdown.svelte'

  const canManage = $userProfile.permissions?.includes('announcement')

  let items   = $state([])
  let loading = $state(true)
  let error   = $state('')
  let open    = $state(null)   // the announcement shown in the modal

  onMount(async () => {
    try {
      // Offline, this is answered from Firestore's local cache (whatever was last seen)
      const snap = await getDocs(query(collection(db, 'announcement'), orderBy('publishedAt', 'desc')))
      items = snap.docs.map(d => {
        const data = d.data({ serverTimestamps: 'estimate' })
        return { id: d.id, title: data.title ?? '', content: data.content ?? '', publishedAt: data.publishedAt?.toDate() ?? null }
      })
    } catch (err) {
      error = $online ? err.message : 'You are offline — announcements will load when you reconnect.'
    }
    loading = false
  })
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape') open = null }} />

<div class="w-screen min-h-screen bg-gray-100 p-4 md:px-16 md:py-8">
  <div class="flex items-center justify-between">
    <button onclick={() => goto('/home')} title="Home">
      <AIcon path={mdiHome} size="36px" class="text-gray-500" />
    </button>
    {#if canManage}
      <button class="flex items-center gap-1 text-sm font-semibold text-blue-600" onclick={() => goto('/announcements/admin')}>
        <AIcon path={mdiPencil} size="18px" />Manage
      </button>
    {/if}
  </div>
  <div class="text-2xl font-bold my-3">Announcements</div>

  {#if loading}
    <div class="text-gray-400">Loading…</div>
  {:else if error}
    <div class="text-red-500">{error}</div>
  {:else}
    {#each items as a (a.id)}
      <button
        class="w-full text-left px-4 py-3 bg-white shadow rounded my-2 flex items-center gap-3 sm:max-w-2xl"
        onclick={() => open = a}
      >
        <AIcon path={mdiBullhorn} class="text-orange-500 shrink-0" />
        <div class="min-w-0 grow">
          <div class="font-bold">{a.title}</div>
          <div class="text-xs text-gray-500 mt-0.5">{a.publishedAt ? fmtDateTime(a.publishedAt) : ''}</div>
        </div>
        <AIcon path={mdiChevronRight} class="text-gray-400 shrink-0" />
      </button>
    {:else}
      <div class="text-gray-400">No announcements yet.</div>
    {/each}
  {/if}
</div>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onclick={e => { if (e.target === e.currentTarget) open = null }}>
    <div class="bg-white rounded shadow-lg w-full max-w-2xl flex flex-col" style="max-height:90vh" role="dialog" aria-modal="true">
      <div class="p-4 border-b flex items-start gap-3">
        <div class="min-w-0 grow">
          <div class="font-bold text-xl">{open.title}</div>
          <div class="text-xs text-gray-500 mt-0.5">{open.publishedAt ? fmtDateTime(open.publishedAt) : ''}</div>
        </div>
        <button class="shrink-0 text-gray-500" onclick={() => open = null} title="Close" aria-label="Close">
          <AIcon path={mdiClose} />
        </button>
      </div>
      <div class="p-4 overflow-y-auto">
        <Markdown source={open.content} />
      </div>
    </div>
  </div>
{/if}
