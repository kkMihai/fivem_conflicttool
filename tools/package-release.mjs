import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const name = 'fivem_conflicttool'

const include = ['fxmanifest.lua', 'client', 'server', 'web/dist', 'docs', 'README.md', 'LICENSE']

const out = path.join(root, 'dist-release')
const stage = path.join(out, name)
const zip = path.join(out, `${name}-v${version}.zip`)

if (!fs.existsSync(path.join(root, 'web/dist/index.html'))) {
    console.error('package: web/dist is missing, run "npm run build" first')
    process.exit(1)
}

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })

for (const rel of include) {
    const from = path.join(root, rel)
    if (!fs.existsSync(from)) {
        console.error(`package: missing ${rel}`)
        process.exit(1)
    }
    const to = path.join(stage, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.cpSync(from, to, { recursive: true })
    console.log(`package: + ${rel}`)
}

const result =
    process.platform === 'win32'
        ? spawnSync(
              'powershell',
              ['-NoProfile', '-Command', `Compress-Archive -Path "${stage}" -DestinationPath "${zip}" -Force`],
              { stdio: 'inherit' }
          )
        : spawnSync('zip', ['-r', '-q', zip, name], { cwd: out, stdio: 'inherit' })

if (result.status !== 0) {
    console.error('package: archiving failed')
    process.exit(1)
}

const size = (fs.statSync(zip).size / 1024 / 1024).toFixed(2)
console.log(`package: ${path.relative(root, zip)} (${size} MB)`)
