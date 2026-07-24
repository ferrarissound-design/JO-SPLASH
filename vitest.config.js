import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The game resolves "three" via an import map (see index.html), which only
// works in a browser. Point Vitest's own module resolution at the same
// vendored file so tests can import gameplay modules without a build step
// or a real "three" npm package.
export default defineConfig({
  resolve: {
    alias: {
      three: fileURLToPath(new URL('./src/vendor/three/three.module.min.js', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
  },
});
