import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Links in an announcement open in a new tab, so tapping one never navigates the PWA away
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// Markdown → HTML that is safe to put in {@html}: scripts, event handlers and
// javascript: links are stripped. Single line breaks are kept as line breaks.
export function renderMarkdown(source) {
  const html = marked.parse(source ?? '', { gfm: true, breaks: true })
  return DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input', 'button'], FORBID_ATTR: ['style'] })
}
