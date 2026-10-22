// ============================================
// APP.JS - Perpustakaan Digital Budaya Sulawesi
// ============================================

// ---- LOCALSTORAGE (aman dari data rusak) ----
function loadLS(key, fallback) {
  try {
    const val = JSON.parse(localStorage.getItem(key));
    return val ?? fallback;
  } catch {
    return fallback;
  }
}

// ---- ESCAPE HTML (cegah XSS dari input pengguna) ----
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// ---- STATE ----
const State = {
  activeProvince: 'all',
  activeCategory: 'all',
  activeTab: 'explorer',   // explorer | favorites
  searchQuery: '',
  sortBy: 'popular',
  viewMode: 'grid',        // grid | list
  favorites: loadLS('pdbs-favorites', []),
  likes: loadLS('pdbs-likes', []),
  contributions: loadLS('pdbs-contributions', []).filter(c => c && Number.isFinite(c.id)),
  comments: loadLS('pdbs-comments', {}),
  displayCount: 12,
  // quiz state
  quizIndex: 0,
  quizScore: 0,
  quizAnswered: false,
  quizQuestions: [],
  quizAnswers: [],      // true/false per soal, untuk ringkasan hasil
  quizTimer: null,      // setInterval ID for countdown
  quizTimeLeft: 20,     // seconds remaining per question
  // audio state
  audioItem: null,
};

// ---- SAVE TO LOCALSTORAGE ----
function saveState() {
  try {
    localStorage.setItem('pdbs-favorites', JSON.stringify(State.favorites));
    localStorage.setItem('pdbs-likes', JSON.stringify(State.likes));
    localStorage.setItem('pdbs-contributions', JSON.stringify(State.contributions));
    localStorage.setItem('pdbs-comments', JSON.stringify(State.comments));
  } catch { /* storage penuh / diblokir */ }
}

// ---- HELPERS ----
function allItems() { return [...CULTURE_DATA, ...State.contributions]; }
function findItem(id) { return allItems().find(d => d.id === id); }
function getProvince(id) { return PROVINCES.find(p => p.id === id); }
function getCategory(id) { return CATEGORIES.find(c => c.id === id); }
function formatNum(n) { return n >= 1000 ? (n/1000).toFixed(1)+'rb' : n; }
function isFav(id) { return State.favorites.includes(id); }
function isLiked(id) { return State.likes.includes(id); }
function getComments(id) {
  const base = (CULTURE_DATA.find(d=>d.id===id)||{}).comments || [];
  const user = State.comments[id] || [];
  return [...base, ...user];
}
function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- AVATAR INISIAL ----
function avatar(name, cls) {
  const words = String(name || '?').trim().split(/\s+/);
  const init = (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = PROVINCES[h % PROVINCES.length].color;
  return `<div class="${cls}" style="background:${color}">${esc(init)}</div>`;
}

// ---- GAMBAR SAMPUL ----
// Pakai foto bila ada; jika tidak, ikon kategori di atas warna kategori.
function coverArt(item, cls, imgCls) {
  if (item.image && imgCls) {
    return `<img class="${imgCls}" src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy">`;
  }
  const cat = getCategory(item.category);
  return `<div class="${cls}" style="--cc:${cat ? cat.color : 'var(--accent)'}">${icon(cat ? cat.icon : 'book-open')}</div>`;
}

// ---- TOAST ----
function showToast(msg, type='ok', iconName='circle-check') {
  const box = document.getElementById('toast-box');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-ico">${icon(iconName)}</span> <span>${esc(msg)}</span>`;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}

// ---- FILTER & SORT DATA ----
function getFilteredData() {
  let data = allItems();
  if (State.activeProvince !== 'all') data = data.filter(d => d.province === State.activeProvince);
  if (State.activeCategory !== 'all') data = data.filter(d => d.category === State.activeCategory);
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    data = data.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.desc.toLowerCase().includes(q) ||
      d.tags.some(t => t.toLowerCase().includes(q)) ||
      (getProvince(d.province)||{name:''}).name.toLowerCase().includes(q)
    );
  }
  if (State.sortBy === 'popular') data.sort((a,b) => b.likes - a.likes);
  else if (State.sortBy === 'views') data.sort((a,b) => b.views - a.views);
  else if (State.sortBy === 'newest') data.sort((a,b) => b.id - a.id);
  else if (State.sortBy === 'az') data.sort((a,b) => a.title.localeCompare(b.title));
  return data;
}

// ---- RENDER CULTURE CARD ----
function renderCard(item) {
  const prov = getProvince(item.province);
  const cat = getCategory(item.category);
  const fav = isFav(item.id);
  return `
    <article class="c-card" onclick="openDetail(${item.id})">
      <div class="c-card-img">
        ${coverArt(item, 'c-img-placeholder', 'c-img-inner')}
        <button class="c-fav ${fav?'on':''}" onclick="toggleFav(event,${item.id})" title="${fav?'Hapus dari favorit':'Simpan ke favorit'}" aria-label="Favorit">${icon('heart')}</button>
        ${hasAudio(item) ? `<span class="c-audio-badge">${icon('headphones')}</span>` : ''}
      </div>
      <div class="c-body">
        <div class="c-meta">
          ${prov ? `<span class="dot" style="background:${prov.color}"></span>${prov.short}` : ''}
          ${cat ? `<span class="c-sep">·</span>${cat.label}` : ''}
        </div>
        <h3 class="c-title">${esc(item.title)}</h3>
        <p class="c-desc">${esc(item.desc)}</p>
        <div class="c-foot">
          <span class="c-stat">${icon('eye')} ${formatNum(item.views)}</span>
          <span class="c-stat">${icon('heart')} ${formatNum(item.likes)}</span>
          <span class="c-loc">${icon('map-pin')} ${esc(item.lokasi)}</span>
        </div>
      </div>
    </article>`;
}

