import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entryPoints: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    minify: false,
    outDir: 'dist/',
    clean: true,
    sourcemap: true,
    bundle: true,
    splitting: false,
    outExtension(ctx) {
      return {
        dts: '.d.ts',
        js: ctx.format === 'cjs' ? '.cjs' : '.mjs'
      }
    },
    treeshake: true,
    target: 'es2022',
    platform: 'node',
    tsconfig: './tsconfig.json',
    cjsInterop: true,
    keepNames: true
  }
])
