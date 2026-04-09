import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

// Serve built Vite output (JS/CSS bundles, index.html)
app.use(express.static(join(__dirname, 'dist')));

// Serve raw assets from project root (models/, music/ — not bundled by Vite)
app.use('/models', express.static(join(__dirname, 'models')));
app.use('/music', express.static(join(__dirname, 'music')));

// SPA fallback — serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
