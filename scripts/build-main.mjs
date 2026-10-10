import { build } from 'esbuild';
await build({ entryPoints: ['src/main/main.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'dist/main/main.cjs', external: ['electron'], sourcemap: true });
await build({ entryPoints: ['src/main/preload.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'dist/main/preload.cjs', external: ['electron'] });
await build({ entryPoints: ['src/main/host-worker.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'dist/main/host-worker.cjs' });
