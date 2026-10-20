import { defineConfig } from 'vite'
import { cpSync } from 'node:fs'

// Konfigurasi Vite untuk Vanilla HTML/CSS/JS
// (Web-PustakaanBudaya menggunakan vanilla JS, bukan React)

// js/*.js dimuat sebagai <script> biasa (bukan module) dan foto di img/
// hanya dirujuk dari JS, jadi Vite tidak mem-bundle-nya. Salin apa adanya saat build.
const copyStaticFiles = () => ({
  name: 'copy-static-files',
  apply: 'build',
  closeBundle() {
    cpSync('js', 'dist/js', { recursive: true })
    cpSync('img', 'dist/img', { recursive: true })
  },
})

export default defineConfig({
  // Serve dari root directory (index.html, css/, js/)
  root: '.',
  // Path relatif agar dist/ bisa dibuka dari subfolder mana pun
  base: './',
  plugins: [copyStaticFiles()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
  },
})
