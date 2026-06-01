// Admin script with optional Supabase upload, preview, and edit support
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Load config dynamically to avoid cached/static import issues on Pages
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let STORAGE_BUCKET = 'products';
let supabase = null;
let supabaseConfigured = false;
let siteAssetsCache = {};

async function loadSiteAssets(){
  if(!supabase || !supabaseConfigured) return;
  try{
    const { data, error } = await supabase.from('site_assets').select('key,image_url');
    if(error){ console.warn('load site_assets error', error); return; }
    siteAssetsCache = {};
    (data || []).forEach(row => { if(row?.key) siteAssetsCache[row.key] = row.image_url || ''; });
  }catch(e){ console.warn('load site_assets failed', e); }
}

function getSiteAssetValue(key, fallback = ''){
  return siteAssetsCache[key] || localStorage.getItem(key) || fallback;
}

async function saveSiteAssetValue(key, value){
  try{ siteAssetsCache[key] = value || ''; }catch(e){}
  try{ localStorage.setItem(key, value || ''); }catch(e){}
  if(supabase && supabaseConfigured){
    try{
      const { error } = await supabase.from('site_assets').upsert([{ key, image_url: value || '' }], { onConflict: 'key' });
      if(error) console.warn('save site_assets error', error);
    }catch(e){ console.warn('save site_assets failed', e); }
  }
}


async function migrateLegacySiteAssetsFromLocalStorage(){
  const simpleKeys = ['adminWelcomeImage', 'heroImage', 'aboutHeroImage', 'sinceLogoImage', 'adminLogoImage'];
  for(const key of simpleKeys){
    const remoteValue = siteAssetsCache[key] || '';
    const localValue = localStorage.getItem(key) || '';
    if(!remoteValue && localValue){
      await saveSiteAssetValue(key, localValue);
    }
  }

  const galleryKeys = ['topProductImages_roti', 'topProductImages_kopi'];
  for(const key of galleryKeys){
    const remoteValue = siteAssetsCache[key] || '';
    const localValue = localStorage.getItem(key) || '';
    if(!remoteValue && localValue){
      try{
        const arr = JSON.parse(localValue);
        if(Array.isArray(arr) && arr.length){
          await saveSiteAssetValue(key, JSON.stringify(arr));
        }
      }catch(e){ /* ignore bad legacy data */ }
    }
  }
}
async function loadConfigAndInit(){
  // Try dynamic import of local config with a timestamp to bypass cache
  try{
    const mod = await import(`./config.js?ts=${Date.now()}`);
    SUPABASE_URL = mod.SUPABASE_URL || '';
    SUPABASE_ANON_KEY = mod.SUPABASE_ANON_KEY || '';
    STORAGE_BUCKET = mod.STORAGE_BUCKET || STORAGE_BUCKET;
  }catch(e){
    // Fallback: fetch raw file from gh-pages branch (GitHub raw) and parse
    try{
      const url = `https://raw.githubusercontent.com/ardan2056/saadah-bakery/gh-pages/config.js?ts=${Date.now()}`;
      const r = await fetch(url, {cache: 'no-store'});
      if(r.ok){
        const txt = await r.text();
        const mUrl = txt.match(/SUPABASE_URL\s*=\s*"([^"]*)"/m);
        const mKey = txt.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]*)"/m);
        const mBucket = txt.match(/STORAGE_BUCKET\s*=\s*"([^"]*)"/m);
        SUPABASE_URL = mUrl ? mUrl[1] : '';
        SUPABASE_ANON_KEY = mKey ? mKey[1] : '';
        STORAGE_BUCKET = mBucket ? mBucket[1] : STORAGE_BUCKET;
      }
    }catch(_){ /* ignore */ }
  }

  supabaseConfigured = SUPABASE_URL && SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('ISI_');
  if(supabaseConfigured){
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Attach auth state listener now that supabase exists
    try{
      supabase.auth.onAuthStateChange((_event, session)=>{
        currentAdminUser = session?.user || null;
        setAuthUI(!!session, currentAdminUser?.email || '');
        if(session){
          syncRemoteProductsToLocal().catch(()=>{});
        }
      });
    }catch(_){ }
    await loadSiteAssets();
    await migrateLegacySiteAssetsFromLocalStorage();
  }
}

const form = document.getElementById('productForm');
const pName = document.getElementById('pName');
const pDesc = document.getElementById('pDesc');
const pCategory = document.getElementById('pCategory');
const pPrice = document.getElementById('pPrice');
const pImageUrl = document.getElementById('pImageUrl');
const pImageFile = document.getElementById('pImageFile');
const pPreviewImg = document.getElementById('pPreview');
const previewBox = document.querySelector('.preview-box');
const adminList = document.getElementById('adminList');
const clearBtn = document.getElementById('clearAdminData');
const adminAuthPanel = document.getElementById('adminAuthPanel');
const adminEmail = document.getElementById('adminEmail');
const adminPassword = document.getElementById('adminPassword');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const adminAuthStatus = document.getElementById('adminAuthStatus');

const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('saadah-updates') : null;
// Do NOT auto-open Produk. Hide all admin sections and show a prompt; clicking a feature box will open it.
document.querySelectorAll('.admin-section').forEach(el=> el.style.display = 'none');
const prodSection = document.getElementById('tab-products');
if(prodSection) prodSection.style.display = 'none';
const featureGrid = document.querySelector('.admin-feature-grid');

let isAdminAuthenticated = false;
let currentAdminUser = null;
// current filter for admin products view: 'all' | 'roti' | 'kopi'
let currentCategoryFilter = 'all';

// inject simple filter buttons above adminList if the container exists
function ensureAdminFilters(){
  const listEl = adminList;
  if(!listEl) return;
  const existing = document.getElementById('adminCategoryFilters');
  if(existing) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'adminCategoryFilters';
  wrapper.style.display = 'flex';
  wrapper.style.gap = '8px';
  wrapper.style.margin = '8px 0';
  const btnAll = document.createElement('button'); btnAll.textContent = 'Semua'; btnAll.className='btn ghost'; btnAll.dataset.cat='all';
  const btnRoti = document.createElement('button'); btnRoti.textContent = 'Makanan'; btnRoti.className='btn ghost'; btnRoti.dataset.cat='roti';
  const btnKopi = document.createElement('button'); btnKopi.textContent = 'Minuman'; btnKopi.className='btn ghost'; btnKopi.dataset.cat='kopi';
  [btnAll, btnRoti, btnKopi].forEach(b=>{ b.addEventListener('click', ()=>{ currentCategoryFilter = b.dataset.cat; updateFilterUI(); renderList(); }); });
  wrapper.appendChild(btnAll); wrapper.appendChild(btnRoti); wrapper.appendChild(btnKopi);
  listEl.parentNode.insertBefore(wrapper, listEl);
}

