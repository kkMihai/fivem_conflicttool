import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const input = process.argv[2]
if (!input) {
    console.log('usage: node tools/build-vanilla-index.mjs <vanilla-file-list.txt>')
    console.log('')
    console.log('The input is a plain text file with one file name per line, generated from an')
    console.log('UNMODIFIED GTA V installation, e.g. by exporting the file list from CodeWalker')
    console.log('(RPF Explorer -> right click -> export file list) or OpenIV. Only .ymap, .ytyp,')
    console.log('.ybn, .ydr and .ydd names are kept. No game data is copied, only file names.')
    process.exit(1)
}

const keep = new Set(['.ymap', '.ytyp', '.ybn', '.ydr', '.ydd'])
const names = new Set()
for (const line of fs.readFileSync(input, 'utf8').split(/\r?\n/)) {
    const base = path.basename(line.trim()).toLowerCase()
    if (base && keep.has(path.extname(base))) {
        names.add(base)
    }
}

const out = path.join(dir, '..', 'server', 'data', 'vanilla-files.json.gz')
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify([...names].sort())))
console.log(`wrote ${names.size} vanilla file names to ${out}`)
