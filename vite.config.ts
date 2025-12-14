import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: command === 'serve' ? [basicSsl()] : [],
    server: {
      https: true,
      host: true
    },
    base: './' // Ensure relative paths for assets in Cloudflare Pages
  };
});
