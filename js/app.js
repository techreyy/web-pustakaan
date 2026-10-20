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
  activeTab: 'explorer',   // explorer | favorites | quiz
  searchQuery: '',
  sortBy: 'popular',
  viewMode: 'grid',        // grid | list
  favorites: loadLS('pdbs-favorites', []),
  likes: loadLS('pdbs-likes', []),
  contributions: loadLS('pdbs-contributions', []).filter(c => c && Number.isFinite(c.id)),
  comments: loadLS('pdbs-comments', {}),
  displayCount: 12,
  // quiz state
  quizActive: false,
  quizIndex: 0,
  quizScore: 0,
  quizAnswered: false,
  quizQuestions: [],
  quizTimer: null,      // setInterval ID for countdown
  quizTimeLeft: 20,    // seconds remaining per question
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

// ---- AVATAR INISIAL (pengganti emoji) ----
function avatar(name, cls) {
  const words = String(name || '?').trim().split(/\s+/);
  const init = (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = PROVINCES[h % PROVINCES.length].color;
  return `<div class="${cls}" style="background:${color}">${esc(init)}</div>`;
}

// ---- GAMBAR SAMPUL ----
// Pakai foto bila ada; jika tidak, ikon kategori di atas gradasi warna kategori.
function coverArt(item, cls, imgCls) {
  if (item.image && imgCls) {
    return `<img class="${imgCls}" src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy">`;
  }
  const cat = getCategory(item.category);
  return `<div class="${cls}" style="--cc:${cat ? cat.color : 'var(--primary)'}">${icon(cat ? cat.icon : 'book-open')}</div>`;
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
  let data = [...CULTURE_DATA, ...State.contributions];
  if (State.activeProvince !== 'all') data = data.filter(d => d.province === State.activeProvince);
  if (State.activeCategory !== 'all') data = data.filter(d => d.category === State.activeCategory);
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    data = data.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.desc.toLowerCase().includes(q) ||
      d.tags.some(t => t.toLowerCase().includes(q)) ||
      (getProvince(d.province)||{}).name.toLowerCase().includes(q)
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
  const liked = isLiked(item.id);
  const likeCount = item.likes + (liked ? 0 : 0);
  const isGrid = State.viewMode === 'grid';
  return `
    <div class="c-card anim-up" onclick="openDetail(${item.id})">
      <div class="c-card-img" style="${isGrid ? '' : 'height:190px'}">
        ${coverArt(item, 'c-img-placeholder', 'c-img-inner')}
        <div class="c-badges">
          ${prov ? `<span class="c-badge b-prov">${prov.short}</span>` : ''}
          ${cat ? `<span class="c-badge b-cat">${cat.label}</span>` : ''}
        </div>
        <button class="c-fav ${fav?'on':''}" onclick="toggleFav(event,${item.id})" title="${fav?'Hapus dari favorit':'Simpan ke favorit'}">${icon('heart')}</button>
        ${hasAudio(item) ? `<div class="c-audio-badge">${icon('headphones')} Audio</div>` : ''}
      </div>
      <div class="c-body">
        <div class="c-title">${esc(item.title)}</div>
        <div class="c-desc">${esc(item.desc)}</div>
        <div class="c-foot">
          <div class="c-stats">
            <span class="c-stat">${icon('eye')} ${formatNum(item.views)}</span>
            <span class="c-stat">${icon('heart')} ${formatNum(item.likes)}</span>
          </div>
          <span style="font-size:11px;color:var(--text-muted)">${prov ? prov.name : ''}</span>
        </div>
      </div>
    </div>`;
}

// ---- RENDER EXPLORER ----
function renderExplorer() {
  refreshMapMarkers();
  const container = document.getElementById('culture-grid');
  if (!container) return;
  const data = getFilteredData();
  const shown = data.slice(0, State.displayCount);
  const srchInfo = document.getElementById('search-info');

  if (State.searchQuery && srchInfo) {
    srchInfo.style.display = 'block';
    srchInfo.innerHTML = `Menampilkan <strong>${data.length} hasil</strong> untuk pencarian "<strong>${esc(State.searchQuery)}</strong>"`;
  } else if (srchInfo) {
    srchInfo.style.display = 'none';
  }

  if (data.length === 0) {
    container.innerHTML = `<div class="no-result" style="grid-column:1/-1">
      <div class="no-result-ico">${icon('search')}</div>
      <div class="no-result-title">Tidak Ada Hasil</div>
      <p style="font-size:14px;color:var(--text-muted)">Coba gunakan kata kunci atau filter yang berbeda</p>
    </div>`;
    document.getElementById('load-more-wrap').style.display = 'none';
    return;
  }

  container.innerHTML = shown.map(renderCard).join('');
  const lmw = document.getElementById('load-more-wrap');
  lmw.style.display = data.length > State.displayCount ? 'block' : 'none';
  document.getElementById('load-more-count').textContent = Math.min(State.displayCount + 12, data.length) - shown.length + ' Lagi';
}

// ---- RENDER FAVORITES ----
function renderFavorites() {
  const container = document.getElementById('fav-grid');
  if (!container) return;
  const items = [...CULTURE_DATA, ...State.contributions].filter(d => isFav(d.id));
  if (items.length === 0) {
    container.innerHTML = `<div class="fav-empty" style="grid-column:1/-1">
      <div class="fav-empty-ico">${icon('heart-off')}</div>
      <div class="fav-empty-title">Belum Ada Favorit</div>
      <p style="font-size:14px">Klik ikon ${icon('heart')} pada koleksi budaya untuk menyimpannya di sini.</p>
    </div>`;
    return;
  }
  const saved = State.viewMode;
  State.viewMode = 'grid';
  container.innerHTML = items.map(renderCard).join('');
  State.viewMode = saved;
}

// ---- CATEGORY BAR ----
function renderCategories() {
  const grid = document.getElementById('cat-grid');
  if (!grid) return;
  const allData = [...CULTURE_DATA, ...State.contributions];
  grid.innerHTML = CATEGORIES.map(cat => {
    const cnt = cat.id === 'all' ? allData.length : allData.filter(d => d.category === cat.id).length;
    return `<div class="cat-card ${State.activeCategory === cat.id ? 'active' : ''}"
      style="--cat-clr:${cat.color}"
      onclick="setCategory('${cat.id}')">
      <span class="cat-icon">${icon(cat.icon)}</span>
      <div class="cat-name">${cat.label}</div>
      <div class="cat-cnt">${cnt} berkas</div>
    </div>`;
  }).join('');
}

// ---- PROVINCE BUTTONS ----
function renderProvinceList() {
  const list = document.getElementById('prov-list');
  if (!list) return;
  const allData = [...CULTURE_DATA, ...State.contributions];
  const allBtn = `<button class="prov-btn ${State.activeProvince==='all'?'active':''}" onclick="setProvince('all')">
    <span class="prov-dot" style="background:#D4AC0D"></span>
    <span class="prov-name">Seluruh Sulawesi</span>
    <span class="prov-cnt">${allData.length}</span>
  </button>`;
  const provBtns = PROVINCES.map(p => {
    const cnt = allData.filter(d => d.province === p.id).length;
    return `<button class="prov-btn ${State.activeProvince===p.id?'active':''}" onclick="setProvince('${p.id}')">
      <span class="prov-dot" style="background:${p.color}"></span>
      <span class="prov-name">${p.name}</span>
      <span class="prov-cnt">${cnt}</span>
    </button>`;
  }).join('');
  list.innerHTML = allBtn + provBtns;
}

// ---- MAP SVG ----
function updateMapHighlight() {
  document.querySelectorAll('#sulawesi-svg .prov-path').forEach(path => {
    path.classList.toggle('active', path.dataset.prov === State.activeProvince);
  });
}

// ---- SECTION TABS ----
function setTab(tab) {
  State.activeTab = tab;
  document.querySelectorAll('.n-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  const el = document.getElementById('tab-' + tab);
  if (el) el.style.display = '';
  if (tab === 'explorer') renderExplorer();
  if (tab === 'favorites') renderFavorites();
  if (tab === 'quiz') initQuiz();
}

// ---- FILTER ACTIONS ----
function setProvince(id) {
  State.activeProvince = id;
  State.displayCount = 12;
  renderProvinceList();
  updateMapHighlight();
  renderExplorer();
  if (id !== 'all') {
    const prov = getProvince(id);
    if (prov) showToast(`Menampilkan budaya ${prov.name}`, 'ok', 'map-pin');
  }
}

function setCategory(id) {
  State.activeCategory = id;
  State.displayCount = 12;
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
  State.searchQuery = q;
  State.displayCount = 12;
  if (State.activeTab !== 'explorer') setTab('explorer');
  renderExplorer();
}

// ---- TOGGLE FAVORITE ----
function toggleFav(e, id) {
  e.stopPropagation();
  if (isFav(id)) {
    State.favorites = State.favorites.filter(f => f !== id);
    showToast('Dihapus dari Favorit', 'ok', 'heart-off');
  } else {
    State.favorites.push(id);
    showToast('Ditambahkan ke Favorit!', 'ok', 'heart');
  }
  saveState();
  renderExplorer();
  if (State.activeTab === 'favorites') renderFavorites();
}

// ---- TOGGLE LIKE ----
function toggleLike(id) {
  const item = [...CULTURE_DATA, ...State.contributions].find(d => d.id === id);
  if (!item) return;
  if (isLiked(id)) {
    State.likes = State.likes.filter(l => l !== id);
    item.likes = Math.max(0, item.likes - 1);
    showToast('Suka dihapus', 'ok', 'thumbs-up');
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

// ---- OPEN DETAIL MODAL ----
function openDetail(id) {
  const item = [...CULTURE_DATA, ...State.contributions].find(d => d.id === id);
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
            ${prov ? `<span class="c-badge b-prov">${icon('map-pin')} ${prov.name}</span>` : ''}
            ${cat ? `<span class="c-badge b-cat">${icon(cat.icon)} ${cat.label}</span>` : ''}
          </div>
          <h1 class="m-title">${esc(item.title)}</h1>
          <p class="m-sub">${icon('calendar')} Terdaftar ${esc(item.tahun_terdaftar)} &nbsp;|&nbsp; ${icon('user')} ${esc(item.kontributor)}</p>
        </div>
        <button class="m-close" onclick="closeDetail()" aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="m-body">
        <div class="m-grid">
          <div>
            <p class="m-desc">${esc(item.detail || item.desc)}</p>
            <table class="m-table">
              <tr><td>Provinsi</td><td>${prov ? prov.name : '-'}</td></tr>
              <tr><td>Lokasi</td><td>${esc(item.lokasi)}</td></tr>
              <tr><td>Kategori</td><td>${cat ? cat.label : '-'}</td></tr>
              <tr><td>Terdaftar</td><td>${esc(item.tahun_terdaftar)}</td></tr>
              <tr><td>Kontributor</td><td>${esc(item.kontributor)}</td></tr>
              <tr><td>Tag</td><td>${item.tags.map(t=>`<span style="display:inline-block;background:var(--light-2);border-radius:50px;padding:2px 9px;font-size:11px;margin:2px;font-weight:500">#${esc(t)}</span>`).join('')}</td></tr>
            </table>
            ${item.imageCredit ? `
            <p class="img-credit">${icon('camera')} Foto: ${esc(item.imageCredit.author)} · ${esc(item.imageCredit.license)} ·
              <a href="${esc(item.imageCredit.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></p>` : ''}
            ${item.audio ? `
            <div class="audio-box">
              <div class="audio-lbl">${icon('headphones')} Audio Budaya</div>
              <div class="audio-song">${esc(item.audio.title)}</div>
              ${hasAudio(item) ? `
              <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:12px">${esc(item.audio.artist)}</div>
              <div class="audio-ctrls">
                <button class="a-play" id="modal-play-btn" onclick="toggleAudio(${item.id})" aria-label="Putar / jeda">${icon(isPlaying(item) ? 'pause' : 'play')}</button>
                <div class="a-prog">
                  <div class="a-time">
                    <span id="modal-time-cur">0:00</span>
                    <span id="modal-time-dur">--:--</span>
                  </div>
                  <div class="a-bar" onclick="seekAudio(event)">
                    <div class="a-fill" id="modal-prog-fill"></div>
                  </div>
                </div>
              </div>` : `
              <div class="audio-soon">${icon('clock')} Rekaman segera hadir. Punya rekamannya? Bantu lewat menu Kontribusi.</div>`}
            </div>` : ''}
            <div class="cmts">
              <h3 class="cmts-title">${icon('message-circle')} Diskusi <span style="font-size:14px;font-weight:500;color:var(--text-muted)">(${comments.length})</span></h3>
              <div class="cmt-form">
                <div class="cmt-avatar">${icon('user')}</div>
                <div class="cmt-right">
                  <textarea class="cmt-input" id="cmt-input-${item.id}" rows="2" placeholder="Tulis komentarmu tentang ${esc(item.title)}..."></textarea>
                  <button class="cmt-sub" onclick="submitComment(${item.id})">Kirim</button>
                </div>
              </div>
              <div class="cmt-list" id="cmt-list-${item.id}">
                ${comments.map(c => `
                <div class="cmt-item">
                  ${avatar(c.name, 'cmt-av-sm')}
                  <div class="cmt-content">
                    <div class="cmt-hd"><span class="cmt-name">${esc(c.name)}</span><span class="cmt-time">${esc(c.time)}</span></div>
                    <p class="cmt-text">${esc(c.text)}</p>
                  </div>
                </div>`).join('')}
              </div>
            </div>
          </div>
          <div>
            <div class="m-actions">
              <button class="m-act-btn ${liked?'on':''}" data-action="like" onclick="toggleLike(${item.id})">
                <span class="m-act-ico">${icon('heart')}</span>
                <span>${liked?'Disukai':'Suka'}</span>
              </button>
              <button class="m-act-btn ${fav?'on':''}" data-action="fav" onclick="toggleFavModal(${item.id})">
                <span class="m-act-ico">${icon(fav ? 'bookmark-check' : 'bookmark')}</span>
                <span>${fav?'Tersimpan':'Simpan'}</span>
              </button>
              <button class="m-act-btn" onclick="shareItem(${item.id})">
                <span class="m-act-ico">${icon('share-2')}</span>
                <span>Bagikan</span>
              </button>
            </div>
            <div class="m-stat-grid">
              <div class="m-stat-box">
                <div class="m-stat-num" id="modal-view-count">${formatNum(item.views)}</div>
                <div class="m-stat-lbl">${icon('eye')} Dilihat</div>
              </div>
              <div class="m-stat-box">
                <div class="m-stat-num" id="modal-like-count">${formatNum(item.likes)}</div>
                <div class="m-stat-lbl">${icon('heart')} Disukai</div>
              </div>
              <div class="m-stat-box">
                <div class="m-stat-num">${comments.length}</div>
                <div class="m-stat-lbl">${icon('message-circle')} Komentar</div>
              </div>
              <div class="m-stat-box">
                <div class="m-stat-num">${item.tags.length}</div>
                <div class="m-stat-lbl">${icon('tag')} Tag</div>
              </div>
            </div>
            ${prov ? `
            <div style="background:linear-gradient(135deg,${prov.color}22,${prov.color}11);border:1px solid ${prov.color}33;border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
              <div style="font-size:11px;font-weight:700;color:${prov.color};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${icon('map-pin')} Provinsi</div>
              <div style="font-size:16px;font-weight:700;color:var(--text-dark)">${prov.name}</div>
              <div style="font-size:12px;color:var(--text-muted)">${prov.capital} — Ibukota</div>
              <button onclick="closeDetail();setProvince('${prov.id}')" style="margin-top:10px;font-size:12px;color:${prov.color};background:none;border:none;cursor:pointer;font-weight:600">Lihat semua budaya →</button>
            </div>` : ''}
            <div style="background:var(--light-2);border-radius:var(--radius-md);padding:16px">
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">${icon('lightbulb')} Budaya Serupa</div>
              ${getSimilar(item).map(s => `
              <div onclick="openDetail(${s.id})" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light);cursor:pointer;transition:var(--transition)" onmouseover="this.style.paddingLeft='6px'" onmouseout="this.style.paddingLeft='0'">
                ${coverArt(s, 'sim-ico', 'sim-ico sim-img')}
                <div><div style="font-size:13px;font-weight:600;color:var(--text-dark)">${esc(s.title)}</div><div style="font-size:11px;color:var(--text-muted)">${(getProvince(s.province)||{}).short}</div></div>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (isPlaying(item) || State.audioItem === item) updateAudioUI();
}

function getSimilar(item) {
  return CULTURE_DATA.filter(d =>
    d.id !== item.id && (d.category === item.category || d.province === item.province)
  ).slice(0, 3);
}

function closeDetail() {
  const modal = document.getElementById('detail-modal');
  modal.classList.remove('open');
  document.body.style.overflow = '';
  renderExplorer();
}

function toggleFavModal(id) {
  if (isFav(id)) {
    State.favorites = State.favorites.filter(f => f !== id);
    showToast('Dihapus dari Favorit', 'ok', 'heart-off');
  } else {
    State.favorites.push(id);
    showToast('Ditambahkan ke Favorit!', 'ok', 'heart');
  }
  saveState();
  const btn = document.querySelector('.m-act-btn[data-action="fav"]');
  if (btn) {
    btn.classList.toggle('on', isFav(id));
    btn.querySelector('span:last-child').textContent = isFav(id) ? 'Tersimpan' : 'Simpan';
    btn.querySelector('span:first-child').innerHTML = icon(isFav(id) ? 'bookmark-check' : 'bookmark');
  }
}

function shareItem(id) {
  const item = [...CULTURE_DATA, ...State.contributions].find(d => d.id === id);
  if (!item) return;
  const text = `Yuk kenali budaya Sulawesi: "${item.title}" dari ${(getProvince(item.province)||{}).name}! Temukan di Perpustakaan Digital Budaya Sulawesi.`;
  if (navigator.share) {
    navigator.share({ title: item.title, text, url: window.location.href });
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
  if (list) {
    const el = document.createElement('div');
    el.className = 'cmt-item anim-up';
    el.innerHTML = `
      ${avatar(comment.name, 'cmt-av-sm')}
      <div class="cmt-content">
        <div class="cmt-hd"><span class="cmt-name">${esc(comment.name)}</span><span class="cmt-time">${esc(comment.time)}</span></div>
        <p class="cmt-text">${esc(comment.text)}</p>
      </div>`;
    list.prepend(el);
  }
  showToast('Komentar terkirim!', 'ok', 'message-circle');
}

// ---- CONTRIBUTION MODAL ----
function openContribModal() {
  const modal = document.getElementById('contrib-modal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeContribModal() {
  const modal = document.getElementById('contrib-modal');
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
  showToast(`"${title}" berhasil ditambahkan! Terima kasih, Sobat Budaya!`, 'ok', 'circle-check');
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
  const item = [...CULTURE_DATA, ...State.contributions].find(d => d.id === id);
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
// ---- QUIZ TIMER HELPERS ----
function clearQuizTimer() {
  if (State.quizTimer) { clearInterval(State.quizTimer); State.quizTimer = null; }
}

function startQuizTimer() {
  clearQuizTimer();
  State.quizTimeLeft = 20;
  State.quizTimer = setInterval(() => {
    State.quizTimeLeft--;
    const timerEl = document.getElementById('q-timer-count');
    const timerBar = document.getElementById('q-timer-bar-fill');
    if (timerEl) {
      timerEl.textContent = State.quizTimeLeft;
      timerEl.style.color = State.quizTimeLeft <= 5 ? '#E74C3C' : (State.quizTimeLeft <= 10 ? '#F39C12' : '#2ECC71');
    }
    if (timerBar) {
      const pct = (State.quizTimeLeft / 20) * 100;
      timerBar.style.width = pct + '%';
      timerBar.style.background = State.quizTimeLeft <= 5 ? '#E74C3C' : (State.quizTimeLeft <= 10 ? '#F39C12' : '#2ECC71');
    }
    if (State.quizTimeLeft <= 0) {
      clearQuizTimer();
      // Time's up — auto-answer as wrong
      if (!State.quizAnswered) {
        timeoutQuiz();
      }
    }
  }, 1000);
}

function timeoutQuiz() {
  State.quizAnswered = true;
  const q = State.quizQuestions[State.quizIndex];
  const opts = document.querySelectorAll('.q-opt');
  opts.forEach(o => o.disabled = true);
  if (opts[q.answer]) opts[q.answer].classList.add('correct');
  const fb = document.getElementById('q-feedback');
  if (fb) {
    fb.innerHTML = `${icon('clock')} <strong>Waktu habis!</strong> Jawaban yang benar: <strong>${q.options[q.answer]}</strong>. ${q.explanation}`;
    fb.style.color = '#E74C3C';
  }
  const next = document.getElementById('q-next');
  if (next) next.style.display = 'inline-flex';
}

function initQuiz() {
  clearQuizTimer();
  State.quizQuestions = [...QUIZ_DATA].sort(() => Math.random() - 0.5).slice(0, 10);
  State.quizIndex = 0;
  State.quizScore = 0;
  State.quizAnswered = false;
  renderQuiz();
}

function renderQuiz() {
  const wrap = document.getElementById('quiz-wrap');
  if (!wrap) return;
  const total = State.quizQuestions.length;
  if (State.quizIndex >= total) {
    clearQuizTimer();
    renderQuizResult(total);
    return;
  }
  const q = State.quizQuestions[State.quizIndex];
  const pct = (State.quizIndex / total * 100).toFixed(0);
  const diffLabel = q.difficulty === 'mudah' ? { label: 'Mudah', color: '#2ECC71' }
    : q.difficulty === 'sulit' ? { label: 'Sulit', color: '#E74C3C' }
    : { label: 'Sedang', color: '#F39C12' };
  wrap.innerHTML = `
    <div class="quiz-card">
      <div class="q-prog-row">
        <span class="q-prog-lbl">Pertanyaan ${State.quizIndex+1}/${total}</span>
        <div class="q-prog-bar"><div class="q-prog-fill" style="width:${pct}%"></div></div>
        <span class="q-score">${icon('award')} ${State.quizScore}/${total}</span>
      </div>
      <!-- Timer Row -->
      <div class="q-timer-row" style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <span style="font-size:12px;color:rgba(255,255,255,0.5)">
          <span style="color:${diffLabel.color};font-weight:600"><span class="dot" style="background:${diffLabel.color}"></span>${diffLabel.label}</span>
        </span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
          <div id="q-timer-bar-fill" style="height:100%;width:100%;background:#2ECC71;border-radius:3px;transition:width 1s linear,background 0.3s"></div>
        </div>
        <span style="font-size:13px;font-weight:700;min-width:28px;text-align:right" id="q-timer-count">20</span>
        <span style="font-size:11px;color:rgba(255,255,255,0.4)">dtk</span>
      </div>
      <p class="q-question">${q.question}</p>
      <div class="q-opts">
        ${q.options.map((opt,i) => `
          <button class="q-opt" id="q-opt-${i}" onclick="answerQuiz(${i})">${String.fromCharCode(65+i)}. ${opt}</button>
        `).join('')}
      </div>
      <p class="q-feedback" id="q-feedback"></p>
      <button class="q-next" id="q-next" style="display:none" onclick="nextQuiz()">
        ${State.quizIndex+1 >= total ? 'Lihat Hasil' : 'Pertanyaan Berikutnya →'}
      </button>
    </div>`;
  // Start timer after DOM update
  startQuizTimer();
}

function answerQuiz(idx) {
  if (State.quizAnswered) return;
  clearQuizTimer();
  State.quizAnswered = true;
  const q = State.quizQuestions[State.quizIndex];
  const opts = document.querySelectorAll('.q-opt');
  opts.forEach(o => o.disabled = true);
  const fb = document.getElementById('q-feedback');
  const next = document.getElementById('q-next');
  if (idx === q.answer) {
    State.quizScore++;
    opts[idx].classList.add('correct');
    fb.innerHTML = `${icon('circle-check')} <strong>Benar!</strong> ${q.explanation}`;
    fb.style.color = '#2ECC71';
  } else {
    opts[idx].classList.add('wrong');
    if (opts[q.answer]) opts[q.answer].classList.add('correct');
    fb.innerHTML = `${icon('circle-x')} <strong>Kurang tepat.</strong> Jawaban benar: <strong>${q.options[q.answer]}</strong>. ${q.explanation}`;
    fb.style.color = '#E74C3C';
  }
  if (next) next.style.display = 'inline-flex';
}

function nextQuiz() {
  State.quizIndex++;
  State.quizAnswered = false;
  renderQuiz();
}

function renderQuizResult(total) {
  clearQuizTimer();
  const pct = Math.round(State.quizScore / total * 100);
  let title, desc, emoji;
  if (pct >= 90) { emoji='trophy'; title = 'Maestro Budaya Sulawesi!'; desc = 'Luar biasa! Pengetahuan budaya Sulawesimu sangat mendalam.'; }
  else if (pct >= 70) { emoji='medal'; title = 'Sobat Budaya Sejati!'; desc = 'Bagus sekali! Kamu tahu banyak tentang kekayaan budaya Sulawesi.'; }
  else if (pct >= 50) { emoji='book-open'; title = 'Penjelajah Budaya'; desc = 'Tidak buruk! Terus jelajahi koleksi kami untuk menambah wawasanmu.'; }
  else { emoji='sprout'; title = 'Pemula yang Bersemangat'; desc = 'Jangan menyerah! Jelajahi koleksi budaya kami dan coba lagi.'; }

  // Build answer grid
  const ansGrid = State.quizQuestions.map((q, i) => {
    const isCorrect = (State._answers || [])[i]?.correct;
    return `<div style="width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;
      background:${isCorrect === undefined ? 'rgba(255,255,255,0.05)' : isCorrect ? 'rgba(46,204,113,0.2)' : 'rgba(231,76,60,0.2)'};
      border:1px solid ${isCorrect === undefined ? 'rgba(255,255,255,0.1)' : isCorrect ? 'rgba(46,204,113,0.4)' : 'rgba(231,76,60,0.4)'}
      ">${isCorrect === undefined ? (i+1) : isCorrect ? '✓' : '✗'}</div>`;
  }).join('');

  const wrap = document.getElementById('quiz-wrap');
  wrap.innerHTML = `
    <div class="quiz-card">
      <div class="q-result">
        <div class="big-ico">${icon(emoji)}</div>
        <div class="q-big-score">${State.quizScore}/${total}</div>
        <div style="font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:12px">${pct}% jawaban benar</div>
        <div class="q-res-title">${title}</div>
        <div class="q-res-desc">${desc}</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin:16px 0">${ansGrid}</div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <button class="q-next" onclick="initQuiz()">${icon('rotate-ccw')} Main Lagi</button>
          <button class="q-next" style="background:rgba(255,255,255,0.12);color:#fff" onclick="setTab('explorer');document.getElementById('explorer-section').scrollIntoView({behavior:'smooth'})">${icon('map')} Jelajahi Budaya</button>
        </div>
      </div>
    </div>`;
}

// ---- HERO STATS ----
function updateHeroStats() {
  const allData = [...CULTURE_DATA, ...State.contributions];
  const el = document.getElementById('stat-berkas');
  if (el) el.textContent = allData.length + '+';
  const el2 = document.getElementById('stat-kontributor');
  if (el2) el2.textContent = '200+';
}

// ---- MAP INTERACTION & LEAFLET GIS ----
let leafletInstance = null;

function switchMapMode(mode) {
  const gisBox = document.getElementById('leaflet-map-box');
  const svgBox = document.getElementById('map-svg-box');
  const btnGis = document.getElementById('btn-map-gis');
  const btnSvg = document.getElementById('btn-map-svg');

  if (mode === 'gis') {
    if (gisBox) gisBox.style.display = 'block';
    if (svgBox) svgBox.style.display = 'none';
    if (btnGis) btnGis.classList.add('active');
    if (btnSvg) btnSvg.classList.remove('active');
    if (leafletInstance) {
      setTimeout(() => leafletInstance.invalidateSize(), 200);
    }
  } else {
    if (gisBox) gisBox.style.display = 'none';
    if (svgBox) svgBox.style.display = 'block';
    if (btnSvg) btnSvg.classList.add('active');
    if (btnGis) btnGis.classList.remove('active');
  }
}

function initMap() {
  // 1. Setup SVG Map events
  const paths = document.querySelectorAll('#sulawesi-svg .prov-path');
  const tip = document.getElementById('map-tip');
  paths.forEach(path => {
    path.addEventListener('click', () => {
      const id = path.dataset.prov;
      setProvince(id);
      if (State.activeTab !== 'explorer') setTab('explorer');
      document.getElementById('explorer-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    path.addEventListener('mouseenter', (e) => {
      const prov = getProvince(path.dataset.prov);
      if (!prov || !tip) return;
      const allData = [...CULTURE_DATA, ...State.contributions];
      const cnt = allData.filter(d => d.province === prov.id).length;
      tip.classList.add('show');
      tip.innerHTML = `<strong>${prov.name}</strong>${cnt} koleksi budaya`;
    });
    path.addEventListener('mouseleave', () => { if(tip) tip.classList.remove('show'); });
  });

  // 2. Peta Leaflet (OpenStreetMap)
  if (typeof L !== 'undefined' && document.getElementById('leaflet-map')) {
    try {
      leafletInstance = L.map('leaflet-map', {
        center: [-1.43, 121.44],
        zoom: 6,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(leafletInstance);

      provinceLayer = L.layerGroup();
      cultureLayer = L.markerClusterGroup
        ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 })
        : L.layerGroup();
      buildProvinceMarkers();
      refreshMapMarkers();
      setMapLayer('budaya');
      addMapControls();
    } catch (e) {
      console.warn('Leaflet map error:', e);
    }
  }
}

// ---- PETA: PENANDA ----
let provinceLayer = null;
let cultureLayer = null;
let mapLayerMode = 'budaya';

// Koordinat item; kontribusi tanpa koordinat ditaruh di tengah provinsinya.
function itemLatLng(item) {
  if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) return [item.lat, item.lng];
  const prov = getProvince(item.province);
  return prov ? [prov.lat, prov.lng] : null;
}

function buildProvinceMarkers() {
  const allData = [...CULTURE_DATA, ...State.contributions];
  provinceLayer.clearLayers();
  PROVINCES.forEach(p => {
    const cnt = allData.filter(d => d.province === p.id).length;
    const markerIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `<div class="prov-marker" style="background:${p.color}">${icon('map-pin')} ${p.name.replace('Sulawesi ', 'Sul. ')} (${cnt})</div>`,
      iconSize: [120, 32],
      iconAnchor: [60, 16]
    });
    L.marker([p.lat, p.lng], { icon: markerIcon })
      .bindPopup(`
        <div class="map-pop">
          <strong style="color:${p.color}">${p.name}</strong>
          <span class="map-pop-sub">Ibu Kota: ${p.capital}</span>
          <span class="map-pop-cnt">${cnt} Koleksi Budaya</span>
          <button class="map-pop-btn" style="background:${p.color}" onclick="setProvince('${p.id}');document.getElementById('explorer-section').scrollIntoView({behavior:'smooth'})">Lihat Koleksi →</button>
        </div>`)
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
    const color = cat ? cat.color : '#C0392B';
    const markerIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `<div class="item-marker" style="--mc:${color}">${icon(cat ? cat.icon : 'map-pin')}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -30]
    });
    L.marker(pos, { icon: markerIcon, title: item.title })
      .bindPopup(`
        <div class="map-pop">
          ${item.image ? `<img class="map-pop-img" src="${esc(item.image)}" alt="">` : ''}
          <strong>${esc(item.title)}</strong>
          <span class="map-pop-sub">${icon('map-pin')} ${esc(item.lokasi)}</span>
          <button class="map-pop-btn" style="background:${color}" onclick="openDetail(${item.id})">Lihat Detail →</button>
        </div>`, { maxWidth: 220 })
      .addTo(cultureLayer);
  });
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
        <button class="map-ctl-layer" data-layer="budaya" onclick="setMapLayer('budaya')">${icon('map-pin')} Budaya</button>
        <button class="map-ctl-layer" data-layer="provinsi" onclick="setMapLayer('provinsi')">${icon('map')} Provinsi</button>
        <button class="map-ctl-loc" id="btn-locate" onclick="toggleLocate()">${icon('locate')} Lokasi Saya</button>`;
      L.DomEvent.disableClickPropagation(box);
      return box;
    }
  });
  leafletInstance.addControl(new Ctl());
  document.querySelectorAll('.map-ctl-layer').forEach(b => b.classList.toggle('active', b.dataset.layer === mapLayerMode));
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
    locCircle = L.circle(here, { radius: accuracy, color: '#2980B9', weight: 1, fillOpacity: 0.12 }).addTo(leafletInstance);
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
  return [...CULTURE_DATA, ...State.contributions]
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
    <div class="nearby-head">${icon('locate')} Budaya terdekat darimu <button class="nearby-x" onclick="stopLocate()" aria-label="Tutup">${icon('x')}</button></div>
    ${list.map(({ item, km }) => `
      <button class="nearby-item" onclick="openDetail(${item.id})">
        ${coverArt(item, 'sim-ico', 'sim-ico sim-img')}
        <span class="nearby-txt"><span class="nearby-title">${esc(item.title)}</span><span class="nearby-km">${formatKm(km)}</span></span>
      </button>`).join('')}`;
}

// ---- NAVBAR ----
function initNavbar() {
  window.addEventListener('scroll', () => {
    document.querySelector('.navbar').classList.toggle('scrolled', window.scrollY > 50);
  });
  // hamburger
  const ham = document.getElementById('hamburger');
  const links = document.getElementById('nav-links');
  if (ham && links) {
    ham.addEventListener('click', () => links.classList.toggle('open'));
  }
  // nav search
  const navSearch = document.getElementById('nav-search-input');
  if (navSearch) {
    navSearch.addEventListener('keyup', e => { if (e.key === 'Enter') doSearch(e.target.value); });
  }
  // hero search
  const heroInp = document.getElementById('hero-search-input');
  const heroSel = document.getElementById('hero-search-cat');
  if (heroInp) heroInp.addEventListener('keyup', e => { if(e.key==='Enter') doSearch(e.target.value); });
}

// ---- SEARCH BUTTON ----
function heroSearch() {
  const q = document.getElementById('hero-search-input').value;
  const cat = document.getElementById('hero-search-cat').value;
  if (cat && cat !== 'all') setCategory(cat);
  doSearch(q);
  document.getElementById('explorer-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- COUNTER ANIMATION ----
function animateCounter(el, target, suffix='') {
  let current = 0;
  const step = Math.ceil(target / 50);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString('id') + suffix;
    if (current >= target) clearInterval(timer);
  }, 30);
}

// ---- INTERSECTION OBSERVER (animate on scroll) ----
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('anim-up');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.cat-card, .c-card, .prov-btn').forEach(el => observer.observe(el));
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
  renderCategories();
  renderProvinceList();
  renderExplorer();
  updateHeroStats();
  initNavbar();
  initMap();

  // Set default tab display
  setTab('explorer');

  // Animate hero stats counters
  const statBerkas = document.getElementById('stat-berkas');
  const statProv = document.getElementById('stat-prov');
  const statKont = document.getElementById('stat-kontributor');
  if (statBerkas) animateCounter(statBerkas, CULTURE_DATA.length + State.contributions.length, '+');
  if (statProv) animateCounter(statProv, 6);
  if (statKont) animateCounter(statKont, 200, '+');

  // Close modal on overlay click
  document.getElementById('detail-modal').addEventListener('click', function(e) {
    if (e.target === this) closeDetail();
  });
  document.getElementById('contrib-modal').addEventListener('click', function(e) {
    if (e.target === this) closeContribModal();
  });

  // ESC key closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDetail(); closeContribModal(); }
  });
});
