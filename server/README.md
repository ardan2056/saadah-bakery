Local upload server for assets

1. Install dependencies:

   npm install

2. Run server:

   npm start

3. The server listens on port 5000 by default and exposes endpoint:

   POST /upload (form field `file`)

4. Uploaded files are saved to `assets/uploads/` and served at:

   http://localhost:5000/assets/uploads/<filename>
