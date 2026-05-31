// Node script: normalize product categories via Supabase REST API
// Usage:
//   On Windows (PowerShell):
//     $env:SUPABASE_URL = "https://your-project.supabase.co"
//     $env:SUPABASE_SERVICE_ROLE = "<SERVICE_ROLE_KEY>"
//     node scripts/normalize_categories.js
//   On mac/linux:
//     export SUPABASE_URL="https://your-project.supabase.co"
//     export SUPABASE_SERVICE_ROLE="<SERVICE_ROLE_KEY>"
//     node scripts/normalize_categories.js

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if(!SUPABASE_URL || !SERVICE_ROLE){
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env vars.');
  process.exit(1);
}

const fetch = global.fetch || require('node-fetch');

const mapCategory = (c) => {
  if(!c) return null;
  const s = String(c).toLowerCase().trim();
  if(['minuman','drink','coffee','cafe'].includes(s) || s.includes('kop')) return 'kopi';
  if(['makanan','food','bread','bakery'].includes(s) || s.includes('roti')) return 'roti';
  return null;
}

(async ()=>{
  try{
    console.log('Fetching products...');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,category`, {
      headers: {
        'apikey': SERVICE_ROLE,
        'Authorization': `Bearer ${SERVICE_ROLE}`
      }
    });
    if(!res.ok){
      const text = await res.text();
      throw new Error('Failed to fetch products: '+res.status+' '+text);
    }
    const products = await res.json();
    console.log(`Found ${products.length} products`);
    const toUpdate = [];
    for(const p of products){
      const newCat = mapCategory(p.category);
      if(newCat && newCat !== (p.category||'').toLowerCase().trim()){
        toUpdate.push({ id: p.id, from: p.category, to: newCat });
      }
    }
    console.log('Will update', toUpdate.length, 'rows');
    for(const u of toUpdate){
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${u.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_ROLE,
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ category: u.to })
      });
      if(!patchRes.ok){
        const t = await patchRes.text();
        console.error(`Failed to update ${u.id}: ${patchRes.status} ${t}`);
      } else {
        const json = await patchRes.json();
        console.log('Updated', u.id, '->', u.to);
      }
    }
    console.log('Done. Refresh your site to see changes.');
  }catch(err){
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