function updateFilterUI(){
  const wrapper = document.getElementById('adminCategoryFilters'); if(!wrapper) return;
  Array.from(wrapper.querySelectorAll('button')).forEach(b=>{
    if(b.dataset.cat === currentCategoryFilter){ b.classList.add('is-active'); } else { b.classList.remove('is-active'); }
  });
}

// return true if product category string matches the desired filter (supports synonyms)
function categoryMatches(itemCategory, filter){
  if(!filter || filter === 'all') return true;
  const cat = String(itemCategory || '').toLowerCase().trim();
  if(!cat) return false;
  if(filter === 'roti'){
    return ['roti','makanan','food','bread','bakery'].includes(cat) || cat.startsWith('roti') || cat.includes('makanan') || cat.includes('bread');
  }
  if(filter === 'kopi'){
    return ['kopi','minuman','drink','coffee','cafe'].includes(cat) || cat.startsWith('kopi') || cat.includes('minuman') || cat.includes('coffee') || cat.includes('cafe');
  }
  return cat === String(filter).toLowerCase();
}

function setAuthUI(loggedIn, email = ''){
  isAdminAuthenticated = loggedIn;
  if(adminAuthStatus) adminAuthStatus.textContent = loggedIn ? `Masuk sebagai ${email || 'admin'}` : 'Belum login';
  if(adminLoginBtn) adminLoginBtn.style.display = loggedIn ? 'none' : 'inline-flex';
  if(adminLogoutBtn) adminLogoutBtn.style.display = loggedIn ? 'inline-flex' : 'none';
  if(adminEmail) adminEmail.disabled = loggedIn;
  if(adminPassword) adminPassword.disabled = loggedIn;
  if(featureGrid) featureGrid.style.display = loggedIn ? '' : 'none';
  document.querySelectorAll('.admin-section').forEach(el=> el.style.display = 'none');
  if(prodSection) prodSection.style.display = 'none';
  if(!loggedIn){
    const pr = document.getElementById('adminChoosePrompt');
    if(pr) pr.innerHTML = '<strong>Login dulu supaya produk tersimpan ke Supabase.</strong>';
  }
}

async function getRemoteAdminProducts(){
  if(!supabase || !isAdminAuthenticated) return [];
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
  if(error){ console.warn('Supabase load products error', error); return []; }
  return Array.isArray(data) ? data : [];
}

async function syncRemoteProductsToLocal(){
  const remote = await getRemoteAdminProducts();
  if(remote.length){
    saveAdminProducts(remote.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description || '',
      category: item.category || 'roti',
      price: Number(item.price) || 0,
      image_url: item.image_url || ''
    })));
    renderList();
  }
}

async function refreshAuthState(){
  if(!supabase){
    setAuthUI(false);
    return;
  }
  const { data } = await supabase.auth.getSession();
  const session = data?.session || null;
  currentAdminUser = session?.user || null;
  const email = currentAdminUser?.email || '';
  setAuthUI(!!session, email);
  if(session){
    await syncRemoteProductsToLocal();
    renderList();
  } else {
    renderList();
  }
}

adminLoginBtn?.addEventListener('click', async ()=>{
  if(!supabase) return alert('Supabase belum dikonfigurasi.');
  const email = adminEmail?.value.trim();
  const password = adminPassword?.value || '';
  if(!email || !password) return alert('Isi email dan password admin.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if(error){
    alert(error.message || 'Login gagal.');
    return;
  }
  currentAdminUser = data?.user || null;
  setAuthUI(true, currentAdminUser?.email || email);
  await syncRemoteProductsToLocal();
  renderList();
});

adminLogoutBtn?.addEventListener('click', async ()=>{
  if(supabase) await supabase.auth.signOut();
  currentAdminUser = null;
  setAuthUI(false);
  renderList();
});

// Initialize config and Supabase, then refresh auth state
const configReady = loadConfigAndInit().then(()=>{
  refreshAuthState().catch(()=>{});
}).catch(()=>{});

// Insert choose-menu prompt under the feature grid if not exists
let prompt = document.getElementById('adminChoosePrompt');
if(!prompt){
  prompt = document.createElement('div');
  prompt.id = 'adminChoosePrompt';
  prompt.style.padding = '18px';
  prompt.style.borderRadius = '12px';
  prompt.style.background = 'rgba(255,255,255,0.6)';
  prompt.style.marginTop = '12px';
  prompt.innerHTML = '<strong>Pilih salah satu fitur di atas untuk mulai mengelola.</strong>';
  const container = document.querySelector('.admin-content');
  const features = container?.querySelector('.admin-feature-grid');
  if(features) features.insertAdjacentElement('afterend', prompt);
}

// Bind feature boxes
document.querySelectorAll('.admin-feature').forEach(card => {
  card.addEventListener('click', ()=>{
    const feature = card.dataset.feature;
    // remove prompt
    const pr = document.getElementById('adminChoosePrompt'); if(pr) pr.remove();
    // hide all sections
    document.querySelectorAll('.admin-section').forEach(el=> el.style.display = 'none');
    // show target
    const target = document.getElementById('tab-' + feature);
    if(target) target.style.display = 'block';
    // mark active
    document.querySelectorAll('.admin-feature').forEach(c=> c.classList.remove('is-active'));
    card.classList.add('is-active');
    // scroll
    target?.scrollIntoView({behavior:'smooth'});
  });
});

function loadAdminProducts(){
  try{ return JSON.parse(localStorage.getItem('adminProducts') || '[]'); }catch(e){ return []; }
}

function saveAdminProducts(list){
  localStorage.setItem('adminProducts', JSON.stringify(list));
  if(channel) channel.postMessage({type:'products-updated', products: list});
  try{ localStorage.setItem('adminProducts:lastUpdate', Date.now().toString()); }catch(e){}
}

async function renderList(){
  ensureAdminFilters();
  updateFilterUI();
  const items = isAdminAuthenticated ? await getRemoteAdminProducts() : loadAdminProducts();
  if(!adminList) return;
  const filtered = (items || []).filter(it => {
    return categoryMatches(it.category, currentCategoryFilter);
  });
  if(filtered.length === 0){ adminList.innerHTML = '<p class="note">Belum ada produk pada kategori ini.</p>'; return; }
  adminList.innerHTML = filtered.map((it)=>`
    <div class="admin-gallery-item">
      <img src="${it.image_url || ''}" alt="${it.name}" />
      <div>
        <h4>${it.name}</h4>
        <small>${it.category} • Rp${Number(it.price).toLocaleString('id-ID')}</small>
        <div class="admin-actions">
          <button data-edit-id="${it.id}" class="btn">Edit</button>
          <button data-delete-id="${it.id}" class="btn danger">Hapus</button>
        </div>
      </div>
    </div>
  `).join('');
}

