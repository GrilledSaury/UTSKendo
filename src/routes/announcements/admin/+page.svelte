<script>
  import { onMount } from 'svelte'
  import {
    addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc,
  } from 'firebase/firestore'
  import { goto } from '$app/navigation'
  import Swal from 'sweetalert2'
  import { AIcon } from 'ace.svelte'
  import { mdiArrowLeft, mdiPlus, mdiPencil, mdiDelete, mdiBullhorn } from '@mdi/js'
  import { db } from '$lib/firebase'
  import { userProfile } from '$lib/stores'
  import { online } from '$lib/sync'
  import { fmtDateTime } from '$lib/club'
  import MarkdownEditor from '$lib/components/MarkdownEditor.svelte'

  const TITLE_MAX   = 120
  const CONTENT_MAX = 20000

  let items   = $state([])
  let loading = $state(true)
  let error   = $state('')

  // Editor modal: null when closed; id is null for a new announcement
  let editing = $state(null)   // { id, title, content, original: { title, content } }
  let saving  = $state(false)

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, 'announcement'), orderBy('publishedAt', 'desc')))
      items = snap.docs.map(d => {
        const data = d.data({ serverTimestamps: 'estimate' })
        return {
          id: d.id,
          title: data.title ?? '',
          content: data.content ?? '',
          publishedAt: data.publishedAt?.toDate() ?? null,
          updatedAt: data.updatedAt?.toDate() ?? null,
        }
      })
      error = ''
    } catch (err) {
      error = $online ? err.message : 'You are offline — reconnect to manage announcements.'
    }
    loading = false
  }

  onMount(() => {
    if (!$userProfile.permissions?.includes('announcement')) { goto('/home'); return }
    load()
  })

  function openEditor(a) {
    const title = a?.title ?? '', content = a?.content ?? ''
    editing = { id: a?.id ?? null, title, content, original: { title, content } }
  }

  const isDirty = () => editing.title !== editing.original.title || editing.content !== editing.original.content

  async function closeEditor() {
    if (isDirty()) {
      const { isConfirmed } = await Swal.fire({
        title: 'Discard changes?',
        confirmButtonText: 'Discard',
        confirmButtonColor: '#ef4444',
        showCancelButton: true,
        cancelButtonText: 'Keep editing',
      })
      if (!isConfirmed) return
    }
    editing = null
  }

  async function save() {
    const title = editing.title.trim(), content = editing.content.trim()
    if (!title)   { Swal.fire('Title is required', '', 'warning'); return }
    if (!content) { Swal.fire('Content is required', '', 'warning'); return }
    if (content.length > CONTENT_MAX) { Swal.fire('Too long', `Keep the content under ${CONTENT_MAX.toLocaleString()} characters.`, 'warning'); return }
    if (!$online) { Swal.fire('You are offline', 'Reconnect and try again — your text is still here.', 'warning'); return }

    saving = true
    try {
      if (editing.id) {
        // Editing keeps the original published time
        await updateDoc(doc(db, 'announcement', editing.id), { title, content, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, 'announcement'), { title, content, publishedAt: serverTimestamp(), author: $userProfile.uid })
      }
      editing = null
      await load()
    } catch (err) {
      Swal.fire('Could not save', err.code === 'permission-denied' ? 'You do not have permission to manage announcements.' : err.message, 'error')
    }
    saving = false
  }

  async function remove(a) {
    const { isConfirmed } = await Swal.fire({
      title: 'Remove announcement?',
      text: `“${a.title}” will be removed for everyone.`,
      icon: 'warning',
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
      showCancelButton: true,
    })
    if (!isConfirmed) return
    if (!$online) { Swal.fire('You are offline', 'Reconnect and try again.', 'warning'); return }
    try {
      await deleteDoc(doc(db, 'announcement', a.id))
      items = items.filter(i => i.id !== a.id)
    } catch (err) {
      Swal.fire('Could not remove', err.message, 'error')
    }
  }
</script>

<div class="w-screen min-h-screen bg-gray-100 p-4 md:px-16 md:py-8">
  <button onclick={() => goto('/announcements')} title="Back to announcements">
    <AIcon path={mdiArrowLeft} size="36px" class="text-gray-500" />
  </button>
  <div class="flex items-center gap-3 my-3 sm:max-w-2xl">
    <div class="text-2xl font-bold grow">Manage Announcements</div>
    <button class="bg-blue-500 text-white font-bold rounded px-3 py-1.5 flex items-center gap-1 shrink-0" onclick={() => openEditor(null)}>
      <AIcon path={mdiPlus} size="20px" />Add
    </button>
  </div>

  {#if loading}
    <div class="text-gray-400">Loading…</div>
  {:else if error}
    <div class="text-red-500">{error}</div>
  {:else}
    {#each items as a (a.id)}
      <div class="px-4 py-3 bg-white shadow rounded my-2 flex items-center gap-2 sm:max-w-2xl">
        <AIcon path={mdiBullhorn} class="text-orange-500 shrink-0" />
        <div class="min-w-0 grow">
          <div class="font-bold">{a.title}</div>
          <div class="text-xs text-gray-500 mt-0.5">
            {a.publishedAt ? fmtDateTime(a.publishedAt) : ''}{a.updatedAt ? ` · edited ${fmtDateTime(a.updatedAt)}` : ''}
          </div>
        </div>
        <button class="p-2 text-blue-500 shrink-0" onclick={() => openEditor(a)} title="Edit" aria-label="Edit"><AIcon path={mdiPencil} /></button>
        <button class="p-2 text-red-500 shrink-0" onclick={() => remove(a)} title="Remove" aria-label="Remove"><AIcon path={mdiDelete} /></button>
      </div>
    {:else}
      <div class="text-gray-400">No announcements yet. Tap Add to publish the first one.</div>
    {/each}
  {/if}
</div>

{#if editing}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
    <div class="bg-white rounded shadow-lg w-full max-w-3xl flex flex-col" style="max-height:95vh" role="dialog" aria-modal="true">
      <div class="p-4 font-bold text-xl border-b">{editing.id ? 'Edit announcement' : 'New announcement'}</div>
      <div class="p-4 flex flex-col gap-3 overflow-y-auto">
        <label class="block">
          <div class="text-sm text-gray-600 mb-1">Title</div>
          <input class="w-full px-3 py-2 rounded border" bind:value={editing.title} maxlength={TITLE_MAX} placeholder="e.g. No training this Friday">
        </label>
        <div>
          <div class="text-sm text-gray-600 mb-1">Content</div>
          <MarkdownEditor bind:value={editing.content} />
        </div>
      </div>
      <div class="p-4 border-t flex items-center justify-end gap-3">
        <button class="px-4 py-1.5 text-gray-600" onclick={closeEditor} disabled={saving}>Cancel</button>
        <button class="bg-blue-500 text-white font-bold rounded px-4 py-1.5 disabled:opacity-50" onclick={save} disabled={saving}>
          {saving ? 'Saving…' : editing.id ? 'Save' : 'Publish'}
        </button>
      </div>
    </div>
  </div>
{/if}
