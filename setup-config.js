#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise((res) => rl.question(q, (a) => res(a))); }

(async function main() {
  console.log('Setup config.js untuk Saadah Bakery (kunci Supabase dan nomor WA).');

  const SUPABASE_URL = (await ask('SUPABASE_URL: ')).trim();
  const SUPABASE_ANON_KEY = (await ask('SUPABASE_ANON_KEY: ')).trim();
  const STORE_PHONE = (await ask('STORE_PHONE (contoh: 6281234567890): ')).trim();
  const STORAGE_BUCKET = (await ask('STORAGE_BUCKET (default: products): ')).trim() || 'products';

  const content = `export const SUPABASE_URL = "${SUPABASE_URL}";\nexport const SUPABASE_ANON_KEY = "${SUPABASE_ANON_KEY}";\nexport const STORE_PHONE = "${STORE_PHONE}";\nexport const STORAGE_BUCKET = "${STORAGE_BUCKET}";\n`;

  const dest = path.join(process.cwd(), 'config.js');
  fs.writeFileSync(dest, content, { encoding: 'utf8' });
  console.log('\nWrote config.js');

  // add to .gitignore
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  let gi = '';
  if (fs.existsSync(gitignorePath)) gi = fs.readFileSync(gitignorePath, 'utf8');
  if (!gi.includes('config.js')) {
    gi = gi + '\n# local keys\nconfig.js\n';
    fs.writeFileSync(gitignorePath, gi, 'utf8');
    console.log('Added config.js to .gitignore');
  }

  rl.close();
})();
