<script>
  import { onDestroy } from 'svelte'
  import jsQR from 'jsqr'
  import { AIcon } from 'ace.svelte'
  import { mdiHome, mdiCheck, mdiClose, mdiCloudUploadOutline, mdiQrcodeScan } from '@mdi/js'
  import { goto, afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import { userProfile } from '$lib/stores'
  import { parseQrText, payloadFromParams, checkWindow } from '$lib/qr'
  import { recordScan, pending } from '$lib/sync'
  import { sessionIdToDate, fmtDate, fmtShortDate, fmtTime } from '$lib/club'

  const MAX_FRAME   = 720   // px on the long edge; smaller frames decode much faster
  const SCAN_EVERY  = 150   // ms between decode attempts

  // 'scanning' | 'saving' | 'synced' | 'already' | 'pending' | 'rejected' | 'invalid' | 'camera-error'
  let status   = $state('scanning')
  let message  = $state('')
  let hint     = $state('')    // shown under the camera when a QR is read but isn't one of ours
  let payload  = $state(null)

  let video  = $state()
  let stream = null
  let raf    = null
  let lastAttempt = 0
  const canvas = document.createElement('canvas')

  let sessionDate = $derived(payload ? sessionIdToDate(payload.sessionId) : null)

  async function startCamera() {
    payload = null
    message = ''
    hint    = ''
    status  = 'scanning'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      video.srcObject = stream
      await video.play()
      raf = requestAnimationFrame(tick)
    } catch (err) {
      stopCamera()
      message = err?.name === 'NotAllowedError'
        ? 'Camera access was denied. Allow camera access for this site, or scan the code with your phone’s camera app instead.'
        : 'Could not open the camera. You can scan the code with your phone’s camera app instead.'
      status = 'camera-error'
    }
  }

  function stopCamera() {
    if (raf) cancelAnimationFrame(raf)
    raf = null
    stream?.getTracks().forEach(t => t.stop())
    stream = null
  }

  function tick(ts) {
    raf = requestAnimationFrame(tick)
    if (ts - lastAttempt < SCAN_EVERY || !video || video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) return
    lastAttempt = ts

    const scale = Math.min(1, MAX_FRAME / Math.max(video.videoWidth, video.videoHeight))
    canvas.width  = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code  = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
    if (!code?.data) return

    const parsed = parseQrText(code.data)
    if (!parsed) { hint = 'That isn’t a club attendance QR code.'; return }
    stopCamera()
    handle(parsed)
  }

  // Validate on the device (works with no network), save locally, then try to submit
  async function handle(p) {
    payload = p
    const check = checkWindow(p)
    if (!check.ok) {
      message = check.reason === 'early'
        ? `Check-in for this session opens at ${fmtTime(p.windowStart)} on ${fmtShortDate(p.windowStart)}.`
        : `Check-in for this session closed at ${fmtTime(p.windowEnd)} on ${fmtShortDate(p.windowEnd)}.`
      status = 'invalid'
      return
    }
    status = 'saving'
    try {
      status = await recordScan($userProfile.uid, p)
      if (status === 'rejected') {
        message = $pending.find(i => i.sessionId === p.sessionId)?.error ?? 'The server did not accept this check-in.'
      }
    } catch (err) {
      message = 'Could not save the check-in on this device: ' + err.message
      status  = 'invalid'
    }
  }

  // Runs on first load and again whenever this page is re-opened with a different QR link
  afterNavigate(() => {
    stopCamera()
    // Opened from the phone's own camera app: the QR link carries the payload
    const params = page.url.searchParams
    if (params.has('s')) {
      const p = payloadFromParams(params)
      if (p) handle(p)
      else { payload = null; message = 'This QR code is not valid.'; status = 'invalid' }
      return
    }
    startCamera()
  })

  onDestroy(stopCamera)
</script>

<div class="min-h-screen w-screen bg-gray-100 flex flex-col p-4 md:px-16 md:py-8">
  <div>
    <button onclick={() => goto('/home')}>
      <AIcon path={mdiHome} size="36px" class="text-gray-500" />
    </button>
  </div>
  <div class="text-2xl font-bold mt-4 mb-4">Scan Attendance</div>

  <div class="grow flex flex-col items-center">

    <!-- The <video> stays mounted so the camera can be restarted without re-binding it -->
    <div class="w-full max-w-sm {status === 'scanning' ? '' : 'hidden'}">
      <div class="relative rounded-lg overflow-hidden bg-black aspect-square shadow">
        <video bind:this={video} class="w-full h-full object-cover" playsinline muted></video>
        <div class="absolute inset-8 border-2 border-white/70 rounded-lg pointer-events-none"></div>
      </div>
      <div class="text-center text-sm mt-3 {hint ? 'text-red-500' : 'text-gray-500'}">
        {hint || 'Point the camera at the session QR code'}
      </div>
    </div>

    {#if status !== 'scanning'}
      <div class="bg-white rounded shadow w-full max-w-sm p-6 text-center">

        {#if status === 'saving'}
          <div class="text-gray-400">Saving…</div>

        {:else if status === 'synced'}
          <div class="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <AIcon path={mdiCheck} class="text-green-500" size="32px" />
          </div>
          <div class="font-bold text-xl text-green-600 mb-1">Attendance marked!</div>

        {:else if status === 'already'}
          <div class="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <AIcon path={mdiCheck} class="text-blue-500" size="32px" />
          </div>
          <div class="font-bold text-xl mb-1">Already marked</div>

        {:else if status === 'pending'}
          <div class="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AIcon path={mdiCloudUploadOutline} class="text-amber-500" size="32px" />
          </div>
          <div class="font-bold text-xl text-amber-600 mb-1">Saved — pending</div>
          <div class="text-gray-500 text-sm mb-2">
            Your check-in is saved on this phone and will be submitted automatically when you're back online.
          </div>

        {:else}
          <!-- rejected | invalid | camera-error -->
          <div class="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AIcon path={mdiClose} class="text-red-500" size="32px" />
          </div>
          <div class="font-bold text-xl mb-2">
            {status === 'camera-error' ? 'Camera unavailable' : 'Check-in not recorded'}
          </div>
          <div class="text-gray-500 text-sm mb-2">{message}</div>
        {/if}

        {#if sessionDate && status !== 'saving'}
          <div class="text-gray-500 text-sm">{fmtDate(sessionDate)}</div>
        {/if}

        {#if status !== 'saving'}
          <div class="mt-6 flex items-center justify-center gap-6 text-sm text-blue-500">
            {#if status === 'pending' || status === 'rejected'}
              <button class="flex items-center gap-1" onclick={() => goto('/pending')}>
                <AIcon path={mdiCloudUploadOutline} size="18px" />Pending
              </button>
            {/if}
            {#if status === 'invalid' || status === 'rejected' || status === 'camera-error'}
              <button class="flex items-center gap-1" onclick={startCamera}>
                <AIcon path={mdiQrcodeScan} size="18px" />Scan again
              </button>
            {/if}
            <button class="flex items-center gap-1" onclick={() => goto('/home')}>
              <AIcon path={mdiHome} size="18px" />Home
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
