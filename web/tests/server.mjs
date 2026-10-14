import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
export async function serve() {
  const root = new URL('../../dist/', import.meta.url).pathname;
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(
        /^\/preview\//,
        '',
      );
      const file = resolve(root, path || 'index.html');
      if (!file.startsWith(resolve(root) + sep)) throw new Error('Invalid path');
      const st = await stat(file);
      const target = st.isDirectory() ? resolve(file, 'index.html') : file;
      res.writeHead(200, {
        'Content-Type': types[extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(await readFile(target));
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/preview/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
if (process.argv.includes('--inspect')) {
  const preview = await serve();
  console.log(preview.url);
  const shutdown = async () => {
    await preview.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  setTimeout(shutdown, 300000);
}
