import { defineConfig } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import css from 'rollup-plugin-css-only';

export default defineConfig({
  input: 'src/main.tsx',
  output: {
    file: 'dist/tag-relations.js',
    format: 'iife',
    name: 'TagRelationsPlugin',
    globals: {
      react: 'React',
      'react-dom': 'ReactDOM',
    },
  },
  external: ['react', 'react-dom'],
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false,
    }),
    css({ output: 'tag-relations.css' }),
  ],
});