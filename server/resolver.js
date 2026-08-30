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

    const BURY_MIN = 1000
    const BURY_MAX = 30000

    function buryTarget(parsed, archetype, from) {
        let lod = 0
        for (const e of parsed.entities || []) {
            if (e.a !== archetype) continue
            if (Math.abs(e.p[0] - from[0]) > 0.05 || Math.abs(e.p[1] - from[1]) > 0.05 || Math.abs(e.p[2] - from[2]) > 0.05) continue
            lod = Math.max(e.ld || 0, e.cld || 0)
            break
        }
        const depth = Math.min(BURY_MAX, Math.max(BURY_MIN, lod + 1000))
        return [from[0], from[1], from[2] - depth]
    }

    function isBuried(parsed, archetype, from) {
        return parsed.entities.some(e => e.a === archetype && e.p[2] < from[2] - (BURY_MIN - 100))
    }

    function buryInPlace(src, d, backup) {
        if (!d.entity || !Array.isArray(d.entity.from)) {
            throw new Error('bury decision has no entity')
        }
        const archetype = d.entity.archetype >>> 0
        const buf = fs.readFileSync(src)
        const to = buryTarget(KKCT.ymap.parse(buf), archetype, d.entity.from)
        const result = KKCT.ymap.patch(buf, [
            { kind: 'entityPos', archetype, from: d.entity.from, to }
        ])
        writeBack(src, result.buf, backup, parsed =>
            parsed.entities.some(e => e.a === archetype && Math.abs(e.p[2] - to[2]) < 0.05)
        )
    }

    function writeBack(src, buf, backup, verify) {
        const tmp = path.join(backupsDir, `.patch-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
        fs.writeFileSync(tmp, buf)
        try {
            KKCT.fsops.copyInto(tmp, src)
            if (!verify(KKCT.ymap.parse(fs.readFileSync(src)))) throw new Error('patched file did not verify')
        } catch (e) {
            try {
                KKCT.fsops.copyInto(backup, src)
            } catch {}
            throw e
        } finally {
            try {
                fs.unlinkSync(tmp)
            } catch {}
        }
    }

    function clipInPlace(src, d, backup) {
        if (!d.box || typeof d.box.index !== 'number' || !d.box.fields) {
            throw new Error('clip decision has no box')
        }
        const result = KKCT.ymap.patch(fs.readFileSync(src), [
            { kind: 'boxOccluder', index: d.box.index, fields: d.box.fields }
        ])
        writeBack(src, result.buf, backup, parsed => {
            const box = (parsed.boxOccluders || []).find(b => b.bi === d.box.index)
            if (!box) return false
            const want = d.box.after
            return Math.abs(box.c[0] - want.c[0]) < 0.3 &&
                Math.abs(box.c[1] - want.c[1]) < 0.3 &&
                Math.abs(box.c[2] - want.c[2]) < 0.3 &&
                Math.abs(box.l - want.l) < 0.3 &&
                Math.abs(box.w - want.w) < 0.3 &&
                Math.abs(box.h - want.h) < 0.3
        })
    }

    async function apply(progress) {
        const pending = KKCT.decisions.pendingAssets()
        const entities = KKCT.decisions.entities()
        const bundleId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const bundleDir = path.join(backupsDir, bundleId)
        const moves = []
        const errors = []
        const appliedIds = new Set()
        const backedUp = new Map()
        let step = 0

        function ensureBackup(resource, rel) {
            const key = `${resource}/${rel.replace(/\\/g, '/')}`
            const cached = backedUp.get(key)
            if (cached) return { ...cached, first: false }
            const root = resourceRoot(resource)
            if (!root) throw new Error(`resource ${resource} not found`)
            const src = path.join(root, rel)
            if (!fs.existsSync(src)) throw new Error('file already missing')
            const sha = sha1File(src)
            const dest = path.join(bundleDir, resource, rel)
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            fs.copyFileSync(src, dest)
            if (sha1File(dest) !== sha) {
                fs.unlinkSync(dest)
                throw new Error('backup copy verification failed')
            }
            const entry = { key, src, dest, sha }
            backedUp.set(key, entry)
            return { ...entry, first: true }
        }

        function recordMove(resource, rel, sha, dest, kind, flags) {
            const relFwd = rel.replace(/\\/g, '/')
            moves.push({
                from: path.join(resourceRoot(resource) || '', rel).replace(/\\/g, '/'),
                fromResource: resource,
                relPath: relFwd,
                to: `${resource}/${relFwd}`,
                sha1: sha,
                size: fs.statSync(dest).size,
                ...flags,
                kind
            })
        }

        for (const d of pending) {
            step++
            progress({ step, total: pending.length, label: d.file })
            try {
                const rel = d.loser.relPath || d.loser.rel
                const b = ensureBackup(d.loser.resource, rel)
                if (b.first && d.loser.sha1 && b.sha !== d.loser.sha1) {
                    fs.unlinkSync(b.dest)
                    backedUp.delete(b.key)
                    throw new Error('file changed since scan')
                }
                if (d.action === 'bury') {
                    buryInPlace(b.src, d, b.dest)
                } else if (d.action === 'clip') {
                    clipInPlace(b.src, d, b.dest)
                } else {
                    KKCT.fsops.removeFile(b.src)
                }
                d.state = 'applied'
                d.bundleId = bundleId
                if (d.conflictId) appliedIds.add(d.conflictId)
                if (b.first) {
                    recordMove(d.loser.resource, rel, b.sha, b.dest, (d.action === 'bury' || d.action === 'clip') ? 'edit' : 'move', {
                        clip: d.action === 'clip' || undefined
                    })
                }
            } catch (e) {
                errors.push({ file: d.file, resource: d.loser ? d.loser.resource : '?', msg: e.message })
            }
            await new Promise(r => setImmediate(r))
        }

        const entityJobs = KKCT.decisions.entityFileJobs()
        for (const job of entityJobs) {
            step++
            progress({ step, total: pending.length + entityJobs.length, label: job.archetype || 'prop edit' })
            let touched = false
            for (const t of job.targets) {
                try {
                    const arch = (typeof t.model === 'number' ? t.model : job.hash) >>> 0
                    const from = t.from
                    const b = ensureBackup(t.resource, t.rel)
                    const buf = fs.readFileSync(b.src)
                    const to = job.action === 'remove' ? buryTarget(KKCT.ymap.parse(buf), arch, from) : job.new.pos
                    const rot = job.action === 'move' && Array.isArray(job.new.rot) ? job.new.rot : undefined
                    const verify = parsed => {
                        if (job.action === 'remove') return isBuried(parsed, arch, from)
                        return parsed.entities.some(e => {
                            if (e.a !== arch) return false
                            if (Math.abs(e.p[0] - to[0]) > 0.05 || Math.abs(e.p[1] - to[1]) > 0.05 || Math.abs(e.p[2] - to[2]) > 0.05) return false
                            if (!rot) return true
                            const dot = e.r[0] * rot[0] + e.r[1] * rot[1] + e.r[2] * rot[2] + e.r[3] * rot[3]
                            return Math.abs(dot) > 0.999
                        })
                    }
                    let result = null
                    try {
                        result = KKCT.ymap.patch(buf, [{ kind: 'entityPos', archetype: arch, from, to, rot }])
                    } catch (patchErr) {
                        if (verify(KKCT.ymap.parse(fs.readFileSync(b.src)))) {
                            touched = true
                            continue
                        }
                        throw patchErr
                    }
                    writeBack(b.src, result.buf, b.dest, verify)
                    touched = true
                    if (b.first) {
                        recordMove(t.resource, t.rel, b.sha, b.dest, 'edit', {
                            move: job.action === 'move' || undefined
                        })
                    }
                } catch (e) {
                    errors.push({ file: t.rel, resource: t.resource, msg: e.message })
                }
            }
            if (touched) {
                job.state = 'applied'
                job.bundleId = bundleId
                if (job.conflictId) appliedIds.add(job.conflictId)
            }
            await new Promise(r => setImmediate(r))
        }

        const summary = {
            removed: entities.filter(e => e.action === 'remove').length,
            moved: entities.filter(e => e.action === 'move').length,
            buried: moves.filter(m => m.kind === 'edit' && !m.clip && !m.move).length,
            clipped: moves.filter(m => m.kind === 'edit' && m.clip).length,
            filedMoves: moves.filter(m => m.move).length,
            assets: moves.filter(m => m.kind !== 'edit').length,
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

        for (const e of entities) {
            if (e.conflictId) appliedIds.add(e.conflictId)
        }

        KKCT.decisions.save()
        return {
            bundleId: moves.length ? bundleId : null,
            summary,
            errors,
            conflictIds: [...appliedIds],
            restartRequired: moves.length > 0,
            permissionHint
        }
    }

    return { init, apply, backupsDir: () => backupsDir }
})()
})()
