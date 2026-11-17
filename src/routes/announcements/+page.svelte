<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { AIcon } from 'ace.svelte'
  import { mdiHome, mdiChevronRight, mdiClose, mdiPencil, mdiBullhorn } from '@mdi/js'
  import { userProfile } from '$lib/stores'
  import { online } from '$lib/sync'
  import { fmtDateTime } from '$lib/club'
  import { fetchAnnouncements, markViewed, syncViewed } from '$lib/announcements'
  import Markdown from '$lib/components/Markdown.svelte'

  const canManage = $userProfile.permissions?.includes('announcement')

  let items   = $state([])
  let loading = $state(true)
  let error   = $state('')
  let open    = $state(null)       // the announcement shown in the modal
  let tab     = $state('unviewed') // 'unviewed' | 'viewed'

  let viewed        = $derived(new Set($userProfile.viewedAnnouncements ?? []))
  let unviewedItems = $derived(items.filter(a => !viewed.has(a.id)))
  let viewedItems   = $derived(items.filter(a => viewed.has(a.id)))
  let shown         = $derived(tab === 'unviewed' ? unviewedItems : viewedItems)

  function show(a) {
    open = a
    markViewed(a.id)   // moves it to the Viewed tab
  }

  onMount(async () => {
    try {
      // Offline, this is answered from Firestore's local cache (whatever was last seen)
      const { items: list, fromServer } = await fetchAnnouncements()
      items = list
      await syncViewed(list, fromServer)
      if (unviewedItems.length === 0 && viewedItems.length > 0) tab = 'viewed'
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
    <div class="flex border-b border-gray-300 mb-2 sm:max-w-2xl" role="tablist">
      <button
        role="tab" aria-selected={tab === 'unviewed'}
        class="px-4 py-2 font-semibold border-b-2 -mb-px flex items-center gap-2 {tab === 'unviewed' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}"
        onclick={() => tab = 'unviewed'}
      >
        Unviewed
        {#if unviewedItems.length}
          <span class="text-xs font-bold rounded-full px-2 py-0.5 bg-red-500 text-white">{unviewedItems.length}</span>
        {/if}
      </button>
      <button
        role="tab" aria-selected={tab === 'viewed'}
        class="px-4 py-2 font-semibold border-b-2 -mb-px {tab === 'viewed' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}"
        onclick={() => tab = 'viewed'}
      >Viewed</button>
    </div>

    {#each shown as a (a.id)}
      <button
        class="w-full text-left px-4 py-3 bg-white shadow rounded my-2 flex items-center gap-3 sm:max-w-2xl"
        onclick={() => show(a)}
      >
        <AIcon path={mdiBullhorn} class="text-orange-500 shrink-0" />
        <div class="min-w-0 grow">
          <div class="font-bold">{a.title}</div>
          <div class="text-xs text-gray-500 mt-0.5">{a.publishedAt ? fmtDateTime(a.publishedAt) : ''}</div>
        </div>
        <AIcon path={mdiChevronRight} class="text-gray-400 shrink-0" />
      </button>
    {:else}
      <div class="text-gray-400 py-2">
        {#if tab === 'unviewed'}
          {items.length ? "You're all caught up." : 'No announcements yet.'}
        {:else}
          Announcements you open will appear here.
        {/if}
      </div>
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