// ---- RENDER EXPLORER ----
function renderExplorer() {
  refreshMapMarkers();
  const container = document.getElementById('culture-grid');
  if (!container) return;
  const data = getFilteredData();
  const shown = data.slice(0, State.displayCount);
  const srchInfo = document.getElementById('search-info');
  const lmw = document.getElementById('load-more-wrap');

  if (srchInfo) {
    srchInfo.hidden = !State.searchQuery;
    if (State.searchQuery) {
      srchInfo.innerHTML = `<strong>${data.length} hasil</strong> untuk “${esc(State.searchQuery)}”
        <button class="link-btn" onclick="clearSearch()">Hapus pencarian</button>`;
    }
  }

  if (data.length === 0) {
    container.innerHTML = `<div class="empty">
      <div class="empty-ico">${icon('search')}</div>
      <div class="empty-title">Tidak ada hasil</div>
      <p>Coba kata kunci atau filter lain.</p>
    </div>`;
    lmw.hidden = true;
    return;
  }

  container.innerHTML = shown.map(renderCard).join('');
  lmw.hidden = data.length <= State.displayCount;
  document.getElementById('load-more-count').textContent = Math.min(12, data.length - shown.length);
}

function clearSearch() {
  ['nav-search-input', 'hero-search-input'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  doSearch('');
}

// ---- RENDER FAVORITES ----
function renderFavCount() {
  const el = document.getElementById('fav-count');
  if (el) el.textContent = allItems().filter(d => isFav(d.id)).length;
}

function renderFavorites() {
  renderFavCount();
  const container = document.getElementById('fav-grid');
  if (!container) return;
  const items = allItems().filter(d => isFav(d.id));
  if (items.length === 0) {
    container.innerHTML = `<div class="empty">
      <div class="empty-ico">${icon('heart-off')}</div>
      <div class="empty-title">Belum ada favorit</div>
      <p>Tekan ${icon('heart')} pada kartu budaya untuk menyimpannya di sini.</p>
    </div>`;
    return;
  }
  container.innerHTML = items.map(renderCard).join('');
}

// ---- CATEGORY CHIPS ----
function renderCategories() {
  const grid = document.getElementById('cat-grid');
  if (!grid) return;
  const data = allItems();
  grid.innerHTML = CATEGORIES.map(cat => {
    const cnt = cat.id === 'all' ? data.length : data.filter(d => d.category === cat.id).length;
    return `<button class="chip ${State.activeCategory === cat.id ? 'active' : ''}" onclick="setCategory('${cat.id}')">
      ${icon(cat.icon)} ${cat.label} <span class="chip-cnt">${cnt}</span>
    </button>`;
  }).join('');
}

// ---- PROVINCE FILTERS (koleksi) & LIST (peta) ----
function renderProvinceFilters() {
  const box = document.getElementById('province-filter-tags');
  if (!box) return;
  box.innerHTML = [{ id: 'all', short: 'Semua provinsi' }, ...PROVINCES].map(p => `
    <button class="chip ${State.activeProvince === p.id ? 'active' : ''}" onclick="setProvince('${p.id}')">
      ${p.color ? `<span class="dot" style="background:${p.color}"></span>` : ''}${p.short}
    </button>`).join('');
}

function renderProvinceList() {
  const list = document.getElementById('prov-list');
  if (!list) return;
  const data = allItems();
  const row = (id, name, sub, color, cnt) => `
    <button class="prov-btn ${State.activeProvince===id?'active':''}" onclick="focusProvince('${id}')">
      <span class="prov-dot" style="background:${color}"></span>
      <span class="prov-txt"><span class="prov-name">${name}</span><span class="prov-sub">${sub}</span></span>
      <span class="prov-cnt">${cnt}</span>
    </button>`;
  list.innerHTML = row('all', 'Seluruh Sulawesi', '6 provinsi', 'var(--text)', data.length) +
    PROVINCES.map(p => row(p.id, p.name, p.capital, p.color, data.filter(d => d.province === p.id).length)).join('');
}

// ---- FOOTER LINKS ----
function renderFooterLinks() {
  const cats = document.getElementById('f-cat-links');
  if (cats) cats.innerHTML = CATEGORIES.filter(c => c.id !== 'all').map(c =>
    `<a href="#koleksi" onclick="setTab('explorer');setCategory('${c.id}')">${c.label}</a>`).join('');
  const provs = document.getElementById('f-prov-links');
  if (provs) provs.innerHTML = PROVINCES.map(p =>
    `<a href="#koleksi" onclick="setTab('explorer');setProvince('${p.id}')">${p.name}</a>`).join('');
}

// ---- HERO MOSAIC ----
function renderHeroMosaic() {
  const box = document.getElementById('hero-mosaic');
  if (!box) return;
  const picks = [1, 4, 2, 3].map(id => CULTURE_DATA.find(d => d.id === id && d.image)).filter(Boolean);
  box.innerHTML = picks.map((item, i) => `
    <figure class="mosaic-item m${i + 1}" onclick="openDetail(${item.id})">
      <img src="${esc(item.image)}" alt="${esc(item.title)}">
      <figcaption>${esc(item.title)}<span>${(getProvince(item.province) || {}).name || ''}</span></figcaption>
    </figure>`).join('');
}

// ---- SECTION TABS ----
function setTab(tab) {
  State.activeTab = tab;
  document.querySelectorAll('.n-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => { c.hidden = c.id !== 'tab-' + tab; });
  if (tab === 'explorer') renderExplorer();
  if (tab === 'favorites') renderFavorites();
}

// ---- FILTER ACTIONS ----
function setProvince(id) {
  State.activeProvince = id;
  State.displayCount = 12;
  renderProvinceList();
  renderProvinceFilters();
  renderExplorer();
}

// Dari daftar provinsi di samping peta: filter sekaligus arahkan peta.
function focusProvince(id) {
  setProvince(id);
  fitMapToData();
}

function setCategory(id) {
  State.activeCategory = id;
  State.displayCount = 12;
  const sel = document.getElementById('hero-search-cat');
  if (sel) sel.value = id;
  renderCategories();
  renderExplorer();
}

function setSort(val) { State.sortBy = val; renderExplorer(); }

function setView(mode) {
  State.viewMode = mode;
  const grid = document.getElementById('culture-grid');
  if (!grid) return;
  grid.className = 'culture-grid ' + (mode === 'list' ? 'g-list' : 'g-4');
  document.querySelectorAll('.v-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  renderExplorer();
}

function doSearch(q) {
  State.searchQuery = q.trim();
  State.displayCount = 12;
  if (State.activeTab !== 'explorer') setTab('explorer');
  renderExplorer();
}

// ---- TOGGLE FAVORITE ----
function flipFav(id) {
  if (isFav(id)) {
    State.favorites = State.favorites.filter(f => f !== id);
    showToast('Dihapus dari favorit', 'ok', 'heart-off');
  } else {
    State.favorites.push(id);
    showToast('Disimpan ke favorit', 'ok', 'heart');
  }
  saveState();
  renderFavCount();
}

function toggleFav(e, id) {
  e.stopPropagation();
  flipFav(id);
  renderExplorer();
  if (State.activeTab === 'favorites') renderFavorites();
}

// ---- TOGGLE LIKE ----
function toggleLike(id) {
  const item = findItem(id);
  if (!item) return;
  if (isLiked(id)) {
    State.likes = State.likes.filter(l => l !== id);
    item.likes = Math.max(0, item.likes - 1);
  } else {
    State.likes.push(id);
    item.likes += 1;
    showToast('Terima kasih sudah menyukai!', 'ok', 'heart');
  }
  saveState();
  const btn = document.querySelector('.m-act-btn[data-action="like"]');
  if (btn) { btn.classList.toggle('on', isLiked(id)); btn.querySelector('span:last-child').textContent = isLiked(id) ? 'Disukai' : 'Suka'; }
  const likeNum = document.getElementById('modal-like-count');
  if (likeNum) likeNum.textContent = formatNum(item.likes);
  renderExplorer();
}

// ---- GOOGLE MAPS ----
// Item dengan koordinat dibuka tepat di titiknya; kontribusi tanpa koordinat dicari lewat nama + lokasi.
function gmapsTarget(item) {
  if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) return `${item.lat},${item.lng}`;
  return `${item.title}, ${item.lokasi}`;
}
function gmapsUrl(item) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gmapsTarget(item))}`;
}
function gmapsRouteUrl(item) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(gmapsTarget(item))}`;
}
function gmapsEmbedUrl(item) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(gmapsTarget(item))}&z=14&output=embed`;
}

// ---- OPEN DETAIL MODAL ----
function openDetail(id) {
  const item = findItem(id);
  if (!item) return;
  const prov = getProvince(item.province);
  const cat = getCategory(item.category);
  const fav = isFav(item.id);
  const liked = isLiked(item.id);
  const comments = getComments(id);
  item.views += 1;

  const modal = document.getElementById('detail-modal');
  modal.innerHTML = `
    <div class="m-box">
      <div class="m-hero">
        ${coverArt(item, 'm-hero-ph', 'm-hero-img')}
        <div class="m-hero-grad"></div>
        <div class="m-hero-content">
          <div class="m-hero-badges">
            ${prov ? `<span class="pill">${prov.name}</span>` : ''}
            ${cat ? `<span class="pill">${icon(cat.icon)} ${cat.label}</span>` : ''}
          </div>
          <h1 class="m-title">${esc(item.title)}</h1>
          <p class="m-sub">${icon('map-pin')} ${esc(item.lokasi)}</p>
        </div>
        <button class="icon-btn m-close" onclick="closeDetail()" aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="m-body">
        <div class="m-grid">
          <div class="m-main">
            <div class="m-actions">
              <button class="m-act-btn ${liked?'on':''}" data-action="like" onclick="toggleLike(${item.id})">
                <span class="m-act-ico">${icon('heart')}</span><span>${liked?'Disukai':'Suka'}</span>
              </button>
              <button class="m-act-btn ${fav?'on':''}" data-action="fav" onclick="toggleFavModal(${item.id})">
                <span class="m-act-ico">${icon(fav ? 'bookmark-check' : 'bookmark')}</span><span>${fav?'Tersimpan':'Simpan'}</span>
              </button>
              <button class="m-act-btn" onclick="shareItem(${item.id})">
                <span class="m-act-ico">${icon('share-2')}</span><span>Bagikan</span>
              </button>
            </div>

            <p class="m-desc">${esc(item.detail || item.desc)}</p>

            ${item.audio ? `
            <div class="audio-box">
              <div class="audio-lbl">${icon('headphones')} Audio</div>
              <div class="audio-song">${esc(item.audio.title)}</div>
              ${hasAudio(item) ? `
              <div class="audio-artist">${esc(item.audio.artist)}</div>
              <div class="audio-ctrls">
                <button class="a-play" id="modal-play-btn" onclick="toggleAudio(${item.id})" aria-label="Putar / jeda">${icon(isPlaying(item) ? 'pause' : 'play')}</button>
                <div class="a-prog">
                  <div class="a-bar" onclick="seekAudio(event)"><div class="a-fill" id="modal-prog-fill"></div></div>
                  <div class="a-time"><span id="modal-time-cur">0:00</span><span id="modal-time-dur">--:--</span></div>
                </div>
              </div>` : `
              <div class="audio-soon">${icon('clock')} Rekaman segera hadir. Punya rekamannya? Bantu lewat menu Kontribusi.</div>`}
            </div>` : ''}

            <div class="m-map">
              <div class="m-map-head">
                <h3>${icon('map-pin')} Lokasi</h3>
                <div class="m-map-links">
                  <a class="btn btn-ghost btn-sm" href="${gmapsUrl(item)}" target="_blank" rel="noopener">${icon('external-link')} Google Maps</a>
                  <a class="btn btn-accent btn-sm" href="${gmapsRouteUrl(item)}" target="_blank" rel="noopener">${icon('navigation')} Rute</a>
                </div>
              </div>
              <iframe class="m-map-frame" src="${esc(gmapsEmbedUrl(item))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Peta ${esc(item.title)}"></iframe>
            </div>

            <div class="cmts">
              <h3 class="cmts-title">Diskusi <span>${comments.length}</span></h3>
              <div class="cmt-form">
                <textarea class="input" id="cmt-input-${item.id}" rows="2" placeholder="Tulis komentarmu…"></textarea>
                <button class="btn btn-dark btn-sm" onclick="submitComment(${item.id})">Kirim</button>
              </div>
              <div class="cmt-list" id="cmt-list-${item.id}">
                ${comments.map(c => commentHTML(c)).join('')}
              </div>
            </div>
          </div>

          <aside class="m-side">
            <div class="m-stat-grid">
              <div class="m-stat-box"><div class="m-stat-num" id="modal-view-count">${formatNum(item.views)}</div><div class="m-stat-lbl">Dilihat</div></div>
              <div class="m-stat-box"><div class="m-stat-num" id="modal-like-count">${formatNum(item.likes)}</div><div class="m-stat-lbl">Disukai</div></div>
              <div class="m-stat-box"><div class="m-stat-num">${comments.length}</div><div class="m-stat-lbl">Komentar</div></div>
            </div>
            <dl class="m-table">
              <div><dt>Provinsi</dt><dd>${prov ? prov.name : '-'}</dd></div>
              <div><dt>Kategori</dt><dd>${cat ? cat.label : '-'}</dd></div>
              <div><dt>Terdaftar</dt><dd>${esc(item.tahun_terdaftar)}</dd></div>
              <div><dt>Kontributor</dt><dd>${esc(item.kontributor)}</dd></div>
            </dl>
            <div class="tags">${item.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
            ${item.imageCredit ? `
            <p class="img-credit">${icon('camera')} ${esc(item.imageCredit.author)} · ${esc(item.imageCredit.license)} ·
              <a href="${esc(item.imageCredit.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></p>` : ''}
            ${prov ? `<button class="link-btn" onclick="closeDetail();setTab('explorer');setProvince('${prov.id}');scrollToId('koleksi')">Semua budaya ${prov.name} →</button>` : ''}
            <div class="similar">
              <div class="side-head">Budaya serupa</div>
              ${getSimilar(item).map(s => `
              <button class="sim-row" onclick="openDetail(${s.id})">
                ${coverArt(s, 'sim-ico', 'sim-ico sim-img')}
                <span><span class="sim-title">${esc(s.title)}</span><span class="sim-sub">${(getProvince(s.province)||{}).short}</span></span>
              </button>`).join('')}
            </div>
          </aside>
        </div>
      </div>
    </div>`;

  modal.classList.add('open');
  modal.scrollTop = 0;
  document.body.style.overflow = 'hidden';

  if (isPlaying(item) || State.audioItem === item) updateAudioUI();
}

function commentHTML(c) {
  return `
    <div class="cmt-item">
      ${avatar(c.name, 'cmt-av-sm')}
      <div class="cmt-content">
        <div class="cmt-hd"><span class="cmt-name">${esc(c.name)}</span><span class="cmt-time">${esc(c.time)}</span></div>
        <p class="cmt-text">${esc(c.text)}</p>
      </div>
    </div>`;
}

function getSimilar(item) {
  return CULTURE_DATA.filter(d =>
    d.id !== item.id && (d.category === item.category || d.province === item.province)
  ).slice(0, 3);
}

function closeDetail() {
  const modal = document.getElementById('detail-modal');
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
  renderExplorer();
}

function toggleFavModal(id) {
  flipFav(id);
  const btn = document.querySelector('.m-act-btn[data-action="fav"]');
  if (btn) {
    btn.classList.toggle('on', isFav(id));
    btn.querySelector('span:last-child').textContent = isFav(id) ? 'Tersimpan' : 'Simpan';
    btn.querySelector('span:first-child').innerHTML = icon(isFav(id) ? 'bookmark-check' : 'bookmark');
  }
  if (State.activeTab === 'favorites') renderFavorites();
}

function shareItem(id) {
  const item = findItem(id);
  if (!item) return;
  const text = `Yuk kenali budaya Sulawesi: "${item.title}" dari ${(getProvince(item.province)||{}).name}! Temukan di Pustaka Budaya Sulawesi.`;
  if (navigator.share) {
    navigator.share({ title: item.title, text, url: window.location.href }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    showToast('Teks disalin ke clipboard!', 'ok', 'clipboard-check');
  } else {
    showToast('Bagikan: ' + item.title, 'ok', 'share-2');
  }
}

// ---- SUBMIT COMMENT ----
function submitComment(id) {
  const inp = document.getElementById(`cmt-input-${id}`);
  if (!inp || !inp.value.trim()) { showToast('Tulis komentar terlebih dahulu!', 'err', 'triangle-alert'); return; }
  const comment = { name: 'Sobat Budaya', time: 'Baru saja', text: inp.value.trim() };
  if (!State.comments[id]) State.comments[id] = [];
  State.comments[id].unshift(comment);
  saveState();
  inp.value = '';
  const list = document.getElementById(`cmt-list-${id}`);
  if (list) list.insertAdjacentHTML('afterbegin', commentHTML(comment));
  showToast('Komentar terkirim!', 'ok', 'message-circle');
}

// ---- CONTRIBUTION MODAL ----
function openContribModal() {
  document.getElementById('nav-links')?.classList.remove('open');
  document.getElementById('contrib-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('c-title')?.focus(), 150);
}
function closeContribModal() {
  const modal = document.getElementById('contrib-modal');
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}
function submitContribution() {
  const get = id => document.getElementById(id);
  const title = get('c-title').value.trim();
  const province = get('c-province').value;
  const category = get('c-category').value;
  const lokasi = get('c-lokasi').value.trim();
  const desc = get('c-desc').value.trim();
  if (!title || !province || !category || !lokasi || !desc) {
    showToast('Harap lengkapi semua kolom!', 'err', 'triangle-alert'); return;
  }
  const newItem = {
    id: Date.now(),
    title, province, category,
    desc, detail: desc, lokasi,
    tahun_terdaftar: new Date().getFullYear().toString(),
    kontributor: get('c-kontributor').value.trim() || 'Sobat Budaya Sulawesi',
    audio: null,
    views: 0, likes: 0,
    tags: [title.split(' ')[0], (getProvince(province)||{}).short || province],
    comments: []
  };
  State.contributions.push(newItem);
  saveState();
  closeContribModal();
  ['c-title','c-lokasi','c-desc','c-kontributor'].forEach(id => { const el = get(id); if(el) el.value = ''; });
  showToast(`"${title}" berhasil ditambahkan. Terima kasih!`, 'ok', 'circle-check');
  renderCategories();
  renderProvinceList();
  renderExplorer();
  updateHeroStats();
}

// ---- AUDIO ----
// Memutar file audio sungguhan (item.audio.src). Item tanpa src dianggap belum punya rekaman.
const player = new Audio();
player.preload = 'none';

function hasAudio(item) { return !!(item && item.audio && item.audio.src); }
function isPlaying(item) { return State.audioItem === item && !player.paused; }

function fmtTime(sec) {
  if (!Number.isFinite(sec)) return '--:--';
  const t = Math.floor(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function setPlayIcons(name) {
  ['ab-play', 'modal-play-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.innerHTML = icon(name);
  });
}

function showAudioBar(item) {
  if (!hasAudio(item)) return;
  document.getElementById('ab-title').textContent = item.audio.title;
  document.getElementById('ab-sub').textContent = item.audio.artist;
  document.getElementById('ab-art').innerHTML = icon((getCategory(item.category) || {}).icon || 'music');
  document.getElementById('audio-bar').classList.add('on');
}

function toggleAudio(id) {
  const item = findItem(id);
  if (!hasAudio(item)) return;
  if (State.audioItem !== item) {
    State.audioItem = item;
    player.src = item.audio.src;
    showAudioBar(item);
  }
  if (player.paused) {
    player.play().catch(() => showToast('Audio gagal diputar', 'err', 'triangle-alert'));
  } else {
    player.pause();
  }
}

function updateAudioUI() {
  const pct = player.duration ? (player.currentTime / player.duration * 100).toFixed(1) : 0;
  ['ab-fill', 'modal-prog-fill'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.width = pct + '%';
  });
  const cur = document.getElementById('modal-time-cur');
  const dur = document.getElementById('modal-time-dur');
  if (cur) cur.textContent = fmtTime(player.currentTime);
  if (dur) dur.textContent = fmtTime(player.duration);
}

function seekAudio(e) {
  if (!player.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  player.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * player.duration;
}

function skipAudio(sec) {
  if (!player.duration) return;
  player.currentTime = Math.max(0, Math.min(player.duration, player.currentTime + sec));
}

function closeAudioBar() {
  player.pause();
  player.removeAttribute('src');
  player.load();
  State.audioItem = null;
  updateAudioUI();
  document.getElementById('audio-bar').classList.remove('on');
}

player.addEventListener('play', () => setPlayIcons('pause'));
player.addEventListener('pause', () => setPlayIcons('play'));
player.addEventListener('ended', () => { player.currentTime = 0; setPlayIcons('play'); });
player.addEventListener('timeupdate', updateAudioUI);
player.addEventListener('loadedmetadata', updateAudioUI);

// ---- QUIZ ----
const QUIZ_TIME = 20;

function clearQuizTimer() {
  if (State.quizTimer) { clearInterval(State.quizTimer); State.quizTimer = null; }
}

function timerColor(t) {
  return t <= 5 ? 'var(--bad)' : t <= 10 ? 'var(--warn)' : 'var(--good)';
}

function startQuizTimer() {
  clearQuizTimer();
  State.quizTimeLeft = QUIZ_TIME;
  State.quizTimer = setInterval(() => {
    State.quizTimeLeft--;
    const timerEl = document.getElementById('q-timer-count');
    const timerBar = document.getElementById('q-timer-bar-fill');
    if (timerEl) {
      timerEl.textContent = State.quizTimeLeft;
      timerEl.style.color = timerColor(State.quizTimeLeft);
    }
    if (timerBar) {
      timerBar.style.width = (State.quizTimeLeft / QUIZ_TIME * 100) + '%';
      timerBar.style.background = timerColor(State.quizTimeLeft);
    }
    if (State.quizTimeLeft <= 0) {
      clearQuizTimer();
      if (!State.quizAnswered) timeoutQuiz();
    }
  }, 1000);
}

function finishQuestion(correct, html, cls) {
  State.quizAnswered = true;
  State.quizAnswers[State.quizIndex] = correct;
  document.querySelectorAll('.q-opt').forEach(o => o.disabled = true);
  const fb = document.getElementById('q-feedback');
  if (fb) { fb.innerHTML = html; fb.className = 'q-feedback ' + cls; }
  const next = document.getElementById('q-next');
  if (next) next.hidden = false;
}

function timeoutQuiz() {
  const q = State.quizQuestions[State.quizIndex];
  document.getElementById('q-opt-' + q.answer)?.classList.add('correct');
  finishQuestion(false, `${icon('clock')} <strong>Waktu habis.</strong> Jawaban: <strong>${q.options[q.answer]}</strong>. ${q.explanation}`, 'bad');
}

function initQuiz() {
  clearQuizTimer();
  State.quizQuestions = [...QUIZ_DATA].sort(() => Math.random() - 0.5).slice(0, 10);
  State.quizIndex = 0;
  State.quizScore = 0;
  State.quizAnswered = false;
  State.quizAnswers = [];
  renderQuiz();
}

function renderQuiz() {
  const wrap = document.getElementById('quiz-wrap');
  if (!wrap) return;
  const total = State.quizQuestions.length;
  if (State.quizIndex >= total) {
    renderQuizResult(total);
    return;
  }
  const q = State.quizQuestions[State.quizIndex];
  const diff = q.difficulty === 'mudah' ? { label: 'Mudah', cls: 'good' }
    : q.difficulty === 'sulit' ? { label: 'Sulit', cls: 'bad' }
    : { label: 'Sedang', cls: 'warn' };
  wrap.innerHTML = `
    <div class="quiz-card">
      <div class="q-top">
        <span class="q-prog-lbl">Soal ${State.quizIndex+1} <span>/ ${total}</span></span>
        <span class="q-diff ${diff.cls}">${diff.label}</span>
        <span class="q-score">${icon('award')} ${State.quizScore}</span>
      </div>
      <div class="q-steps">${State.quizQuestions.map((_, i) =>
        `<span class="${i < State.quizIndex ? (State.quizAnswers[i] ? 'ok' : 'no') : i === State.quizIndex ? 'now' : ''}"></span>`).join('')}</div>
      <p class="q-question">${q.question}</p>
      <div class="q-opts">
        ${q.options.map((opt,i) => `
          <button class="q-opt" id="q-opt-${i}" onclick="answerQuiz(${i})"><span class="q-key">${String.fromCharCode(65+i)}</span>${opt}</button>
        `).join('')}
      </div>
      <div class="q-timer">
        <div class="q-timer-bar"><div id="q-timer-bar-fill"></div></div>
        <span id="q-timer-count">${QUIZ_TIME}</span>
      </div>
      <p class="q-feedback" id="q-feedback"></p>
      <button class="btn btn-accent" id="q-next" hidden onclick="nextQuiz()">
        ${State.quizIndex+1 >= total ? 'Lihat hasil' : 'Berikutnya'} ${icon('arrow-right')}
      </button>
    </div>`;
  startQuizTimer();
}

function answerQuiz(idx) {
  if (State.quizAnswered) return;
  clearQuizTimer();
  const q = State.quizQuestions[State.quizIndex];
  const opts = document.querySelectorAll('.q-opt');
  if (idx === q.answer) {
    State.quizScore++;
    opts[idx].classList.add('correct');
    finishQuestion(true, `${icon('circle-check')} <strong>Benar!</strong> ${q.explanation}`, 'good');
  } else {
    opts[idx].classList.add('wrong');
    if (opts[q.answer]) opts[q.answer].classList.add('correct');
    finishQuestion(false, `${icon('circle-x')} <strong>Kurang tepat.</strong> Jawaban: <strong>${q.options[q.answer]}</strong>. ${q.explanation}`, 'bad');
  }
}

function nextQuiz() {
  State.quizIndex++;
  State.quizAnswered = false;
  renderQuiz();
}

function renderQuizResult(total) {
  clearQuizTimer();
  const pct = Math.round(State.quizScore / total * 100);
  let title, desc, ico;
  if (pct >= 90) { ico='trophy'; title = 'Maestro Budaya Sulawesi'; desc = 'Luar biasa! Pengetahuan budaya Sulawesimu sangat mendalam.'; }
  else if (pct >= 70) { ico='medal'; title = 'Sobat Budaya Sejati'; desc = 'Bagus sekali! Kamu tahu banyak tentang kekayaan budaya Sulawesi.'; }
  else if (pct >= 50) { ico='book-open'; title = 'Penjelajah Budaya'; desc = 'Tidak buruk! Terus jelajahi koleksi untuk menambah wawasanmu.'; }
  else { ico='sprout'; title = 'Pemula yang Bersemangat'; desc = 'Jangan menyerah! Jelajahi koleksi budaya dan coba lagi.'; }

  const ansGrid = State.quizQuestions.map((_, i) =>
    `<span class="q-ans ${State.quizAnswers[i] ? 'ok' : 'no'}">${i + 1}</span>`).join('');

  document.getElementById('quiz-wrap').innerHTML = `
    <div class="quiz-card q-result">
      <div class="big-ico">${icon(ico)}</div>
      <div class="q-big-score">${State.quizScore}<span>/${total}</span></div>
      <div class="q-res-title">${title}</div>
      <p class="q-res-desc">${desc}</p>
      <div class="q-ans-grid">${ansGrid}</div>
      <div class="q-res-btns">
        <button class="btn btn-accent" onclick="initQuiz()">${icon('rotate-ccw')} Main lagi</button>
        <a class="btn btn-ghost" href="#koleksi" onclick="setTab('explorer')">Jelajahi koleksi</a>
      </div>
    </div>`;
}

// ---- HERO STATS ----
function updateHeroStats() {
  const n = allItems().length;
  const el = document.getElementById('stat-berkas');
  if (el) el.textContent = n;
  const fb = document.getElementById('f-stat-berkas');
  if (fb) fb.textContent = n;
}

// ============================================================
// ---- PETA (Leaflet: peta jalan, satelit, Google Maps) ----
// ============================================================
let leafletInstance = null;
let provinceLayer = null;
let cultureLayer = null;
let mapLayerMode = 'budaya';     // budaya | provinsi
let baseMode = 'peta';           // peta | satelit
const baseLayers = {};
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function initMap() {
  if (typeof L === 'undefined' || !document.getElementById('leaflet-map')) return;
  try {
    leafletInstance = L.map('leaflet-map', {
      zoomControl: false,
      scrollWheelZoom: false,
    });
    // Seluruh Pulau Sulawesi selalu terlihat, berapa pun lebar layarnya
    leafletInstance.fitBounds([[-6.2, 118.8], [2.0, 125.3]], { padding: [16, 16] });
    L.control.zoom({ position: 'bottomright' }).addTo(leafletInstance);
    // Zoom dengan scroll hanya setelah peta diklik, agar halaman tetap mudah di-scroll
    leafletInstance.on('click', () => leafletInstance.scrollWheelZoom.enable());
    leafletInstance.on('mouseout', () => leafletInstance.scrollWheelZoom.disable());

    // Tile Esri (tanpa API key). Mode gelap memakai kanvas abu-abu gelap + label.
    const esri = (service, attribution) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`, {
      attribution, maxZoom: 19,
    });
    baseLayers.light = esri('World_Street_Map', 'Peta &copy; Esri, HERE, Garmin, &copy; OpenStreetMap');
    baseLayers.dark = L.layerGroup([
      esri('Canvas/World_Dark_Gray_Base', 'Peta &copy; Esri, HERE, Garmin, &copy; OpenStreetMap'),
      esri('Canvas/World_Dark_Gray_Reference', ''),
    ]);
    baseLayers.satelit = L.layerGroup([
      esri('World_Imagery', 'Citra &copy; Esri, Maxar, Earthstar Geographics'),
      esri('Reference/World_Boundaries_and_Places', ''),
    ]);

    provinceLayer = L.layerGroup();
    cultureLayer = L.markerClusterGroup
      ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 })
      : L.layerGroup();
    setBaseMap('peta');
    refreshMapMarkers();
    setMapLayer('budaya');
    addMapControls();
    darkQuery.addEventListener('change', () => { if (baseMode === 'peta') setBaseMap('peta'); });
  } catch (e) {
    console.warn('Leaflet map error:', e);
  }
}

