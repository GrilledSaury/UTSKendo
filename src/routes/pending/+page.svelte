<script>
  import { AIcon } from 'ace.svelte'
  import { mdiHome, mdiCloudUploadOutline, mdiDelete, mdiAlertCircleOutline, mdiClockOutline, mdiWifiOff } from '@mdi/js'
  import { goto } from '$app/navigation'
  import Swal from 'sweetalert2'
  import { pending, syncing, online, syncNow, dismiss } from '$lib/sync'
  import { sessionIdToDate, fmtDate, fmtShortDate, fmtTime } from '$lib/club'

  let note = $state('')

  async function submitNow() {
    note = ''
    const results = Object.values(await syncNow({ retryRejected: true }))
    const done = results.filter(r => r === 'synced' || r === 'already').length
    const left = results.length - done
    if (left === 0) note = 'All check-ins submitted.'
    else if (!$online) note = 'Still offline — your check-ins will be submitted when you reconnect.'
    else note = `${done} submitted, ${left} could not be submitted.`
  }

  async function removeItem(item) {
    const { isConfirmed } = await Swal.fire({
      title: 'Remove check-in?',
      text: item.error
        ? 'This check-in was not accepted and will be discarded.'
        : 'This check-in has not been submitted yet. If you remove it, your attendance for this session will not be recorded.',
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
      showCancelButton: true,
    })
    if (isConfirmed) await dismiss(item)
  }

  function sessionLabel(item) {
    const d = sessionIdToDate(item.sessionId)
    return d ? fmtDate(d) : item.sessionId
  }
  function scannedLabel(item) {
    const d = new Date(item.scannedAt)
    return `${fmtShortDate(d)}, ${fmtTime(d)}`
  }
</script>

<div class="w-screen min-h-screen bg-gray-100 p-4 md:px-16 md:py-8">

  <button onclick={() => goto('/home')}>
    <AIcon path={mdiHome} size="36px" class="text-gray-500" />
  </button>

  <div class="flex items-center gap-3 mt-4 mb-2 flex-wrap">
    <div class="text-2xl font-bold grow">Pending Check-ins</div>
    {#if !$online}
      <span class="flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-200 rounded-full px-2 py-1">
        <AIcon path={mdiWifiOff} size="14px" />Offline
      </span>
    {/if}
  </div>
  <p class="text-sm text-gray-500 mb-4 max-w-xl">
    Check-ins you scanned that haven't reached the server yet. They are submitted automatically when you're online.
  </p>

  {#if $pending.length === 0}
    <div class="text-gray-400 text-center mt-16">{note || 'Nothing pending — all your check-ins have been submitted.'}</div>
  {:else}
    <button
      class="bg-blue-500 text-white font-bold px-4 py-2 rounded shadow text-sm flex items-center gap-2 disabled:opacity-50 mb-3"
      onclick={submitNow}
      disabled={$syncing}
    >
      <AIcon path={mdiCloudUploadOutline} size="18px" />{$syncing ? 'Submitting…' : 'Submit now'}
    </button>
    {#if note}<div class="text-sm text-gray-500 mb-3">{note}</div>{/if}

    <div class="flex flex-col gap-2 max-w-xl">
      {#each $pending as item (item.key)}
        <div class="bg-white rounded shadow-sm px-4 py-3 flex items-center gap-3">
          <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 {item.error ? 'bg-red-100' : 'bg-amber-100'}">
            <AIcon path={item.error ? mdiAlertCircleOutline : mdiClockOutline} size="18px" class={item.error ? 'text-red-500' : 'text-amber-500'} />
          </div>
          <div class="grow min-w-0">
            <div class="font-medium text-sm">{sessionLabel(item)}</div>
            <div class="text-xs text-gray-400">scanned {scannedLabel(item)}</div>
            {#if item.error}
              <div class="text-xs text-red-500 mt-0.5">Not accepted: {item.error}</div>
            {:else}
              <div class="text-xs text-amber-600 mt-0.5">Pending</div>
            {/if}
          </div>
          <button class="text-red-400 p-1 shrink-0" onclick={() => removeItem(item)} title="Remove">
            <AIcon path={mdiDelete} />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
