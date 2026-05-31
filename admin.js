// Admin script with optional Supabase upload, preview, and edit support
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET } from './config.js';

const supabaseConfigured = SUPABASE_URL && SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('ISI_');
const supabase = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

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

const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('saadah-updates') : null;
// Do NOT auto-open Produk. Hide all admin sections and show a prompt; clicking a feature box will open it.
document.querySelectorAll('.admin-section').forEach(el=> el.style.display = 'none');
const prodSection = document.getElementById('tab-products');
if(prodSection) prodSection.style.display = 'none';

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

function renderList(){
  const items = loadAdminProducts();
  if(!adminList) return;
  if(items.length === 0){ adminList.innerHTML = '<p class="note">Belum ada produk admin.</p>'; return; }
  adminList.innerHTML = items.map((it, idx)=>`
    <div class="admin-gallery-item">
      <img src="${it.image_url || ''}" alt="${it.name}" />
      <div>
        <h4>${it.name}</h4>
        <small>${it.category} • Rp${Number(it.price).toLocaleString('id-ID')}</small>
        <div class="admin-actions">
          <button data-edit="${idx}" class="btn">Edit</button>
          <button data-delete="${idx}" class="btn danger">Hapus</button>
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

async function uploadToSupabase(file){
  if(!supabase) return null;
  try{
    const ext = file.name.split('.').pop();
    const fileName = `admin/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(fileName, file, { cacheControl: '3600', upsert: false });
    if(error){ console.warn('Supabase upload error', error); return null; }
    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    return pub?.publicUrl || null;
  }catch(err){ console.error(err); return null; }
}