function setBaseMap(mode) {
  if (!leafletInstance) return;
  baseMode = mode;
  Object.values(baseLayers).forEach(l => leafletInstance.removeLayer(l));
  const layer = mode === 'satelit' ? baseLayers.satelit : (darkQuery.matches ? baseLayers.dark : baseLayers.light);
  layer.addTo(leafletInstance);
  document.getElementById('leaflet-map-box')?.classList.toggle('is-sat', mode === 'satelit');
  document.querySelectorAll('.map-ctl-base').forEach(b => b.classList.toggle('active', b.dataset.base === mode));
}

// Koordinat item; kontribusi tanpa koordinat ditaruh di tengah provinsinya.
function itemLatLng(item) {
  if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) return [item.lat, item.lng];
  const prov = getProvince(item.province);
  return prov ? [prov.lat, prov.lng] : null;
}

function popupHTML(item, color) {
  return `
    <div class="map-pop">
      ${item.image ? `<img class="map-pop-img" src="${esc(item.image)}" alt="">` : ''}
      <div class="map-pop-body">
        <strong>${esc(item.title)}</strong>
        <span class="map-pop-sub">${esc(item.lokasi)}</span>
        <div class="map-pop-btns">
          <button class="map-pop-btn" style="--mc:${color}" onclick="openDetail(${item.id})">Detail</button>
          <a class="map-pop-btn ghost" href="${gmapsUrl(item)}" target="_blank" rel="noopener">${icon('external-link')} Google Maps</a>
        </div>
      </div>
    </div>`;
}

