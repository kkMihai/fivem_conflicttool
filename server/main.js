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
    let hiddenCount = 0
    for (const c of scan.conflicts) {
        if (c.ignored) {
            ignoredCount++
            continue
        }
        if (c.hidden) {
            hiddenCount++
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
        hiddenCount,
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
    emitNet('kk_ct:collMats', src, { names: KKCT.collmats.NAMES, colors: KKCT.collmats.COLORS, flags: KKCT.collmats.FLAGS })
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
    let queued = 0
    for (const t of d.targets) {
        if (!t || !t.resource || !t.rel) continue
        const from = Array.isArray(t.from) && t.from.length === 3 ? t.from.map(Number) : d.pos
        const to = [from[0], from[1], from[2] - 1000]
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

function occlBoxesFrom(d) {
    if (!d || !Array.isArray(d.boxes) || d.boxes.length < 2) return null
    return d.boxes
}

function occlQueue(d, box, part, group) {
    if (!box || !box.resource || !box.rel) return false
    KKCT.decisions.addAsset({
        action: 'clip',
        conflictId: d.conflictId || null,
        file: box.file || box.rel,
        loser: { resource: box.resource, relPath: box.rel },
        box: { index: part.index, fields: part.fields, after: part.after },
        group: group || undefined,
        by: GetPlayerName(source)
    })
    return true
}

function occlPush(src, d, boxes, message) {
    emitNet('kk_ct:occlPreview', src, { conflictId: d.conflictId || null, boxes })
    emitNet('kk_ct:notice', src, message)
    emitNet('kk_ct:decisionsMeta', src, KKCT.decisions.meta())
    pushState(src)
}

onNet('kk_ct:clipOccluder', d => {
    const src = source
    if (!allowed(src)) return
    try {
        const boxes = occlBoxesFrom(d)
        if (!boxes || typeof d.target !== 'number' || !boxes[d.target]) return
        const clip = KKCT.occlusion.clip(boxes, d.target)
        if (!clip.ok) {
            emitNet('kk_ct:notice', src, clip.reason)
            return
        }
        const victim = boxes[d.target]
        if (!occlQueue(d, victim, clip, null)) {
            emitNet('kk_ct:notice', src, 'that occluder has no file path, run a fresh scan')
            return
        }
        const newBoxes = boxes.map((box, i) => (i === d.target ? { ...box, ...clip.after } : box))
        occlPush(src, d, newBoxes, `Queued a shrink of the ${victim.resource} occluder on its ${clip.axis} axis.`)
    } catch (e) {
        console.log(`[fivem_conflicttool] clipOccluder failed: ${e.message}`)
        emitNet('kk_ct:notice', src, 'the shrink failed on the server, check the server console')
    }
})

onNet('kk_ct:zeroOccluder', d => {
    const src = source
    if (!allowed(src)) return
    try {
        const boxes = occlBoxesFrom(d)
        if (!boxes || typeof d.target !== 'number' || !boxes[d.target]) return
        const victim = boxes[d.target]
        const zero = KKCT.occlusion.zero(victim)
        if (!zero.ok) {
            emitNet('kk_ct:notice', src, zero.reason)
            return
        }
        if (!occlQueue(d, victim, zero, null)) {
            emitNet('kk_ct:notice', src, 'that occluder has no file path, run a fresh scan')
            return
        }
        const newBoxes = boxes.map((box, i) => (i === d.target ? { ...box, l: 0, w: 0, h: 0 } : box))
        occlPush(src, d, newBoxes, `Queued a removal of the ${victim.resource} occluder, its volume is zeroed in the file.`)
    } catch (e) {
        console.log(`[fivem_conflicttool] zeroOccluder failed: ${e.message}`)
        emitNet('kk_ct:notice', src, 'the removal failed on the server, check the server console')
    }
})

onNet('kk_ct:editOccluder', d => {
    const src = source
    if (!allowed(src)) return
    try {
        const boxes = occlBoxesFrom(d)
        if (!boxes || typeof d.target !== 'number' || !boxes[d.target]) return
        const victim = boxes[d.target]
        const edit = KKCT.occlusion.transform(victim, d.after)
        if (!edit.ok) {
            emitNet('kk_ct:notice', src, edit.reason)
            return
        }
        if (!occlQueue(d, victim, edit, null)) {
            emitNet('kk_ct:notice', src, 'that occluder has no file path, run a fresh scan')
            return
        }
        const newBoxes = boxes.map((box, i) => (i === d.target ? { ...box, ...edit.after } : box))
        occlPush(src, d, newBoxes, `Queued an edit of the ${victim.resource} occluder, it is now ${edit.after.l} x ${edit.after.w} x ${edit.after.h}.`)
    } catch (e) {
        console.log(`[fivem_conflicttool] editOccluder failed: ${e.message}`)
        emitNet('kk_ct:notice', src, 'the edit failed on the server, check the server console')
    }
})

onNet('kk_ct:mergeOccluders', d => {
    const src = source
    if (!allowed(src)) return
    try {
        const boxes = occlBoxesFrom(d)
        if (!boxes) return
        const merge = KKCT.occlusion.merge(boxes)
        if (!merge.ok) {
            emitNet('kk_ct:notice', src, merge.reason)
            return
        }
        const group = `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
        let queued = 0
        if (merge.expand && occlQueue(d, boxes[merge.expand.boxIndex], merge.expand, group)) queued++
        for (const z of merge.zeroed) {
            if (occlQueue(d, boxes[z.boxIndex], z, group)) queued++
        }
        if (!queued) {
            emitNet('kk_ct:notice', src, 'those occluders have no file paths, run a fresh scan')
            return
        }
        const zeroedSet = new Set(merge.zeroed.map(z => z.boxIndex))
        const newBoxes = boxes.map((box, i) => {
            if (merge.expand && merge.expand.boxIndex === i) return { ...box, ...merge.expand.after }
            if (zeroedSet.has(i)) return { ...box, l: 0, w: 0, h: 0 }
            return box
        })
        const zeroNames = [...new Set(merge.zeroed.map(z => boxes[z.boxIndex].resource))].join(', ')
        if (merge.mode === 'contained') {
            occlPush(src, d, newBoxes, `The largest occluder already covers the rest. Queued a zero of ${zeroNames}.`)
        } else {
            occlPush(src, d, newBoxes, `Queued a merge: the ${boxes[merge.expand.boxIndex].resource} occluder grows to the union, ${zeroNames} zeroed.`)
        }
    } catch (e) {
        console.log(`[fivem_conflicttool] mergeOccluders failed: ${e.message}`)
        emitNet('kk_ct:notice', src, 'the merge failed on the server, check the server console')
    }
})

function pushCollAfterUndo(src, rec) {
    try {
        if (!rec || !rec.loser) return
        const resource = rec.loser.resource
        const entry = collEntry(rec.file, resource)
        if (!entry) return
        const current = currentYbn(entry)
        emitNet('kk_ct:collPreview', src, {
            conflictId: rec.conflictId || null,
            file: rec.file,
            resource,
            bounds: KKCT.ybn.inspect(current).bounds
        })
    } catch (e) {
        console.log(`[fivem_conflicttool] collision undo preview failed: ${e.message}`)
    }
}

onNet('kk_ct:undo', () => {
    const src = source
    if (!allowed(src)) return
    const undone = KKCT.decisions.undo()
    if (undone && undone.kind === 'entity') {
        broadcastDecisions()
    }
    if (undone && undone.kind === 'asset' && undone.rec && undone.rec.action === 'ybn') {
        pushCollAfterUndo(src, undone.rec)
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

function collEntry(file, resource) {
    const scan = KKCT.scanner.last()
    if (!scan || typeof file !== 'string') return null
    const entries = scan.index.get(file.toLowerCase())
    if (!entries) return null
    return (resource ? entries.find(e => e.resource === resource) : null) || entries[entries.length - 1] || null
}

onNet('kk_ct:collisionBounds', (file, resource) => {
    const src = source
    if (!allowed(src)) return
    const entry = collEntry(file, resource)
    if (!entry) return
    try {
        const buf = currentYbn(entry)
        TriggerLatentClientEvent('kk_ct:collisionBoundsData', String(src), 4000000, {
            file,
            resource: entry.resource,
            rel: entry.rel,
            inspect: KKCT.ybn.inspect(buf),
            geom: KKCT.ybn.geometryByBound(buf, 4000)
        })
    } catch (e) {
        console.log(`[fivem_conflicttool] collision bounds failed for ${file}: ${e.message}`)
        emitNet('kk_ct:notice', src, 'that collision file could not be read, run a fresh scan')
    }
})

function currentYbn(entry) {
    const buf = fs.readFileSync(entry.abs)
    const prior = pendingYbnEdits(entry.resource, entry.rel)
    return prior.length ? KKCT.ybn.patch(buf, prior).buf : buf
}

function pendingYbnEdits(resource, rel) {
    const out = []
    for (const a of KKCT.decisions.pendingAssets()) {
        if (a.action !== 'ybn' || !a.loser) continue
        if (a.loser.resource !== resource) continue
        if ((a.loser.relPath || a.loser.rel) !== rel) continue
        if (a.ybn && Array.isArray(a.ybn.edits)) out.push(...a.ybn.edits)
    }
    return out
}

onNet('kk_ct:faceData', (file, resource, bi) => {
    const src = source
    if (!allowed(src)) return
    const entry = collEntry(file, resource)
    if (!entry || typeof bi !== 'number') return
    try {
        const data = KKCT.ybn.faceData(currentYbn(entry), bi, 40000)
        if (!data) {
            emitNet('kk_ct:notice', src, 'that bound has no face data')
            return
        }
        TriggerLatentClientEvent('kk_ct:faceDataResult', String(src), 4000000, {
            file,
            resource: entry.resource,
            ...data
        })
    } catch (e) {
        console.log(`[fivem_conflicttool] face data failed for ${file}: ${e.message}`)
        emitNet('kk_ct:notice', src, 'that collision file could not be read, run a fresh scan')
    }
})

function collApply(src, d, build, message) {
    if (!allowed(src)) return
    if (!d || typeof d !== 'object') return
    const entry = collEntry(d.file, d.resource)
    if (!entry) {
        emitNet('kk_ct:notice', src, 'that collision file is not in the last scan, run a fresh scan')
        return
    }
    try {
        const base = currentYbn(entry)
        const ins = KKCT.ybn.inspect(base)
        const result = build(ins, base)
        if (!result.ok) {
            emitNet('kk_ct:notice', src, result.reason)
            return
        }
        const preview = KKCT.ybn.patch(base, result.edits)
        const bounds = KKCT.ybn.inspect(preview.buf).bounds
        KKCT.decisions.addAsset({
            action: 'ybn',
            conflictId: d.conflictId || null,
            file: d.file || entry.rel,
            loser: { resource: entry.resource, relPath: entry.rel, sha1: entry.sha1 },
            ybn: { key: result.key, edits: result.edits },
            group: result.group || undefined,
            by: GetPlayerName(src)
        })
        emitNet('kk_ct:collPreview', src, {
            conflictId: d.conflictId || null,
            file: d.file,
            resource: entry.resource,
            bounds,
            faces: result.faces || null
        })
        emitNet('kk_ct:notice', src, message(result, entry))
        emitNet('kk_ct:decisionsMeta', src, KKCT.decisions.meta())
        pushState(src)
    } catch (e) {
        console.log(`[fivem_conflicttool] collision edit failed for ${d.file}: ${e.stack || e.message}`)
        emitNet('kk_ct:notice', src, 'the collision edit failed on the server, check the server console')
    }
}

onNet('kk_ct:editCollision', d => {
    const src = source
    collApply(src, d, ins => {
        const r = KKCT.collision.transform(ins, d.bi, d.after)
        return r.ok ? { ...r, key: `m:${d.bi}` } : r
    }, (r, entry) => `Queued a move of bound ${d.bi + 1} in ${entry.resource} to ${r.after.pos.join(', ')}.`)
})

onNet('kk_ct:moveCollision', d => {
    const src = source
    collApply(src, d, ins => {
        const r = KKCT.collision.shiftAll(ins, d.delta)
        return r.ok ? { ...r, key: ins.composite ? 'shift' : `shift:${Date.now()}` } : r
    }, (r, entry) => `Queued a move of the whole ${entry.resource} collision by ${r.after.delta.join(', ')}.`)
})

onNet('kk_ct:setFaceMaterial', d => {
    const src = source
    collApply(src, d, (ins, base) => {
        const usage = KKCT.ybn.slotUsage(base, d.bi)
        const r = KKCT.collision.assignFaces(ins, usage, d.bi, d.polys, d)
        if (!r.ok) return r
        return { ...r, key: `face:${d.bi}:${Date.now()}`, faces: { bi: d.bi, slot: r.after.slot, polys: r.edits.find(e => e.kind === 'faceMaterial')?.polys ?? [] } }
    }, r => {
        const how = r.after.mode === 'added'
            ? 'a new surface slot'
            : r.after.mode === 'retyped'
                ? 'by retyping the surface those faces already shared'
                : 'an existing surface slot'
        return `Queued ${r.after.name} on ${r.after.faces} ${r.after.faces === 1 ? 'face' : 'faces'}, using ${how}.`
    })
})

onNet('kk_ct:collProbeSets', file => {
    const src = source
    if (!allowed(src)) return
    const scan = KKCT.scanner.last()
    if (!scan || typeof file !== 'string') return
    const entries = scan.index.get(file.toLowerCase())
    if (!entries || entries.length < 2) return
    try {
        const copies = []
        for (const e of entries) {
            if (!e.inStream) continue
            copies.push({ resource: e.resource, tris: KKCT.ybn.parseGeometry(fs.readFileSync(e.abs), 20000) })
        }
        if (copies.length < 2) {
            emitNet('kk_ct:notice', src, 'only one copy of this file is in a stream folder, so there is nothing to compare')
            return
        }
        const sets = KKCT.collision.probeSets(copies, 60)
        TriggerLatentClientEvent('kk_ct:collProbeData', String(src), 2000000, { file, sets })
    } catch (e) {
        console.log(`[fivem_conflicttool] probe sets failed for ${file}: ${e.message}`)
        emitNet('kk_ct:notice', src, 'those copies could not be compared, run a fresh scan')
    }
})

onNet('kk_ct:moveFaces', d => {
    const src = source
    collApply(src, d, (ins, base) => {
        const can = KKCT.ybn.canMoveVerts(base, d.bi)
        const r = KKCT.collision.moveFaces(ins, can, d.bi, d.polys, d.m)
        return r.ok ? { ...r, key: `verts:${d.bi}:${Date.now()}`, faces: { bi: d.bi, geometry: true } } : r
    }, r => `Queued a move of ${r.after.faces} ${r.after.faces === 1 ? 'face' : 'faces'}.`)
})

onNet('kk_ct:setCollisionMaterial', d => {
    const src = source
    collApply(src, d, ins => {
        const r = KKCT.collision.material(ins, d.bi, d.slot, d)
        return r.ok ? { ...r, key: `mat:${d.bi}:${d.slot}` } : r
    }, (r, entry) => `Queued surface ${r.after.name} on bound ${d.bi + 1} in ${entry.resource}.`)
})

function sendCollisionGeom(src, file, resource, tag, cap) {
    const entry = collEntry(file, resource)
    if (!entry) return
    try {
        const buf = currentYbn(entry)
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
