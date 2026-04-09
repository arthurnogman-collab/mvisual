import { defineConfig } from 'vite';
import fs from 'fs';

export default defineConfig({
  assetsInclude: ['**/*.glb', '**/*.mp3', '**/*.mid'],
  server: {
    open: true
  },
  plugins: [{
    name: 'debug-log-writer',
    configureServer(server) {
      server.middlewares.use('/debug-log', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', () => {
            fs.appendFileSync('section4-debug.log', body + '\n', 'utf-8');
            res.writeHead(200);
            res.end('ok');
          });
        } else {
          res.writeHead(405);
          res.end();
        }
      });
    }
  }]
});
