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
        // Keep dynamic import() as native import() in CJS output.
        // Without this, Rollup converts `import('lighthouse')` to `require('lighthouse')`,
        // which throws ERR_REQUIRE_ESM because Lighthouse 13 is ESM-only.
        output: {
          dynamicImportInCjs: false
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
