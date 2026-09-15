(() => {
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.merge = (() => {
    const FRESH = 'run a fresh scan'
    const CHANGED = 'file changed since the merge was queued'
    const INCOMPLETE = 'the queued merge is incomplete, queue it again'

    const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex')

    function request(conflictId, file, policy, base) {
        return {
            conflictId: typeof conflictId === 'string' ? conflictId : null,
            file: typeof file === 'string' ? file.toLowerCase() : null,
            policy: policy === 'union' ? 'union' : 'three-way',
            base: base && typeof base.resource === 'string' && typeof base.rel === 'string'
                ? { resource: base.resource, rel: base.rel }
                : null
        }
    }

    function findConflict(scan, conflictId, file) {
        const list = scan.conflicts.filter(c => c.kind === 'dup-file' && c.merge && c.file === file)
        return list.find(c => c.id === conflictId) || list[0] || null
    }

    function lastPerResource(entries) {
        const byRes = new Map()
        for (const e of KKCT.conflicts.loadOrder(entries)) {
            if (e.inStream && !e.parseError) byRes.set(e.resource, e)
        }
        return byRes
    }

    function referencedBy(scan, key) {
        const h = KKCT.joaat(key.replace(/\.[^.]+$/, ''))
        for (const [, entries] of scan.index) {
            for (const e of entries) {
                if (e.ext === 'ymap' && e.parsed && e.parsed.parent === h) return true
            }
        }
        return false
    }

    function plan(conflictId, file, requestedBase) {
        const scan = KKCT.scanner.last()
        if (!scan) return { ok: false, reason: `there is no scan yet, ${FRESH}` }
        const conflict = typeof file === 'string' ? findConflict(scan, conflictId, file.toLowerCase()) : null
        if (!conflict) return { ok: false, reason: `this file cannot be merged in the last scan, ${FRESH}` }
        const m = conflict.merge
        const kind = ['lodlights', 'entities', 'ybn', 'ydr', 'ydd', 'yft'].includes(m.kind) ? m.kind : 'entities'
        const keys = kind === 'lodlights' ? [m.lod, m.dist] : [conflict.file]
        const ids = Array.isArray(m.ids) && m.ids.length ? [...m.ids] : [conflict.id]
        const base = { conflict, kind, keys, ids }
        if (keys.some(k => typeof k !== 'string' || !scan.index.has(k))) {
            return { ...base, ok: false, reason: `a file of this merge is not in the last scan, ${FRESH}` }
        }
        const entries = keys.map(k => scan.index.get(k))
        let copies
        if (['ybn', 'ydr', 'ydd', 'yft'].includes(kind)) {
            copies = KKCT.conflicts.loadOrder(entries[0].filter(e => e.inStream && !e.parseError)).map(entry => ({
                resource: entry.resource,
                chosen: [entry]
            }))
        } else {
            const picks = entries.map(lastPerResource)
            const byFirst = new Map()
            for (const [resource, first] of picks[0]) {
                const chosen = picks.map(p => p.get(resource))
                if (chosen.some(e => !e)) continue
                byFirst.set(first, { resource, chosen })
            }
            copies = KKCT.conflicts.loadOrder([...byFirst.keys()]).map(first => byFirst.get(first))
        }
        if (!copies.length) return { ...base, ok: false, reason: `no usable copies remain, ${FRESH}` }
        let baseIndex = copies.length - 1
        if (requestedBase) {
            baseIndex = copies.findIndex(copy => copy.resource === requestedBase.resource && copy.chosen[0].rel === requestedBase.rel)
            if (baseIndex < 0) return { ...base, ok: false, reason: `the selected base copy is not usable, ${FRESH}` }
        }
        const selectedBase = copies[baseIndex]
        if (baseIndex !== copies.length - 1) copies.push(...copies.splice(baseIndex, 1))
        const mergeBase = { resource: selectedBase.resource, rel: selectedBase.chosen[0].rel }
        const idOf = {}
        for (const key of keys) {
            const c = scan.conflicts.find(x => x.kind === 'dup-file' && x.file === key && ids.includes(x.id))
            idOf[key] = c ? c.id : null
        }
        return {
            ...base,
            ok: true,
            entries,
            copies,
            base: mergeBase,
            idOf,
            referenced: kind === 'entities'
                ? referencedBy(scan, keys[0])
                : Object.fromEntries((m.entityKeys || []).map(key => [key, referencedBy(scan, key)])),
            entityKeys: kind === 'lodlights' && Array.isArray(m.entityKeys) ? m.entityKeys.filter(key => keys.includes(key)) : []
        }
    }

    function prepare(req) {
        const p = plan(req.conflictId, req.file, req.base)
        if (!p.ok) return p
        const read = new Map()
        for (let k = 0; k < p.keys.length; k++) {
            for (const e of p.entries[k]) {
                let buf
                try {
                    buf = fs.readFileSync(e.abs)
                } catch {
                    return { ...p, ok: false, reason: `${p.keys[k]} in ${e.resource} is missing, ${FRESH}` }
                }
                read.set(e, { relPath: e.rel, sha1: sha1(buf), buf, entry: e })
            }
        }
        const copies = p.copies.map(c => ({
            resource: c.resource,
            files: Object.fromEntries(p.keys.map((key, k) => [key, read.get(c.chosen[k])]))
        }))
        return { ...p, copies, read }
    }

    function compute(kind, keys, copies, policy, referenced, entityKeys) {
        if (kind === 'lodlights') {
            const result = KKCT.lodlightmerge.merge(copies.map(c => ({
                resource: c.resource,
                lod: c.files[keys[0]] ? c.files[keys[0]].buf : null,
                dist: c.files[keys[1]] ? c.files[keys[1]].buf : null
            })), policy)
            if (!result.ok) return result
            for (const key of Array.isArray(entityKeys) ? entityKeys : []) {
                const index = keys.indexOf(key)
                if (index < 0) continue
                const target = index === 0 ? result.lodTarget : result.distTarget
                const lightBuf = index === 0 ? result.lod : result.dist
                const merged = KKCT.entitymerge.merge(copies.map((copy, i) => ({
                    resource: copy.resource,
                    buf: i === target ? lightBuf : copy.files[key].buf
                })), policy, { referenced: !!referenced[key] })
                if (!merged.ok) {
                    result.ok = false
                    result.reason = `${key} props could not be merged: ${merged.reason}`
                    result.report.digest = null
                    return result
                }
                if (merged.target !== target) {
                    result.ok = false
                    result.reason = `${key} props could not be merged into the active light copy`
                    result.report.digest = null
                    return result
                }
                if (index === 0) result.lod = merged.buf
                else result.dist = merged.buf
                result.report.warnings.push(`also merged ${merged.report.total} props in ${key}`)
            }
            result.report.digest = sha1(Buffer.concat([result.lod, result.dist]))
            return result
        }
        if (kind === 'entities') {
            return KKCT.entitymerge.merge(copies.map(c => ({ resource: c.resource, buf: c.files[keys[0]].buf })), policy, { referenced: !!referenced })
        }
        return KKCT.assetmerge.merge(copies.map(c => ({ resource: c.resource, buf: c.files[keys[0]].buf })), kind, policy)
    }

    function targetsOf(kind, keys, copies, result) {
        const at = (key, index, buf) => {
            const copy = copies[index]
            const f = copy && copy.files[key]
            if (!f || !Buffer.isBuffer(buf)) throw new Error('the merge has no target file')
            return { key, resource: copy.resource, relPath: f.relPath, sha1: f.sha1, entry: f.entry, buf }
        }
        if (kind === 'lodlights') {
            return [at(keys[0], result.lodTarget, result.lod), at(keys[1], result.distTarget, result.dist)]
        }
        return [at(keys[0], result.target, result.buf)]
    }

    function payloadOf(req, ctx, result, reason) {
        const out = { conflictId: req.conflictId, policy: req.policy, file: req.file, base: ctx && ctx.base ? ctx.base : req.base, ok: false }
        if (ctx && ctx.conflict) {
            out.kind = ctx.kind
            out.ids = ctx.ids
        }
        if (result && result.report) {
            const r = result.report
            out.effective = r.effective
            out.ok = !!result.ok
            out.copies = (r.copies || []).map((c, i) => {
                const own = ctx.copies[i]
                return {
                    resource: c.resource,
                    rel: own ? own.files[ctx.keys[0]].relPath : undefined,
                    total: c.total,
                    shared: c.shared,
                    onlyHere: c.onlyHere,
                    removed: c.removed,
                    lost: c.lost,
                    excluded: !!c.excluded,
                    target: !!c.target,
                    warnings: [...(c.warnings || [])]
                }
            })
            out.totals = r.totals
            out.warnings = [...(r.warnings || [])]
            if (result.ok) {
                out.files = targetsOf(ctx.kind, ctx.keys, ctx.copies, result).map(t => ({ file: t.key, target: t.resource, total: r.total }))
                out.digest = r.digest
            } else {
                out.files = []
                out.reason = result.reason
            }
        }
        if (reason) {
            out.ok = false
            out.reason = reason
            delete out.digest
        }
        return out
    }

    function preview(conflictId, file, policy, base) {
        const req = request(conflictId, file, policy, base)
        const ctx = prepare(req)
        if (!ctx.ok) return { ok: false, reason: ctx.reason, req, payload: payloadOf(req, ctx, null, ctx.reason) }
        const result = compute(ctx.kind, ctx.keys, ctx.copies, req.policy, ctx.referenced, ctx.entityKeys)
        return { ok: !!result.ok, reason: result.reason, req, ctx, result, payload: payloadOf(req, ctx, result) }
    }

    function queue(conflictId, file, policy, digest, by, base) {
        const p = preview(conflictId, file, policy, base)
        if (!p.ok) return { ok: false, reason: p.reason, payload: p.payload }
        const { req, ctx, result } = p
        if (typeof digest !== 'string' || digest !== result.report.digest) {
            const reason = 'the copies changed since the preview, preview again'
            return { ok: false, reason, payload: payloadOf(req, ctx, result, reason) }
        }
        const targets = targetsOf(ctx.kind, ctx.keys, ctx.copies, result)
        const group = `g_merge_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
        const meta = {
            group,
            kind: ctx.kind,
            policy: req.policy,
            keys: [...ctx.keys],
            ids: [...ctx.ids],
            referenced: ctx.referenced,
            entityKeys: [...(ctx.entityKeys || [])],
            copies: ctx.copies.map(c => ({
                resource: c.resource,
                files: Object.fromEntries(ctx.keys.map(key => [key, { relPath: c.files[key].relPath, sha1: c.files[key].sha1 }]))
            })),
            digest
        }
        meta.base = ctx.base
        const targetEntries = new Set(targets.map(t => t.entry))
        let losers = 0
        KKCT.decisions.bulk(() => {
            KKCT.decisions.dropGroup(ctx.keys)
            KKCT.decisions.dropDisables(ctx.keys)
            for (const t of targets) {
                KKCT.decisions.addAsset({
                    action: 'merge',
                    conflictId: ctx.idOf[t.key],
                    file: t.key,
                    loser: { resource: t.resource, relPath: t.relPath, sha1: t.sha1 },
                    winner: null,
                    merge: { ...meta },
                    group,
                    by
                })
            }
            ctx.keys.forEach((key, k) => {
                const target = targets.find(t => t.key === key)
                for (const e of ctx.entries[k]) {
                    if (targetEntries.has(e)) continue
                    KKCT.decisions.addAsset({
                        action: 'disable',
                        conflictId: ctx.idOf[key],
                        file: key,
                        loser: { resource: e.resource, relPath: e.rel, sha1: ctx.read.get(e).sha1 },
                        winner: target ? { resource: target.resource } : null,
                        merge: { group },
                        group,
                        by
                    })
                    losers++
                }
            })
        })
        return {
            ok: true,
            payload: { ...p.payload, queued: true },
            files: [...ctx.keys],
            targets: [...new Set(targets.map(t => t.resource))],
            losers
        }
    }

    function run(records, io) {
        const list = Array.isArray(records) ? records : []
        const head = list.find(r => r.action === 'merge' && r.merge && Array.isArray(r.merge.keys) && Array.isArray(r.merge.copies))
        if (!head) throw new Error(INCOMPLETE)
        const m = head.merge
        if (!['lodlights', 'entities', 'ybn', 'ydr', 'ydd', 'yft'].includes(m.kind)) throw new Error(INCOMPLETE)
        if (m.keys.length !== (m.kind === 'lodlights' ? 2 : 1)) throw new Error(INCOMPLETE)
        const own = key => list.find(r => r.action === 'merge' && r.file === key && r.merge && r.merge.group === m.group)
        if (m.keys.some(key => !own(key))) throw new Error(INCOMPLETE)

        const copies = m.copies.map(c => {
            const root = io.resourceRoot(c.resource)
            if (!root) throw new Error(`resource ${c.resource} not found`)
            const files = {}
            for (const key of m.keys) {
                const f = c.files && c.files[key]
                if (!f || typeof f.relPath !== 'string') throw new Error(INCOMPLETE)
                let buf
                try {
                    buf = fs.readFileSync(path.join(root, f.relPath))
                } catch {
                    throw new Error(`${key} in ${c.resource} is missing`)
                }
                if (sha1(buf) !== f.sha1) throw new Error(CHANGED)
                files[key] = { relPath: f.relPath, sha1: f.sha1, buf }
            }
            return { resource: c.resource, files }
        })

        const result = compute(m.kind, m.keys, copies, m.policy, m.referenced, m.entityKeys)
        if (!result.ok) throw new Error(result.reason)
        const targets = targetsOf(m.kind, m.keys, copies, result)
        for (const t of targets) {
            const rec = own(t.key)
            const rel = rec.loser ? (rec.loser.relPath || rec.loser.rel) : null
            if (!rec.loser || rec.loser.resource !== t.resource || rel !== t.relPath) {
                throw new Error('the merge target changed since the merge was queued')
            }
        }

        const written = []
        try {
            for (const t of targets) {
                const b = io.ensureBackup(t.resource, t.relPath)
                if (b.first) io.recordMove(t.resource, t.relPath, b.sha, b.dest, 'edit', { merge: true })
                io.writeBack(b.src, t.buf, b.dest, raw => {
                    if (!raw.equals(t.buf)) return false
                    if (m.kind === 'entities' || m.kind === 'lodlights') return !!KKCT.ymap.parse(raw)
                    return !!KKCT.assetmerge.inspect(raw, m.kind)
                })
                written.push(b)
            }
        } catch (e) {
            let lost = false
            for (const b of written) {
                try {
                    KKCT.fsops.copyInto(b.dest, b.src)
                } catch {
                    lost = true
                }
            }
            if (lost) e.message = `${e.message}, and an earlier merged file could not be put back, restore the backup bundle`
            throw e
        }
        return { files: targets.length, keys: [...m.keys], targets: targets.map(t => t.resource) }
    }

    return { plan, preview, queue, run }
})()
})()
