const { defineConfig, loadEnv } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return defineConfig({
    plugins: [react()],
    base: './',
    server: { port: 5173, strictPort: true },
    build: { outDir: 'dist', emptyOutDir: true },
    define: {
      'import.meta.env.ANTHROPIC_API_KEY': JSON.stringify(env.ANTHROPIC_API_KEY ?? ''),
      'import.meta.env.CLERK_PUBLISHABLE_KEY': JSON.stringify(env.CLERK_PUBLISHABLE_KEY ?? ''),
      'import.meta.env.BACKEND_URL': JSON.stringify(env.BACKEND_URL ?? 'http://localhost:3001'),
    },
  });
};
