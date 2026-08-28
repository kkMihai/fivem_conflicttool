(() => {
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = GetResourcePath(GetCurrentResourceName()).replace(/\//g, path.sep)

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true })
KKCT.decisions.init(ROOT)
KKCT.ignores.init(ROOT)
KKCT.scanner.init(ROOT)
KKCT.resolver.init(ROOT)
KKCT.names.loadDictionary(ROOT)
KKCT.conflicts.loadVanilla(ROOT)

const allowed = src => IsPlayerAceAllowed(String(src), 'fivem_conflicttool')

function stripForClient(scan) {
    if (!scan) return null
    return {
        scanId: scan.scanId,
        scannedAt: scan.scannedAt,
        durationMs: scan.durationMs,
        resourceCount: scan.resourceCount,
        modPackCount: scan.modPackCount,
        fileCount: scan.fileCount,
        parseErrors: scan.parseErrors,
        conflicts: scan.conflicts,
        weights: scan.weights ?? []
    }
}

function scanMeta(scan) {
    if (!scan) return null
    const counts = { all: 0, coll: 0, occl: 0, prop: 0, asset: 0 }
    let autoRes = 0
    let newCount = 0
    let ignoredCount = 0
    for (const c of scan.conflicts) {
        if (c.ignored) {
            ignoredCount++
            continue
        }
        counts.all++
        counts[c.cat] = (counts[c.cat] || 0) + 1
        if (c.autoRes) autoRes++
        if (c.isNew) newCount++
    }
    return {
        scanId: scan.scanId,
        scannedAt: scan.scannedAt,
        durationMs: scan.durationMs,
        resourceCount: scan.resourceCount,
        modPackCount: scan.modPackCount,
        fileCount: scan.fileCount,
        counts,
        autoRes,
        newCount,
        ignoredCount,
        parseErrorCount: scan.parseErrors.length
    }
}

function sendChunked(src, payload) {
    const b64 = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64')
    const size = 60000
    const n = Math.ceil(b64.length / size)
    const tid = payload.scanId || `t_${Date.now().toString(36)}`
    console.log(`[fivem_conflicttool] sending scan payload to ${src}: ${(b64.length / 1024).toFixed(0)} KB in ${n} parts`)
    for (let i = 0; i < n; i++) {
        TriggerLatentClientEvent('kk_ct:scanChunk', String(src), 2000000, tid, i, n, b64.slice(i * size, (i + 1) * size))
    }
    emitNet('kk_ct:scanDone', src, scanMeta(KKCT.scanner.last()))
}

function broadcastDecisions() {
    emitNet('kk_ct:decisions', -1, KKCT.decisions.entities())
}

function pushState(src) {
    emitNet('kk_ct:state', src, {
        scanMeta: scanMeta(KKCT.scanner.last()),
        decisions: KKCT.decisions.meta(),
        backups: KKCT.backups.list(),
        scanning: KKCT.scanner.isScanning(),
        queued: KKCT.decisions.queuedConflictIds(),
        version: KKCT.version.snapshot()
    })
}

onNet('kk_ct:auth', () => {
    const src = source
    emitNet('kk_ct:authResult', src, allowed(src))
})

onNet('kk_ct:checkUpdate', () => {
    const src = source
    if (!allowed(src)) return
    KKCT.version.check(true).then(v => emitNet('kk_ct:version', src, v))
})

onNet('kk_ct:requestDecisions', () => {
    const src = source
    emitNet('kk_ct:decisions', src, KKCT.decisions.entities())
})

function writePermissionsCfg(scan) {
    try {
        const names = new Set()
        for (const [, entries] of scan.index) {
            for (const e of entries) names.add(e.resource)
        }
        const lines = [...names].sort().map(n => `add_filesystem_permission fivem_conflicttool write ${n}`)
        fs.writeFileSync(path.join(ROOT, 'data', 'fs-permissions.cfg'), lines.join('\n') + '\n')
    } catch (e) {
        console.log(`[fivem_conflicttool] fs-permissions.cfg write failed: ${e.message}`)
    }
}

function startScan(src) {
    if (KKCT.scanner.isScanning()) return
    const progress = p => emitNet('kk_ct:scanProgress', src, p)
    KKCT.scanner.run(progress).then(scan => {
        if (!scan) return
        console.log(`[fivem_conflicttool] scan finished: ${scan.fileCount} files, ${scan.conflicts.length} conflicts in ${scan.durationMs}ms`)
        writePermissionsCfg(scan)
        sendChunked(src, stripForClient(scan))
        pushState(src)
    }).catch(e => {
        console.log(`[fivem_conflicttool] scan failed: ${e.stack || e.message}`)
        emitNet('kk_ct:scanError', src, { msg: e.message })
    })
}

onNet('kk_ct:getState', () => {
    const src = source
    if (!allowed(src)) return
    pushState(src)
    if (KKCT.scanner.last()) {
        sendChunked(src, stripForClient(KKCT.scanner.last()))
    } else {
        startScan(src)
    }
})

onNet('kk_ct:scan', () => {
    const src = source
    if (!allowed(src)) return
    startScan(src)
})

onNet('kk_ct:decide', d => {
    const src = source
    if (!allowed(src)) return
    if (!d || typeof d !== 'object') return
    const by = GetPlayerName(src)
    if (d.type === 'entity' && d.action && d.original && typeof d.hash === 'number') {
        if (d.action === 'remove' || d.action === 'move') {
            KKCT.decisions.addEntity({ ...d, by })
        } else if (d.action === 'keep') {
            KKCT.decisions.removeEntityByConflict(d.conflictId)
        }
        broadcastDecisions()
    } else if (d.type === 'asset' && d.file && d.loser) {
        KKCT.decisions.addAsset({ ...d, by })
    }
    emitNet('kk_ct:decisionsMeta', src, KKCT.decisions.meta())
    pushState(src)
})

onNet('kk_ct:bury', d => {
    const src = source
    if (!allowed(src)) return
    if (!d || !Array.isArray(d.targets) || !d.targets.length) return
    if (!Array.isArray(d.pos) || typeof d.hash !== 'number') return
    const by = GetPlayerName(src)
    const from = d.pos
    const to = [from[0], from[1], from[2] - 1000]
    let queued = 0
    for (const t of d.targets) {
        if (!t || !t.resource || !t.rel) continue
        KKCT.decisions.addAsset({
            action: 'bury',
            conflictId: d.conflictId || null,
            file: d.file || t.rel,
            loser: { resource: t.resource, relPath: t.rel },
            entity: { archetype: d.hash >>> 0, from, to },
            by
        })
        queued++
    }
    if (!queued) return
    emitNet('kk_ct:decisionsMeta', src, KKCT.decisions.meta())
    pushState(src)
})

onNet('kk_ct:clipOccluder', d => {
    const src = source
    if (!allowed(src)) return
    if (!d || !d.a || !d.b || (d.target !== 'a' && d.target !== 'b')) return
    const clip = KKCT.occlusion.clip(d.a, d.b, d.target)
    if (!clip.ok) {
        emitNet('kk_ct:notice', src, clip.reason)
        return
    }
    const victim = d.target === 'a' ? d.a : d.b
    if (!victim.resource || !victim.rel) {
        emitNet('kk_ct:notice', src, 'that occluder has no file path, run a fresh scan')
        return
    }
    KKCT.decisions.addAsset({
        action: 'clip',
        conflictId: d.conflictId || null,
        file: victim.file || victim.rel,
        loser: { resource: victim.resource, relPath: victim.rel },
        box: { index: clip.index, fields: clip.fields, after: clip.after },
        by: GetPlayerName(src)
    })
    emitNet('kk_ct:notice', src, `Queued a shrink of the ${victim.resource} occluder on its ${clip.axis} axis by ${clip.overlap}m. Run Resolve, then restart.`)
    emitNet('kk_ct:decisionsMeta', src, KKCT.decisions.meta())
    pushState(src)
})

onNet('kk_ct:mergeOccluders', d => {
    const src = source
    if (!allowed(src)) return
    if (!d || !d.a || !d.b) return
    const merge = KKCT.occlusion.merge(d.a, d.b)
    if (!merge.ok) {
        emitNet('kk_ct:notice', src, merge.reason)
        return
    }
    const by = GetPlayerName(src)
    const boxOf = which => (which === 'a' ? d.a : d.b)
    const queue = (which, part) => {
        const box = boxOf(which)
        if (!box.resource || !box.rel) return false
        KKCT.decisions.addAsset({
            action: 'clip',
            conflictId: d.conflictId || null,
            file: box.file || box.rel,
            loser: { resource: box.resource, relPath: box.rel },
            box: { index: part.index, fields: part.fields, after: part.after },
            by
        })
        return true
    }
    let queued = 0
    if (merge.expand && queue(merge.expand.box, merge.expand)) queued++
    if (queue(merge.zero.box, merge.zero)) queued++
    if (!queued) {
        emitNet('kk_ct:notice', src, 'those occluders have no file paths, run a fresh scan')
        return
    }
    if (merge.mode === 'contained') {
        emitNet('kk_ct:notice', src, `One occluder already covers the other. Queued a zero of the ${boxOf(merge.zero.box).resource} copy. Run Resolve, then restart.`)
    } else {
        emitNet('kk_ct:notice', src, `Queued a merge: the ${boxOf(merge.expand.box).resource} occluder grows to the union, the ${boxOf(merge.zero.box).resource} one is zeroed. Run Resolve, then restart.`)
    }
    emitNet('kk_ct:decisionsMeta', src, KKCT.decisions.meta())
    pushState(src)
})

onNet('kk_ct:undo', () => {
    const src = source
    if (!allowed(src)) return
    const undone = KKCT.decisions.undo()
    if (undone && undone.kind === 'entity') {
        broadcastDecisions()
    }
    emitNet('kk_ct:decisionsMeta', src, KKCT.decisions.meta())
    pushState(src)
})

onNet('kk_ct:autoResolve', scope => {
    const src = source
    if (!allowed(src)) return
    const scan = KKCT.scanner.last()
    if (!scan) return
    const by = GetPlayerName(src)
    let count = 0
    const ids = []
    for (const c of scan.conflicts) {
        if (!c.autoRes || c.ignored) continue
        if (scope !== 'all' && c.autoRes !== scope) continue
        ids.push(c.id)
        if (c.autoRes === 'assets' && c.suggested && c.suggested.losers) {
            const winner = c.resources[c.resources.length - 1]
            for (const loser of c.suggested.losers) {
                KKCT.decisions.addAsset({
                    conflictId: c.id,
                    file: c.file,
                    loser: { resource: loser.resource, relPath: loser.rel, sha1: loser.sha1 },
                    winner: winner ? { resource: winner.name, sha1: winner.fullSha1 } : null,
                    by
                })
                count++
            }
        } else if (c.autoRes === 'props' && c.entity) {
            KKCT.decisions.addEntity({
                conflictId: c.id,
                action: 'remove',
                archetype: c.entity.name,
                hash: c.entity.model,
                guid: c.entity.guid,
                source: { resource: c.resources[1] ? c.resources[1].name : null, file: c.file },
                original: { pos: c.entity.pos, rot: c.entity.rot },
                hideRadius: c.entity.radius,
                by
            })
            count++
        }
    }
    broadcastDecisions()
    emitNet('kk_ct:autoResolved', src, ids)
    emitNet('kk_ct:decisionsMeta', src, KKCT.decisions.meta())
    pushState(src)
    console.log(`[fivem_conflicttool] auto-resolve (${scope}) queued ${count} decisions`)
})

onNet('kk_ct:clearQueued', () => {
    const src = source
    if (!allowed(src)) return
    const n = KKCT.decisions.clearPending()
    emitNet('kk_ct:decisionsMeta', src, KKCT.decisions.meta())
    pushState(src)
    console.log(`[fivem_conflicttool] cleared ${n} queued file decisions`)
})

onNet('kk_ct:ignore', d => {
    const src = source
    if (!allowed(src)) return
    if (!d || typeof d !== 'object') return
    const items = Array.isArray(d.items) ? d.items : (typeof d.key === 'string' ? [d] : [])
    if (!items.length) return
    const by = GetPlayerName(src)
    const keys = new Set()
    for (const it of items.slice(0, 500)) {
        if (!it || typeof it.key !== 'string') continue
        KKCT.ignores.set(it.key, !!d.on, { title: it.title, cat: it.cat, by })
        keys.add(it.key)
    }
    const scan = KKCT.scanner.last()
    if (scan) {
        for (const c of scan.conflicts) {
            if (keys.has(c.key)) c.ignored = !!d.on
        }
    }
    pushState(src)
})

onNet('kk_ct:apply', () => {
    const src = source
    if (!allowed(src)) return
    const progress = p => emitNet('kk_ct:applyProgress', src, p)
    KKCT.resolver.apply(progress).then(result => {
        emitNet('kk_ct:applyDone', src, result)
        pushState(src)
    }).catch(e => {
        emitNet('kk_ct:applyDone', src, { summary: null, errors: [{ file: '', msg: e.message }], restartRequired: false })
    })
})

onNet('kk_ct:backups', () => {
    const src = source
    if (!allowed(src)) return
    emitNet('kk_ct:backupsList', src, KKCT.backups.list())
})

onNet('kk_ct:restore', id => {
    const src = source
    if (!allowed(src)) return
    if (typeof id !== 'string' || id.includes('..') || id.includes('/') || id.includes('\\')) return
    const progress = p => emitNet('kk_ct:applyProgress', src, p)
    KKCT.backups.restore(id, progress).then(result => {
        emitNet('kk_ct:applyDone', src, { summary: { restored: result.restored }, errors: result.errors, restartRequired: result.restartRequired, restore: true })
        emitNet('kk_ct:backupsList', src, KKCT.backups.list())
        pushState(src)
    })
})

function sendCollisionGeom(src, file, resource, tag, cap) {
    const scan = KKCT.scanner.last()
    if (!scan || typeof file !== 'string') return
    const entries = scan.index.get(file.toLowerCase())
    if (!entries) return
    const entry = resource ? entries.find(e => e.resource === resource) : entries[entries.length - 1]
    if (!entry) return
    try {
        const buf = fs.readFileSync(entry.abs)
        const tris = KKCT.ybn.parseGeometry(buf, cap)
        TriggerLatentClientEvent('kk_ct:collisionGeomData', String(src), 4000000, tag, tris)
    } catch (e) {
        console.log(`[fivem_conflicttool] collision geometry failed for ${file}: ${e.message}`)
    }
}

onNet('kk_ct:collisionGeom', (file, resource) => {
    const src = source
    if (!allowed(src)) return
    sendCollisionGeom(src, file, resource, 'sel', 8000)
})

onNet('kk_ct:collisionGeomAll', () => {
    const src = source
    if (!allowed(src)) return
    const scan = KKCT.scanner.last()
    if (!scan) return
    const colls = scan.conflicts.filter(c => c.cat === 'coll' && c.kind === 'dup-file').slice(0, 10)
    for (const c of colls) {
        const winner = c.resources[c.resources.length - 1]
        sendCollisionGeom(src, c.file, winner ? winner.name : null, c.file, 4000)
    }
})

on('playerJoining', () => {
    const src = source
    setTimeout(() => emitNet('kk_ct:decisions', src, KKCT.decisions.entities()), 5000)
})

console.log(`[fivem_conflicttool] loaded (${KKCT.names.size()} known object names)`)
})()
