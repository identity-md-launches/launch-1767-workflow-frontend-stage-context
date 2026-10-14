import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'deployment-files-in-development',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const path = request.url?.split('?')[0];
          if (!path || !(path === '/imd-deployment.json' || /^\/abi\/[A-Za-z]+\.json$/.test(path)))
            return next();
          try {
            const bytes = await readFile(new URL(`../dist${path}`, import.meta.url));
            response.setHeader('Content-Type', 'application/json');
            response.end(bytes);
          } catch {
            response.statusCode = 404;
            response.end('Run npm run build to generate the deployment files.');
          }
        });
      },
    },
  ],
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 650 },
});
