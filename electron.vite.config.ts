import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['puppeteer', 'lighthouse', 'exceljs', 'axios'],
        output: {
          // MUST be true (Rollup default) to keep dynamic import() as native
          // import() in CJS output.  Lighthouse 13+ is ESM-only — converting
          // to require() throws ERR_REQUIRE_ESM and makes all scores N/A.
          dynamicImportInCjs: true
        }
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    css: {
      postcss: {
        plugins: [tailwindcss, autoprefixer]
      }
    },
    plugins: [react()]
  }
})
