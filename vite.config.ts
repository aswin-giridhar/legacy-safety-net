import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // WSL2 + Windows drive (/mnt/e) don't emit inotify events — poll so HMR works.
  server: {
    watch: { usePolling: true, interval: 120 },
  },
})
