<script>
  import { onMount } from 'svelte'
  import { db } from '$lib/firebase'
  import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch,
    query, where, orderBy, Timestamp, documentId,
  } from 'firebase/firestore'
  import { AIcon } from 'ace.svelte'
  import {
    mdiHome, mdiPlus, mdiDelete, mdiQrcode, mdiPencil, mdiCog, mdiFilePdfBox,
    mdiChevronLeft, mdiChevronRight, mdiRefresh, mdiPrinter,
    mdiAccountMultiple, mdiCheck, mdiClose,
  } from '@mdi/js'
  import { goto } from '$app/navigation'
  import { userProfile } from '$lib/stores'
  import Swal from 'sweetalert2'
  import QRCode from 'qrcode'
  import { jsPDF } from 'jspdf'
  import {
    CLUB_NAME, DEFAULT_LOCATION, DEFAULT_SETTINGS, OPEN_BEFORE_MINS, DAY_FULL, COLORS, COLORS_MAP,
    labelTw, dateKey, sessionIdFor, checkinWindow, fmtDate, fmtShortDate, fmtTime,
  } from '$lib/club'
  import { buildScanUrl } from '$lib/qr'

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const WEEK_ORDER  = [1, 2, 3, 4, 5, 6, 0]  // Mon … Sun
  const WINDOW_TEXT = {
    day:  'until the end of the training day (11:59 pm)',
    week: 'until the end of the training week (Sunday 11:59 pm)',
  }

  const now = new Date()
  let selectedYear  = $state(now.getFullYear())
  let selectedMonth = $state(now.getMonth())

  let sessions = $state([])  // { id, start, end, trainingStart, trainingEnd, passcode, label, color, type, location }
  let loading  = $state(true)

  // ── Settings (config/attendance) ───────────────────────────────────────────

  let settings       = $state({ ...DEFAULT_SETTINGS })
  let showSettings   = $state(false)
  let settingsForm   = $state(null)  // { windowMode, days: [{ dow, on, start, end }] }
  let savingSettings = $state(false)

  let scheduleDays = $derived(WEEK_ORDER.filter(d => settings.schedule[d]))
  let scheduleSummary = $derived(
    scheduleDays.map(d => `${DAY_FULL[d].slice(0, 3)} ${settings.schedule[d].start}–${settings.schedule[d].end}`).join(', ')
  )

  async function loadSettings() {
    const snap = await getDoc(doc(db, 'config', 'attendance'))
    if (snap.exists()) settings = { ...DEFAULT_SETTINGS, ...snap.data() }
  }

  function openSettings() {
    settingsForm = {
      windowMode: settings.windowMode,
      days: WEEK_ORDER.map(dow => ({
        dow,
        on:    !!settings.schedule[dow],
        start: settings.schedule[dow]?.start ?? '19:00',
        end:   settings.schedule[dow]?.end   ?? '21:00',
      })),
    }
    showSettings = true
  }

  async function saveSettings() {
    if (savingSettings) return
    const bad = settingsForm.days.find(d => d.on && (!d.start || !d.end || d.end <= d.start))
    if (bad) { Swal.fire('Check the times', `${DAY_FULL[bad.dow]}: training must end after it starts.`, 'warning'); return }
    savingSettings = true
    try {
      const next = {
        windowMode: settingsForm.windowMode,
        schedule: Object.fromEntries(settingsForm.days.filter(d => d.on).map(d => [d.dow, { start: d.start, end: d.end }])),
      }
      await setDoc(doc(db, 'config', 'attendance'), next)
      settings = next
      showSettings = false
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
    savingSettings = false
  }

  // ── Label / location inline editing ────────────────────────────────────────

  let editingLabel     = $state(null)  // sessionId | null
  let labelInput       = $state('')
  let labelColorInput  = $state('purple')

  let editingLocation = $state(null)  // sessionId | null
  let locationInput   = $state('')

  function focusEl(node) { node.focus() }

  function startEditLabel(session) {
    editingLabel    = session.id
    labelInput      = session.label ?? ''
    labelColorInput = session.color || 'purple'
  }

  function startEditLocation(session) {
    editingLocation = session.id
    locationInput   = session.location ?? ''
  }

  async function saveLocation(session) {
    const location = locationInput.trim()
    try {
      await updateDoc(doc(db, 'session', session.id), { location })
      sessions = sessions.map(s => s.id === session.id ? { ...s, location } : s)
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
    editingLocation = null
  }

  async function saveLabel(session) {
    const label = labelInput.trim()
    const color = label ? labelColorInput : ''
    try {
      await updateDoc(doc(db, 'session', session.id), { label, color })
      sessions = sessions.map(s => s.id === session.id ? { ...s, label, color } : s)
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
    editingLabel = null
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  const blankAddForm = () => ({ date: '', trainingStart: '19:00', trainingEnd: '21:00', type: 'training', label: '', labelColor: 'purple', location: DEFAULT_LOCATION })
  let showAddModal  = $state(false)
  let addForm       = $state(blankAddForm())
  let savingSession = $state(false)

  // Each session gets its own random passcode; it only ever leaves Firestore inside the printed QR
  function makePasscode() {
    return Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async function loadSessions() {
    loading = true
    const mm    = String(selectedMonth + 1).padStart(2, '0')
    const start = `${selectedYear}-${mm}-01`
    const end   = `${selectedYear}-${mm}-32`
    try {
      const snap = await getDocs(query(
        collection(db, 'session'),
        where(documentId(), '>=', start),
        where(documentId(), '<=', end),
        orderBy(documentId()),
      ))
      const secretSnaps = await Promise.all(
        snap.docs.map(d => getDoc(doc(db, 'sessionSecret', d.id)))
      )
      sessions = snap.docs.map((d, i) => ({
        id:            d.id,
        start:         d.data().start.toDate(),
        end:           d.data().end.toDate(),
        trainingStart: d.data().trainingStart.toDate(),
        trainingEnd:   d.data().trainingEnd.toDate(),
        passcode:      secretSnaps[i].exists() ? secretSnaps[i].data().passcode : '',
        label:         d.data().label ?? '',
        color:         d.data().color ?? '',
        type:          d.data().type ?? 'training',
        location:      d.data().location ?? '',
      }))
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
    loading = false
  }

  // Writes the session and its passcode together so a training session can never exist without a QR
  async function createTraining(trainStart, trainEnd, extra) {
    const id  = sessionIdFor(trainStart)
    const win = checkinWindow(trainStart, settings.windowMode)
    const batch = writeBatch(db)
    batch.set(doc(db, 'session', id), {
      start:         Timestamp.fromDate(win.start),
      end:           Timestamp.fromDate(win.end),
      trainingStart: Timestamp.fromDate(trainStart),
      trainingEnd:   Timestamp.fromDate(trainEnd),
      type:          'training',
      ...extra,
    })
    batch.set(doc(db, 'sessionSecret', id), { passcode: makePasscode() })
    await batch.commit()
  }

  async function generateStandard() {
    if (scheduleDays.length === 0) { openSettings(); return }
    const existing = new Set(sessions.map(s => s.id))
    const toCreate = []
    const d = new Date(selectedYear, selectedMonth, 1)
    while (d.getMonth() === selectedMonth) {
      const slot = settings.schedule[d.getDay()]
      if (slot && !existing.has(sessionIdFor(d))) toCreate.push({ date: dateKey(d), ...slot })
      d.setDate(d.getDate() + 1)
    }
    if (toCreate.length === 0) {
      Swal.fire('All sessions already exist', '', 'info')
      return
    }
    loading = true
    try {
      for (const s of toCreate) {
        await createTraining(new Date(`${s.date}T${s.start}:00`), new Date(`${s.date}T${s.end}:00`), { location: DEFAULT_LOCATION })
      }
      Swal.fire('Generated!', `${toCreate.length} sessions created`, 'success')
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
    await loadSessions()
  }

  async function saveCustomSession() {
    if (!addForm.date || !addForm.trainingStart || !addForm.trainingEnd) return
    if (savingSession) return
    const trainStart = new Date(`${addForm.date}T${addForm.trainingStart}:00`)
    const trainEnd   = new Date(`${addForm.date}T${addForm.trainingEnd}:00`)
    if (trainEnd <= trainStart) { Swal.fire('Check the times', 'The end time must be after the start time.', 'warning'); return }

    savingSession = true
    try {
      const id = sessionIdFor(trainStart)
      // One session per day: saving over an existing one would replace its passcode and orphan printed QR codes
      if ((await getDoc(doc(db, 'session', id))).exists()) {
        Swal.fire('Already exists', `There is already a session on ${fmtDate(trainStart)}. Delete it first to replace it.`, 'warning')
        savingSession = false
        return
      }
      const labelTrim = addForm.label.trim()
      const extra = {
        location: addForm.location.trim(),
        ...(labelTrim ? { label: labelTrim, color: addForm.labelColor } : {}),
      }
      if (addForm.type === 'event') {
        // Events only appear on the calendar — no check-in, so no passcode
        await setDoc(doc(db, 'session', id), {
          start:         Timestamp.fromDate(trainStart),
          end:           Timestamp.fromDate(trainEnd),
          trainingStart: Timestamp.fromDate(trainStart),
          trainingEnd:   Timestamp.fromDate(trainEnd),
          type:          'event',
          ...extra,
        })
      } else {
        await createTraining(trainStart, trainEnd, extra)
      }
      showAddModal = false
      // Jump to the month the new session is in
      selectedYear  = trainStart.getFullYear()
      selectedMonth = trainStart.getMonth()
      await loadSessions()
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
    savingSession = false
  }

  async function deleteSession(session) {
    const { isConfirmed } = await Swal.fire({
      title: 'Delete session?',
      text: session.type === 'event'
        ? fmtDate(session.trainingStart)
        : `${fmtDate(session.trainingStart)} — its printed QR code will stop working. Check-ins already recorded are kept.`,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
      showCancelButton: true,
    })
    if (!isConfirmed) return
    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'session', session.id))
      batch.delete(doc(db, 'sessionSecret', session.id))
      await batch.commit()
      sessions = sessions.filter(s => s.id !== session.id)
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
  }

  // ── QR ─────────────────────────────────────────────────────────────────────

  let qrModal = $state(null)  // { session, dataUrl } | null

  let printable = $derived(sessions.filter(s => s.type !== 'event' && s.passcode))

  function closesText(session) {
    return `Check-in closes ${fmtShortDate(session.end)}, ${fmtTime(session.end)}`
  }

  async function openQR(session) {
    const dataUrl = await QRCode.toDataURL(buildScanUrl(window.location.origin, session), { width: 512, margin: 2 })
    qrModal = { session, dataUrl }
  }

  function downloadQR() {
    const a = document.createElement('a')
    a.href     = qrModal.dataUrl
    a.download = `QR-${qrModal.session.id}.png`
    a.click()
  }

  // One A4 page per session: date, time, QR
  async function addQrPage(pdf, session) {
    const W = 210, H = 297
    const qrSize = 160
    const qrX = (W - qrSize) / 2
    const qrY = (H - qrSize) / 2 - 5

    const dataUrl = await QRCode.toDataURL(buildScanUrl(window.location.origin, session), { width: 800, margin: 1 })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(12)
    pdf.setTextColor(150)
    pdf.text(CLUB_NAME, W / 2, qrY - 36, { align: 'center' })

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(20)
    pdf.setTextColor(0)
    pdf.text(fmtDate(session.trainingStart), W / 2, session.label ? qrY - 24 : qrY - 20, { align: 'center' })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(14)
    pdf.setTextColor(100)
    pdf.text(`${fmtTime(session.trainingStart)} – ${fmtTime(session.trainingEnd)}`, W / 2, session.label ? qrY - 14 : qrY - 10, { align: 'center' })

    if (session.label) {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      const [r, g, b] = (COLORS_MAP[session.color] ?? COLORS_MAP.purple).rgb
      pdf.setTextColor(r, g, b)
      pdf.text(session.label, W / 2, qrY - 5, { align: 'center' })
    }

    pdf.addImage(dataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(150)
    pdf.text('Scan to mark attendance', W / 2, qrY + qrSize + 10, { align: 'center' })
    pdf.text(closesText(session), W / 2, qrY + qrSize + 17, { align: 'center' })
    pdf.setTextColor(0)
  }

  const newPdf = () => new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  async function printBook() {
    const pdf = newPdf()
    for (let i = 0; i < printable.length; i++) {
      if (i > 0) pdf.addPage()
      await addQrPage(pdf, printable[i])
    }
    pdf.save(`QR-${MONTH_NAMES[selectedMonth]}-${selectedYear}.pdf`)
  }

  async function printOne(session) {
    const pdf = newPdf()
    await addQrPage(pdf, session)
    pdf.save(`QR-${session.id}.pdf`)
  }

  // ── Session attendance view ────────────────────────────────────────────────

  let viewModal    = $state(null)  // { session, rows: [{ uid, name, checkedIn, time, late }] }
  let viewLoading  = $state(false)
  let markModal    = $state(null)  // { row, session } — confirmation + time picker
  let markTime     = $state('')
  let marking      = $state(false)

  // A check-in that reached the server well after it was scanned was queued offline
  const LATE_SYNC_MS = 10 * 60 * 1000

  function sortRows(rows) {
    return rows.sort((a, b) => {
      if (a.checkedIn !== b.checkedIn) return a.checkedIn ? -1 : 1
      if (a.time && b.time) return a.time - b.time
      return a.name.localeCompare(b.name)
    })
  }

  // The time alone is ambiguous once check-in can happen on a later day
  function checkinLabel(time, session) {
    return dateKey(time) === dateKey(session.trainingStart) ? fmtTime(time) : `${fmtShortDate(time)}, ${fmtTime(time)}`
  }

  async function openView(session) {
    viewLoading = true
    viewModal   = { session, rows: [] }
    try {
      const usersSnap = await getDocs(collection(db, 'user'))
      const rows = await Promise.all(usersSnap.docs.map(async u => {
        const snap = await getDoc(doc(db, 'attendance', u.id, 'sessions', session.id))
        const data = snap.data()
        const time      = data?.t?.toDate() ?? null
        const submitted = data?.submittedAt?.toDate() ?? null
        return {
          uid:       u.id,
          name:      u.data().name ?? '',
          checkedIn: snap.exists(),
          time,
          manual:    data?.p === 'manual',
          late:      time && submitted && submitted - time > LATE_SYNC_MS ? submitted : null,
        }
      }))
      viewModal = { session, rows: sortRows(rows) }
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
      viewModal = null
    }
    viewLoading = false
  }

  function openMark(row) {
    const s = viewModal.session.trainingStart
    markTime  = `${String(s.getHours()).padStart(2,'0')}:${String(s.getMinutes()).padStart(2,'0')}`
    markModal = { row, session: viewModal.session }
  }

  async function confirmMark() {
    if (marking || !markTime) return
    marking = true
    try {
      const [h, m] = markTime.split(':').map(Number)
      const date   = new Date(markModal.session.trainingStart)
      date.setHours(h, m, 0, 0)
      await setDoc(
        doc(db, 'attendance', markModal.row.uid, 'sessions', markModal.session.id),
        { t: Timestamp.fromDate(date), p: 'manual', markedBy: $userProfile.uid },
      )
      const uid = markModal.row.uid
      viewModal.rows = sortRows(viewModal.rows.map(r => r.uid === uid ? { ...r, checkedIn: true, time: date, manual: true } : r))
      markModal = null
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
    marking = false
  }

  // ── Month nav ──────────────────────────────────────────────────────────────

  async function prevMonth() {
    if (selectedMonth === 0) { selectedMonth = 11; selectedYear-- } else selectedMonth--
    await loadSessions()
  }
  async function nextMonth() {
    if (selectedMonth === 11) { selectedMonth = 0; selectedYear++ } else selectedMonth++
    await loadSessions()
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  onMount(async () => {
    if (!$userProfile?.permissions?.includes('attendance')) { goto('/home'); return }
    try { await loadSettings() } catch (err) { Swal.fire('Error', err.message, 'error') }
    await loadSessions()
  })
</script>

<div class="w-screen min-h-screen bg-gray-100 p-4 md:px-16 md:py-8">

  <div class="flex items-center justify-between mb-6 mt-0">
    <button onclick={() => goto('/home')}>
      <AIcon path={mdiHome} size="36px" class="text-gray-500" />
    </button>
  </div>
  <div class="text-2xl font-bold mb-6">Sessions</div>

  <!-- Settings summary -->
  <div class="bg-white rounded shadow px-4 py-3 mb-6 flex items-center gap-3">
    <div class="grow min-w-0 text-sm">
      <div class="font-bold text-gray-500 mb-1">Club settings</div>
      <div class="text-gray-700">
        <span class="text-gray-400">Training days:</span>
        {scheduleSummary || 'not set yet'}
      </div>
      <div class="text-gray-700">
        <span class="text-gray-400">Check-in open:</span>
        from {OPEN_BEFORE_MINS} min before training {WINDOW_TEXT[settings.windowMode]}
      </div>
    </div>
    <button
      class="bg-gray-500 text-white font-bold px-3 py-1.5 rounded text-sm flex items-center gap-1 shrink-0"
      onclick={openSettings}
    >
      <AIcon path={mdiCog} size="18px" />Edit
    </button>
  </div>

  <!-- Month controls -->
  <div class="flex items-center flex-wrap gap-2 mb-4">
    <div class="flex items-center bg-white rounded shadow px-1 py-1">
      <button class="text-gray-600 p-1 disabled:opacity-40" onclick={prevMonth} disabled={loading}>
        <AIcon path={mdiChevronLeft} />
      </button>
      <span class="font-bold mx-2 w-44 text-center">{MONTH_NAMES[selectedMonth]} {selectedYear}</span>
      <button class="text-gray-600 p-1 disabled:opacity-40" onclick={nextMonth} disabled={loading}>
        <AIcon path={mdiChevronRight} />
      </button>
    </div>
    <button
      class="bg-blue-500 text-white font-bold px-3 py-1.5 rounded shadow text-sm flex items-center gap-1 disabled:opacity-50"
      onclick={generateStandard} disabled={loading}
    >
      <AIcon path={mdiRefresh} size="18px" />Generate Standard
    </button>
    <button
      class="bg-green-500 text-white font-bold px-3 py-1.5 rounded shadow text-sm flex items-center gap-1 disabled:opacity-50"
      onclick={() => { addForm = blankAddForm(); showAddModal = true }}
    >
      <AIcon path={mdiPlus} size="18px" />Add Custom
    </button>
    {#if printable.length > 0}
      <button
        class="bg-gray-700 text-white font-bold px-3 py-1.5 rounded shadow text-sm flex items-center gap-1"
        onclick={printBook}
      >
        <AIcon path={mdiPrinter} size="18px" />Print Book
      </button>
    {/if}
  </div>

  <!-- Session list -->
  {#if loading}
    <div class="text-gray-400 text-center mt-8">Loading...</div>
  {:else if sessions.length === 0}
    <div class="text-gray-400 text-center mt-8">
      No sessions for {MONTH_NAMES[selectedMonth]} {selectedYear}.<br/>
      {#if scheduleDays.length > 0}
        Click "Generate Standard" to create the regular training sessions.
      {:else}
        Set the club's training days under "Club settings", then click "Generate Standard".
      {/if}
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each sessions as session (session.id)}
        <div class="bg-white rounded shadow px-4 py-3 flex items-center gap-4">
          <div class="grow min-w-0">
            <div class="flex items-center gap-2">
              <div class="font-bold">{fmtDate(session.trainingStart)}</div>
              {#if session.type === 'event'}
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">Event</span>
              {/if}
            </div>
            <div class="text-sm text-gray-500">{fmtTime(session.trainingStart)} – {fmtTime(session.trainingEnd)}</div>
            {#if session.type !== 'event'}
              <div class="text-xs text-gray-400 mt-0.5">{closesText(session)}</div>
            {/if}
            <div class="mt-1.5 flex items-center gap-1.5">
              {#if editingLabel === session.id}
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-1">
                    <input
                      class="border rounded px-2 py-0.5 text-xs w-36"
                      bind:value={labelInput}
                      onkeydown={e => { if (e.key === 'Enter') saveLabel(session); if (e.key === 'Escape') editingLabel = null }}
                      use:focusEl
                    />
                    <button class="text-green-600 p-0.5" onclick={() => saveLabel(session)}>
                      <AIcon path={mdiCheck} size="14px" />
                    </button>
                    <button class="text-gray-400 p-0.5" onclick={() => editingLabel = null}>
                      <AIcon path={mdiClose} size="14px" />
                    </button>
                  </div>
                  <div class="flex gap-1">
                    {#each COLORS as c}
                      <button
                        class="w-4 h-4 rounded-full {c.swatch} {labelColorInput === c.key ? 'ring-2 ring-offset-1 ring-gray-400' : ''}"
                        onclick={() => labelColorInput = c.key}
                        aria-label={c.key}
                      ></button>
                    {/each}
                  </div>
                </div>
              {:else if session.label}
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full {labelTw(session.color)}">{session.label}</span>
                <button class="text-gray-300 hover:text-gray-500 p-0.5" onclick={() => startEditLabel(session)}>
                  <AIcon path={mdiPencil} size="12px" />
                </button>
              {:else}
                <button class="text-xs text-gray-300 hover:text-gray-500 flex items-center gap-0.5" onclick={() => startEditLabel(session)}>
                  <AIcon path={mdiPencil} size="12px" />label
                </button>
              {/if}
            </div>
            <!-- Location -->
            <div class="mt-1 flex items-center gap-1 min-w-0">
              {#if editingLocation === session.id}
                <input
                  class="border rounded px-2 py-0.5 text-xs grow min-w-0"
                  bind:value={locationInput}
                  onkeydown={e => { if (e.key === 'Enter') saveLocation(session); if (e.key === 'Escape') editingLocation = null }}
                  use:focusEl
                />
                <button class="text-green-600 p-0.5 shrink-0" onclick={() => saveLocation(session)}>
                  <AIcon path={mdiCheck} size="14px" />
                </button>
                <button class="text-gray-400 p-0.5 shrink-0" onclick={() => editingLocation = null}>
                  <AIcon path={mdiClose} size="14px" />
                </button>
              {:else if session.location}
                <span class="text-xs text-gray-400 truncate">{session.location}</span>
                <button class="text-gray-300 hover:text-gray-500 p-0.5 shrink-0" onclick={() => startEditLocation(session)}>
                  <AIcon path={mdiPencil} size="12px" />
                </button>
              {:else}
                <button class="text-xs text-gray-300 hover:text-gray-500 flex items-center gap-0.5" onclick={() => startEditLocation(session)}>
                  <AIcon path={mdiPencil} size="12px" />location
                </button>
              {/if}
            </div>
          </div>
          {#if session.type !== 'event'}
            <button class="text-green-600 p-1 shrink-0" onclick={() => openView(session)} title="View attendance">
              <AIcon path={mdiAccountMultiple} />
            </button>
            {#if session.passcode}
              <button class="text-indigo-500 p-1 shrink-0" onclick={() => openQR(session)} title="QR Code">
                <AIcon path={mdiQrcode} />
              </button>
            {/if}
          {/if}
          <button class="text-red-400 p-1 shrink-0" onclick={() => deleteSession(session)} title="Delete">
            <AIcon path={mdiDelete} />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Settings Modal -->
{#if showSettings}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded shadow-lg w-full max-w-md flex flex-col" style="max-height:90vh">
      <div class="p-4 font-bold text-xl border-b">Club Settings</div>
      <div class="p-4 flex flex-col gap-5 overflow-y-auto">
        <div>
          <div class="font-bold text-sm mb-1">Check-in window</div>
          <p class="text-xs text-gray-400 mb-2">
            How long after training members can still scan the session QR. Check-in always opens {OPEN_BEFORE_MINS} min before training.
          </p>
          <div class="flex rounded border overflow-hidden text-sm font-bold">
            <button
              class="flex-1 py-1.5 transition-colors {settingsForm.windowMode === 'day' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
              onclick={() => settingsForm.windowMode = 'day'}
            >End of day</button>
            <button
              class="flex-1 py-1.5 transition-colors {settingsForm.windowMode === 'week' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
              onclick={() => settingsForm.windowMode = 'week'}
            >End of week (Sunday)</button>
          </div>
          <p class="text-xs text-gray-400 mt-2">
            Applies to sessions created from now on. Existing sessions keep the window they were created with.
          </p>
        </div>
        <div>
          <div class="font-bold text-sm mb-1">Regular training days</div>
          <p class="text-xs text-gray-400 mb-2">Used by "Generate Standard" to create a month of sessions.</p>
          <div class="flex flex-col gap-1.5">
            {#each settingsForm.days as day}
              <div class="flex items-center gap-2 text-sm">
                <label class="flex items-center gap-2 w-32 shrink-0">
                  <input type="checkbox" bind:checked={day.on} />
                  <span class={day.on ? 'font-medium' : 'text-gray-400'}>{DAY_FULL[day.dow]}</span>
                </label>
                {#if day.on}
                  <input type="time" class="border rounded px-1.5 py-1 min-w-0" bind:value={day.start} />
                  <span class="text-gray-400">–</span>
                  <input type="time" class="border rounded px-1.5 py-1 min-w-0" bind:value={day.end} />
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
      <div class="p-4 border-t flex justify-end gap-2">
        <button class="px-4 py-1.5 rounded border font-bold" onclick={() => showSettings = false}>Cancel</button>
        <button
          class="px-4 py-1.5 rounded bg-blue-500 text-white font-bold disabled:opacity-50"
          onclick={saveSettings} disabled={savingSettings}
        >{savingSettings ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  </div>
{/if}

<!-- Session Attendance Modal -->
{#if viewModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded shadow-lg w-full max-w-md flex flex-col" style="max-height:90vh">
      <div class="p-4 border-b">
        <div class="font-bold text-xl">{fmtDate(viewModal.session.trainingStart)}</div>
        <div class="text-sm text-gray-500">{fmtTime(viewModal.session.trainingStart)} – {fmtTime(viewModal.session.trainingEnd)}</div>
      </div>

      {#if viewLoading}
        <div class="p-8 text-center text-gray-400">Loading...</div>
      {:else}
        <div class="px-4 py-2 text-sm text-gray-500 border-b">
          {viewModal.rows.filter(r => r.checkedIn).length} / {viewModal.rows.length} checked in
        </div>
        <div class="overflow-y-auto grow">
          {#each viewModal.rows as row (row.uid)}
            <div class="flex items-center px-4 py-2.5 border-b border-gray-50 last:border-0">
              <button
                class="w-6 h-6 rounded-full flex items-center justify-center mr-3 shrink-0 transition-colors {row.checkedIn ? 'bg-green-100 cursor-default' : 'bg-gray-100 hover:bg-gray-200'}"
                onclick={() => !row.checkedIn && openMark(row)}
                title={row.checkedIn ? '' : 'Mark as attended'}
              >
                {#if row.checkedIn}
                  <AIcon path={mdiCheck} size="16px" class="text-green-500" />
                {/if}
              </button>
              <div class="grow font-medium text-sm">{row.name}</div>
              {#if row.time}
                <div class="text-xs text-gray-400 shrink-0 text-right">
                  {checkinLabel(row.time, viewModal.session)}
                  {#if row.manual}
                    <div class="text-gray-300">marked manually</div>
                  {:else if row.late}
                    <div class="text-amber-500" title="Scanned offline and submitted later">synced {checkinLabel(row.late, viewModal.session)}</div>
                  {/if}
                </div>
              {:else}
                <div class="text-xs text-gray-300 shrink-0">absent</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div class="p-4 border-t flex justify-end">
        <button class="px-4 py-1.5 rounded border font-bold" onclick={() => viewModal = null}>Close</button>
      </div>
    </div>
  </div>
{/if}

<!-- Manual Mark Modal -->
{#if markModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
    <div class="bg-white rounded shadow-lg w-full max-w-sm">
      <div class="p-4 border-b font-bold text-xl">Mark Attendance</div>
      <div class="p-4 flex flex-col gap-3">
        <div class="text-sm text-gray-600">
          Manually marking <span class="font-bold text-gray-800">{markModal.row.name}</span> as attended for
          <span class="font-bold text-gray-800">{fmtDate(markModal.session.trainingStart)}</span>.
        </div>
        <div class="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-xs text-yellow-700">
          This cannot be undone. Only mark if you are sure this person attended.
        </div>
        <label class="flex flex-col">
          <span class="font-bold text-sm mb-1">Check-in time</span>
          <input type="time" class="border rounded px-2 py-1.5" bind:value={markTime} />
        </label>
      </div>
      <div class="p-4 border-t flex justify-end gap-2">
        <button class="px-4 py-1.5 rounded border font-bold" onclick={() => markModal = null}>Cancel</button>
        <button
          class="px-4 py-1.5 rounded bg-green-500 text-white font-bold disabled:opacity-50 flex items-center gap-1"
          onclick={confirmMark}
          disabled={marking || !markTime}
        >
          <AIcon path={mdiCheck} size="18px" />{marking ? 'Saving...' : 'Confirm'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- QR Modal (on-screen backup if the printed codes weren't brought) -->
{#if qrModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded shadow-lg w-full max-w-sm flex flex-col items-center">
      <div class="p-4 font-bold text-xl border-b w-full">{fmtDate(qrModal.session.trainingStart)}</div>
      <div class="text-sm text-gray-500 mt-3">{fmtTime(qrModal.session.trainingStart)} – {fmtTime(qrModal.session.trainingEnd)}</div>
      <img src={qrModal.dataUrl} alt="QR Code" class="w-64 h-64 my-2" />
      <div class="text-xs text-gray-400 mb-3">{closesText(qrModal.session)}</div>
      <div class="p-4 border-t w-full flex justify-end gap-2 flex-wrap">
        <button class="px-4 py-1.5 rounded border font-bold" onclick={() => qrModal = null}>Close</button>
        <button class="px-4 py-1.5 rounded border font-bold flex items-center gap-1" onclick={downloadQR}>
          <AIcon path={mdiQrcode} size="18px" />PNG
        </button>
        <button class="px-4 py-1.5 rounded bg-indigo-500 text-white font-bold flex items-center gap-1" onclick={() => printOne(qrModal.session)}>
          <AIcon path={mdiFilePdfBox} size="18px" />PDF
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Add Custom Modal -->
{#if showAddModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded shadow-lg w-full max-w-sm">
      <div class="p-4 font-bold text-xl border-b">Add Custom Session</div>
      <div class="p-4 flex flex-col gap-4">
        <!-- Type toggle -->
        <div class="flex rounded border overflow-hidden text-sm font-bold">
          <button
            class="flex-1 py-1.5 transition-colors {addForm.type === 'training' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
            onclick={() => { addForm.type = 'training'; if (!addForm.location) addForm.location = DEFAULT_LOCATION }}
          >Training</button>
          <button
            class="flex-1 py-1.5 transition-colors {addForm.type === 'event' ? 'bg-sky-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
            onclick={() => { addForm.type = 'event'; if (addForm.location === DEFAULT_LOCATION) addForm.location = '' }}
          >Event</button>
        </div>
        <label class="flex flex-col">
          <span class="font-bold text-sm mb-1">Date</span>
          <input type="date" class="border rounded px-2 py-1.5" bind:value={addForm.date} />
        </label>
        <div class="flex gap-3">
          <label class="flex flex-col grow">
            <span class="font-bold text-sm mb-1">{addForm.type === 'event' ? 'Start' : 'Training Start'}</span>
            <input type="time" class="border rounded px-2 py-1.5" bind:value={addForm.trainingStart} />
          </label>
          <label class="flex flex-col grow">
            <span class="font-bold text-sm mb-1">{addForm.type === 'event' ? 'End' : 'Training End'}</span>
            <input type="time" class="border rounded px-2 py-1.5" bind:value={addForm.trainingEnd} />
          </label>
        </div>
        {#if addForm.type === 'training'}
          <p class="text-xs text-gray-400 -mt-2">Check-in is open from {OPEN_BEFORE_MINS} min before training {WINDOW_TEXT[settings.windowMode]}</p>
        {:else}
          <p class="text-xs text-gray-400 -mt-2">Events show on the schedule only — no QR code or attendance</p>
        {/if}
        <label class="flex flex-col">
          <span class="font-bold text-sm mb-1">Label <span class="font-normal text-gray-400">(optional)</span></span>
          <input
            class="border rounded px-2 py-1.5 text-sm"
            placeholder={addForm.type === 'event' ? 'e.g. Grading, Seminar' : 'e.g. Kata night'}
            bind:value={addForm.label}
          />
        </label>
        {#if addForm.label.trim()}
          <div class="flex gap-1.5 -mt-2">
            {#each COLORS as c}
              <button
                class="w-5 h-5 rounded-full {c.swatch} {addForm.labelColor === c.key ? 'ring-2 ring-offset-1 ring-gray-400' : ''}"
                onclick={() => addForm.labelColor = c.key}
                aria-label={c.key}
              ></button>
            {/each}
          </div>
        {/if}
        <label class="flex flex-col">
          <span class="font-bold text-sm mb-1">Location <span class="font-normal text-gray-400">(optional)</span></span>
          <input
            class="border rounded px-2 py-1.5 text-sm"
            placeholder="Venue"
            bind:value={addForm.location}
          />
        </label>
      </div>
      <div class="p-4 border-t flex justify-end gap-2">
        <button class="px-4 py-1.5 rounded border font-bold" onclick={() => showAddModal = false}>Cancel</button>
        <button
          class="px-4 py-1.5 rounded bg-blue-500 text-white font-bold disabled:opacity-50"
          onclick={saveCustomSession} disabled={savingSession || !addForm.date || !addForm.trainingStart || !addForm.trainingEnd}
        >{savingSession ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  </div>
{/if}
