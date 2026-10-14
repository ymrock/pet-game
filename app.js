'use strict';

// ---------- データ ----------
// shops: [{ id, name, genre, area, url, memo, priority(0-5), createdAt,
//           visits: [{ id, date, rating(0-5), price, companions, dishes, comment, again }] }]

const STORAGE_KEY = 'tabearuki-list-v1';
const state = { tab: 'want', query: '', genre: '', sort: 'created' };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.shops)) {
        return { version: 1, shops: parsed.shops.map(normalizeShop).filter(Boolean) };
      }
    }
  } catch (e) {
    console.warn('データの読み込みに失敗しました', e);
  }
  return { version: 1, shops: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    toast('保存に失敗しました。バックアップを取ってください');
  }
}

const str = (v) => (v == null ? '' : String(v)).trim();
const clampStar = (v) => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function normalizeShop(s) {
  if (!s || !str(s.name)) return null;
  return {
    id: str(s.id) || uid(),
    name: str(s.name),
    genre: str(s.genre),
    area: str(s.area),
    url: str(s.url),
    memo: str(s.memo),
    priority: clampStar(s.priority),
    createdAt: Number(s.createdAt) || Date.now(),
    visits: Array.isArray(s.visits) ? s.visits.map(normalizeVisit).filter(Boolean) : [],
  };
}

function normalizeVisit(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(str(v.date))) return null;
  const price = v.price === '' || v.price == null ? null : Number(v.price);
  return {
    id: str(v.id) || uid(),
    date: str(v.date),
    rating: clampStar(v.rating),
    price: Number.isFinite(price) && price >= 0 ? Math.round(price) : null,
    companions: str(v.companions),
    dishes: str(v.dishes),
    comment: str(v.comment),
    again: Boolean(v.again),
  };
}

let data = load();

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const findShop = (id) => data.shops.find((s) => s.id === id);
const isVisited = (shop) => shop.visits.length > 0;
const sortedVisits = (shop) => [...shop.visits].sort((a, b) => b.date.localeCompare(a.date));
const lastVisit = (shop) => (shop.visits.length ? sortedVisits(shop)[0] : null);

function avgRating(shop) {
  const rated = shop.visits.filter((v) => v.rating > 0);
  if (!rated.length) return 0;
  return rated.reduce((sum, v) => sum + v.rating, 0) / rated.length;
}

// ---------- 表示ユーティリティ ----------
const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function starsHtml(value, label) {
  const full = Math.round(value);
  return `<span class="stars" aria-label="${esc(label)} ${value ? value.toFixed(1) : '未評価'}">` +
    '★'.repeat(full) + `<span class="off">${'★'.repeat(5 - full)}</span></span>`;
}

const fmtDate = (d) => d.replaceAll('-', '/');
const fmtYen = (n) => `${n.toLocaleString('ja-JP')}円`;

