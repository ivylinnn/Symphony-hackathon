import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * The canvas feature is a slice of the private `creative-cue` monorepo. It imports
 * internal-only packages (`@/api*`, `@edenx/runtime/*`, `@fe-infra/keystone-icons-react`)
 * that don't exist on public npm. For this standalone UI demo we alias each of those
 * specifiers to a local stub under `src/_stubs/**` so the real feature code builds and
 * runs unchanged. Backend calls resolve to mocked data.
 *
 * Order matters: more specific specifiers must come before their prefixes
 * (`@/api/typings` before `@/api`), and the catch-all `@` alias comes last.
 */
const stub = (p: string) => fileURLToPath(new URL(`./src/_stubs/${p}`, import.meta.url));
const srcRoot = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: [
      { find: '@/api/typings', replacement: stub('api/typings.ts') },
      { find: '@/api/bff-gen/i2v', replacement: stub('api/bff-gen/i2v.ts') },
      { find: '@/api/bff-gen/t2v', replacement: stub('api/bff-gen/t2v.ts') },
      { find: '@/api', replacement: stub('api/index.ts') },
      { find: '@fe-infra/keystone-icons-react', replacement: stub('keystone-icons.tsx') },
      { find: '@edenx/runtime/router', replacement: stub('edenx-router.ts') },
      { find: '@', replacement: srcRoot },
    ],
  },
});
