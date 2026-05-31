const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NETLIFY_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NETLIFY_SUPABASE_ANON_KEY || '';
const STORE_PHONE = process.env.STORE_PHONE || process.env.NETLIFY_STORE_PHONE || '6281234567890';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || process.env.NETLIFY_STORAGE_BUCKET || 'products';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_ANON_KEY empty. Generated config.js will contain placeholders.');
}

const content = `export const SUPABASE_URL = "${SUPABASE_URL}";\nexport const SUPABASE_ANON_KEY = "${SUPABASE_ANON_KEY}";\nexport const STORE_PHONE = "${STORE_PHONE}";\nexport const STORAGE_BUCKET = "${STORAGE_BUCKET}";\n`;

fs.writeFileSync(path.join(process.cwd(), 'config.js'), content, 'utf8');
console.log('Wrote config.js');