function safeUrl(url) {
  if (!url) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

const mapUrl = (shop) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([shop.name, shop.area].filter(Boolean).join(' '))}`;

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------- 一覧 ----------
const sorters = {
  created: (a, b) => b.createdAt - a.createdAt,
  priority: (a, b) => b.priority - a.priority || b.createdAt - a.createdAt,
  rating: (a, b) => avgRating(b) - avgRating(a) || b.priority - a.priority,
  lastVisit: (a, b) => (lastVisit(b)?.date || '').localeCompare(lastVisit(a)?.date || '') || b.createdAt - a.createdAt,
  name: (a, b) => a.name.localeCompare(b.name, 'ja'),
};

function matchesQuery(shop, q) {
  if (!q) return true;
  const hay = [shop.name, shop.genre, shop.area, shop.memo,
    ...shop.visits.flatMap((v) => [v.dishes, v.comment, v.companions])].join('\n').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((word) => hay.includes(word));
}

function render() {
  const visitedCount = data.shops.filter(isVisited).length;
  $('#countWant').textContent = data.shops.length - visitedCount;
  $('#countVisited').textContent = visitedCount;
  $('#countAll').textContent = data.shops.length;

  renderGenres();

  const items = data.shops
    .filter((s) => state.tab === 'all' || (state.tab === 'visited') === isVisited(s))
    .filter((s) => !state.genre || s.genre === state.genre)
    .filter((s) => matchesQuery(s, state.query))
    .sort(sorters[state.sort] || sorters.created);

  $('#list').innerHTML = items.map(cardHtml).join('');

  const empty = $('#empty');
  empty.hidden = items.length > 0;
  if (!items.length) {
    if (state.query || state.genre) empty.textContent = '条件に合うお店がありません';
    else if (state.tab === 'visited') empty.textContent = 'まだ行ったお店はありません。\n「行きたい」のお店の ○ をタップして記録しましょう';
    else empty.textContent = '行きたいお店を登録しましょう。\n右下の ＋ ボタンから追加できます';
  }
}

function renderGenres() {
  const genres = [...new Set(data.shops.map((s) => s.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
  if (state.genre && !genres.includes(state.genre)) state.genre = '';
  $('#genreFilter').innerHTML = '<option value="">すべてのジャンル</option>' +
    genres.map((g) => `<option value="${esc(g)}"${g === state.genre ? ' selected' : ''}>${esc(g)}</option>`).join('');
  $('#genreList').innerHTML = genres.map((g) => `<option value="${esc(g)}"></option>`).join('');
}

function cardHtml(shop) {
  const visited = isVisited(shop);
  const last = lastVisit(shop);
  const avg = avgRating(shop);
  const url = safeUrl(shop.url);
  const meta = [];
  if (shop.area) meta.push(`📍 ${esc(shop.area)}`);

  let summary;
  let preview = '';
  if (visited) {
    summary = `${starsHtml(avg, '評価')} ${avg ? avg.toFixed(1) : '未評価'} · ${fmtDate(last.date)} · ${shop.visits.length}回`;
    const latestComment = sortedVisits(shop).find((v) => v.comment || v.dishes);
    if (latestComment) preview = latestComment.comment || `食べたもの: ${latestComment.dishes}`;
  } else {
    summary = shop.priority ? `行きたい度 ${starsHtml(shop.priority, '行きたい度')}` : '';
    preview = shop.memo;
  }

  return `
  <article class="card${visited ? ' visited' : ''}" data-id="${esc(shop.id)}">
    <button type="button" class="check-btn" data-action="visit"
      aria-label="${visited ? 'また行った記録を追加' : '行った！として記録'}" title="${visited ? 'また行った' : '行った！'}">✓</button>
    <div class="card-body">
      <div class="card-main" data-action="detail">
        <div class="card-title">
          <h3>${esc(shop.name)}</h3>
          ${shop.genre ? `<span class="chip">${esc(shop.genre)}</span>` : ''}
          ${last?.again ? '<span class="chip again">また行きたい</span>' : ''}
        </div>
        ${meta.length ? `<div class="meta">${meta.join(' ')}</div>` : ''}
        ${summary ? `<div class="meta">${summary}</div>` : ''}
        ${preview ? `<p class="preview">${esc(preview)}</p>` : ''}
      </div>
      <div class="card-actions">
        <button type="button" data-action="visit"${visited ? '' : ' class="primary"'}>${visited ? '＋ また行った' : '✓ 行った！'}</button>
        <a class="btn-link" href="${esc(mapUrl(shop))}" target="_blank" rel="noopener">地図</a>
        ${url ? `<a class="btn-link" href="${esc(url)}" target="_blank" rel="noopener">リンク</a>` : ''}
        <button type="button" data-action="edit">編集</button>
      </div>
    </div>
  </article>`;
}

// ---------- 星入力 ----------
function setupStarsInput(container) {
  container.innerHTML = [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" data-star="${n}" aria-label="${n}つ星">★</button>`).join('') +
    '<button type="button" class="clear" data-star="0">クリア</button>';
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-star]');
    if (btn) setStars(container, Number(btn.dataset.star));
  });
}

function setStars(container, value) {
  container.dataset.value = value;
  container.querySelectorAll('[data-star]').forEach((b) => {
    const n = Number(b.dataset.star);
    if (n > 0) {
      b.classList.toggle('on', n <= value);
      b.setAttribute('aria-pressed', String(n <= value));
    }
  });
}

const getStars = (container) => Number(container.dataset.value) || 0;

// ---------- お店ダイアログ ----------
const shopDialog = $('#shopDialog');
const shopForm = $('#shopForm');
const priorityInput = shopForm.querySelector('[data-name="priority"]');
let editingShopId = null;

function openShopDialog(shopId = null) {
  editingShopId = shopId;
  const shop = shopId ? findShop(shopId) : null;
  shopForm.reset();
  $('#shopDialogTitle').textContent = shop ? 'お店を編集' : 'お店を追加';
  $('#deleteShopBtn').hidden = !shop;
  for (const key of ['name', 'genre', 'area', 'url', 'memo']) {
    shopForm.elements[key].value = shop ? shop[key] : '';
  }
  setStars(priorityInput, shop ? shop.priority : 3);
  shopDialog.showModal();
  if (!shop) shopForm.elements.name.focus();
}

shopForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = shopForm.elements;
  const name = str(f.name.value);
  if (!name) {
    f.name.focus();
    toast('店名を入力してください');
    return;
  }
  const fields = {
    name,
    genre: str(f.genre.value),
    area: str(f.area.value),
    url: str(f.url.value),
    memo: str(f.memo.value),
    priority: getStars(priorityInput),
  };
  if (editingShopId) {
    Object.assign(findShop(editingShopId), fields);
    toast('保存しました');
  } else {
    data.shops.push({ id: uid(), createdAt: Date.now(), visits: [], ...fields });
    toast(`「${name}」を追加しました`);
  }
  save();
  shopDialog.close();
  render();
  refreshDetail();
});

$('#deleteShopBtn').addEventListener('click', () => {
  const shop = findShop(editingShopId);
  if (!shop || !confirm(`「${shop.name}」を削除しますか？\n行った記録もすべて削除されます。`)) return;
  data.shops = data.shops.filter((s) => s.id !== shop.id);
  save();
  shopDialog.close();
  detailDialog.close();
  render();
  toast('削除しました');
});

// ---------- 行った記録ダイアログ ----------
const visitDialog = $('#visitDialog');
const visitForm = $('#visitForm');
const ratingInput = visitForm.querySelector('[data-name="rating"]');
let visitTarget = { shopId: null, visitId: null };

function openVisitDialog(shopId, visitId = null) {
  const shop = findShop(shopId);
  if (!shop) return;
  const visit = visitId ? shop.visits.find((v) => v.id === visitId) : null;
  visitTarget = { shopId, visitId: visit ? visit.id : null };
  visitForm.reset();
  $('#visitDialogTitle').textContent = visit ? '行った記録を編集' : (isVisited(shop) ? 'また行った！' : '行った！');
  $('#visitShopName').textContent = shop.name;
  const f = visitForm.elements;
  f.date.value = visit ? visit.date : today();
  f.price.value = visit && visit.price != null ? visit.price : '';
  f.companions.value = visit ? visit.companions : '';
  f.dishes.value = visit ? visit.dishes : '';
  f.comment.value = visit ? visit.comment : '';
  f.again.checked = visit ? visit.again : false;
  setStars(ratingInput, visit ? visit.rating : 0);
  visitDialog.showModal();
}

visitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const shop = findShop(visitTarget.shopId);
  if (!shop) return;
  const f = visitForm.elements;
  const visit = normalizeVisit({
    id: visitTarget.visitId,
    date: f.date.value,
    rating: getStars(ratingInput),
    price: f.price.value,
    companions: f.companions.value,
    dishes: f.dishes.value,
    comment: f.comment.value,
    again: f.again.checked,
  });
  if (!visit) {
    f.date.focus();
    toast('行った日を入力してください');
    return;
  }
  const wasVisited = isVisited(shop);
  const idx = shop.visits.findIndex((v) => v.id === visit.id);
  if (idx >= 0) shop.visits[idx] = visit;
  else shop.visits.push(visit);
  save();
  visitDialog.close();
  render();
  refreshDetail();
  toast(wasVisited ? '記録を保存しました' : `「${shop.name}」を行ったリストに移動しました`);
});

// ---------- 詳細ダイアログ ----------
const detailDialog = $('#detailDialog');
let detailShopId = null;

function openDetail(shopId) {
  detailShopId = shopId;
  refreshDetail();
  detailDialog.showModal();
}

function refreshDetail() {
  const shop = detailShopId && findShop(detailShopId);
  if (!shop) {
    if (detailDialog.open) detailDialog.close();
    return;
  }
  const url = safeUrl(shop.url);
  const visits = sortedVisits(shop);
  const avg = avgRating(shop);
  const prices = visits.map((v) => v.price).filter((p) => p != null);

  const info = [];
  if (shop.genre) info.push(`<div><span class="chip">${esc(shop.genre)}</span></div>`);
  if (shop.area) info.push(`<div>📍 ${esc(shop.area)} · <a href="${esc(mapUrl(shop))}" target="_blank" rel="noopener">地図で見る</a></div>`);
  else info.push(`<div><a href="${esc(mapUrl(shop))}" target="_blank" rel="noopener">地図で探す</a></div>`);
  if (url) info.push(`<div>🔗 <a href="${esc(url)}" target="_blank" rel="noopener">${esc(shop.url)}</a></div>`);
  if (shop.priority) info.push(`<div>行きたい度 ${starsHtml(shop.priority, '行きたい度')}</div>`);

  const visitsHtml = visits.length
    ? `<div class="summary">
         <span>訪問 <b>${visits.length}回</b></span>
         <span>平均評価 <b>${avg ? avg.toFixed(1) : '—'}</b></span>
         ${prices.length ? `<span>平均金額 <b>${fmtYen(Math.round(prices.reduce((a, b) => a + b, 0) / prices.length))}</b></span>` : ''}
       </div>
       <ul class="visit-list">${visits.map((v) => `
         <li class="visit" data-visit-id="${esc(v.id)}">
           <div class="visit-head">
             <span class="date">${fmtDate(v.date)}</span>
             ${v.rating ? starsHtml(v.rating, '評価') : '<span class="meta">未評価</span>'}
             ${v.again ? '<span class="chip again">また行きたい</span>' : ''}
             <span class="spacer"></span>
             <span class="visit-btns">
               <button type="button" data-visit-action="edit">編集</button>
               <button type="button" class="danger" data-visit-action="delete">削除</button>
             </span>
           </div>
           ${v.price != null ? `<p><span class="label">金額</span>${fmtYen(v.price)}</p>` : ''}
           ${v.companions ? `<p><span class="label">一緒に</span>${esc(v.companions)}</p>` : ''}
           ${v.dishes ? `<p><span class="label">食べたもの</span>${esc(v.dishes)}</p>` : ''}
           ${v.comment ? `<p>${esc(v.comment)}</p>` : ''}
         </li>`).join('')}
       </ul>`
    : '<p class="meta">まだ行っていません。行ったら「＋ 行った記録」から記録しましょう。</p>';

  $('#detailBody').innerHTML = `
    <div class="detail-head"><h2>${esc(shop.name)}</h2></div>
    <div class="detail-info">${info.join('')}</div>
    ${shop.memo ? `<p class="detail-memo">${esc(shop.memo)}</p>` : ''}
    <h2>行った記録</h2>
    ${visitsHtml}`;
}