// Orders management (stored in localStorage.orders)
function loadOrders(){ try{ return JSON.parse(localStorage.getItem('orders')||'[]'); }catch(e){return[]} }
function renderOrders(){
  const container = document.getElementById('ordersList');
  const list = loadOrders();
  if(!container) return;
  if(list.length===0){ container.innerHTML = '<p class="note">Belum ada pesanan.</p>'; return; }
  container.innerHTML = list.map((o, idx)=>`<div style="padding:12px;border-radius:12px;background:rgba(255,255,255,0.7);margin-bottom:8px;"><strong>${o.name||'Pesanan #'+(idx+1)}</strong><div>${o.items? o.items.map(i=>`<div>${i.name} x ${i.qty}</div>`).join('') : ''}</div><small>${o.phone||''} • ${o.address||''}</small><div style="margin-top:8px;"><button data-mark="${idx}" class="btn">Tandai Selesai</button></div></div>`).join('');
}

document.getElementById('ordersList')?.addEventListener('click', (e)=>{
  const m = e.target.closest('[data-mark]');
  if(!m) return; const idx = Number(m.dataset.mark);
  const arr = loadOrders(); arr.splice(idx,1); localStorage.setItem('orders', JSON.stringify(arr)); renderOrders();
});

// Reviews management
function loadReviews(){ try{ return JSON.parse(localStorage.getItem('reviews')||'[]'); }catch(e){return[]} }
function saveReviews(list){ localStorage.setItem('reviews', JSON.stringify(list)); if(channel) channel.postMessage({type:'reviews-updated', reviews:list}); }
const cannedReplies = [
  'Terima kasih atas ulasan Anda. Kami mohon maaf atas ketidaknyamanan — kami akan memperbaikinya secepatnya.',
  'Terima kasih banyak! Senang mendengar Anda menyukai produk kami. Kami akan terus memberikan yang terbaik.',
  'Maafkan jika pengalaman Anda kurang memuaskan. Bisa dijelaskan lebih rinci supaya kami perbaiki?',
  'Terima kasih atas masukannya — kami akan meneruskannya ke tim produksi.'
];

function findRelatedOrdersForReview(review){
  const orders = loadOrders();
  if(!orders || orders.length===0) return [];
  const name = (review.name || '').toLowerCase();
  // match by name substring or exact phone if review includes it
  return orders.filter(o => {
    const on = (o.name||'').toLowerCase();
    const phone = (o.phone||'').replace(/\s+/g,'');
    const rvPhone = (review.phone||'').replace(/\s+/g,'');
    if(rvPhone && phone && phone.includes(rvPhone)) return true;
    if(name && on && (on.includes(name) || name.includes(on))) return true;
    return false;
  });
}

function renderReviews(){
  const c = document.getElementById('reviewsList'); const r = loadReviews();
  if(!c) return; if(r.length===0){ c.innerHTML='<p class="note">Belum ada review.</p>'; return; }
  c.innerHTML = r.map((rv, idx)=>{
    const replyText = rv.reply ? rv.reply : '<em>Belum</em>';
    const suggestions = cannedReplies.map((s,i)=>`<option value="${i}">${s.slice(0,60)}${s.length>60? '...':''}</option>`).join('');
    return `
      <div style="padding:12px;background:rgba(255,255,255,0.7);border-radius:12px;margin-bottom:8px;">
        <strong>${rv.name||'Anon'}</strong>
        <p>${rv.text}</p>
        <small>Balasan: ${replyText}</small>
        <div style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <select data-suggest-select="${idx}"><option value="">-- Pilih saran balasan --</option>${suggestions}</select>
          <button data-apply-suggest="${idx}" class="btn">Gunakan</button>
          <input placeholder="Tulis balasan..." data-reply-input="${idx}" style="width:46%" />
          <button data-reply="${idx}" class="btn">Kirim Balasan</button>
          <button data-find-orders="${idx}" class="btn">Cari Pesanan Terkait</button>
          <button data-send-wa="${idx}" class="btn secondary">Kirim via WhatsApp</button>
        </div>
        <div data-related-container="${idx}" style="margin-top:8px; display:none; background:rgba(0,0,0,0.04); padding:8px; border-radius:8px;"></div>
      </div>
    `;
  }).join('');
}

document.getElementById('reviewsList')?.addEventListener('click', (e)=>{
  const applyBtn = e.target.closest('[data-apply-suggest]');
  if(applyBtn){
    const idx = Number(applyBtn.dataset.applySuggest);
    const sel = document.querySelector(`[data-suggest-select="${idx}"]`);
    const input = document.querySelector(`[data-reply-input="${idx}"]`);
    if(sel && input && sel.value !== ''){
      const s = cannedReplies[Number(sel.value)];
      input.value = s || '';
    }
    return;
  }

  const findBtn = e.target.closest('[data-find-orders]');
  if(findBtn){
    const idx = Number(findBtn.dataset.findOrders);
    const arr = loadReviews(); const rv = arr[idx];
    const matches = findRelatedOrdersForReview(rv);
    const container = document.querySelector(`[data-related-container="${idx}"]`);
    if(!container) return;
    if(matches.length === 0){ container.innerHTML = '<div class="note">Tidak ditemukan pesanan terkait.</div>'; container.style.display='block'; return; }
    container.innerHTML = matches.map((o, i)=>`<div style="padding:8px;border-radius:8px;background:rgba(255,255,255,0.9);margin-bottom:6px;"><strong>${o.name||'Anon'}</strong><div>${o.items? o.items.map(it=>`<div>${it.name} x ${it.qty}</div>`).join('') : ''}</div><small>${o.phone||''} • ${o.address||''}</small></div>`).join('');
    container.style.display='block';
    return;
  }

  const sendWaBtn = e.target.closest('[data-send-wa]');
  if(sendWaBtn){
    const idx = Number(sendWaBtn.dataset.sendWa);
    const input = document.querySelector(`[data-reply-input="${idx}"]`);
    const text = input ? input.value.trim() : '';
    if(!text) return alert('Isi balasan terlebih dahulu.');
    // ask for phone (try to find related order phones first)
    const arr = loadReviews(); const rv = arr[idx];
    const matches = findRelatedOrdersForReview(rv);
    let phone = '';
    if(matches && matches.length>0){ phone = matches[0].phone || ''; }
    if(!phone){ phone = prompt('Masukkan nomor WhatsApp penerima (contoh: 62812...):'); }
    if(!phone) return alert('Nomor tidak diberikan.');
    const msg = text + '\n\n— Sa\'adah Bakery';
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
    return;
  }

  const replyBtn = e.target.closest('[data-reply]');
  if(replyBtn){
    const idx = Number(replyBtn.dataset.reply);
    const input = document.querySelector(`[data-reply-input="${idx}"]`);
    if(!input) return; const text = input.value.trim(); if(!text) return alert('Isi balasan'); const arr = loadReviews(); arr[idx].reply = text; saveReviews(arr); renderReviews(); return; }
});

