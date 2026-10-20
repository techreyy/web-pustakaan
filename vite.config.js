import { defineConfig } from 'vite'
import { cpSync } from 'node:fs'

// Konfigurasi Vite untuk Vanilla HTML/CSS/JS
// (Web-PustakaanBudaya menggunakan vanilla JS, bukan React)

// js/data.js & js/app.js dimuat sebagai <script> biasa (bukan module),
// jadi Vite tidak mem-bundle-nya. Salin apa adanya ke dist/js saat build.
const copyClassicScripts = () => ({
  name: 'copy-classic-scripts',
  apply: 'build',
  closeBundle() {
    cpSync('js', 'dist/js', { recursive: true })
  },
})

export default defineConfig({
  // Serve dari root directory (index.html, css/, js/)
  root: '.',
  // Path relatif agar dist/ bisa dibuka dari subfolder mana pun
  base: './',
  plugins: [copyClassicScripts()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
  },
})
