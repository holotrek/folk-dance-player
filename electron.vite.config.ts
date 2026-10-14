import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

// Two windows: the control window (index) and the projector (spec §8), each with its own preload.
export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          projector: resolve('src/preload/projector.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          projector: resolve('src/renderer/projector.html')
        }
      }
    }
  }
})
