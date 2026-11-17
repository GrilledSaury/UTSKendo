import { sveltekit } from '@sveltejs/kit/vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      // Absolute URLs: SvelteKit's relative base would resolve sw.js / the manifest against nested routes
      base: '/',
      scope: '/',
      kit: { adapterFallback: '200.html', spa: true },
      manifest: {
        name: 'UTS Kendo Club',
        short_name: 'UTSKC',
        description: 'UTS Kendo Club attendance and schedule',
        start_url: '/home',
        scope: '/',
        display: 'standalone',
        background_color: '#f3f4f6',
        theme_color: '#1e293b',
        icons: []
      },
      workbox: {
        // Never answer these from the app shell: the ICS feed and Firebase Auth's /__/auth handler
        navigateFallbackDenylist: [/^\/api\//, /^\/__\//]
      }
    })
  ]
})
