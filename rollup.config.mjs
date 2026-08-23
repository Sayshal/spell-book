import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import postcss from 'rollup-plugin-postcss';

const isDev = process.env.BUILD === 'development';

export default {
  /**
   * Suppress circular dependency warnings.
   * @param {object} warning - The rollup warning
   * @param {Function} warn - Default warning handler
   */
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  },
  input: 'spell-book.mjs',
  output: {
    file: 'dist/spell-book.mjs',
    format: 'es',
    sourcemap: true,
    inlineDynamicImports: true
  },
  plugins: [
    postcss({
      extract: 'styles/spell-book.css',
      minimize: false
    }),
    !isDev &&
      terser({
        format: { comments: false }
      }),
    copy({
      copyOnce: false,
      targets: [
        { src: 'templates', dest: 'dist' },
        { src: 'assets', dest: 'dist' },
        { src: 'module.json', dest: 'dist' },
        { src: 'release_notes.txt', dest: 'dist' },
        { src: 'LICENSE', dest: 'dist' },
        { src: 'README.md', dest: 'dist' }
      ]
    })
  ]
};
