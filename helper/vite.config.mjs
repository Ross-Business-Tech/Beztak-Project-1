// Bundles the helper and the shared AI agent code into ONE file you paste into Cloudflare.
// Run from the project folder:  npm run build:helper   ->   helper/bundle/worker.js
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  logLevel: 'warn',
  ssr: { noExternal: true, target: 'webworker' },
  build: {
    ssr: 'src/index.js', outDir: 'bundle', emptyOutDir: true, minify: false,
    rollupOptions: { output: { entryFileNames: 'worker.js', format: 'es' } },
  },
})
