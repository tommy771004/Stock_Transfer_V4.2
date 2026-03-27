/**
 * vite.config.mobile.ts  (inside T-Stock-app/web/)
 *
 * Builds a single self-contained index.html for the Expo WebView.
 * All JS + CSS are inlined — output goes to ../assets/web/index.html
 * so the Expo app can bundle it directly.
 *
 * Usage:
 *   npm run build:mobile
 *   # → T-Stock-app/assets/web/index.html  (~1.5 MB)
 *
 * Mobile-specific overrides vs desktop build:
 *   • @monaco-editor/react → src/stubs/monaco-stub.tsx
 *       Monaco editor is ~5–8 MB when bundled. The stub replaces it with a
 *       plain <textarea> so the IPA/APK asset stays small.
 *   • VITE_OPENROUTER_API_KEY → always empty string
 *       Never embed API keys in a mobile binary (apktool/otool can extract
 *       them). Users enter their key via the in-app Settings UI instead.
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    root: '.',
    publicDir: 'public',
    plugins: [react(), tailwindcss(), inlinePlugin()],
    define: {
      // Never expose API keys in the mobile bundle — users provide their own
      // key through the in-app Settings UI (stored in localStorage via api.setSetting).
      'process.env.VITE_OPENROUTER_API_KEY': JSON.stringify(''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Swap Monaco editor for a lightweight textarea stub to avoid bundling
        // ~5–8 MB of editor JS into the Expo asset.
        '@monaco-editor/react': path.resolve(__dirname, 'src/stubs/monaco-stub.tsx'),
      },
    },
    optimizeDeps: {
      exclude: ['electron'],
    },
    build: {
      // Output directly into T-Stock-app/assets/web/ so Expo can bundle it
      outDir: path.resolve(__dirname, '..', 'assets', 'web'),
      emptyOutDir: false, // don't wipe other assets
      target: 'es2020',
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        external: ['electron'],
        output: {
          inlineDynamicImports: true,
          manualChunks: undefined,
        },
      },
      chunkSizeWarningLimit: 10_000,
      assetsInlineLimit: 100_000_000,
    },
  };
});

function inlinePlugin() {
  return {
    name: 'inline-assets',
    enforce: 'post' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { bundle?: Record<string, { type: string; source?: string; code?: string }> }) {
        if (!ctx.bundle) return html;
        let result = html;
        for (const [fileName, chunk] of Object.entries(ctx.bundle)) {
          if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
            const code = (chunk as { code: string }).code;
            result = result.replace(
              new RegExp(`<script[^>]*src=["'][^"']*${escapeRe(fileName)}["'][^>]*>\\s*</script>`, 'g'),
              `<script type="module">${code}</script>`,
            );
          }
          if (chunk.type === 'asset' && fileName.endsWith('.css')) {
            const css = (chunk as { source: string }).source;
            result = result.replace(
              new RegExp(`<link[^>]*href=["'][^"']*${escapeRe(fileName)}["'][^>]*>`, 'g'),
              `<style>${css}</style>`,
            );
          }
        }
        return result;
      },
    },
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
