const Busboy = require('busboy');
const { createClient } = require('@supabase/supabase-js');

const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'products';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!SERVICE_ROLE || !SUPABASE_URL) return { statusCode: 500, body: 'Service key not configured' };

  return new Promise((resolve) => {
    const bb = Busboy({ headers: event.headers });
    let fileBuffer = null;
    let filename = null;
    let mimetype = 'image/jpeg';

    bb.on('file', (fieldname, file, info) => {
      filename = info.filename || `upload-${Date.now()}.jpg`;
      mimetype = info.mimeType || mimetype;
      const chunks = [];
      file.on('data', (c) => chunks.push(c));
      file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });

    bb.on('finish', async () => {
      if (!fileBuffer) return resolve({ statusCode: 400, body: 'No file uploaded' });
      try{
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
        const ext = (filename.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();
        const safeName = `admin/${Date.now()}.${ext}`;
        const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(safeName, fileBuffer, { contentType: mimetype, upsert: false });
        if(error) return resolve({ statusCode: 500, body: JSON.stringify({ error: error.message || error }) });
        // try public url then signed url
        try{
          const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(safeName);
          if(pub?.publicUrl) return resolve({ statusCode: 200, body: JSON.stringify({ url: pub.publicUrl }) });
        }catch(e){}
        const { data: signed, error: sErr } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(safeName, 60*60*24*7);
        if(sErr) return resolve({ statusCode: 200, body: JSON.stringify({ url: null }) });
        return resolve({ statusCode: 200, body: JSON.stringify({ url: signed.signedUrl }) });
      }catch(err){
        return resolve({ statusCode: 500, body: JSON.stringify({ error: err.message || String(err) }) });
      }
    });

    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body || '');
    bb.end(body);
  });
};
