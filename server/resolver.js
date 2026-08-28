(() => {
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.fsops = (() => {
    let shellMode = false

    function shellDelete(p) {
        if (process.platform === 'win32') {
            execFileSync('cmd.exe', ['/c', 'del', '/f', '/q', p], { stdio: 'ignore' })
        } else {
            execFileSync('rm', ['-f', p], { stdio: 'ignore' })
        }
    }

    function shellCopy(src, dest) {
        if (process.platform === 'win32') {
            execFileSync('cmd.exe', ['/c', 'copy', '/y', src, dest], { stdio: 'ignore' })
        } else {
            execFileSync('cp', [src, dest], { stdio: 'ignore' })
        }
    }

    function removeFile(p) {
        if (!shellMode) {
            try {
                fs.unlinkSync(p)
                return
            } catch (e) {
                shellMode = true
            }
        }
        try {
            shellDelete(p)
        } catch {}
        if (fs.existsSync(p)) {
            throw new Error('blocked: grant fivem_conflicttool filesystem access in server.cfg')
        }
    }

    function copyInto(src, dest) {
        if (!shellMode) {
            try {
                fs.copyFileSync(src, dest)
                return
            } catch (e) {
                shellMode = true
            }
        }
        try {
            shellCopy(src, dest)
        } catch {}
        if (!fs.existsSync(dest)) {
            throw new Error('blocked: grant fivem_conflicttool filesystem access in server.cfg')
        }
    }

    return { removeFile, copyInto }
})()

KKCT.resolver = (() => {
    let backupsDir = null

    function init(rootDir) {
        backupsDir = path.join(rootDir, 'data', 'backups')
        fs.mkdirSync(backupsDir, { recursive: true })
    }

    function sha1File(p) {
        return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex')
    }

    function resourceRoot(name) {
        const p = GetResourcePath(name)
        return p ? p.replace(/\//g, path.sep) : null
    }

    async function apply(progress) {
        const pending = KKCT.decisions.pendingAssets()
        const entities = KKCT.decisions.entities()
        const bundleId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const bundleDir = path.join(backupsDir, bundleId)
        const moves = []
        const errors = []
        let step = 0

        for (const d of pending) {
            step++
            progress({ step, total: pending.length, label: d.file })
            try {
                const root = resourceRoot(d.loser.resource)
                if (!root) throw new Error(`resource ${d.loser.resource} not found`)
                const src = path.join(root, d.loser.relPath || d.loser.rel)
                if (!fs.existsSync(src)) throw new Error('file already missing')
                const currentSha = sha1File(src)
                if (d.loser.sha1 && currentSha !== d.loser.sha1) throw new Error('file changed since scan')
                const dest = path.join(bundleDir, d.loser.resource, d.loser.relPath || d.loser.rel)
                fs.mkdirSync(path.dirname(dest), { recursive: true })
                fs.copyFileSync(src, dest)
                if (sha1File(dest) !== currentSha) {
                    fs.unlinkSync(dest)
                    throw new Error('backup copy verification failed')
                }
                KKCT.fsops.removeFile(src)
                d.state = 'applied'
                d.bundleId = bundleId
                moves.push({
                    from: src.replace(/\\/g, '/'),
                    fromResource: d.loser.resource,
                    relPath: (d.loser.relPath || d.loser.rel).replace(/\\/g, '/'),
                    to: `${d.loser.resource}/${(d.loser.relPath || d.loser.rel).replace(/\\/g, '/')}`,
                    sha1: currentSha,
                    size: fs.statSync(dest).size
                })
            } catch (e) {
                errors.push({ file: d.file, resource: d.loser ? d.loser.resource : '?', msg: e.message })
            }
            await new Promise(r => setImmediate(r))
        }

        const summary = {
            removed: entities.filter(e => e.action === 'remove').length,
            moved: entities.filter(e => e.action === 'move').length,
            assets: moves.length,
            files: moves.length,
            errors: errors.length
        }
        const permissionHint = errors.some(e => (e.msg || '').includes('blocked: grant'))

        if (moves.length) {
            const manifest = {
                id: bundleId,
                createdAt: new Date().toISOString(),
                summary,
                moves,
                decisionsSnapshot: KKCT.decisions.get()
            }
            fs.mkdirSync(bundleDir, { recursive: true })
            fs.writeFileSync(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
        }

        KKCT.decisions.save()
        return { bundleId: moves.length ? bundleId : null, summary, errors, restartRequired: moves.length > 0, permissionHint }
    }

    return { init, apply, backupsDir: () => backupsDir }
})()
})()