let editingIndex = -1;

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
  const item = { id: editingIndex >= 0 ? products[editingIndex].id : 'a_'+Date.now(), name, description: desc, category, price, image_url: image };

  if(editingIndex >= 0){
    products.splice(editingIndex, 1, item);
    editingIndex = -1;
  } else {
    products.unshift(item);
  }

  saveAdminProducts(products);
  renderList();
  form.reset();
  if(previewBox) previewBox.style.display = 'none';
  alert('Produk berhasil disimpan.');

  // If Supabase configured, try to insert product record to DB table 'products'
  if(supabaseConfigured){
    try{
      const payload = {
        name: item.name,
        description: item.description || null,
        category: item.category || null,
        price: item.price || 0,
        image_url: item.image_url || null,
        is_active: true
      };
      const { data: dbRes, error: dbErr } = await supabase.from('products').insert([payload]).select();
      if(dbErr){ console.warn('Supabase insert product error', dbErr); }
      else if(dbRes && dbRes[0] && dbRes[0].id){
        // update local stored product id to supabase id for clarity
        const arr = loadAdminProducts();
        const local = arr.findIndex(p => p.id === item.id);
        if(local >= 0) { arr[local].id = String(dbRes[0].id); saveAdminProducts(arr); renderList(); }
      }
    }catch(e){ console.error('supabase insert error', e); }
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
  const del = e.target.closest('[data-delete]');
  if(del){
    const idx = Number(del.dataset.delete);
    const arr = loadAdminProducts();
    arr.splice(idx,1);
    saveAdminProducts(arr);
    renderList();
    return;
  }

  const edt = e.target.closest('[data-edit]');
  if(edt){
    const idx = Number(edt.dataset.edit);
    const arr = loadAdminProducts();
    const item = arr[idx];
    if(!item) return;
    editingIndex = idx;
    pName.value = item.name || '';
    pDesc.value = item.description || '';
    pCategory.value = item.category || 'roti';
    pPrice.value = item.price || 0;
    if(item.image_url){
      if(pPreviewImg){ pPreviewImg.src = item.image_url; previewBox.style.display='block'; }
    }
    window.scrollTo({top:0,behavior:'smooth'});
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

// Try local server upload if Supabase not configured
async function uploadToLocalServer(blobFile){
  try{
    const fd = new FormData();
    fd.append('file', blobFile, (blobFile.name || `upload-${Date.now()}.jpg`));
    const res = await fetch('http://localhost:5000/upload', { method: 'POST', body: fd });
    if(!res.ok) throw new Error('Server upload failed');
    const json = await res.json();
    return json.url;
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
  const url = localStorage.getItem('adminWelcomeImage') || '';
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
    localStorage.setItem('adminWelcomeImage', url);
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
    let url = (heroUrlInput && heroUrlInput.value.trim()) || '';
    if(!url && heroFileInput && heroFileInput.files && heroFileInput.files[0]){
      let file = heroFileInput.files[0];
      try{ const resized = await resizeImageFile(file, 1600, 0.8); if(resized) file = resized; }catch(e){}
      let uploaded = null;
      if(supabaseConfigured) uploaded = await uploadToSupabase(file instanceof Blob ? new File([file], (heroFileInput.files[0]||{}).name || 'hero.jpg', {type: file.type || 'image/jpeg'}) : file);
      if(!uploaded) uploaded = await uploadToLocalServer(file);
      if(!uploaded) uploaded = await toDataURL(heroFileInput.files[0]);
      url = uploaded;
    }
    if(!url) return alert('Pilih file atau masukkan URL untuk hero.');
    localStorage.setItem('heroImage', url);
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
    localStorage.setItem('aboutHeroImage', url);
    try{ if(channel) channel.postMessage({type:'media-updated', key:'aboutHeroImage', url}); }catch(e){}
    alert('Gambar About tersimpan.');
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
    localStorage.setItem('sinceLogoImage', url);
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
    let url = (adminLogoUrlInput && adminLogoUrlInput.value.trim()) || '';
    if(!url && adminLogoFileInput && adminLogoFileInput.files && adminLogoFileInput.files[0]){
      let file = adminLogoFileInput.files[0];
      try{ const resized = await resizeImageFile(file, 1000, 0.8); if(resized) file = resized; }catch(e){}
      let uploaded = null;
      if(supabaseConfigured) uploaded = await uploadToSupabase(file instanceof Blob ? new File([file], (adminLogoFileInput.files[0]||{}).name || 'admin-logo.jpg', {type: file.type || 'image/jpeg'}) : file);
      if(!uploaded) uploaded = await uploadToLocalServer(file);
      if(!uploaded) uploaded = await toDataURL(adminLogoFileInput.files[0]);
      url = uploaded;
    }
    if(!url) return alert('Pilih file atau masukkan URL untuk logo admin.');
    localStorage.setItem('adminLogoImage', url);
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

function loadTopGallery(brand){
  const key = (brand === 'kopi') ? 'topProductImages_kopi' : 'topProductImages_roti';
  try{ return JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){ return []; }
}

function saveTopGalleryArr(brand, arr){
  const key = (brand === 'kopi') ? 'topProductImages_kopi' : 'topProductImages_roti';
  try{ localStorage.setItem(key, JSON.stringify(arr||[])); }catch(e){}
}

function renderTopGallery(){
  const brand = topGalleryBrandSelect ? topGalleryBrandSelect.value : 'roti';
  const arr = loadTopGallery(brand);
  if(!topGalleryList) return;
  if(arr.length === 0){ topGalleryList.innerHTML = '<div class="note">Belum ada foto di galeri.</div>'; return; }
  topGalleryList.innerHTML = arr.map((u, i)=>`<div style="position:relative;border-radius:8px;overflow:hidden;background:#fff;border:1px solid rgba(0,0,0,0.04);"><img src="${u}" style="width:100%;height:96px;object-fit:cover;display:block;"> <button data-remove-index="${i}" class="btn ghost" style="position:absolute;right:6px;top:6px;">Hapus</button></div>`).join('');
}

renderTopGallery();

if(topGalleryBrandSelect){
  topGalleryBrandSelect.addEventListener('change', ()=> renderTopGallery());
}

if(saveTopGalleryBtn){
  saveTopGalleryBtn.addEventListener('click', async ()=>{
    if(!topGalleryFiles || !topGalleryFiles.files || topGalleryFiles.files.length===0) return alert('Pilih file terlebih dahulu.');
    const brand = topGalleryBrandSelect ? topGalleryBrandSelect.value : 'roti';
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
    const arr = loadTopGallery(brand);
    const merged = arr.concat(saved);
    saveTopGalleryArr(brand, merged);
    try{ if(channel) channel.postMessage({type:'media-updated', key: (brand === 'kopi' ? 'topProductImages_kopi' : 'topProductImages_roti')}); }catch(e){}
    renderTopGallery();
    alert('Foto galeri berhasil ditambahkan.');
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
});


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

