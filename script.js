import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { STORAGE_BUCKET, STORE_PHONE, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const supabaseConfigured = SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("ISI_");
const supabase = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
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

function setSiteAssetValueLocal(key, value){
  try{ siteAssetsCache[key] = value || ''; }catch(e){}
  try{ localStorage.setItem(key, value || ''); }catch(e){}
}

const siteAssetsReady = loadSiteAssets().then(()=>{
  setTimeout(()=>{
    syncBrandMarkImage();
    setHeroBackground();
    setAboutHeroImage();
    setFounderPhoto();
    setSinceLogoImage();
    syncAdminLogoImage();
    renderTopProductGallery();
  }, 0);
}).catch(()=>{});
const menuGrid = document.getElementById("menuGrid");
const menuPanelTitle = document.getElementById("menuPanelTitle");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter") || { value: 'all' };
const cartItems = document.getElementById("cartItems");
const totalPrice = document.getElementById("totalPrice");
const orderBtn = document.getElementById("orderBtn");
const homeTabTrigger = document.getElementById("homeTabTrigger");
const menuTabTrigger = document.getElementById("menuTabTrigger");
const aboutTabTrigger = document.getElementById("aboutTabTrigger");
const contactTabTrigger = document.getElementById("contactTabTrigger");
const menuPanelClose = document.getElementById("menuPanelClose");
const heroMenuTrigger = document.getElementById("heroMenuTrigger");
const heroContactTrigger = document.getElementById("heroContactTrigger");
const contactMenuTrigger = document.getElementById("contactMenuTrigger");
const quoteTrigger = document.querySelector('.topbar a[href="#kontak"]');
const aboutBackTrigger = document.getElementById("aboutBackTrigger");
const contactBackTrigger = document.getElementById("contactBackTrigger");
const pageSlider = document.getElementById("pageSlider");
const homeView = document.getElementById("homeView");
const menuView = document.getElementById("menuView");
const aboutView = document.getElementById("aboutView");
const contactView = document.getElementById("contactView");
const adminSecretTrigger = document.getElementById("adminSecretTrigger");
const topProductGallery = document.getElementById("topProductGallery");
const secretModal = document.getElementById("secretModal");
const secretModalClose = document.getElementById("secretModalClose");
const secretModalCancel = document.getElementById("secretModalCancel");
const secretModalSubmit = document.getElementById("secretModalSubmit");
const secretCodeInput = document.getElementById("secretCodeInput");
const secretModalError = document.getElementById("secretModalError");
const brandMarkImage = document.getElementById('brandMarkImage');

let products = [];
let cart = [];
// Tidak memakai demo produk — tampilkan kosong sampai admin menambahkan produk
// top product images are stored per-brand using keys: topProductImages_roti and topProductImages_kopi

function storageKeyForBrand(brand){
  if(!brand) brand = selectedBrand;
  return (brand === 'coffee' || brand === 'kopi') ? 'topProductImages_kopi' : 'topProductImages_roti';
}

function loadTopProductImages(brand){
  const raw = getSiteAssetValue(storageKeyForBrand(brand), localStorage.getItem(storageKeyForBrand(brand)) || '[]');
  try{ return JSON.parse(raw || '[]'); }catch(e){ return []; }
}

function saveTopProductImages(brand, arr){
  try{ localStorage.setItem(storageKeyForBrand(brand), JSON.stringify(arr || [])); }catch(e){}
}
// load admin products from localStorage if present
function loadAdminProductsFromStorage(){
  try{ return JSON.parse(localStorage.getItem('adminProducts') || '[]'); }catch(e){ return []; }
}

function syncBrandMarkImage() {
  if (!brandMarkImage) return;
  const url = getSiteAssetValue('adminWelcomeImage');
  if (url) {
    brandMarkImage.src = url;
    brandMarkImage.style.display = 'block';
  } else {
    brandMarkImage.removeAttribute('src');
    brandMarkImage.style.display = 'none';
  }
}

// Real-time updates channel (optional)
const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('saadah-updates') : null;
if (bc) {
  bc.addEventListener('message', (ev) => {
    if (!ev.data) return;
    if (ev.data.type === 'products-updated') {
      const admin = ev.data.products || loadAdminProductsFromStorage();
      products = admin.length ? admin.slice() : [];
      renderProducts();
    }
    if (ev.data.type === 'media-updated') {
      // media updates include heroImage, aboutHeroImage, sinceLogoImage, adminLogoImage
      try{
        if (ev.data.key === 'heroImage') setHeroBackground();
        if (ev.data.key === 'aboutHeroImage') setAboutHeroImage();
        if (ev.data.key === 'founderPhoto') setFounderPhoto();
        if (ev.data.key === 'sinceLogoImage') setSinceLogoImage();
        if (ev.data.key === 'adminLogoImage' || ev.data.key === 'adminWelcomeImage') syncAdminLogoImage();
        if (ev.data.key && ev.data.key.startsWith('topProductImages')) renderTopProductGallery();
      }catch(e){}
    }
  });
}
// storage event for other tabs (fallback)
window.addEventListener('storage', (e)=>{
  if (!e.key) return;
  if (e.key === 'adminProducts' || e.key.startsWith('adminProducts')){
    const admin = loadAdminProductsFromStorage();
    products = admin.length ? admin.slice() : [];
    renderProducts();
  }
  if (e.key === 'adminWelcomeImage') {
    syncBrandMarkImage();
  }
});


const ADMIN_SECRET_CODE = "ardan2056";
const ADMIN_SECRET_KEY = "saadah_bakery_admin_secret";
const VIEW_CONFIG = {
  home: { view: homeView, trigger: homeTabTrigger },
  menu: { view: menuView, trigger: menuTabTrigger },
  about: { view: aboutView, trigger: aboutTabTrigger },
  contact: { view: contactView, trigger: contactTabTrigger }
};

const VIEW_HASH = {
  home: '#homeView',
  menu: '#menuView',
  about: '#aboutView',
  contact: '#contactView'
};

// Brand selection: 'bakery' -> show roti; 'coffee' -> show kopi
const brandBakeryBtn = document.getElementById('brandBakery');
const brandCoffeeBtn = document.getElementById('brandCoffee');
const brandIndicator = document.querySelector('.brand-indicator');
let selectedBrand = 'bakery';

function updateBrandIndicator() {
  if (!brandIndicator) return;

  const activeButton = selectedBrand === 'coffee' ? brandCoffeeBtn : brandBakeryBtn;
  const switcher = activeButton?.parentElement;
  if (!activeButton || !switcher) return;

  const buttonRect = activeButton.getBoundingClientRect();
  const switchRect = switcher.getBoundingClientRect();
  const left = buttonRect.left - switchRect.left;
  const top = buttonRect.top - switchRect.top;

  brandIndicator.style.width = `${buttonRect.width}px`;
  brandIndicator.style.height = `${buttonRect.height}px`;
  brandIndicator.style.transform = `translate(${left}px, ${top}px)`;
  brandIndicator.classList.add('is-ready');
}

function setBrand(b) {
  selectedBrand = b;
  if (brandBakeryBtn) brandBakeryBtn.classList.toggle('is-active', b === 'bakery');
  if (brandCoffeeBtn) brandCoffeeBtn.classList.toggle('is-active', b === 'coffee');
  if (menuPanelTitle) {
    menuPanelTitle.textContent = b === 'coffee' ? "Katalog Sa'adah Cafe" : "Katalog Sa'adah Bakery";
  }
  menuGrid?.classList.add('is-switching');
  renderProducts();
  window.setTimeout(() => {
    menuGrid?.classList.remove('is-switching');
  }, 220);
  window.requestAnimationFrame(updateBrandIndicator);

  // update top gallery for selected brand
  renderTopProductGallery();
}

brandBakeryBtn?.addEventListener('click', () => setBrand('bakery'));
brandCoffeeBtn?.addEventListener('click', () => setBrand('coffee'));

function formatRupiah(value) {
  return `Rp${Number(value).toLocaleString("id-ID")}`;
}

function fallbackImage(category) {
  const map = {
    roti: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
    kopi: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=1200&q=80"
  };

  return map[category] || map.roti;
}

function canonicalCategory(cat){
  const c = (cat||'').toString().toLowerCase().trim();
  if(!c) return '';
  const kopiSyn = ['kopi','coffee','cafe','minuman','drink','beverage','minum'];
  const rotiSyn = ['roti','bread','makanan','food','bakery','pastry'];
  if(kopiSyn.includes(c) || c.indexOf('kopi') === 0 || c.includes('minum') || c.includes('coffee') || c.includes('cafe')) return 'kopi';
  if(rotiSyn.includes(c) || c.indexOf('roti') === 0 || c.includes('makan') || c.includes('bread')) return 'roti';
  return c;
}

function normalizeProduct(item){
  if(!item) return item;
  const normalized = Object.assign({}, item);
  try{ normalized.category = canonicalCategory(item.category) || (item.category||'').toString().toLowerCase().trim(); }catch(e){ normalized.category = (item.category||'').toString().toLowerCase().trim(); }
  return normalized;
}

async function loadProducts() {
  // Prioritas: adminProducts (localStorage) -> Supabase (jika dikonfigurasi) -> kosong
  const adminProducts = loadAdminProductsFromStorage();
  if (adminProducts && adminProducts.length) {
    products = adminProducts.slice();
    // normalisasi kategori agar filter publik mengenali variasi (coffee, minuman, dll.)
    products = products.map(normalizeProduct);
    renderProducts();
    return;
  }
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        products = [];
        renderProducts();
        return;
      }

      products = (data && data.length) ? data : [];
      // normalisasi kategori dari remote juga (jika ada variasi teks)
      products = products.map(normalizeProduct);
      renderProducts();
      return;
    } catch (e) {
      console.error('Load products failed', e);
      products = [];
      renderProducts();
      return;
    }
  }

  // default: kosong (tunggu admin menambahkan produk)
  products = [];
  renderProducts();
}

