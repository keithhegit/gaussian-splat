import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ command, mode }) => {
  // NOTE:
  // This repo's tsconfig does not include Node.js globals, so avoid referencing `process` here.
  // `loadEnv` still works with a stable project root string.
  const env = loadEnv(mode, '.', '');

  // Prefer CI-provided identifiers when available via env injection; otherwise fall back to timestamp.
  const buildId =
    env.CF_PAGES_COMMIT_SHA ||
    env.GITHUB_SHA ||
    env.VERCEL_GIT_COMMIT_SHA ||
    `${Date.now()}`;
  
  return {
    plugins: command === 'serve' ? [basicSsl()] : [],
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    server: {
      https: true,
      host: true
    },
    base: './' // Ensure relative paths for assets in Cloudflare Pages
  };
});
