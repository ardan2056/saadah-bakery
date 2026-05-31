const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());

const publicDir = path.join(__dirname, '..');
const uploadDir = path.join(publicDir, 'assets', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `upload-${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

// Serve static project files so the returned URL can be used directly
app.use('/assets', express.static(path.join(publicDir, 'assets')));

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const host = req.get('origin') || `${req.protocol}://${req.get('host')}`;
  const url = `${host.replace(/\/$/, '')}/assets/uploads/${req.file.filename}`;
  res.json({ url });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Upload server running on http://localhost:${PORT}`));
