import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/**
 * Builds /sw.js from sw/sw.js with the build id and the list of every file
 * the browser build produced (plus public/), so the service worker saves
 * the whole app on the tablet when it installs. Client build only; the dev
 * server has no service worker.
 */
function formeServiceWorker(): Plugin {
  return {
    name: 'forme-service-worker',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((file) => !file.endsWith('.map') && file !== 'sw.js')
        .map((file) => `/${file}`)
      const publicFiles = readdirSync('public', { withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && entry.name !== 'robots.txt')
        .map((entry) => `/${entry.name}`)
      const precache = [...new Set([...built, ...publicFiles])].sort()
      const build = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)
      const source = readFileSync('sw/sw.js', 'utf8')
        .replace('self.__FORME_BUILD__', JSON.stringify(build))
        .replace('self.__FORME_PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

const config = defineConfig({
  plugins: [
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    formeServiceWorker(),
  ],
})

export default config
