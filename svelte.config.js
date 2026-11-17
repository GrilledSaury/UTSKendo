import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Pure SPA: every route is served by the 200.html fallback (see firebase.json rewrites)
  kit: { adapter: adapter({ fallback: '200.html' }) },
  preprocess: vitePreprocess()
}
export default config
