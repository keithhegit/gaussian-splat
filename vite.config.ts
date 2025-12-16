import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildId =
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
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