function renderProducts() {
  const keyword = (searchInput.value || '').trim().toLowerCase();
  const category = (categoryFilter && categoryFilter.value) ? categoryFilter.value : 'all';
  // normalisasi nilai filter kategori (mis. 'minuman' -> 'kopi')
  const canonicalFilter = (category === 'all') ? 'all' : canonicalCategory(category);

  function normalizeCat(c){ return (c||'').toString().toLowerCase().trim(); }
  function categoryMatchesFilter(itemCategory, filter){
    if(!filter || filter === 'all') return true;
    const cat = normalizeCat(itemCategory);
    if(!cat) return false;
    if(filter === 'roti'){
      return ['roti','makanan','food','bread','bakery'].includes(cat) || cat.indexOf('roti') === 0 || cat.includes('makanan');
    }
    if(filter === 'kopi'){
      return ['kopi','minuman','drink','coffee','cafe'].includes(cat) || cat.indexOf('kopi') === 0 || cat.includes('minuman') || cat.includes('coffee') || cat.includes('cafe');
    }
    return cat === normalizeCat(filter);
  }

  function brandMatches(itemCategory){
    if(selectedBrand === 'coffee') {
      // ensure strict: exclude anything that normalizes to 'roti'
      if(!itemCategory) return false;
      const cat = normalizeCat(itemCategory);
      const isRoti = (['roti','makanan','food','bread','bakery'].includes(cat) || cat.indexOf('roti') === 0 || cat.includes('makanan'));
      if(isRoti) return false;
      return categoryMatchesFilter(itemCategory, 'kopi');
    }
    if(selectedBrand === 'bakery') {
      const cat = normalizeCat(itemCategory);
      const isKopi = (['kopi','minuman','drink','coffee','cafe'].includes(cat) || cat.indexOf('kopi') === 0 || cat.includes('minuman') || cat.includes('coffee'));
      if(isKopi) return false;
      return categoryMatchesFilter(itemCategory, 'roti');
    }
    return true;
  }

  const filtered = products.filter((item) => {
    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();
    const matchKeyword = name.includes(keyword) || description.includes(keyword);
    const matchCategory = categoryMatchesFilter(item.category, canonicalFilter);
    // If user explicitly chose a category (not 'all'), respect that choice
    // and don't further limit results by the selected brand.
    const matchBrand = (canonicalFilter && canonicalFilter !== 'all') ? true : brandMatches(item.category);
    return matchKeyword && matchCategory && matchBrand;
  });

  if (filtered.length === 0) {
    menuGrid.innerHTML = '<div class="empty-state">Menu tidak ditemukan. Coba ubah kata kunci atau kategori.</div>';
    return;
  }

  // Default: show flat grid
  menuGrid.innerHTML = filtered
    .map((item) => {
      const imageSrc = item.image_url || fallbackImage(item.category);
      const initials = (item.name || '').split(' ').map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
      return `
        <article class="card">
          <div class="card-image">
            <img src="${imageSrc}" alt="${item.name}" loading="lazy" decoding="async" onerror="this.style.display='none'">
            <div class="img-fallback">${initials}</div>
          </div>
          <div class="card-body">
            <h4>${item.name}</h4>
            <p>${item.description || "Menu favorit Sa'adah."}</p>
            <span class="price">${formatRupiah(item.price)}</span>
            <div class="card-actions">
              <button class="btn primary" type="button" data-add-to-cart="${item.id}">Tambah</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTopProductGallery(){
  if(!topProductGallery) return;
  const arr = loadTopProductImages(selectedBrand === 'coffee' ? 'kopi' : 'roti');
  // filter out gallery images that are actually product images of the opposite category
  let filteredArr = arr || [];
  try{
    if(selectedBrand === 'coffee'){
      const rotiImgs = new Set((products||[]).filter(p=>{ const c = (p.category||'').toString().toLowerCase(); return c && (c==='roti' || c.includes('roti') || c.includes('makanan') || c.includes('bread')); }).map(p=>p.image_url).filter(Boolean));
      filteredArr = filteredArr.filter(u => !rotiImgs.has(u));
    } else if(selectedBrand === 'bakery'){
      const kopiImgs = new Set((products||[]).filter(p=>{ const c = (p.category||'').toString().toLowerCase(); return c && (c==='kopi' || c.includes('kopi') || c.includes('minuman') || c.includes('coffee')); }).map(p=>p.image_url).filter(Boolean));
      filteredArr = filteredArr.filter(u => !kopiImgs.has(u));
    }
  }catch(e){ }

  if(!filteredArr || filteredArr.length === 0){
    topProductGallery.innerHTML = '<div class="top-product-inner empty">Galeri produk kosong. Upload foto melalui admin nanti.</div>';
    return;
  }
  const html = `
    <div class="top-product-inner">
      <div class="gallery-row">
        ${filteredArr.map(url=>`<div class="top-product-item"><img src="${url}" alt="Foto produk" loading="lazy" decoding="async" onerror="this.style.display='none'"></div>`).join('')}
      </div>
    </div>`;
  topProductGallery.innerHTML = html;
}

// Public upload UI removed — uploads now handled from admin only.

window.addTopProductImage = function(url, brand){
  if(!url) return;
  const b = (brand === 'kopi' || brand === 'coffee') ? 'kopi' : 'roti';
  const arr = loadTopProductImages(b);
  arr.push(url);
  saveTopProductImages(b, arr);
  try{ if(typeof BroadcastChannel !== 'undefined') new BroadcastChannel('saadah-updates').postMessage({type:'media-updated', key: storageKeyForBrand(b==='kopi'? 'coffee':'bakery')}); }catch(e){}
  renderTopProductGallery();
}

window.clearTopProductImages = function(brand){
  const b = (brand === 'kopi' || brand === 'coffee') ? 'kopi' : 'roti';
  saveTopProductImages(b, []);
  try{ if(typeof BroadcastChannel !== 'undefined') new BroadcastChannel('saadah-updates').postMessage({type:'media-updated', key: storageKeyForBrand(b==='kopi'? 'coffee':'bakery')}); }catch(e){}
  renderTopProductGallery();
}

function renderCart() {
  if (cart.length === 0) {
    cartItems.innerHTML = '<div class="empty-state">Keranjang masih kosong. Tambahkan menu dari daftar di atas.</div>';
    totalPrice.textContent = formatRupiah(0);
    orderBtn.disabled = true;
    return;
  }

  let total = 0;

  cartItems.innerHTML = cart
    .map((item, index) => {
      const subtotal = item.price * item.qty;
      total += subtotal;

      return `
        <div class="cart-item">
          <div>
            <strong>${item.name}</strong>
            <small>${item.qty} x ${formatRupiah(item.price)}</small>
          </div>
          <div class="cart-item-actions">
            <strong>${formatRupiah(subtotal)}</strong>
                <button class="icon-btn" type="button" data-decrease-item="${index}">-</button>
                <button class="icon-btn" type="button" data-increase-item="${index}">+</button>
                <button class="icon-btn danger" type="button" data-remove-item="${index}">x</button>
          </div>
        </div>
      `;
    })
    .join("");

  totalPrice.textContent = formatRupiah(total);
  orderBtn.disabled = false;
}

function addToCart(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;

  const existing = cart.find((item) => item.id === productId);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: 1
    });
  }

  renderCart();
}

function decreaseItem(index) {
  const item = cart[index];
  if (!item) return;

  item.qty -= 1;

  if (item.qty <= 0) {
    cart.splice(index, 1);
  }

  renderCart();
}

function increaseItem(index) {
  const item = cart[index];
  if (!item) return;
  item.qty += 1;
  renderCart();
}

function removeItem(index) {
  cart.splice(index, 1);
  renderCart();
}

function orderWhatsApp() {
  if (cart.length === 0) {
    alert("Keranjang masih kosong.");
    return;
  }

  let message = "Halo Sa'adah Bakery, saya mau pesan:\n\n";
  let total = 0;

  cart.forEach((item) => {
    const subtotal = item.price * item.qty;
    total += subtotal;
    message += `- ${item.name} x ${item.qty} = ${formatRupiah(subtotal)}\n`;
  });

  message += `\nTotal: ${formatRupiah(total)}`;
  message += "\n\nNama:\nAlamat:\nCatatan Pesanan:";

  // also save order locally for admin dashboard
  saveOrderLocally();

  window.open(`https://wa.me/${STORE_PHONE}?text=${encodeURIComponent(message)}`, "_blank");
}

// Save order to localStorage so admin can see it
function saveOrderLocally() {
  if (cart.length === 0) return;
  const orders = JSON.parse(localStorage.getItem('orders') || '[]');
  const now = new Date().toISOString();
  const order = {
    id: 'o_' + Date.now(),
    items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
    total: cart.reduce((s,i)=> s + i.price * i.qty, 0),
    created_at: now,
  };
  orders.unshift(order);
  localStorage.setItem('orders', JSON.stringify(orders));
  if (typeof BroadcastChannel !== 'undefined') {
    try { new BroadcastChannel('saadah-updates').postMessage({ type: 'orders-updated', orders }); } catch (e) {}
  }
}

function openView(viewName, shouldScrollTop = true) {
  if (!pageSlider || !VIEW_CONFIG[viewName]) {
    return;
  }

  Object.entries(VIEW_CONFIG).forEach(([name, config]) => {
    const isActive = name === viewName;
    config.view?.classList.toggle("is-active", isActive);
    config.view?.setAttribute("aria-hidden", isActive ? "false" : "true");
    config.trigger?.classList.toggle("is-active", isActive);
    // Set aria-current so assistive tech knows which tab is active
    try {
      if (config.trigger) {
        config.trigger.setAttribute('aria-current', isActive ? 'page' : 'false');
      }
    } catch (e) {}
  });

  // Move slider to the selected view (0 = home, 1 = menu, 2 = about, 3 = contact)
  // No slider transform: we switch pages by toggling active classes only.

  // Toggle body scrolling: home view should scroll, others should lock
  // Ensure the document body remains scrollable for all views
  try {
    document.body.style.overflow = 'auto';
  } catch (e) {
    // noop
  }

  // Update URL without causing a native anchor jump
  const targetHash = VIEW_HASH[viewName] || VIEW_HASH.home;
  try {
    history.replaceState(null, '', targetHash);
  } catch (e) {
    // noop
  }

  if (shouldScrollTop) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (viewName === 'menu') {
    window.requestAnimationFrame(updateBrandIndicator);
  }

  // Accessibility: put focus on the first heading in the active view
  try {
    const heading = VIEW_CONFIG[viewName].view.querySelector('h2, h3');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  } catch (e) {
    // noop
  }
}

// Keyboard navigation: ArrowRight -> next view, ArrowLeft -> prev view, Escape -> home
window.addEventListener('keydown', (e) => {
  const order = ['home','menu','about','contact'];
  const currentHash = window.location.hash || VIEW_HASH.home;
  const currentView = Object.keys(VIEW_HASH).find(k => VIEW_HASH[k] === currentHash.replace(/^#/, '#') ) || null;
  // fallback: find active via class
  let activeIndex = order.findIndex(v => VIEW_CONFIG[v].view?.classList.contains('is-active'));
  if (activeIndex === -1) activeIndex = order.indexOf(currentView) >= 0 ? order.indexOf(currentView) : 0;

  if (e.key === 'ArrowRight') {
    const next = Math.min(activeIndex + 1, order.length -1);
    openView(order[next]);
  } else if (e.key === 'ArrowLeft') {
    const prev = Math.max(activeIndex - 1, 0);
    openView(order[prev]);
  } else if (e.key === 'Escape') {
    openView('home');
  }
});

// Touch / pointer swipe navigation: horizontal swipe moves between views
(function setupSwipeNavigation(){
  const order = ['home','menu','about','contact'];
  let startX = null;
  let startY = null;
  let pointerDown = false;

  function handleSwipeEnd(endX, endY) {
    if (startX === null || startY === null) return;
    const dx = endX - startX;
    const dy = endY - startY;
    // require mostly horizontal movement and enough distance
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      const activeIndex = order.findIndex(v => VIEW_CONFIG[v].view?.classList.contains('is-active'));
      if (dx < 0) {
        // swipe left -> next
        const next = Math.min(activeIndex + 1, order.length - 1);
        openView(order[next]);
      } else {
        // swipe right -> prev
        const prev = Math.max(activeIndex - 1, 0);
        openView(order[prev]);
      }
    }
    startX = null;
    startY = null;
  }

  // touch events for mobile
  window.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, {passive: true});

  window.addEventListener('touchend', (e) => {
    // use changedTouches to get the last point
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    handleSwipeEnd(t.clientX, t.clientY);
  });

  // pointer events for trackpad/mouse drag (optional)
  window.addEventListener('pointerdown', (e) => {
    // ignore right-click or non-primary buttons
    if (e.button && e.button !== 0) return;
    pointerDown = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  window.addEventListener('pointerup', (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    handleSwipeEnd(e.clientX, e.clientY);
  });
})();

function bindViewTrigger(element, viewName) {
  element?.addEventListener("click", (event) => {
    // Prevent native anchor jump and use JS-driven slider.
    event.preventDefault();
    openView(viewName);
    // Push history so back/forward work as expected
    try {
      history.pushState(null, '', VIEW_HASH[viewName] || VIEW_HASH.home);
    } catch (e) {
      // noop
    }
  });
}

function openAdminSecret() {
  if (!secretModal) {
    return;
  }

  secretModal.classList.remove("hidden");
  secretModal.setAttribute("aria-hidden", "false");
  secretModalError.classList.add("hidden");
  secretCodeInput.value = "";
  setTimeout(() => secretCodeInput.focus(), 0);
}

function closeAdminSecret() {
  if (!secretModal) {
    return;
  }

  secretModal.classList.add("hidden");
  secretModal.setAttribute("aria-hidden", "true");
  secretModalError.classList.add("hidden");
}

function submitAdminSecret() {
  const code = secretCodeInput.value.trim();

  if (code === ADMIN_SECRET_CODE) {
    localStorage.setItem(ADMIN_SECRET_KEY, "true");
    window.location.href = "admin.html";
    return;
  }

  secretModalError.classList.remove("hidden");
}

menuGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-to-cart]");
  if (addButton) {
    addToCart(addButton.dataset.addToCart);
  }
});

cartItems.addEventListener("click", (event) => {
  const decreaseButton = event.target.closest("[data-decrease-item]");
  const removeButton = event.target.closest("[data-remove-item]");
  const increaseButton = event.target.closest("[data-increase-item]");

  if (decreaseButton) {
    decreaseItem(Number(decreaseButton.dataset.decreaseItem));
  }

  if (increaseButton) {
    increaseItem(Number(increaseButton.dataset.increaseItem));
  }

  if (removeButton) {
    removeItem(Number(removeButton.dataset.removeItem));
  }
});

searchInput.addEventListener("input", renderProducts);
categoryFilter.addEventListener("change", renderProducts);
orderBtn.addEventListener("click", orderWhatsApp);
bindViewTrigger(homeTabTrigger, "home");
bindViewTrigger(menuTabTrigger, "menu");
bindViewTrigger(aboutTabTrigger, "about");
bindViewTrigger(contactTabTrigger, "contact");
bindViewTrigger(heroMenuTrigger, "menu");
bindViewTrigger(heroContactTrigger, "contact");
bindViewTrigger(contactMenuTrigger, "menu");
bindViewTrigger(quoteTrigger, "contact");
// handle quick category nav links inside menu header
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-scroll-to]');
  if (!a) return;
  e.preventDefault();
  const cat = a.dataset.scrollTo;
  openView('menu');
  // scroll to section immediately (no transition/slider)
  const el = document.getElementById(`cat-${cat}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
adminSecretTrigger?.addEventListener("click", openAdminSecret);
secretModalClose?.addEventListener("click", closeAdminSecret);
secretModalCancel?.addEventListener("click", closeAdminSecret);
secretModalSubmit?.addEventListener("click", submitAdminSecret);
secretCodeInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    submitAdminSecret();
  }
  if (event.key === "Escape") {
    closeAdminSecret();
  }
});
secretModal?.addEventListener("click", (event) => {
  if (event.target === secretModal) {
    closeAdminSecret();
  }
});

function handleLocationChange() {
  const map = {
    '#homeView': 'home',
    '#menuView': 'menu',
    '#aboutView': 'about',
    '#contactView': 'contact',
    '#kontak': 'contact'
  };
  const view = map[window.location.hash] || 'home';
  openView(view);
}

window.addEventListener('hashchange', handleLocationChange);
window.addEventListener('popstate', handleLocationChange);
window.addEventListener('resize', () => {
  if (document.getElementById('menuView')?.classList.contains('is-active')) {
    updateBrandIndicator();
  }
});

const initialView = {
  "#homeView": "home",
  "#menuView": "menu",
  "#aboutView": "about",
  "#contactView": "contact",
  "#kontak": "contact"
}[window.location.hash] || "home";

openView(initialView, false);
loadProducts();
renderCart();
syncBrandMarkImage();
window.requestAnimationFrame(updateBrandIndicator);

// Set hero background using data attribute or uploaded topProductImages (localStorage)
function setHeroBackground() {
  const heroEl = document.querySelector('.hero.hero-landing');
  if (!heroEl) return;
  // Priority: explicit localStorage heroImage -> data-hero-image attribute -> topProductImages gallery
  let url = getSiteAssetValue('heroImage', heroEl.dataset.heroImage || '');
  if ((!url || url === '') && topProductImages && topProductImages.length) {
    url = topProductImages[0];
  }
  const baseOverlay = 'linear-gradient(180deg, rgba(12,8,6,0.18), rgba(12,8,6,0.06))';
  if (!url) {
    heroEl.style.setProperty('--hero-bg', baseOverlay);
    return;
  }
  const cssVal = `${baseOverlay}, url('${url}')`;
  heroEl.style.setProperty('--hero-bg', cssVal);
}

setHeroBackground();

// Review submission from frontend
const submitReviewBtn = document.getElementById('submitReview');
if(submitReviewBtn){
  submitReviewBtn.addEventListener('click', ()=>{
    const textEl = document.getElementById('reviewText');
    const nameEl = document.getElementById('reviewerName');
    const text = textEl?.value?.trim();
    const name = nameEl?.value?.trim() || null;
    if(!text) return alert('Tulis ulasan terlebih dahulu.');
    const reviews = JSON.parse(localStorage.getItem('reviews') || '[]');
    const item = { id: 'r_'+Date.now(), name, text, created_at: new Date().toISOString() };
    reviews.unshift(item);
    localStorage.setItem('reviews', JSON.stringify(reviews));
    if(typeof BroadcastChannel !== 'undefined'){
      try{ new BroadcastChannel('saadah-updates').postMessage({type:'reviews-updated', reviews}); }catch(e){}
    }
    alert('Terima kasih atas ulasan Anda!');
    if(textEl) textEl.value = '';
    if(nameEl) nameEl.value = '';
  });
}

// Set about hero image (from localStorage.aboutHeroImage)
function setAboutHeroImage(){
  const aboutPhoto = document.querySelector('.hero-visual-photo');
  if(!aboutPhoto) return;
  const url = getSiteAssetValue('aboutHeroImage');
  if(!url){
    // keep existing decorative background
    return;
  }
  // If image is a data URL or regular URL, set as background
  aboutPhoto.style.backgroundImage = `url('${url}')`;
  aboutPhoto.style.backgroundSize = 'cover';
  aboutPhoto.style.backgroundPosition = 'center center';
  aboutPhoto.textContent = '';
}

function setFounderPhoto(){
  const founderEl = document.querySelector('.founder-photo');
  if(!founderEl) return;
  const full = getSiteAssetValue('founderPhoto');
  const thumb = getSiteAssetValue('founderPhoto_thumb');
  const display = full || thumb;
  if(!display){ founderEl.textContent = 'S'; founderEl.style.backgroundImage = ''; return; }
  // Use img tag inside founderEl for better layout
  founderEl.innerHTML = '';
  const img = document.createElement('img');
  img.src = display;
  img.alt = 'Ibu Saadah';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  founderEl.appendChild(img);
  // If we are showing a thumb but full exists remotely, try to preload and swap
  if(display === thumb && full && full !== thumb){
    const fullImg = new Image();
    fullImg.crossOrigin = 'anonymous';
    fullImg.onload = ()=>{ img.src = full; };
    fullImg.src = full;
  }
}

setFounderPhoto();

// Preload helper: load image off-DOM then apply when ready to avoid flicker
function preloadAndApply(url, applyFn){
  if(!url) return;
  try{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>{ try{ applyFn(url); }catch(e){} };
    img.onerror = ()=>{ try{ applyFn(url); }catch(e){} };
    img.src = url;
  }catch(e){ try{ applyFn(url); }catch(_){} }
}

// Try to fetch high-priority assets directly and apply immediately (reduces perceived delay)
async function prioritizeAssets(){
  if(!supabase || !supabaseConfigured) return;
  const keys = ['founderPhoto','adminLogoImage','heroImage'];
  try{
    await Promise.all(keys.map(async (key)=>{
      try{
        const { data, error } = await supabase.from('site_assets').select('image_url').eq('key', key).limit(1).single();
        if(!error && data?.image_url){
          siteAssetsCache[key] = data.image_url;
          if(key === 'founderPhoto') preloadAndApply(data.image_url, ()=>setFounderPhoto());
          if(key === 'adminLogoImage') preloadAndApply(data.image_url, ()=>syncAdminLogoImage());
          if(key === 'heroImage') preloadAndApply(data.image_url, ()=>setHeroBackground());
        }
      }catch(_){ }
    }));
  }catch(e){ }
}

// Kick off prioritized fetch without waiting for full site_assets load
prioritizeAssets().catch(()=>{});

setAboutHeroImage();

// Set small 'Since' logo in hero visual if present
function setSinceLogoImage(){
  const ribbonEls = document.querySelectorAll('.hero-visual-ribbon, .hero-annotation');
  const url = getSiteAssetValue('sinceLogoImage');
  ribbonEls.forEach(el=>{
    if(!el) return;
    if(url){
      el.innerHTML = `<img src="${url}" alt="Since" style="height:28px; display:block;">`;
    } else {
      const defaultText = el.dataset?.sinceText || el.textContent || 'Since 1998';
      el.textContent = defaultText;
    }
  });
}

// Sync admin header logo (adminLogoImage preferred, fallback to adminWelcomeImage)
function syncAdminLogoImage(){
  if(!brandMarkImage) return;
  const url = getSiteAssetValue('adminLogoImage') || getSiteAssetValue('adminWelcomeImage') || '';
  if(url){ brandMarkImage.src = url; brandMarkImage.style.display = 'block'; }
  else { brandMarkImage.removeAttribute('src'); brandMarkImage.style.display = 'none'; }
}

setSinceLogoImage();
syncAdminLogoImage();

// listen for storage changes to update hero/about images in other tabs
window.addEventListener('storage', (e)=>{
  if(!e.key) return;
  if(e.key === 'heroImage' || e.key.startsWith('topProductImages')) { setHeroBackground(); renderTopProductGallery(); }
  if(e.key === 'aboutHeroImage') setAboutHeroImage();
  if (e.key === 'founderPhoto') setFounderPhoto();
  if(e.key === 'sinceLogoImage') setSinceLogoImage();
  if(e.key === 'adminWelcomeImage' || e.key === 'adminLogoImage') syncAdminLogoImage();
  if(e.key === 'adminProducts') loadProducts();
});
