# md-fence

A tiny, predictable parser for Markdown fenced code block info strings. It extracts language, attributes, and line highlights with zero dependencies.

- Language: `ts`
- Attributes: `key=value` and bare flags; quoted strings with escaping (`\n`, `\t`, `\"`, `\'`, `\\`)
- Line highlights: `{1,3-5}` and attribute aliases `highlight="1,3-5"`, `lines="1,3-5"`, `hl="1,3-5"`
- Extras: `extractBlocks`, `parseBlocks`, `normalize`, `parseLineSpec`

Note: GitHub (GFM) ignores everything after the language in the info string. `{...}` and attrs are meant for site generators (VitePress, Nuxt Content, Astro, rehype-pretty-code, etc.), not for github.com.

## Quick start

sample.md:

````md
# axios

```js
// GET request
const response = await fetch("https://api.example.com/data");
```
````

Script:

```ts
import { readFile } from "node:fs/promises";
import { parseBlocks, normalize } from "md-fence"; // adjust import path if local

const md = await readFile("sample.md", "utf8");
const blocks = parseBlocks(md);
const results = blocks.map((b) => ({ info: b.info, meta: normalize(b.meta), code: b.code }));
console.log(JSON.stringify(results, null, 2));
```

Output:

```json
[
  {
    "info": "js",
    "meta": { "lang": "js", "highlight": [], "attrs": {} },
    "code": "// GET request\nconst response = await fetch('https://api.example.com/data');\n"
  }
]
```

Add metadata:

````md
```ts {1,3-5} title="App.tsx" line-numbers
const a = 1;
function foo() {}
foo();
bar();
baz();
```
````

Normalized meta:

```json
{ "lang": "ts", "title": "App.tsx", "lineNumbers": true, "highlight": [1, 3, 4, 5], "attrs": {} }
```

## Info string syntax

- Language: first bare token (e.g. `js`, `ts`, `bash`)
- Attributes:
  - `key=value` (numbers and `true`/`false` are coerced)
  - `key` (boolean flag → `true`)
  - Strings: `"..."` or `'...'` with escapes: `\n`, `\t`, `\"`, `\'`, `\\`
- Line highlights:
  - Curly: `{1,3-5}`
  - Or attributes: `highlight="1,3-5"`, `lines="1,3-5"`, `hl="1,3-5"`

## API

- `parseInfo(info: string, opts?)`
  - Returns `{ lang?: string; attrs: Record<string, string|number|boolean>; highlight: number[] }`
  - Options: `{ lowerCaseKeys?: boolean }` (default `true`), `{ treatFirstBareAsLang?: boolean }` (default `true`)
- `extractBlocks(md: string)`
  - Returns `Array<{ info: string; code: string }>`
  - Supports backtick and tilde fences with matching lengths and up to 3 spaces indent
- `parseBlocks(md: string, opts?)`
  - Returns `Array<{ info: string; code: string; meta: ReturnType<typeof parseInfo> }>`
- `normalize(meta, options?)`
  - Maps known keys and merges highlight aliases
  - Default key map:
    - `title` → `meta.title`
    - `filename|file|name` → `meta.filename`
    - `line-numbers|linenumbers|linenos` → `meta.lineNumbers`
    - `pinned` → `meta.pinned`
    - `collapsed` → `meta.collapsed`
    - `highlight|lines|hl` → merged into `meta.highlight`
  - Returns:
    - `{ lang?, title?, filename?, lineNumbers?, pinned?, collapsed?, highlight: number[], attrs: Record<string, string|number|boolean> }`
- `parseLineSpec(value)`
  - `"1,3-5"` → `[1,3,4,5]`
