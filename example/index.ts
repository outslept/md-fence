import { readFile } from 'node:fs/promises'
import { parseBlocks, normalize } from '../src/fence.js'

const md = await readFile('sample.md', 'utf8')
const blocks = parseBlocks(md)
const results = blocks.map((b) => ({
  info: b.info,
  meta: normalize(b.meta),
  code: b.code,
}))
console.log(JSON.stringify(results, null, 2))