$('#detailBody').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-visit-action]');
  if (!btn) return;
  const shop = findShop(detailShopId);
  const visitId = btn.closest('[data-visit-id]').dataset.visitId;
  if (btn.dataset.visitAction === 'edit') {
    openVisitDialog(shop.id, visitId);
  } else if (confirm('この記録を削除しますか？')) {
    shop.visits = shop.visits.filter((v) => v.id !== visitId);
    save();
    render();
    refreshDetail();
    toast(isVisited(shop) ? '記録を削除しました' : '記録を削除し、「行きたい」に戻しました');
  }
});

$('#detailEditBtn').addEventListener('click', () => openShopDialog(detailShopId));
$('#detailVisitBtn').addEventListener('click', () => openVisitDialog(detailShopId));

// ---------- バックアップ ----------
function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#exportJsonBtn').addEventListener('click', () => {
  download(`tabearuki-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('バックアップを保存しました');
});

$('#importJsonBtn').addEventListener('click', () => $('#importFile').click());

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.shops)) throw new Error('形式が違います');
    const shops = parsed.shops.map(normalizeShop).filter(Boolean);
    if (!confirm(`${shops.length}件のお店を読み込みます。\n現在のデータ（${data.shops.length}件）は置き換えられます。よろしいですか？`)) return;
    data = { version: 1, shops };
    save();
    render();
    $('#menuDialog').close();
    toast('復元しました');
  } catch (err) {
    alert(`読み込めませんでした: ${err.message}`);
  }
});

$('#exportCsvBtn').addEventListener('click', () => {
  const header = ['店名', 'ジャンル', 'エリア', 'URL', '行きたい度', 'メモ', '行った日', '評価', '金額', '一緒に行った人', '食べたもの', '感想', 'また行きたい'];
  const rows = [];
  for (const s of data.shops) {
    const base = [s.name, s.genre, s.area, s.url, s.priority || '', s.memo];
    if (!s.visits.length) rows.push([...base, '', '', '', '', '', '', '']);
    for (const v of sortedVisits(s)) {
      rows.push([...base, v.date, v.rating || '', v.price ?? '', v.companions, v.dishes, v.comment, v.again ? '○' : '']);
    }
  }
  const cell = (c) => `"${String(c).replaceAll('"', '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  download(`tabearuki-${today()}.csv`, '﻿' + csv, 'text/csv');
  toast('CSVを書き出しました');
});

// ---------- イベント ----------
$('#list').addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const id = actionEl.closest('[data-id]').dataset.id;
  const action = actionEl.dataset.action;
  if (action === 'visit') openVisitDialog(id);
  else if (action === 'edit') openShopDialog(id);
  else if (action === 'detail') openDetail(id);
});

document.querySelectorAll('.tabs [data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    render();
  });
});

$('#search').addEventListener('input', (e) => { state.query = e.target.value.trim(); render(); });
$('#genreFilter').addEventListener('change', (e) => { state.genre = e.target.value; render(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('#addBtn').addEventListener('click', () => openShopDialog());
$('#menuBtn').addEventListener('click', () => $('#menuDialog').showModal());

document.querySelectorAll('dialog').forEach((dialog) => {
  // 背景タップで閉じる
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
});

setupStarsInput(priorityInput);
setupStarsInput(ratingInput);
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
