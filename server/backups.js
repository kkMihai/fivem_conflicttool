(() => {
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.backups = (() => {
    function sha1File(p) {
        return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex')
    }

    function list() {
        const dir = KKCT.resolver.backupsDir()
        if (!dir || !fs.existsSync(dir)) return []
        const out = []
        for (const name of fs.readdirSync(dir)) {
            const mp = path.join(dir, name, 'manifest.json')
            if (!fs.existsSync(mp)) continue
            try {
                const m = JSON.parse(fs.readFileSync(mp, 'utf8'))
                out.push({
                    id: m.id,
                    createdAt: m.createdAt,
                    summary: m.summary,
                    files: (m.moves || []).length,
                    resources: [...new Set((m.moves || []).map(mv => mv.fromResource))],
                    restored: !!m.restored
                })
            } catch {}
        }
        out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        if (out.length) out[0].current = true
        return out
    }

    async function restore(id, progress) {
        const dir = KKCT.resolver.backupsDir()
        const mp = path.join(dir, id, 'manifest.json')
        if (!fs.existsSync(mp)) return { ok: false, msg: 'bundle not found' }
        const m = JSON.parse(fs.readFileSync(mp, 'utf8'))
        const errors = []
        let restored = 0
        let step = 0
        for (const mv of m.moves || []) {
            step++
            progress({ step, total: m.moves.length, label: mv.relPath })
            try {
                const src = path.join(dir, id, mv.to.replace(/\//g, path.sep))
                if (!fs.existsSync(src)) throw new Error('backup file missing')
                const destRoot = GetResourcePath(mv.fromResource)
                if (!destRoot) throw new Error(`resource ${mv.fromResource} not found`)
                const dest = path.join(destRoot.replace(/\//g, path.sep), mv.relPath.replace(/\//g, path.sep))
                if (fs.existsSync(dest)) {
                    if (sha1File(dest) === mv.sha1) {
                        restored++
                        continue
                    }
                    if (mv.kind !== 'edit') throw new Error('a different file now exists at the destination')
                    KKCT.fsops.removeFile(dest)
                }
                try {
                    fs.mkdirSync(path.dirname(dest), { recursive: true })
                } catch {}
                KKCT.fsops.copyInto(src, dest)
                if (sha1File(dest) !== mv.sha1) {
                    KKCT.fsops.removeFile(dest)
                    throw new Error('restore verification failed')
                }
                restored++
            } catch (e) {
                errors.push({ file: mv.relPath, msg: e.message })
            }
            await new Promise(r => setImmediate(r))
        }
        const decisions = KKCT.decisions.get()
        for (const a of decisions.assets) {
            if (a.bundleId === id && a.state === 'applied') {
                a.state = 'reverted'
            }
        }
        KKCT.decisions.save()
        m.restored = true
        fs.writeFileSync(mp, JSON.stringify(m, null, 2))
        return { ok: errors.length === 0, restored, errors, restartRequired: restored > 0 }
    }

    return { list, restore }
})()
})()
