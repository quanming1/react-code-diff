import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'node:path'
import { dependencies } from './package.json'

// Vite library-mode config (separate from the demo app's vite.config.ts).
// Usage: pnpm run build:lib
export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src/code-diff'],
      exclude: ['src/__tests__', 'src/App.tsx', 'src/main.tsx'],
      tsconfigPath: './tsconfig.app.json',
    }),
  ],
  // Don't copy public/ assets into the library bundle
  publicDir: false,
  resolve: {
    alias: {
      'refractor/jsx': resolve(__dirname, 'node_modules/refractor/lang/jsx.js'),
      'refractor/tsx': resolve(__dirname, 'node_modules/refractor/lang/tsx.js'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/code-diff/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      // Externalize all deps + peer deps so they're not bundled
      external: [
        /^react($|\/)/,
        /^react-dom($|\/)/,
        ...Object.keys(dependencies),
      ],
      output: {
        // Preserve the CSS file as a separate asset
        assetFileNames: 'style.css',
      },
    },
  },
})
