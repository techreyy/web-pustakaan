// ============================================
// CONFIG - salin file ini menjadi js/config.js
// ============================================
// js/config.js tidak ikut di-commit (lihat .gitignore), jadi API key tidak masuk ke GitHub.
// Tanpa key, peta otomatis memakai tile Esri dan embed Google Maps biasa.

window.PDBS_CONFIG = {
  // Google Cloud Console → APIs & Services → Credentials.
  // Aktifkan "Map Tiles API" (peta utama) dan "Maps Embed API" (peta di halaman detail),
  // lalu batasi key dengan HTTP referrer domain situsmu.
  googleMapsKey: '',
};
