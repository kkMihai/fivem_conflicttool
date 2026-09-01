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

    function buryOverride() {
        if (typeof GetConvar !== 'function') return null
        const v = Math.abs(parseFloat(GetConvar('fivem_conflicttool_bury_depth', '')))
        if (!Number.isFinite(v) || v <= 0) return null
        return Math.min(100000, Math.max(BURY_MIN, v))
    }

    function buryTarget(parsed, archetype, from) {
        const forced = buryOverride()
        if (forced) return [from[0], from[1], from[2] - forced]
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

    function sharedBuryTarget(job) {
        const targets = (job.targets || []).filter(t => Array.isArray(t.from))
        if (!targets.length) return null
        let anchor = targets[0]
        for (const t of targets) {
            if (t.from[2] < anchor.from[2]) anchor = t
        }
        let parsed = null
        try {
            const root = resourceRoot(anchor.resource)
            if (root) parsed = KKCT.ymap.parse(fs.readFileSync(path.join(root, anchor.rel)))
        } catch {}
        const arch = (typeof anchor.model === 'number' ? anchor.model : job.hash) >>> 0
        return buryTarget(parsed || { entities: [] }, arch, anchor.from)
    }

    function isAt(parsed, archetype, to) {
        return parsed.entities.some(e =>
            e.a === archetype &&
            Math.abs(e.p[0] - to[0]) < 0.05 &&
            Math.abs(e.p[1] - to[1]) < 0.05 &&
            Math.abs(e.p[2] - to[2]) < 0.05
        )
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
        writeBack(src, result.buf, backup, raw =>
            KKCT.ymap.parse(raw).entities.some(e => e.a === archetype && Math.abs(e.p[2] - to[2]) < 0.05)
        )
    }

    function writeBack(src, buf, backup, verify) {
        const tmp = path.join(backupsDir, `.patch-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
        fs.writeFileSync(tmp, buf)
        try {
            KKCT.fsops.copyInto(tmp, src)
            if (!verify(fs.readFileSync(src))) throw new Error('patched file did not verify')
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
        writeBack(src, result.buf, backup, raw => {
            const box = (KKCT.ymap.parse(raw).boxOccluders || []).find(b => b.bi === d.box.index)
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

    const MAT_FIELDS = ['type', 'flags', 'procId', 'roomId', 'pedDensity', 'colorIndex']

    function effectiveYbn(edits) {
        const matrices = new Map()
        const mats = new Map()
        const faces = new Map()
        const shift = [0, 0, 0]
        const movedBounds = new Set()
        let shifted = false
        for (const e of edits) {
            if (e.kind === 'moveVerts') movedBounds.add(e.bi)
            if (e.kind === 'boundMatrix') {
                matrices.set(e.bi, e.m)
            } else if (e.kind === 'boundShift') {
                shifted = true
                for (let a = 0; a < 3; a++) shift[a] += e.d[a]
            } else if (e.kind === 'boundMaterial' || e.kind === 'addMaterial') {
                const key = `${e.bi}:${e.slot}`
                const cur = mats.get(key) || { bi: e.bi, slot: e.slot }
                for (const k of MAT_FIELDS) {
                    if (typeof e[k] === 'number') cur[k] = e[k]
                }
                mats.set(key, cur)
            } else if (e.kind === 'faceMaterial') {
                let per = faces.get(e.bi)
                if (!per) {
                    per = new Map()
                    faces.set(e.bi, per)
                }
                for (const poly of e.polys) per.set(poly, e.slot)
            }
        }
        return { matrices, mats, faces, shift, shifted, movedBounds }
    }

    function ybnInPlace(src, edits, backup) {
        if (!edits.length) throw new Error('collision decision has no edits')
        const buf = fs.readFileSync(src)
        const before = KKCT.ybn.inspect(buf)
        const want = effectiveYbn(edits)
        const result = KKCT.ybn.patch(buf, edits)
        writeBack(src, result.buf, backup, raw => {
            const after = KKCT.ybn.inspect(raw)
            const boundAt = bi => after.bounds.find(b => b.bi === bi)
            for (const [bi, m] of want.matrices) {
                const bound = boundAt(bi)
                if (!bound || !bound.m) return false
                for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14]) {
                    if (Math.abs(bound.m[i] - m[i]) > 0.01) return false
                }
            }
            if (want.shifted) {
                for (let a = 0; a < 3; a++) {
                    if (Math.abs(after.root.center[a] - before.root.center[a] - want.shift[a]) > 0.05) return false
                }
            }
            for (const e of want.mats.values()) {
                const bound = boundAt(e.bi)
                if (!bound) return false
                const mat = bound.mats.find(m => m.slot === e.slot)
                if (!mat) return false
                for (const k of MAT_FIELDS) {
                    if (typeof e[k] === 'number' && mat[k] !== e[k]) return false
                }
            }
            for (const bi of want.movedBounds) {
                const bound = boundAt(bi)
                const was = before.bounds.find(b => b.bi === bi)
                if (!bound || !was || bound.faces !== was.faces) return false
            }
            for (const [bi, per] of want.faces) {
                const usage = KKCT.ybn.slotUsage(raw, bi)
                if (!usage) return false
                for (const [poly, slot] of per) {
                    if (poly >= usage.polyCount || usage.slotOf[poly] !== slot) return false
                }
            }
            return true
        })
    }

    function groupYbn(list) {
        const groups = new Map()
        for (const d of list) {
            if (d.action !== 'ybn' || !d.loser) continue
            const rel = d.loser.relPath || d.loser.rel
            if (!rel) continue
            const key = `${d.loser.resource}/${rel.replace(/\\/g, '/')}`
            let g = groups.get(key)
            if (!g) {
                g = { resource: d.loser.resource, rel, file: d.file || rel, decisions: [] }
                groups.set(key, g)
            }
            g.decisions.push(d)
        }
        return [...groups.values()]
    }

    async function apply(progress) {
        const allPending = KKCT.decisions.pendingAssets()
        const pending = allPending.filter(d => d.action !== 'ybn')
        const ybnJobs = groupYbn(allPending)
        const fresh = KKCT.decisions.entities().filter(e => (e.state || 'live') === 'live' && !e.reported)
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        let bundleId = stamp
        for (let n = 2; fs.existsSync(path.join(backupsDir, bundleId)); n++) {
            bundleId = `${stamp}-${n}`
        }
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
            progress({ step, total: totalSteps, label: d.file })
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
        const totalSteps = pending.length + ybnJobs.length + entityJobs.length

        for (const job of ybnJobs) {
            step++
            progress({ step, total: totalSteps, label: job.file })
            try {
                const b = ensureBackup(job.resource, job.rel)
                const stamped = job.decisions.find(d => d.loser && d.loser.sha1)
                if (b.first && stamped && b.sha !== stamped.loser.sha1) {
                    fs.unlinkSync(b.dest)
                    backedUp.delete(b.key)
                    throw new Error('file changed since scan')
                }
                const edits = job.decisions.flatMap(d => (d.ybn && Array.isArray(d.ybn.edits) ? d.ybn.edits : []))
                ybnInPlace(b.src, edits, b.dest)
                for (const d of job.decisions) {
                    d.state = 'applied'
                    d.bundleId = bundleId
                }
                if (b.first) {
                    recordMove(job.resource, job.rel, b.sha, b.dest, 'edit', { ybn: true })
                }
            } catch (e) {
                errors.push({ file: job.file, resource: job.resource, msg: e.message })
            }
            await new Promise(r => setImmediate(r))
        }

        for (const job of entityJobs) {
            step++
            progress({ step, total: totalSteps, label: job.archetype || 'prop edit' })
            let touched = false
            const sharedTo = job.action === 'remove' ? sharedBuryTarget(job) : null
            for (const t of job.targets) {
                try {
                    const arch = (typeof t.model === 'number' ? t.model : job.hash) >>> 0
                    const from = t.from
                    const b = ensureBackup(t.resource, t.rel)
                    const buf = fs.readFileSync(b.src)
                    const to = sharedTo || (job.action === 'remove' ? buryTarget(KKCT.ymap.parse(buf), arch, from) : job.new.pos)
                    const rot = job.action === 'move' && Array.isArray(job.new.rot) ? job.new.rot : undefined
                    const verify = parsed => {
                        if (job.action === 'remove') return isAt(parsed, arch, to) || isBuried(parsed, arch, from)
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
                    writeBack(b.src, result.buf, b.dest, raw => verify(KKCT.ymap.parse(raw)))
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
            removed: fresh.filter(e => e.action === 'remove').length,
            moved: fresh.filter(e => e.action === 'move').length,
            buried: moves.filter(m => m.kind === 'edit' && !m.clip && !m.move && !m.ybn).length,
            clipped: moves.filter(m => m.kind === 'edit' && m.clip).length,
            collision: moves.filter(m => m.ybn).length,
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

        const retryIds = new Set(entityJobs.filter(j => (j.state || 'live') === 'live').map(j => j.id))
        for (const e of fresh) {
            if (e.conflictId) appliedIds.add(e.conflictId)
            if (!retryIds.has(e.id)) e.reported = true
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
