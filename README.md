# Pustaka Budaya Sulawesi (PDBS)

Perpustakaan digital budaya dari 6 provinsi di Pulau Sulawesi: rumah adat, tarian, kuliner, musik, upacara, senjata, dan permainan tradisional.

Dibuat dengan HTML, CSS, dan JavaScript vanilla, dengan Vite sebagai dev server dan build tool.

## Menjalankan

```bash
npm install
npm run dev      # dev server di http://localhost:5173
npm run build    # hasil build di dist/
npm run preview  # pratinjau hasil build
```

## Struktur

- `index.html`: halaman utama
- `css/style.css`: gaya tampilan
- `js/data.js`: data budaya, provinsi, kategori, dan kuis
- `js/app.js`: logika aplikasi (filter, modal, kuis, favorit, kontribusi)