function buildProvinceMarkers() {
  const data = allItems();
  provinceLayer.clearLayers();
  PROVINCES.forEach(p => {
    const cnt = data.filter(d => d.province === p.id).length;
    const markerIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `<div class="prov-marker"><span class="dot" style="background:${p.color}"></span>${p.short}<b>${cnt}</b></div>`,
      iconSize: null,
    });
    L.marker([p.lat, p.lng], { icon: markerIcon })
      .on('click', () => { focusProvince(p.id); setMapLayer('budaya'); })
      .addTo(provinceLayer);
  });
}

// Penanda per budaya mengikuti filter yang sedang aktif (provinsi, kategori, pencarian).
function refreshMapMarkers() {
  if (!cultureLayer) return;
  buildProvinceMarkers();
  cultureLayer.clearLayers();
  getFilteredData().forEach(item => {
    const pos = itemLatLng(item);
    if (!pos) return;
    const cat = getCategory(item.category);
    const color = cat ? cat.color : '#B5482A';
    const markerIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `<div class="item-marker" style="--mc:${color}">${icon(cat ? cat.icon : 'map-pin')}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -30]
    });
    L.marker(pos, { icon: markerIcon, title: item.title })
      .bindPopup(popupHTML(item, color), { maxWidth: 240, minWidth: 220 })
      .addTo(cultureLayer);
  });
}

function fitMapToData() {
  if (!leafletInstance) return;
  const pts = getFilteredData().map(itemLatLng).filter(Boolean);
  if (pts.length) leafletInstance.flyToBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 11, duration: 0.8 });
}

function setMapLayer(mode) {
  if (!leafletInstance) return;
  mapLayerMode = mode;
  if (mode === 'budaya') {
    leafletInstance.removeLayer(provinceLayer);
    leafletInstance.addLayer(cultureLayer);
  } else {
    leafletInstance.removeLayer(cultureLayer);
    leafletInstance.addLayer(provinceLayer);
  }
  document.querySelectorAll('.map-ctl-layer').forEach(b => b.classList.toggle('active', b.dataset.layer === mode));
}

function addMapControls() {
  const Ctl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const box = L.DomUtil.create('div', 'map-ctl');
      box.innerHTML = `
        <div class="map-ctl-group">
          <button class="map-ctl-base" data-base="peta" onclick="setBaseMap('peta')">${icon('map')} Peta</button>
          <button class="map-ctl-base" data-base="satelit" onclick="setBaseMap('satelit')">${icon('globe')} Satelit</button>
        </div>
        <div class="map-ctl-group">
          <button class="map-ctl-layer" data-layer="budaya" onclick="setMapLayer('budaya')">${icon('map-pin')} Budaya</button>
          <button class="map-ctl-layer" data-layer="provinsi" onclick="setMapLayer('provinsi')">${icon('layers')} Provinsi</button>
        </div>
        <button class="map-ctl-loc" id="btn-locate" onclick="toggleLocate()">${icon('locate')} Lokasi saya</button>`;
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      return box;
    }
  });
  leafletInstance.addControl(new Ctl());
  document.querySelectorAll('.map-ctl-layer').forEach(b => b.classList.toggle('active', b.dataset.layer === mapLayerMode));
  document.querySelectorAll('.map-ctl-base').forEach(b => b.classList.toggle('active', b.dataset.base === baseMode));
}

// ---- PETA: LOKASI SAYA (real time via watchPosition) ----
let locWatchId = null;
let locMarker = null;
let locCircle = null;
let locFirstFix = false;
let nearbyKey = '';

function toggleLocate() {
  if (locWatchId !== null) { stopLocate(); return; }
  if (!('geolocation' in navigator)) {
    showToast('Browser ini tidak mendukung lokasi', 'err', 'triangle-alert');
    return;
  }
  locFirstFix = true;
  document.getElementById('btn-locate')?.classList.add('active', 'loading');
  locWatchId = navigator.geolocation.watchPosition(onLocation, onLocationError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 20000
  });
}

function stopLocate() {
  if (locWatchId !== null) navigator.geolocation.clearWatch(locWatchId);
  locWatchId = null;
  if (locMarker) { leafletInstance.removeLayer(locMarker); locMarker = null; }
  if (locCircle) { leafletInstance.removeLayer(locCircle); locCircle = null; }
  document.getElementById('btn-locate')?.classList.remove('active', 'loading');
  const panel = document.getElementById('nearby-panel');
  if (panel) panel.hidden = true;
  nearbyKey = '';
}

function onLocation(pos) {
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  const here = [lat, lng];
  document.getElementById('btn-locate')?.classList.remove('loading');
  if (!locMarker) {
    locMarker = L.marker(here, {
      icon: L.divIcon({ className: 'custom-leaflet-marker', html: '<div class="me-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
      zIndexOffset: 1000,
      title: 'Lokasi kamu'
    }).addTo(leafletInstance);
    locCircle = L.circle(here, { radius: accuracy, color: '#2563EB', weight: 1, fillOpacity: 0.1 }).addTo(leafletInstance);
  } else {
    locMarker.setLatLng(here);
    locCircle.setLatLng(here).setRadius(accuracy);
  }
  const nearby = nearestCultures(lat, lng, 3);
  renderNearby(nearby);
  if (locFirstFix) {
    locFirstFix = false;
    // Tampilkan posisi kamu sekaligus budaya terdekat
    const pts = [here, ...nearby.map(n => itemLatLng(n.item))];
    leafletInstance.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 12 });
  }
}

function onLocationError(err) {
  // Sinyal GPS sempat hilang setelah posisi pertama didapat: tetap lacak, tunggu pembaruan berikutnya.
  if (err.code !== 1 && locMarker) return;
  const msg = err.code === 1 ? 'Izin lokasi ditolak. Aktifkan di pengaturan browser.'
    : err.code === 3 ? 'Lokasi tidak ditemukan (waktu habis). Coba lagi.'
    : 'Lokasi tidak tersedia saat ini.';
  showToast(msg, 'err', 'triangle-alert');
  stopLocate();
}

// Jarak garis lurus (km) dengan rumus haversine
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestCultures(lat, lng, n) {
  return allItems()
    .map(item => {
      const pos = itemLatLng(item);
      return pos ? { item, km: distanceKm(lat, lng, pos[0], pos[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

function formatKm(km) {
  if (km < 1) return Math.round(km * 1000) + ' m';
  return (km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('id')) + ' km';
}

function renderNearby(list) {
  const panel = document.getElementById('nearby-panel');
  if (!panel) return;
  // Gambar ulang hanya jika daftar/jarak berubah (posisi diperbarui terus-menerus)
  const key = list.map(n => n.item.id + ':' + formatKm(n.km)).join('|');
  if (key === nearbyKey && !panel.hidden) return;
  nearbyKey = key;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="nearby-head">Terdekat darimu <button class="nearby-x" onclick="stopLocate()" aria-label="Tutup">${icon('x')}</button></div>
    ${list.map(({ item, km }) => `
      <div class="nearby-item">
        <button class="nearby-main" onclick="openDetail(${item.id})">
          ${coverArt(item, 'sim-ico', 'sim-ico sim-img')}
          <span class="nearby-txt"><span class="nearby-title">${esc(item.title)}</span><span class="nearby-km">${formatKm(km)}</span></span>
        </button>
        <a class="nearby-route" href="${gmapsRouteUrl(item)}" target="_blank" rel="noopener" title="Rute di Google Maps">${icon('navigation')}</a>
      </div>`).join('')}`;
}

// ---- NAVBAR ----
function initNavbar() {
  const nav = document.getElementById('navbar');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const ham = document.getElementById('hamburger');
  const links = document.getElementById('nav-links');
  if (ham && links) {
    ham.addEventListener('click', () => links.classList.toggle('open'));
    links.addEventListener('click', e => { if (e.target.closest('a')) links.classList.remove('open'); });
  }
  document.getElementById('nav-search-input')?.addEventListener('keyup', e => {
    if (e.key === 'Enter') { doSearch(e.target.value); scrollToId('koleksi'); }
  });
  document.getElementById('hero-search-input')?.addEventListener('keyup', e => {
    if (e.key === 'Enter') heroSearch();
  });
}

// ---- SEARCH BUTTON ----
function heroSearch() {
  const q = document.getElementById('hero-search-input').value;
  const cat = document.getElementById('hero-search-cat').value;
  setCategory(cat || 'all');
  doSearch(q);
  scrollToId('koleksi');
}

// ---- COUNTER ANIMATION ----
function animateCounter(el, target, suffix='') {
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 40));
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString('id') + suffix;
    if (current >= target) clearInterval(timer);
  }, 30);
}

