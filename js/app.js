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

  // 2. Setup Leaflet Real GIS Google-style Map
  if (typeof L !== 'undefined' && document.getElementById('leaflet-map')) {
    try {
      leafletInstance = L.map('leaflet-map', {
        center: [-1.43, 121.44],
        zoom: 6,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      // CartoDB Voyager / Google Maps style clean tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(leafletInstance);

      // Coordinates & details for 6 provinces
      const provinceGeo = [
        { id: 'sulsel', name: 'Sulawesi Selatan', capital: 'Makassar', lat: -3.8, lng: 119.9, color: '#C0392B' },
        { id: 'sulut', name: 'Sulawesi Utara', capital: 'Manado', lat: 1.47, lng: 124.84, color: '#2980B9' },
        { id: 'sulteng', name: 'Sulawesi Tengah', capital: 'Palu', lat: -0.9, lng: 120.87, color: '#27AE60' },
        { id: 'sultra', name: 'Sulawesi Tenggara', capital: 'Kendari', lat: -4.14, lng: 122.17, color: '#8E44AD' },
        { id: 'sulbar', name: 'Sulawesi Barat', capital: 'Mamuju', lat: -2.67, lng: 118.88, color: '#E67E22' },
        { id: 'gorontalo', name: 'Gorontalo', capital: 'Gorontalo', lat: 0.54, lng: 123.06, color: '#16A085' }
      ];

      provinceGeo.forEach(p => {
        const allData = [...CULTURE_DATA, ...State.contributions];
        const cnt = allData.filter(d => d.province === p.id).length;

        const icon = L.divIcon({
          className: 'custom-leaflet-marker',
          html: `<div style="background:${p.color};color:#fff;font-weight:700;font-size:11px;padding:6px 10px;border-radius:20px;box-shadow:0 4px 12px rgba(0,0,0,0.35);border:2px solid #fff;white-space:nowrap;cursor:pointer;display:flex;align-items:center;gap:4px">${icon('map-pin')} ${p.name.replace('Sulawesi ', 'Sul. ')} (${cnt})</div>`,
          iconSize: [120, 32],
          iconAnchor: [60, 16]
        });

        const marker = L.marker([p.lat, p.lng], { icon }).addTo(leafletInstance);

        marker.bindPopup(`
          <div style="font-family:'Outfit',sans-serif;padding:4px;text-align:center">
            <strong style="font-size:14px;color:${p.color};display:block;margin-bottom:2px">${p.name}</strong>
            <span style="font-size:11px;color:#666">Ibu Kota: ${p.capital}</span><br/>
            <span style="font-size:12px;color:#D4AC0D;font-weight:700;display:inline-block;margin:6px 0">${cnt} Koleksi Budaya</span><br/>
            <button onclick="setProvince('${p.id}');document.getElementById('explorer-section').scrollIntoView({behavior:'smooth'})" 
              style="background:${p.color};color:#fff;border:none;padding:7px 14px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.2)">
              Lihat Koleksi →
            </button>
          </div>
        `);

        marker.on('click', () => {
          setProvince(p.id);
        });
      });

    } catch (e) {
      console.warn('Leaflet map error:', e);
    }
  }
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
