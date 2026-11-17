<script>
  import { tick } from 'svelte'
  import { AIcon } from 'ace.svelte'
  import {
    mdiFormatBold, mdiFormatItalic, mdiFormatHeaderPound, mdiFormatListBulleted,
    mdiFormatListNumbered, mdiFormatQuoteClose, mdiLink,
  } from '@mdi/js'
  import Markdown from './Markdown.svelte'

  let { value = $bindable(''), placeholder = 'Write in markdown…', rows = 12 } = $props()

  let tab = $state('write')   // 'write' | 'preview'
  let area = $state(null)

  // Replaces the selection and then re-selects [selStart, selEnd) of the new text
  async function replaceSelection(start, end, text, selStart, selEnd) {
    value = value.slice(0, start) + text + value.slice(end)
    await tick()
    area.focus()
    area.setSelectionRange(selStart, selEnd)
  }

  // **bold**, *italic*: wraps the selection, or inserts a placeholder to type over
  function wrap(mark, sample) {
    const { selectionStart: s, selectionEnd: e } = area
    const inner = value.slice(s, e) || sample
    replaceSelection(s, e, mark + inner + mark, s + mark.length, s + mark.length + inner.length)
  }

  // Headings, lists, quotes: prefixes every line the selection touches
  function prefixLines(prefix) {
    const { selectionStart: s, selectionEnd: e } = area
    const start = value.lastIndexOf('\n', s - 1) + 1
    const nl    = value.indexOf('\n', e)
    const end   = nl === -1 ? value.length : nl
    const lines = value.slice(start, end).split('\n')
    const text  = lines.map((l, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + l).join('\n')
    replaceSelection(start, end, text, start + text.length, start + text.length)
  }

  function link() {
    const { selectionStart: s, selectionEnd: e } = area
    const label = value.slice(s, e) || 'link text'
    const text  = `[${label}](https://)`
    // leaves the cursor on the URL, ready to paste over
    replaceSelection(s, e, text, s + label.length + 3, s + text.length - 1)
  }

  const tools = [
    { title: 'Bold',          icon: mdiFormatBold,         run: () => wrap('**', 'bold text') },
    { title: 'Italic',        icon: mdiFormatItalic,       run: () => wrap('*', 'italic text') },
    { title: 'Heading',       icon: mdiFormatHeaderPound,  run: () => prefixLines('## ') },
    { title: 'Bullet list',   icon: mdiFormatListBulleted, run: () => prefixLines('- ') },
    { title: 'Numbered list', icon: mdiFormatListNumbered, run: () => prefixLines(i => `${i + 1}. `) },
    { title: 'Quote',         icon: mdiFormatQuoteClose,   run: () => prefixLines('> ') },
    { title: 'Link',          icon: mdiLink,               run: link },
  ]

  function onkeydown(ev) {
    if (!(ev.metaKey || ev.ctrlKey)) return
    const key = ev.key.toLowerCase()
    if (key === 'b') { ev.preventDefault(); wrap('**', 'bold text') }
    if (key === 'i') { ev.preventDefault(); wrap('*', 'italic text') }
    if (key === 'k') { ev.preventDefault(); link() }
  }
</script>

<div class="border rounded bg-white">
  <div class="flex flex-wrap items-center border-b bg-gray-50 rounded-t px-1">
    <button type="button" class="px-3 py-2 text-sm font-semibold border-b-2 {tab === 'write' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}" onclick={() => tab = 'write'}>Write</button>
    <button type="button" class="px-3 py-2 text-sm font-semibold border-b-2 {tab === 'preview' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}" onclick={() => tab = 'preview'}>Preview</button>
    <div class="grow"></div>
    {#if tab === 'write'}
      <div class="flex items-center">
        {#each tools as t}
          <button type="button" class="p-1.5 text-gray-600 hover:bg-gray-200 rounded shrink-0" title={t.title} aria-label={t.title} onclick={t.run}>
            <AIcon path={t.icon} size="20px" />
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if tab === 'write'}
    <textarea
      bind:this={area} bind:value {placeholder} {rows} {onkeydown}
      class="block w-full px-3 py-2 rounded-b font-mono text-sm outline-none resize-y"
    ></textarea>
  {:else}
    <div class="px-3 py-2 overflow-y-auto" style="min-height: {rows * 1.25 + 1}rem">
      {#if value.trim()}
        <Markdown source={value} />
      {:else}
        <div class="text-gray-400 text-sm">Nothing to preview yet.</div>
      {/if}
    </div>
  {/if}
</div>