function toDataURL(file){
  return new Promise((res, rej)=>{
    const reader = new FileReader();
    reader.onload = ()=>res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  })
}

// Resize image using canvas to limit width and reduce size (returns Blob)
function resizeImageFile(file, maxWidth = 1200, quality = 0.8){
  return new Promise((res, rej)=>{
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if(width > maxWidth){
        height = Math.round((maxWidth / width) * height);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0,width,height);
      canvas.toBlob((blob)=>{
        URL.revokeObjectURL(url);
        res(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = (e)=>{ URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}

// Convert image Blob/File to WebP via canvas; returns a Blob (image/webp)
function convertToWebP(file, maxWidth = 1200, quality = 0.8){
  return new Promise((res, rej)=>{
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if(width > maxWidth){
        height = Math.round((maxWidth / width) * height);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0,width,height);
      canvas.toBlob((blob)=>{
        URL.revokeObjectURL(url);
        res(blob);
      }, 'image/webp', quality);
    };
    img.onerror = (e)=>{ URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}

async function uploadToSupabase(file){
  if(!supabase) return null;
  try{
    const ext = (file.name || 'upload.jpg').split('.').pop();
    const fileName = `admin/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, file, { cacheControl: '3600', upsert: false });
    if(error){
      console.warn('Supabase upload error', error);
      return null;
    }

    // Try to get a public URL (works if bucket is public)
    try{
      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
      if(pub?.publicUrl) return pub.publicUrl;
    }catch(e){ /* ignore and try signed URL */ }

    // If public URL not available (private bucket), try createSignedUrl as fallback
    try{
      // expires in seconds (7 days)
      const expiresIn = 60 * 60 * 24 * 7;
      const { data: signed, error: signedErr } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(fileName, expiresIn);
      if(signedErr){ console.warn('createSignedUrl error', signedErr); return null; }
      return signed?.signedUrl || null;
    }catch(e){ console.warn('signed url generation failed', e); return null; }

  }catch(err){ console.error(err); return null; }
}

async function syncProductToRemote(item, previousId = null){
  if(!supabase || !isAdminAuthenticated) return null;
  const payload = {
    name: item.name,
    description: item.description || null,
    category: item.category || null,
    price: item.price || 0,
    image_url: item.image_url || null,
    is_active: true
  };

  if(previousId && !String(previousId).startsWith('a_')){
    const { data, error } = await supabase.from('products').update(payload).eq('id', previousId).select();
    if(error){ console.warn('Supabase update product error', error); return null; }
    return data?.[0] || null;
  }

  const { data, error } = await supabase.from('products').insert([payload]).select();
  if(error){ console.warn('Supabase insert product error', error); return null; }
  return data?.[0] || null;
}

async function deleteRemoteProduct(productId){
  if(!supabase || !isAdminAuthenticated) return;
  if(!productId || String(productId).startsWith('a_')) return;
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if(error) console.warn('Supabase delete product error', error);
}

let editingIndex = -1;
let editingRemoteId = null;

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = pName.value.trim();
  const desc = pDesc.value.trim();
  const category = pCategory.value;
  const price = Number(pPrice.value) || 0;
  let image = pImageUrl.value.trim();

  // If user selected a file, prefer file. If Supabase configured, upload to bucket first.
  if(pImageFile.files && pImageFile.files[0]){
    let file = pImageFile.files[0];
    try{
      // resize first to reduce upload size
      const resized = await resizeImageFile(file, 1200, 0.78);
      if(resized) file = resized;
    }catch(e){ /* ignore, use original file */ }

    if(supabaseConfigured){
      const url = await uploadToSupabase(file instanceof Blob ? new File([file], (pImageFile.files[0]||{}).name || 'upload.jpg', {type: file.type || 'image/jpeg'}) : file);
      if(url) image = url;
    }
    if(!image){
      // fallback to data URL
      try{ image = await toDataURL(pImageFile.files[0]); }catch(e){ console.error('file read error', e); }
    }
  }

  const products = loadAdminProducts();
  const existingId = editingRemoteId ? editingRemoteId : (editingIndex >= 0 ? products[editingIndex]?.id : null);
  const item = { id: existingId ? existingId : 'a_'+Date.now(), name, description: desc, category, price, image_url: image };

  if(editingIndex >= 0){
    products.splice(editingIndex, 1, item);
    editingIndex = -1;
  } else if (editingRemoteId) {
    // replace local copy with updated data if exists
    const li = products.findIndex(p => String(p.id) === String(editingRemoteId));
    if (li >= 0) products.splice(li, 1, item);
    editingRemoteId = null;
  } else {
    products.unshift(item);
  }

  saveAdminProducts(products);
  await renderList();
  form.reset();
  if(previewBox) previewBox.style.display = 'none';
  if(!supabase || !isAdminAuthenticated){
    alert('Produk tersimpan di browser saja. Login admin Supabase agar tampil di semua device.');
    return;
  }

  try{
    const remote = await syncProductToRemote(item, (editingRemoteId && String(editingRemoteId)) ? editingRemoteId : (item.id && !String(item.id).startsWith('a_') ? item.id : null));
    if(remote?.id){
      const arr = loadAdminProducts();
      const local = arr.findIndex(p => String(p.id) === String(item.id));
      if(local >= 0) {
        arr[local].id = String(remote.id);
        saveAdminProducts(arr);
        await renderList();
      }
      alert('Produk berhasil disimpan dan disinkronkan ke Supabase.');
    } else {
      alert('Produk berhasil disimpan, tetapi sinkronisasi database belum berhasil.');
    }
  }catch(e){
    console.error('supabase insert/update error', e);
    alert('Produk tersimpan lokal, tapi database belum tersinkron.');
  }
});

// preview file or url
pImageFile.addEventListener('change', async (e)=>{
  const f = e.target.files && e.target.files[0];
  if(!f){ if(previewBox) previewBox.style.display='none'; return; }
  try{
    const data = await toDataURL(f);
    if(pPreviewImg){ pPreviewImg.src = data; previewBox.style.display='block'; }
  }catch(e){ console.error(e); }
});

pImageUrl.addEventListener('input', (e)=>{
  const v = e.target.value.trim();
  if(!v){ if(previewBox) previewBox.style.display='none'; return; }
  if(pPreviewImg){ pPreviewImg.src = v; previewBox.style.display='block'; }
});

adminList.addEventListener('click', (e)=>{
  const del = e.target.closest('[data-delete-id]');
  if (del) {
    const id = del.dataset.deleteId;
    if (!id) return;
    // remove from local storage list
    const arr = loadAdminProducts().filter(p => String(p.id) !== String(id));
    saveAdminProducts(arr);
    renderList();
    // if authenticated, also delete remote
    if (isAdminAuthenticated) deleteRemoteProduct(id).catch(()=>{});
    return;
  }

  const edt = e.target.closest('[data-edit-id]');
  if (edt) {
    const id = edt.dataset.editId;
    if (!id) return;
    // reset editing trackers
    editingIndex = -1;
    editingRemoteId = null;
    if (isAdminAuthenticated) {
      // find product from remote set
      getRemoteAdminProducts().then(remoteArr => {
        const item = remoteArr.find(r => String(r.id) === String(id));
        if (!item) return;
        editingRemoteId = String(item.id);
        pName.value = item.name || '';
        pDesc.value = item.description || '';
        pCategory.value = item.category || 'roti';
        pPrice.value = item.price || 0;
        if (item.image_url && pPreviewImg) { pPreviewImg.src = item.image_url; previewBox.style.display = 'block'; }
        if (form && typeof form.scrollIntoView === 'function') form.scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo({ top: 0, behavior: 'smooth' });
        try { pName.focus(); } catch (e) {}
      }).catch(()=>{});
    } else {
      const arr = loadAdminProducts();
      const idx = arr.findIndex(p => String(p.id) === String(id));
      if (idx < 0) return;
      const item = arr[idx];
      editingIndex = idx;
      pName.value = item.name || '';
      pDesc.value = item.description || '';
      pCategory.value = item.category || 'roti';
      pPrice.value = item.price || 0;
      if (item.image_url && pPreviewImg) { pPreviewImg.src = item.image_url; previewBox.style.display = 'block'; }
      if (form && typeof form.scrollIntoView === 'function') form.scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo({ top: 0, behavior: 'smooth' });
      try { pName.focus(); } catch (e) {}
    }
  }
});

clearBtn.addEventListener('click', ()=>{
  if(!confirm('Hapus semua produk admin dari localStorage?')) return;
  localStorage.removeItem('adminProducts');
  saveAdminProducts([]);
  renderList();
});

// listen for external storage changes (other tabs)
window.addEventListener('storage', (e)=>{ if(e.key && e.key.startsWith('adminProducts')) renderList(); });

renderList();
refreshAuthState();

// Try local server upload if Supabase not configured
async function uploadToLocalServer(blobFile){
  try{
    const fd = new FormData();
    fd.append('file', blobFile, (blobFile.name || `upload-${Date.now()}.jpg`));
    // try local dev server first
    try{
      const res = await fetch('http://localhost:5000/upload', { method: 'POST', body: fd });
      if(res && res.ok){ const j = await res.json(); if(j?.url) return j.url; }
    }catch(e){ /* ignore local server errors */ }

    // if deployed on Netlify, try Netlify Function endpoint
    try{
      const res2 = await fetch('/.netlify/functions/upload', { method: 'POST', body: fd });
      if(res2 && res2.ok){ const j2 = await res2.json(); if(j2?.url) return j2.url; }
    }catch(e){ /* ignore */ }

    return null;
  }catch(e){
    console.warn('Local server upload failed', e);
    return null;
  }
}

// (Export/Import handlers defined later)

// Welcome thumbnail: load and save
const adminThumb = document.getElementById('adminWelcomeThumb');
const welcomeUrlInput = document.getElementById('welcomeImageUrl');
const welcomeFileInput = document.getElementById('welcomeImageFile');
const welcomePreview = document.getElementById('welcomePreview');
const saveWelcomeBtn = document.getElementById('saveWelcomeImage');

function loadWelcomeThumb(){
  const url = getSiteAssetValue('adminWelcomeImage');
  if(url && adminThumb) adminThumb.src = url;
}

if(welcomeFileInput){
  welcomeFileInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f){ if(welcomePreview) welcomePreview.style.display='none'; return; }
    try{ const d = await toDataURL(f); if(welcomePreview) { welcomePreview.querySelector('img').src = d; welcomePreview.style.display='block'; } }catch(e){console.error(e)}
  });
}

if(welcomeUrlInput){
  welcomeUrlInput.addEventListener('input', (e)=>{
    const v = e.target.value.trim(); if(!v){ if(welcomePreview) welcomePreview.style.display='none'; return; } if(welcomePreview) { welcomePreview.querySelector('img').src = v; welcomePreview.style.display='block'; }
  });
}

if(saveWelcomeBtn){
  saveWelcomeBtn.addEventListener('click', async ()=>{
    await configReady;
    let url = (welcomeUrlInput && welcomeUrlInput.value.trim()) || '';
    if(!url && welcomeFileInput && welcomeFileInput.files && welcomeFileInput.files[0]){
      // try local server then supabase then data-url
      const file = welcomeFileInput.files[0];
      let uploaded = null;
      if(supabaseConfigured) uploaded = await uploadToSupabase(file);
      if(!uploaded) uploaded = await uploadToLocalServer(file);
      if(!uploaded) uploaded = await toDataURL(file);
      url = uploaded;
    }
    if(!url) return alert('Pilih file atau masukkan URL');
    await saveSiteAssetValue('adminWelcomeImage', url);
    loadWelcomeThumb();
    alert('Thumbnail sambutan tersimpan');
  });
}

loadWelcomeThumb();

// Media (Hero / About) handlers
const heroUrlInput = document.getElementById('heroImageUrl');
const heroFileInput = document.getElementById('heroImageFile');
const heroPreviewEl = document.getElementById('heroPreview');
const saveHeroBtn = document.getElementById('saveHeroImage');

const aboutUrlInput = document.getElementById('aboutImageUrl');
const aboutFileInput = document.getElementById('aboutImageFile');
const aboutPreviewEl = document.getElementById('aboutPreview');
const saveAboutBtn = document.getElementById('saveAboutImage');

if(heroFileInput){
  heroFileInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f){ if(heroPreviewEl) heroPreviewEl.style.display='none'; return; }
    try{ const d = await toDataURL(f); if(heroPreviewEl){ heroPreviewEl.querySelector('img').src = d; heroPreviewEl.style.display='block'; } }catch(e){console.error(e)}
  });
}

if(heroUrlInput){
  heroUrlInput.addEventListener('input', (e)=>{
    const v = e.target.value.trim(); if(!v){ if(heroPreviewEl) heroPreviewEl.style.display='none'; return; } if(heroPreviewEl){ heroPreviewEl.querySelector('img').src = v; heroPreviewEl.style.display='block'; }
  });
}

if(saveHeroBtn){
  saveHeroBtn.addEventListener('click', async ()=>{
    await configReady;
    let url = (heroUrlInput && heroUrlInput.value.trim()) || '';
    if(!url && heroFileInput && heroFileInput.files && heroFileInput.files[0]){
      let file = heroFileInput.files[0];
      try{ const resized = await resizeImageFile(file, 1600, 0.8); if(resized) file = resized; }catch(e){}
      let uploaded = null;
      try{
        const webp = await convertToWebP(file, 1600, 0.8);
        if(supabaseConfigured) uploaded = await uploadToSupabase(new File([webp], (heroFileInput.files[0]||{}).name ? `${heroFileInput.files[0].name}.webp` : 'hero.webp', {type: 'image/webp'}));
      }catch(e){}
      if(!uploaded){ if(supabaseConfigured) uploaded = await uploadToSupabase(file instanceof Blob ? new File([file], (heroFileInput.files[0]||{}).name || 'hero.jpg', {type: file.type || 'image/jpeg'}) : file); }
      if(!uploaded) uploaded = await uploadToLocalServer(file);
      if(!uploaded) uploaded = await toDataURL(heroFileInput.files[0]);
      url = uploaded;
    }
    if(!url) return alert('Pilih file atau masukkan URL untuk hero.');
    await saveSiteAssetValue('heroImage', url);
    try{ if(channel) channel.postMessage({type:'media-updated', key:'heroImage', url}); }catch(e){}
    alert('Hero beranda tersimpan.');
  });
}

// About image
if(aboutFileInput){
  aboutFileInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f){ if(aboutPreviewEl) aboutPreviewEl.style.display='none'; return; }
    try{ const d = await toDataURL(f); if(aboutPreviewEl){ aboutPreviewEl.querySelector('img').src = d; aboutPreviewEl.style.display='block'; } }catch(e){console.error(e)}
  });
}

if(aboutUrlInput){
  aboutUrlInput.addEventListener('input', (e)=>{
    const v = e.target.value.trim(); if(!v){ if(aboutPreviewEl) aboutPreviewEl.style.display='none'; return; } if(aboutPreviewEl){ aboutPreviewEl.querySelector('img').src = v; aboutPreviewEl.style.display='block'; }
  });
}

if(saveAboutBtn){
  saveAboutBtn.addEventListener('click', async ()=>{
    await configReady;
    let url = (aboutUrlInput && aboutUrlInput.value.trim()) || '';
    if(!url && aboutFileInput && aboutFileInput.files && aboutFileInput.files[0]){
      let file = aboutFileInput.files[0];
      try{ const resized = await resizeImageFile(file, 1200, 0.8); if(resized) file = resized; }catch(e){}
      let uploaded = null;
      if(supabaseConfigured) uploaded = await uploadToSupabase(file instanceof Blob ? new File([file], (aboutFileInput.files[0]||{}).name || 'about.jpg', {type: file.type || 'image/jpeg'}) : file);
      if(!uploaded) uploaded = await uploadToLocalServer(file);
      if(!uploaded) uploaded = await toDataURL(aboutFileInput.files[0]);
      url = uploaded;
    }
    if(!url) return alert('Pilih file atau masukkan URL untuk About.');
    await saveSiteAssetValue('aboutHeroImage', url);
    try{ if(channel) channel.postMessage({type:'media-updated', key:'aboutHeroImage', url}); }catch(e){}
    alert('Gambar About tersimpan.');
  });
}

// --- Founder (Ibu Saadah) photo handlers ---
const founderUrlInput = document.getElementById('founderImageUrl');
const founderFileInput = document.getElementById('founderImageFile');
const founderPreviewEl = document.getElementById('founderPreview');
const saveFounderBtn = document.getElementById('saveFounderImage');

if(founderFileInput){
  founderFileInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f){ if(founderPreviewEl) founderPreviewEl.style.display='none'; return; }
    try{ const d = await toDataURL(f); if(founderPreviewEl){ founderPreviewEl.querySelector('img').src = d; founderPreviewEl.style.display='block'; } }catch(e){console.error(e)}
  });
}

if(saveFounderBtn){
  saveFounderBtn.addEventListener('click', async ()=>{
    await configReady;
    let url = (founderUrlInput && founderUrlInput.value.trim()) || '';
    if(!url && founderFileInput && founderFileInput.files && founderFileInput.files[0]){
      let file = founderFileInput.files[0];
      // 1) create small thumbnail and upload first for fast public visibility
      try{
        const thumbBlob = await resizeImageFile(file, 420, 0.7);
        // prefer WebP thumbnail
        let thumbUrl = null;
        try{
          const thumbWebp = await convertToWebP(thumbBlob, 420, 0.7);
          if(supabaseConfigured) thumbUrl = await uploadToSupabase(new File([thumbWebp], (founderFileInput.files[0]||{}).name ? `thumb_${founderFileInput.files[0].name}.webp` : `founder_thumb.webp`, {type: 'image/webp'}));
        }catch(e){ /* fall back to jpeg */ }
        if(!thumbUrl){ if(supabaseConfigured) thumbUrl = await uploadToSupabase(new File([thumbBlob], (founderFileInput.files[0]||{}).name ? `thumb_${founderFileInput.files[0].name}` : `founder_thumb.jpg`, {type: 'image/jpeg'})); }
        if(!thumbUrl) thumbUrl = await uploadToLocalServer(thumbBlob);
        if(!thumbUrl) thumbUrl = await toDataURL(thumbBlob);
        if(thumbUrl){
          await saveSiteAssetValue('founderPhoto_thumb', thumbUrl);
          try{ if(channel) channel.postMessage({type:'media-updated', key:'founderPhoto_thumb', url: thumbUrl}); }catch(e){}
          if(founderPreviewEl){ founderPreviewEl.querySelector('img').src = thumbUrl; founderPreviewEl.style.display = 'block'; }
        }

        // 2) upload larger/full image in background and replace when ready
        try{ const resized = await resizeImageFile(file, 1200, 0.82); if(resized) file = resized; }catch(e){}
        let uploaded = null;
        // try WebP full first
        try{
          const webp = await convertToWebP(file, 1200, 0.82);
          if(supabaseConfigured) uploaded = await uploadToSupabase(new File([webp], (founderFileInput.files[0]||{}).name ? `${founderFileInput.files[0].name}.webp` : 'founder.webp', {type: 'image/webp'}));
        }catch(e){ }
        if(!uploaded){ if(supabaseConfigured) uploaded = await uploadToSupabase(file instanceof Blob ? new File([file], (founderFileInput.files[0]||{}).name || 'founder.jpg', {type: file.type || 'image/jpeg'}) : file); }
        if(!uploaded) uploaded = await uploadToLocalServer(file);
        if(!uploaded) uploaded = await toDataURL(founderFileInput.files[0]);
        url = uploaded;
      }catch(e){
        console.warn('Founder upload flow failed', e);
      }
    }
    if(!url) return alert('Pilih file atau masukkan URL untuk foto Ibu Saadah.');
    await saveSiteAssetValue('founderPhoto', url);
    try{ if(channel) channel.postMessage({type:'media-updated', key:'founderPhoto', url}); }catch(e){}
    if(founderPreviewEl){ founderPreviewEl.querySelector('img').src = url; founderPreviewEl.style.display = 'block'; }
    alert('Foto Ibu Saadah tersimpan.');
  });
}

// --- Since Logo handlers ---
const sinceUrlInput = document.getElementById('sinceImageUrl');
const sinceFileInput = document.getElementById('sinceImageFile');
const sincePreviewBox = document.getElementById('sincePreview');
const saveSinceBtn = document.getElementById('saveSinceImage');

if(sinceFileInput){
  sinceFileInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f){ if(sincePreviewBox) sincePreviewBox.style.display='none'; return; }
    try{ const d = await toDataURL(f); if(sincePreviewBox){ sincePreviewBox.querySelector('img').src = d; sincePreviewBox.style.display='block'; } }catch(e){console.error(e)}
  });
}

if(sinceUrlInput){
  sinceUrlInput.addEventListener('input', (e)=>{
    const v = e.target.value.trim(); if(!v){ if(sincePreviewBox) sincePreviewBox.style.display='none'; return; } if(sincePreviewBox){ sincePreviewBox.querySelector('img').src = v; sincePreviewBox.style.display='block'; }
  });
}

if(saveSinceBtn){
  saveSinceBtn.addEventListener('click', async ()=>{
    await configReady;
    let url = (sinceUrlInput && sinceUrlInput.value.trim()) || '';
    if(!url && sinceFileInput && sinceFileInput.files && sinceFileInput.files[0]){
      let file = sinceFileInput.files[0];
      try{ const resized = await resizeImageFile(file, 800, 0.8); if(resized) file = resized; }catch(e){}
      let uploaded = null;
      if(supabaseConfigured) uploaded = await uploadToSupabase(file instanceof Blob ? new File([file], (sinceFileInput.files[0]||{}).name || 'since.jpg', {type: file.type || 'image/jpeg'}) : file);
      if(!uploaded) uploaded = await uploadToLocalServer(file);
      if(!uploaded) uploaded = await toDataURL(sinceFileInput.files[0]);
      url = uploaded;
    }
    if(!url) return alert('Pilih file atau masukkan URL untuk logo Since.');
    await saveSiteAssetValue('sinceLogoImage', url);
    try{ if(channel) channel.postMessage({type:'media-updated', key:'sinceLogoImage', url}); }catch(e){}
    if(sincePreviewBox){ sincePreviewBox.querySelector('img').src = url; sincePreviewBox.style.display = 'block'; }
    alert('Logo Since tersimpan.');
  });
}

// --- Admin Header Logo handlers ---
const adminLogoUrlInput = document.getElementById('adminLogoUrl');
const adminLogoFileInput = document.getElementById('adminLogoFile');
const adminLogoPreviewBox = document.getElementById('adminLogoPreview');
const saveAdminLogoBtn = document.getElementById('saveAdminLogo');

if(adminLogoFileInput){
  adminLogoFileInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f){ if(adminLogoPreviewBox) adminLogoPreviewBox.style.display='none'; return; }
    try{ const d = await toDataURL(f); if(adminLogoPreviewBox){ adminLogoPreviewBox.querySelector('img').src = d; adminLogoPreviewBox.style.display='block'; } }catch(e){console.error(e)}
  });
}

if(adminLogoUrlInput){
  adminLogoUrlInput.addEventListener('input', (e)=>{
    const v = e.target.value.trim(); if(!v){ if(adminLogoPreviewBox) adminLogoPreviewBox.style.display='none'; return; } if(adminLogoPreviewBox){ adminLogoPreviewBox.querySelector('img').src = v; adminLogoPreviewBox.style.display='block'; }
  });
}

if(saveAdminLogoBtn){
  saveAdminLogoBtn.addEventListener('click', async ()=>{
    await configReady;
    let url = (adminLogoUrlInput && adminLogoUrlInput.value.trim()) || '';
    if(!url && adminLogoFileInput && adminLogoFileInput.files && adminLogoFileInput.files[0]){
      let file = adminLogoFileInput.files[0];
      try{ const resized = await resizeImageFile(file, 1000, 0.8); if(resized) file = resized; }catch(e){}
      let uploaded = null;
      try{
        const webp = await convertToWebP(file, 1000, 0.8);
        if(supabaseConfigured) uploaded = await uploadToSupabase(new File([webp], (adminLogoFileInput.files[0]||{}).name ? `${adminLogoFileInput.files[0].name}.webp` : 'admin-logo.webp', {type: 'image/webp'}));
      }catch(e){}
      if(!uploaded){ if(supabaseConfigured) uploaded = await uploadToSupabase(file instanceof Blob ? new File([file], (adminLogoFileInput.files[0]||{}).name || 'admin-logo.jpg', {type: file.type || 'image/jpeg'}) : file); }
      if(!uploaded) uploaded = await uploadToLocalServer(file);
      if(!uploaded) uploaded = await toDataURL(adminLogoFileInput.files[0]);
      url = uploaded;
    }
    if(!url) return alert('Pilih file atau masukkan URL untuk logo admin.');
    await saveSiteAssetValue('adminLogoImage', url);
    try{ if(channel) channel.postMessage({type:'media-updated', key:'adminLogoImage', url}); }catch(e){}
    if(adminLogoPreviewBox){ adminLogoPreviewBox.querySelector('img').src = url; adminLogoPreviewBox.style.display = 'block'; }
    alert('Logo Admin tersimpan.');
  });
}

// --- Top Product Gallery (admin upload/manage) ---
const topGalleryFiles = document.getElementById('topGalleryFiles');
const saveTopGalleryBtn = document.getElementById('saveTopGallery');
const clearTopGalleryBtn = document.getElementById('clearTopGallery');
const topGalleryList = document.getElementById('topGalleryList');
const topGalleryBrandSelect = document.getElementById('topGalleryBrandSelect');

function normalizeGalleryBrand(brand){
  const b = (brand||'').toString().toLowerCase().trim();
  const kopiSyn = ['kopi','coffee','minuman','drink','beverage','minum'];
  return kopiSyn.includes(b) ? 'kopi' : 'roti';
}

function loadTopGallery(brand){
  const b = normalizeGalleryBrand(brand);
  const key = (b === 'kopi') ? 'topProductImages_kopi' : 'topProductImages_roti';
  const raw = getSiteAssetValue(key, localStorage.getItem(key) || '[]');
  try{ return JSON.parse(raw || '[]'); }catch(e){ return []; }
}

function saveTopGalleryArr(brand, arr){
  const b = normalizeGalleryBrand(brand);
  const key = (b === 'kopi') ? 'topProductImages_kopi' : 'topProductImages_roti';
  const payload = JSON.stringify(arr || []);
  try{ localStorage.setItem(key, payload); }catch(e){}
  try{ siteAssetsCache[key] = payload; }catch(e){}
  if(supabase && supabaseConfigured){
    supabase.from('site_assets').upsert([{ key, image_url: payload }], { onConflict: 'key' }).catch(err => console.warn('save top gallery site_assets error', err));
  }
}

function renderTopGallery(){
  const brand = topGalleryBrandSelect ? topGalleryBrandSelect.value : 'roti';
  const arr = loadTopGallery(brand);
  if(!topGalleryList) return;
  if(arr.length === 0){ topGalleryList.innerHTML = '<div class="note">Belum ada foto di galeri.</div>'; return; }
  topGalleryList.innerHTML = arr.map((u, i)=>`<div style="position:relative;border-radius:8px;overflow:hidden;background:#fff;border:1px solid rgba(0,0,0,0.04);"><img src="${u}" style="width:100%;height:96px;object-fit:cover;display:block;"> <button data-remove-index="${i}" class="btn ghost" style="position:absolute;right:6px;top:6px;">Hapus</button></div>`).join('');
}

renderTopGallery();
renderTopGalleryDebug?.();

if(topGalleryBrandSelect){
  topGalleryBrandSelect.addEventListener('change', ()=> renderTopGallery());
}

if(saveTopGalleryBtn){
  saveTopGalleryBtn.addEventListener('click', async ()=>{
    await configReady;
    if(!topGalleryFiles || !topGalleryFiles.files || topGalleryFiles.files.length===0) return alert('Pilih file terlebih dahulu.');
    const brand = topGalleryBrandSelect ? topGalleryBrandSelect.value : 'roti';
    const normBrand = normalizeGalleryBrand(brand);
    const files = Array.from(topGalleryFiles.files);
    const saved = [];
    for(const f of files){
      let file = f;
      try{ const resized = await resizeImageFile(file, 1200, 0.78); if(resized) file = resized; }catch(e){}
      let uploaded = null;
      if(supabaseConfigured) uploaded = await uploadToSupabase(file instanceof Blob ? new File([file], (f.name||'upload.jpg'), {type: f.type||'image/jpeg'}) : file);
      if(!uploaded) uploaded = await uploadToLocalServer(file);
      if(!uploaded) uploaded = await toDataURL(f);
      if(uploaded) saved.push(uploaded);
    }
    if(saved.length===0) return alert('Gagal mengunggah file apa pun.');
    const arr = loadTopGallery(normBrand);
    const merged = arr.concat(saved);
    saveTopGalleryArr(normBrand, merged);
    const key = (normBrand === 'kopi') ? 'topProductImages_kopi' : 'topProductImages_roti';
    try{ if(channel) channel.postMessage({type:'media-updated', key}); }catch(e){}
    renderTopGallery();
    alert('Foto galeri berhasil ditambahkan ke ' + (normBrand === 'kopi' ? 'Minuman' : 'Roti') + ` (key: ${key})`);
    // update debug panel
    try{ renderTopGalleryDebug(); }catch(e){}
    topGalleryFiles.value = '';
  });
}

if(clearTopGalleryBtn){
  clearTopGalleryBtn.addEventListener('click', ()=>{
    const brand = topGalleryBrandSelect ? topGalleryBrandSelect.value : 'roti';
    if(!confirm('Hapus semua foto galeri untuk ' + (brand==='kopi'?'Minuman':'Roti') + '?')) return;
    saveTopGalleryArr(brand, []);
    try{ if(channel) channel.postMessage({type:'media-updated', key: (brand === 'kopi' ? 'topProductImages_kopi' : 'topProductImages_roti')}); }catch(e){}
    renderTopGallery();
  });
}

// handle remove single
topGalleryList?.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-remove-index]');
  if(!btn) return;
  const idx = Number(btn.dataset.removeIndex);
  const brand = topGalleryBrandSelect ? topGalleryBrandSelect.value : 'roti';
  const arr = loadTopGallery(brand);
  if(idx<0 || idx>=arr.length) return;
  arr.splice(idx,1);
  saveTopGalleryArr(brand, arr);
  try{ if(channel) channel.postMessage({type:'media-updated', key: (brand === 'kopi' ? 'topProductImages_kopi' : 'topProductImages_roti')}); }catch(e){}
  renderTopGallery();
  try{ renderTopGalleryDebug(); }catch(e){}
});

// Debug helpers for top gallery
const topGalleryDebugEl = document.getElementById('topGalleryDebug');
const refreshTopGalleryDebugBtn = document.getElementById('refreshTopGalleryDebug');
const mirrorTopGalleryBtn = document.getElementById('mirrorTopGallery');

function renderTopGalleryDebug(){
  if(!topGalleryDebugEl) return;
  const roti = localStorage.getItem('topProductImages_roti') || siteAssetsCache['topProductImages_roti'] || '[]';
  const kopi = localStorage.getItem('topProductImages_kopi') || siteAssetsCache['topProductImages_kopi'] || '[]';
  topGalleryDebugEl.innerHTML = `<div><strong>Debug Top Gallery</strong></div>` +
    `<div style="margin-top:8px;"><em>topProductImages_roti</em>: <pre style="white-space:pre-wrap; max-height:120px; overflow:auto; background:#fff;padding:8px;border-radius:6px;">${roti}</pre></div>` +
    `<div style="margin-top:8px;"><em>topProductImages_kopi</em>: <pre style="white-space:pre-wrap; max-height:120px; overflow:auto; background:#fff;padding:8px;border-radius:6px;">${kopi}</pre></div>`;
}

if(refreshTopGalleryDebugBtn){ refreshTopGalleryDebugBtn.addEventListener('click', ()=>{ renderTopGalleryDebug(); alert('Debug refreshed'); }); }

if(mirrorTopGalleryBtn){
  mirrorTopGalleryBtn.addEventListener('click', async ()=>{
    const rotiArr = loadTopGallery('roti');
    const kopiArr = loadTopGallery('kopi');
    const combinedRoti = Array.from(new Set(rotiArr.concat(kopiArr)));
    const combinedKopi = Array.from(new Set(kopiArr.concat(rotiArr)));
    saveTopGalleryArr('roti', combinedRoti);
    saveTopGalleryArr('kopi', combinedKopi);
    try{ if(channel) channel.postMessage({type:'media-updated', key:'topProductImages_roti'}); }catch(e){}
    try{ if(channel) channel.postMessage({type:'media-updated', key:'topProductImages_kopi'}); }catch(e){}
    renderTopGallery(); renderTopGalleryDebug();
    alert('Gallery mirrored to both categories.');
  });
}

// initial debug render
try{ renderTopGalleryDebug(); }catch(e){}


// Export / Import handlers
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');
if(exportBtn){
  exportBtn.addEventListener('click', ()=>{
    const data = loadAdminProducts();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'saadah-admin-products.json'; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
}

if(importFile){
  importFile.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    try{
      const text = await f.text();
      const parsed = JSON.parse(text);
      if(!Array.isArray(parsed)) throw new Error('Format tidak valid');
      const existing = loadAdminProducts();
      const merged = parsed.concat(existing);
      saveAdminProducts(merged);
      renderList();
      alert('Import berhasil.');
    }catch(err){ alert('Import gagal: ' + (err.message || err)); }
  });
}