// ---- NEWSLETTER ----
function submitNewsletter(e) {
  e.preventDefault();
  const inp = document.getElementById('nl-input');
  if (!inp.value.includes('@')) { showToast('Masukkan email yang valid!', 'err', 'triangle-alert'); return; }
  showToast(`Berhasil berlangganan dengan ${inp.value}!`, 'ok', 'mail');
  inp.value = '';
}

// ============================================================
// ---- INIT ----
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  hydrateIcons();
  renderHeroMosaic();
  renderCategories();
  renderProvinceFilters();
  renderProvinceList();
  renderFooterLinks();
  renderFavCount();
  updateHeroStats();
  initNavbar();
  initMap();
  setTab('explorer');

  const statBerkas = document.getElementById('stat-berkas');
  const statKont = document.getElementById('stat-kontributor');
  if (statBerkas) animateCounter(statBerkas, allItems().length);
  if (statKont) animateCounter(statKont, 200, '+');

  // Tutup modal saat klik di luar kotak
  document.getElementById('detail-modal').addEventListener('click', function(e) {
    if (e.target === this) closeDetail();
  });
  document.getElementById('contrib-modal').addEventListener('click', function(e) {
    if (e.target === this) closeContribModal();
  });

  // ESC menutup modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDetail(); closeContribModal(); }
  });
});
