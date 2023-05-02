import { resolve } from 'node:path'
import withSolid from 'rollup-preset-solid'
import commonjs from '@rollup/plugin-commonjs'

export default withSolid({
  input: 'src/index.ts',
  output: [
    {
      format: 'esm',
      file: resolve('dist/esm/index.mjs'),
      sourcemap: true,
    },
    {
      format: 'cjs',
      file: resolve('dist/cjs/index.cjs'),
      sourcemap: true,
    },
  ],
  plugins: [commonjs()],
  external: [/^relay-runtime/],
})
