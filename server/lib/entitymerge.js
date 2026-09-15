(() => {
const crypto = require('crypto')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.entitymerge = (() => {
    const DEEP = -5000
    const DROP_TOP = 150
    const DROP_MEDIAN = 50
    const SCREEN = -250
    const ARRAYINFO = 0x100
    const MAX_DEPTH = 16
    const NONE = new Map()
    const ONE_COPY = 'only one copy can be merged'
    const LOD_PARENT = 'this ymap is a LOD parent, only field changes can merge'

    const LISTS = [
        ['containerLods', 'container LODs'],
        ['boxOccluders', 'box occluders'],
        ['occludeModels', 'occlude models'],
        ['timeCycleModifiers', 'timecycle modifiers'],
        ['physicsDictionaries', 'physics dictionaries'],
        ['instancedData', 'grass instances'],
        ['carGenerators', 'car generators'],
        ['LODLightsSOA', 'LOD lights'],
        ['DistantLODLightsSOA', 'distant LOD lights']
    ]

    const EXTENTS = [
        ['streamingExtentsMin', Math.min],
        ['streamingExtentsMax', Math.max],
        ['entitiesExtentsMin', Math.min],
        ['entitiesExtentsMax', Math.max]
    ]

    const sha1 = v => crypto.createHash('sha1').update(v).digest('hex')
    const round3 = v => Math.round(v * 1000) / 1000

    let hashes = null

    function names() {
        if (!hashes) {
            hashes = {
                map: KKCT.joaatCase('CMapData'),
                mlo: KKCT.joaatCase('CMloInstanceDef')
            }
        }
        return hashes
    }

    function spanOf(si, e) {
        let end = si.size
        for (const o of si.entries) {
            if (o.nameHash !== ARRAYINFO && o.offset > e.offset && o.offset < end) end = o.offset
        }
        return end - e.offset
    }

    function elemSize(W, type) {
        if (W.PRIM[type]) return W.PRIM[type]
        if (type === W.T.VEC3) return 12
        if (type === W.T.VEC4) return 16
        return 0
    }

    function num(W, type, v) {
        if (v === null || v === undefined) return '?'
        if (typeof v === 'boolean') return v ? '1' : '0'
        if (Array.isArray(v)) {
            const scale = type === W.T.VEC4 ? 10000 : 1000
            return v.map(x => String(Math.round(x * scale))).join(' ')
        }
        return type === W.T.FLOAT ? String(Math.round(v * 1000)) : String(v)
    }

    function isPointer(W, type) {
        return type === W.T.ARRAY || type === W.T.STRUCT_PTR || type === W.T.CHAR_PTR || type === W.T.DATA_PTR
    }

    function fields(tree, node, si, base, out, depth) {
        const W = KKCT.metawrite
        const raw = e => node.bytes.toString('hex', base + e.offset, base + e.offset + spanOf(si, e))
        for (const e of si.entries) {
            if (e.nameHash === ARRAYINFO) continue
            const at = base + e.offset
            if (e.type === W.T.STRUCT) {
                const sub = W.info(tree, e.refKey)
                if (sub && depth < MAX_DEPTH) fields(tree, node, sub, at, out, depth + 1)
                else out.push(raw(e))
            } else if (isPointer(W, e.type)) {
                out.push(refSig(tree, node.refs.get(at), depth))
            } else if (e.type === W.T.BYTE_ARRAY) {
                const el = si.entries[e.refIdx]
                const size = el ? elemSize(W, el.type) : 0
                if (!size || at + size * e.refKey > node.bytes.length) {
                    out.push(raw(e))
                    continue
                }
                const vals = []
                for (let i = 0; i < e.refKey; i++) vals.push(num(W, el.type, W.value(node.bytes, at + i * size, el.type)))
                out.push(vals.join(' '))
            } else {
                const size = elemSize(W, e.type)
                const v = size && at + size <= node.bytes.length ? W.value(node.bytes, at, e.type) : null
                out.push(v === null ? raw(e) : num(W, e.type, v))
            }
        }
    }

    function nodeSig(tree, node, depth) {
        const W = KKCT.metawrite
        if (!node) return 'null'
        const si = W.info(tree, node.hash)
        if (!si || depth > MAX_DEPTH || node.bytes.length !== si.size) return 'x' + W.digest(node)
        const out = []
        fields(tree, node, si, 0, out, depth)
        return (node.hash >>> 0).toString(16) + '(' + out.join(',') + ')'
    }

    function refSig(tree, ref, depth) {
        const W = KKCT.metawrite
        if (!ref || !W.count(tree, ref)) return '-'
        switch (ref.kind) {
            case 'structs': {
                if (!W.info(tree, ref.hash)) return 'r' + sha1(ref.raw)
                return '[' + W.rows(tree, ref).map(row => nodeSig(tree, { hash: ref.hash, bytes: row, refs: NONE }, depth + 1)).join(';') + ']'
            }
            case 'items': case 'ptrs': return '[' + ref.items.map(n => nodeSig(tree, n, depth + 1)).join(';') + ']'
            case 'ptr': return '{' + nodeSig(tree, ref.node, depth + 1) + '}'
            case 'prims': return '[' + W.values(ref).map(v => num(W, ref.type, v)).join(' ') + ']'
            case 'chars': return JSON.stringify(ref.raw.toString('latin1'))
            default: return 'd' + sha1(ref.raw)
        }
    }

    function listSig(tree, name) {
        const W = KKCT.metawrite
        const root = tree.root
        const e = W.field(tree, root.hash, name)
        if (!e) return '-'
        if (e.type !== W.T.STRUCT) return isPointer(W, e.type) ? refSig(tree, root.refs.get(e.offset), 0) : '-'
        const si = W.info(tree, root.hash)
        const span = spanOf(si, e)
        let blank = true
        for (const at of root.refs.keys()) {
            if (at >= e.offset && at < e.offset + span) blank = false
        }
        for (let i = e.offset; blank && i < e.offset + span; i++) {
            if (root.bytes[i]) blank = false
        }
        if (blank) return '-'
        const sub = W.info(tree, e.refKey)
        if (!sub) return root.bytes.toString('hex', e.offset, e.offset + span)
        const out = []
        fields(tree, root, sub, e.offset, out, 1)
        return out.join(',')
    }

    function prepare(copy, index) {
        const W = KKCT.metawrite
        const p = {
            index, resource: copy && copy.resource, warnings: [], excluded: false, tree: null, head: null,
            parent: 0, lodParents: 0, entitiesAt: -1, slots: [], byKey: new Map(), lites: []
        }
        try {
            p.head = KKCT.rsc7.parse(copy.buf)
            p.tree = W.read(p.head.data)
        } catch (err) {
            p.excluded = true
            p.tree = null
            p.head = null
            p.warnings.push(`could not be read: ${err.message}`)
            return p
        }
        const tree = p.tree
        const root = tree.root
        if (root.hash !== names().map) {
            p.excluded = true
            p.warnings.push('has no map data')
            return p
        }
        p.parent = (W.get(tree, root, 'parent') || 0) >>> 0
        const list = W.field(tree, root.hash, 'entities')
        if (list) p.entitiesAt = list.offset
        const ref = list ? root.refs.get(list.offset) : null
        const items = ref && ref.kind === 'ptrs' ? ref.items : []

        const lookups = new Map()
        const fieldsOf = hash => {
            let f = lookups.get(hash)
            if (!f) {
                f = {
                    arch: W.field(tree, hash, 'archetypeName'),
                    guid: W.field(tree, hash, 'guid'),
                    pos: W.field(tree, hash, 'position'),
                    kids: W.field(tree, hash, 'numChildren')
                }
                lookups.set(hash, f)
            }
            return f
        }
        const read = (node, f) => {
            if (!f || f.offset + elemSize(W, f.type) > node.bytes.length) return null
            return W.value(node.bytes, f.offset, f.type)
        }

        const guids = new Map()
        items.forEach((node, idx) => {
            if (!node) {
                p.slots.push(null)
                return
            }
            const f = fieldsOf(node.hash)
            const pos = read(node, f.pos)
            const e = {
                idx, node,
                arch: (read(node, f.arch) || 0) >>> 0,
                guid: (read(node, f.guid) || 0) >>> 0,
                pos: Array.isArray(pos) ? pos : [0, 0, 0],
                mlo: node.hash === names().mlo,
                key: null, sig: null, gone: false, lite: null
            }
            if ((read(node, f.kids) || 0) > 0) p.lodParents++
            if (e.guid) guids.set(e.guid, (guids.get(e.guid) || 0) + 1)
            p.slots.push(e)
        })

        const occurrences = new Map()
        for (const e of p.slots) {
            if (!e) continue
            if (e.guid && guids.get(e.guid) === 1) {
                e.key = `g${e.guid}`
            } else {
                const base = `a${e.arch}_${Math.round(e.pos[0] * 4)}_${Math.round(e.pos[1] * 4)}`
                const n = occurrences.get(base) || 0
                occurrences.set(base, n + 1)
                e.key = `${base}#${n}`
            }
            e.sig = sha1(nodeSig(tree, e.node, 0))
            e.lite = { a: e.arch, g: e.guid, p: e.pos.slice(0, 3).map(round3), mlo: e.mlo }
            p.lites.push(e.lite)
            p.byKey.set(e.key, e)
        }
        return p
    }

    function hiddenAlone(p, e) {
        const Y = KKCT.ymap
        if (Y && typeof Y.hidden === 'function') return !!Y.hidden(e.lite, p.lites)
        return e.pos[2] < SCREEN
    }

    function sunk(p, e, others) {
        const z = e.pos[2]
        if (z < DEEP) return true
        if (others.length) {
            const sorted = [...others].sort((a, b) => a - b)
            const top = sorted[sorted.length - 1]
            if (top - z > DROP_TOP) return true
            if (z < 0 && sorted[Math.floor(sorted.length / 2)] - z > DROP_MEDIAN) return true
            if (top >= SCREEN) return false
        }
        return hiddenAlone(p, e)
    }

    function views(preps, voters) {
        const holders = new Map()
        for (const p of preps) {
            if (!voters[p.index]) continue
            for (const [key, e] of p.byKey) {
                if (!holders.has(key)) holders.set(key, [])
                holders.get(key).push({ copy: p.index, z: e.pos[2] })
            }
        }
        return preps.map(p => {
            const view = new Map()
            for (const [key, e] of p.byKey) {
                const others = (holders.get(key) || []).filter(h => h.copy !== p.index).map(h => h.z)
                e.gone = sunk(p, e, others)
                view.set(key, { sig: e.sig, gone: e.gone })
            }
            return view
        })
    }

    function extents(tree, sources) {
        const W = KKCT.metawrite
        for (const [name, pickOf] of EXTENTS) {
            let acc = null
            for (const src of sources) {
                const v = W.get(src.tree, src.tree.root, name)
                if (!Array.isArray(v) || v.some(x => !Number.isFinite(x))) continue
                acc = acc ? acc.map((x, i) => pickOf(x, v[i])) : v.slice()
            }
            if (acc) W.set(tree, tree.root, name, acc)
        }
    }

    function merge(copies, policy, opts) {
        const W = KKCT.metawrite
        const list = Array.isArray(copies) ? copies : []
        const referenced = !!(opts && opts.referenced)
        policy = policy === 'union' ? 'union' : 'three-way'
        const preps = list.map(prepare)
        const target = preps.length - 1
        const winner = preps[target]
        const warnings = []
        let vote = null
        let structural = referenced
        let total = 0

        const report = digest => {
            const effective = vote ? vote.effective : (policy === 'union' || preps.filter(p => !p.excluded).length < 3 ? 'union' : 'three-way')
            const totals = vote ? { ...vote.totals, skipped: 0 } : { merged: 0, added: 0, removed: 0, changed: 0, conflicts: 0, unresolved: 0, skipped: 0 }
            return {
                kind: 'entities', policy, effective, total, structural,
                copies: preps.map((p, i) => ({
                    resource: p.resource,
                    ...(vote ? vote.perCopy[i] : { total: p.byKey.size, shared: 0, onlyHere: 0, removed: 0, lost: 0 }),
                    excluded: p.excluded, target: i === target, warnings: p.warnings
                })),
                totals, warnings, digest
            }
        }
        const fail = reason => ({ ok: false, reason, report: report(null) })

        if (!winner || preps.length < 2) return fail(ONE_COPY)
        if (winner.excluded) return fail('the active copy cannot be merged')
        if (winner.entitiesAt < 0) return fail('the active copy has no entity list')

        structural = referenced || preps.some(p => !p.excluded && p.lodParents > 0)
        const order = p => p.slots.map(e => e ? e.guid : 'null').join(',')
        const winnerOrder = structural ? order(winner) : ''
        for (const p of preps) {
            if (p === winner || p.excluded) continue
            if (p.parent !== winner.parent) {
                p.excluded = true
                p.warnings.push('names a different parent ymap than the active copy')
            } else if (structural && order(p) !== winnerOrder) {
                p.excluded = true
                p.warnings.push('entity order differs from the active copy in a LOD parent')
            }
        }

        const voters = preps.map(p => !p.excluded)
        vote = KKCT.mergevote.run({ views: views(preps, voters), voters, policy })
        total = vote.totals.merged
        const usable = preps.filter(p => !p.excluded)
        if (usable.length < 2) return fail(ONE_COPY)

        for (const [name, label] of LISTS) {
            const sigs = new Set(usable.map(p => listSig(p.tree, name)))
            if (sigs.size > 1) warnings.push(`not merged: ${label} differs between copies, kept the active copy`)
        }

        const contributors = new Set()
        const nodeFor = (key, row) => {
            const src = preps[row.pick]
            const e = src && src.byKey.get(key)
            if (!e) return null
            const own = winner.byKey.get(key)
            if (own && own.sig === e.sig) return own.node
            contributors.add(row.pick)
            return W.clone(e.node)
        }

        const items = []
        if (structural) {
            for (const [key, row] of vote.rows) {
                if (!winner.byKey.has(key) && row.result !== 'removed') return fail(LOD_PARENT)
            }
            for (const e of winner.slots) {
                if (!e) {
                    items.push(null)
                    continue
                }
                const row = vote.rows.get(e.key)
                const node = row && row.pick >= 0 ? nodeFor(e.key, row) : null
                if (!node) return fail(LOD_PARENT)
                items.push(node)
            }
        } else {
            for (const e of winner.slots) {
                if (!e) continue
                const row = vote.rows.get(e.key)
                if (!row || row.result === 'removed') continue
                const node = row.pick >= 0 ? nodeFor(e.key, row) : e.node
                items.push(node || e.node)
            }
            const extra = []
            for (const [key, row] of vote.rows) {
                if (winner.byKey.has(key) || row.result === 'removed' || row.pick < 0) continue
                const src = preps[row.pick].byKey.get(key)
                if (src) extra.push({ key, row, copy: row.pick, idx: src.idx })
            }
            extra.sort((a, b) => a.copy - b.copy || a.idx - b.idx)
            for (const x of extra) {
                const node = nodeFor(x.key, x.row)
                if (node) items.push(node)
            }
        }

        const tree = winner.tree
        const sources = [winner]
        for (const p of preps) {
            if (!contributors.has(p.index) || p === winner) continue
            W.adoptInfos(tree, p.tree)
            sources.push(p)
        }
        if (items.length) tree.root.refs.set(winner.entitiesAt, { kind: 'ptrs', items })
        else tree.root.refs.delete(winner.entitiesAt)
        if (sources.length > 1) extents(tree, sources)

        let buf
        try {
            const out = W.write(tree)
            buf = KKCT.rsc7.pack(winner.head, out.systemFlags, out.data)
        } catch (err) {
            return fail(`could not write the merged ymap: ${err.message}`)
        }
        total = items.filter(Boolean).length
        return { ok: true, buf, target, report: report(sha1(buf)) }
    }

    return { merge }
})()
})()
