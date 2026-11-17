<script>
  import { renderMarkdown } from '$lib/markdown'

  let { source = '' } = $props()
  let html = $derived(renderMarkdown(source))
</script>

<div class="md">{@html html}</div>

<style>
  /* Tailwind's reset strips heading/list styling, so rendered markdown gets its own */
  .md { line-height: 1.6; overflow-wrap: anywhere; }
  .md :global(> :first-child) { margin-top: 0; }
  .md :global(> :last-child) { margin-bottom: 0; }
  .md :global(h1) { font-size: 1.5rem; font-weight: 700; margin: 1.2em 0 0.5em; }
  .md :global(h2) { font-size: 1.25rem; font-weight: 700; margin: 1.2em 0 0.5em; }
  .md :global(h3) { font-size: 1.1rem; font-weight: 700; margin: 1.1em 0 0.4em; }
  .md :global(h4), .md :global(h5), .md :global(h6) { font-weight: 700; margin: 1em 0 0.4em; }
  .md :global(p) { margin: 0.75em 0; }
  .md :global(ul) { list-style: disc; padding-left: 1.5em; margin: 0.75em 0; }
  .md :global(ol) { list-style: decimal; padding-left: 1.5em; margin: 0.75em 0; }
  .md :global(li) { margin: 0.25em 0; }
  .md :global(li > ul), .md :global(li > ol) { margin: 0.25em 0; }
  .md :global(a) { color: #2563eb; text-decoration: underline; }
  .md :global(strong) { font-weight: 700; }
  .md :global(blockquote) { border-left: 4px solid #d1d5db; padding-left: 1em; color: #6b7280; margin: 0.75em 0; }
  .md :global(code) { background: #f3f4f6; padding: 0.1em 0.3em; border-radius: 0.25rem; font-size: 0.9em; }
  .md :global(pre) { background: #f3f4f6; padding: 0.75em; border-radius: 0.375rem; overflow-x: auto; margin: 0.75em 0; }
  .md :global(pre code) { background: none; padding: 0; }
  .md :global(hr) { border-top: 1px solid #e5e7eb; margin: 1.25em 0; }
  .md :global(img) { max-width: 100%; height: auto; border-radius: 0.375rem; }
  .md :global(table) { border-collapse: collapse; margin: 0.75em 0; display: block; overflow-x: auto; }
  .md :global(th), .md :global(td) { border: 1px solid #e5e7eb; padding: 0.3em 0.6em; text-align: left; }
  .md :global(th) { background: #f9fafb; font-weight: 700; }
</style>
