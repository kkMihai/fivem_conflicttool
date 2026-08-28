import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version

if (!/^\d+\.\d+\.\d+(-[0-9a-z.]+)?$/i.test(version)) {
    console.error(`sync-version: bad version "${version}"`)
    process.exit(1)
}

const targets = [
    {
        file: 'fxmanifest.lua',
        pattern: /^version\s+'[^']*'$/m,
        replace: `version '${version}'`
    },
    {
        file: 'web/package.json',
        pattern: /"version":\s*"[^"]*"/,
        replace: `"version": "${version}"`
    }
]

let failed = false

for (const t of targets) {
    const p = path.join(root, t.file)
    const before = fs.readFileSync(p, 'utf8')
    if (!t.pattern.test(before)) {
        console.error(`sync-version: no version field found in ${t.file}`)
        failed = true
        continue
    }
    const after = before.replace(t.pattern, t.replace)
    if (after !== before) {
        fs.writeFileSync(p, after)
        console.log(`sync-version: ${t.file} -> ${version}`)
    } else {
        console.log(`sync-version: ${t.file} already ${version}`)
    }
}

process.exit(failed ? 1 : 0)
