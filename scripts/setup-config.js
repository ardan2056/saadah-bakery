#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function question(q){ return new Promise(res => rl.question(q, ans => res(ans.trim()))); }

(async function(){
  console.log('\nSa\'adah Bakery — config.js setup');
  const supaUrl = await question('SUPABASE_URL (https://...): ');
  const anon = await question('SUPABASE_ANON_KEY (anon public key): ');
  let bucket = await question('STORAGE_BUCKET (default: products): ');
  if(!bucket) bucket = 'products';

  if(!supaUrl || !anon){
    console.error('\nERROR: SUPABASE_URL and SUPABASE_ANON_KEY are required. Aborting.');
    rl.close(); process.exit(1);
  }

  const out = `export const SUPABASE_URL = "${supaUrl.replace(/"/g, '\\"')}";
export const SUPABASE_ANON_KEY = "${anon.replace(/"/g, '\\"')}";
export const STORE_PHONE = "6281234567890";
export const STORAGE_BUCKET = "${bucket.replace(/"/g, '\\"')}";
`;

  const target = path.join(__dirname, '..', 'config.js');
  try{
    fs.writeFileSync(target, out, { encoding: 'utf8', flag: 'w' });
    console.log('\nWrote', target);
    console.log('IMPORTANT: Do not commit your keys to Git. Add config.js to .gitignore if needed.');
  }catch(err){
    console.error('Failed to write config.js:', err);
    process.exit(1);
  } finally{ rl.close(); }

})();
