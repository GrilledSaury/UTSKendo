<script>
  import { goto } from '$app/navigation'
  import { AIcon } from 'ace.svelte'
  import { mdiHome, mdiChevronDown } from '@mdi/js'

  // ── Edit the content here ───────────────────────────────────────────────
  // FAQ answers are paragraphs; `steps` (optional) is shown as a numbered list.
  const faqs = [
    {
      q: 'Can I check in without internet?',
      a: [
        'Yes. Scan the session QR code as usual. If you are offline, your check-in is saved on your phone and marked “Saved — pending”.',
        'When you are back online, the app tries to submit it automatically, the next time you open the app or bring it back to the screen.',
      ],
    },
    {
      q: 'My check-in still says “pending”. What should I do?',
      a: [
        'Automatic submission depends on your phone and browser. Some phones pause apps in the background or clear saved data, so a pending check-in is not always sent on its own.',
        'To be safe, open the app again within a couple of days after training:',
      ],
      steps: [
        'If you see “Pending check-ins” on the home screen, tap it.',
        'Make sure you are online, then tap “Submit now”.',
        'Check My Attendance to confirm the session is listed.',
      ],
      note: 'Pending check-ins are stored on that phone only. Use the same phone and the same browser (or the installed app) you scanned with, and don’t sign out or clear site data until they have been submitted.',
    },
    {
      q: 'How long do I have to scan and submit?',
      a: [
        'Scanning: the QR code for a session works from 30 minutes before training until the end of that week (Sunday, 11:59 pm).',
        'Submitting: for now there is no deadline. A check-in counts from the time you scanned, so it is accepted even if it is submitted later.',
        'This will change: pending check-ins will need to be submitted within 72 hours (3 days) after training. The date it starts will be posted in Dev notes below, so it’s safest to submit within 3 days already.',
      ],
    },
    {
      q: 'I found a problem in the app. Has it been fixed?',
      a: [
        'While the app is new, known bugs are fixed a couple of times a week, so a problem you saw a few days ago has probably been fixed already.',
        'To get the latest version, refresh the page. If you installed the app on your home screen, close it fully and open it again.',
        'Dev notes below list what has been fixed and when.',
      ],
    },
  ]

  // Newest first. Fill in `date` by hand, e.g. '24 Nov 2026'; entries without a date show none.
  const devNotes = [
    {
      date: 'Tue 24 Nov 2026',
      title: 'Fixed: signing in from the home-screen app',
      details: 'If you added the app to your home screen, tapping “Sign in with Google” could do nothing or never finish, because the sign-in pop-up doesn’t work there. The app now signs you in on the same screen instead. If you were stuck, close the app fully, open it again and sign in. In a normal browser, sign-in still uses a pop-up.',
    },
    {
      date: 'Tue 24 Nov 2026',
      title: 'Fixed: scanning the QR code with the phone’s camera app',
      details: 'Opening a QR link from the phone’s camera app could get stuck on the scan page without opening the camera, and then showed “Saved — pending” even when online. Check-ins from a QR link are now submitted straight away. If you saw “pending” before this fix, your check-in was most likely submitted shortly afterwards. Check My Attendance, and contact Hayley if the session is missing.',
    },
  ]
  // ────────────────────────────────────────────────────────────────────────
</script>

<div class="w-screen min-h-screen bg-gray-100 p-4 md:px-16 md:py-8">
  <button onclick={() => goto('/home')} title="Home">
    <AIcon path={mdiHome} size="36px" class="text-gray-500" />
  </button>
  <div class="text-2xl font-bold my-3">Help &amp; FAQ</div>

  <div class="max-w-2xl">
    <div class="font-bold text-gray-700 mt-4 mb-2">Frequently asked questions</div>
    {#each faqs as f}
      <details class="group bg-white shadow rounded my-2">
        <summary class="list-none cursor-pointer px-4 py-3 font-semibold flex items-center gap-3">
          <span class="grow">{f.q}</span>
          <AIcon path={mdiChevronDown} class="text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div class="px-4 pb-4 text-sm text-gray-700 space-y-2">
          {#each f.a as para}<p>{para}</p>{/each}
          {#if f.steps}
            <ol class="list-decimal pl-5 space-y-1">
              {#each f.steps as s}<li>{s}</li>{/each}
            </ol>
          {/if}
          {#if f.note}
            <p class="bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">{f.note}</p>
          {/if}
        </div>
      </details>
    {/each}

    <div class="font-bold text-gray-700 mt-8 mb-2">Dev notes</div>
    {#each devNotes as n}
      <div class="bg-white shadow rounded my-2 px-4 py-3">
        <div class="flex items-baseline gap-3 flex-wrap">
          <div class="font-semibold grow">{n.title}</div>
          {#if n.date}<div class="text-xs text-gray-500 shrink-0">{n.date}</div>{/if}
        </div>
        {#if n.details}<p class="text-sm text-gray-600 mt-1">{n.details}</p>{/if}
      </div>
    {:else}
      <div class="text-gray-400">No notes yet.</div>
    {/each}
  </div>
</div>

<style>
  /* Hide the default disclosure triangle in Safari */
  summary::-webkit-details-marker { display: none; }
</style>
