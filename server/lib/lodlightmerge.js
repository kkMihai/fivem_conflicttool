(() => {
const crypto = require('crypto')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.lodlightmerge = (() => {
    const STREET = 1 << 24
    const LOD_OFFSETS = [8, 24, 40, 56, 72, 88, 104, 120]
    const LOD_WIDTHS = [12, 4, 4, 4, 4, 1, 1, 1]
    const DIST_OFFSETS = [8, 24]
    const DIST_WIDTHS = [12, 4]
    const FLAGS_COLUMN = 3
    const HASH_COLUMN = 4
    const STREET_COUNT = 40
    const ENTITY_MARGIN = 20
    const LOD_MARGIN = 950
    const DIST_MARGIN = 3000
    const WINDOW = 32
    const LOOKAHEAD = 8
    const ONE_COPY = 'only one copy has usable lights'
    const EMPTY = Buffer.alloc(0)

    const sha1 = v => crypto.createHash('sha1').update(v).digest('hex')

    let names = null

    function hashes() {
        if (!names) {
            names = {
                map: KKCT.joaatCase('CMapData'),
                lod: KKCT.joaatCase('CLODLight'),
                dist: KKCT.joaatCase('CDistantLODLight'),
                xyz: KKCT.joaatCase('FloatXYZ')
            }
        }
        return names
    }

    function readSide(buf, structHash, offsets, widths) {
        const W = KKCT.metawrite
        const { map, xyz } = hashes()
        const head = KKCT.rsc7.parse(buf)
        const tree = W.read(head.data)
        if (tree.root.hash !== map) throw new Error('it is not a map file')
        const base = W.offsetOf(tree, tree.root, structHash)
        if (base < 0) throw new Error('it has no light fields')
        const cols = offsets.map((offset, k) => {
            const col = W.column(tree, tree.root, structHash, offset)
            if (!col || col.entry.type !== W.T.ARRAY || !col.elem) throw new Error(`the light field at ${offset} is missing`)
            const isStruct = col.elem.type === W.T.STRUCT
            const si = isStruct ? W.info(tree, col.elem.refKey) : null
            const width = isStruct ? (si ? si.size : col.elem.refKey === xyz ? 12 : 0) : W.PRIM[col.elem.type] || 0
            if (width !== widths[k] || isStruct !== (widths[k] === 12)) throw new Error(`the light field at ${offset} has an unexpected layout`)
            if (col.ref && col.ref.kind !== (isStruct ? 'structs' : 'prims')) throw new Error(`the light field at ${offset} has an unexpected layout`)
            const raw = col.ref ? col.ref.raw : EMPTY
            return { at: col.at, elem: col.elem, width, raw, count: Math.floor(raw.length / width) }
        })
        return { head, tree, base, cols }
    }

    function readDist(buf) {
        const W = KKCT.metawrite
        const side = readSide(buf, hashes().dist, DIST_OFFSETS, DIST_WIDTHS)
        const e = W.entryAt(side.tree, hashes().dist, STREET_COUNT)
        if (!e || W.PRIM[e.type] !== 2) throw new Error('the street light count field is missing')
        side.streetType = e.type
        side.street = W.value(side.tree.root.bytes, side.base + STREET_COUNT, e.type)
        return side
    }

    function keyRows(cols, n) {
        const out = new Array(n)
        for (let i = 0; i < n; i++) {
            let key = ''
            for (const col of cols) key += col.raw.toString('latin1', i * col.width, (i + 1) * col.width)
            out[i] = key
        }
        return out
    }

    function inspect(copy, index) {
        const c = {
            index, resource: String((copy && copy.resource) || ''), lod: null, dist: null,
            L: 0, D: 0, hashes: [], lodKeys: [], distKeys: [], rowOf: new Map(), where: new Map(),
            pair: null, fills: new Map(), misplaced: 0, excluded: false, reason: null, warnings: []
        }
        const fail = reason => {
            if (c.excluded) return
            c.excluded = true
            c.reason = reason
            c.warnings.push(reason)
        }
        const hasLod = !!(copy && copy.lod)
        const hasDist = !!(copy && copy.dist)
        let lodError = null
        let distError = null
        if (hasLod) {
            try { c.lod = readSide(copy.lod, hashes().lod, LOD_OFFSETS, LOD_WIDTHS) } catch (e) { lodError = e }
        }
        if (hasDist) {
            try { c.dist = readDist(copy.dist) } catch (e) { distError = e }
        }
        if (!hasLod && !hasDist) fail('ships no light files')
        else if (!hasLod) fail('ships the dist file without its lod file')
        else if (!hasDist) fail('ships the lod file without its dist file')
        if (lodError) fail(`the lod file does not read: ${lodError.message}`)
        if (distError) fail(`the dist file does not read: ${distError.message}`)

        let lodOk = false
        let distOk = false
        if (c.lod) {
            const counts = c.lod.cols.map(col => col.count)
            if (counts.some(n => n !== counts[0])) {
                fail(`the lod columns have different lengths (${counts.join('/')})`)
            } else {
                lodOk = true
                c.L = counts[0]
                const col = c.lod.cols[HASH_COLUMN]
                for (let i = 0; i < c.L; i++) {
                    const h = col.raw.readUInt32LE(i * 4)
                    c.hashes.push(h)
                    if (!c.rowOf.has(h)) c.rowOf.set(h, i)
                }
                c.lodKeys = keyRows(c.lod.cols, c.L)
                if (c.rowOf.size !== c.L) fail(`the lod file repeats ${c.L - c.rowOf.size} light hashes`)
            }
        }
        if (c.dist) {
            const [position, rgbi] = c.dist.cols
            if (position.count !== rgbi.count) {
                fail(`the dist file has ${position.count} positions but ${rgbi.count} colours`)
            } else {
                distOk = true
                c.D = position.count
                c.distKeys = keyRows(c.dist.cols, c.D)
                c.distKeys.forEach((key, j) => {
                    const list = c.where.get(key)
                    if (list) list.push(j)
                    else c.where.set(key, [j])
                })
            }
        }
        if (lodOk && distOk) {
            if (!c.L && !c.D) c.warnings.push('ships an empty pair, Keep all brings back the lights it removed')
            else if (!c.L) fail(`lod has 0 lights but dist has ${c.D}`)
            else if (!c.D) fail(`dist has 0 lights but lod has ${c.L}`)
            const flags = c.lod.cols[FLAGS_COLUMN].raw
            let flagged = 0
            let outside = 0
            for (let i = 0; i < c.L; i++) {
                if (!(flags.readUInt32LE(i * 4) & STREET)) continue
                flagged++
                if (i >= c.dist.street) outside++
            }
            if (flagged !== c.dist.street || outside) {
                c.warnings.push(`numStreetLights says ${c.dist.street} but ${flagged} lights are street lights`)
            }
        }
        c.usable = lodOk && distOk && !c.excluded
        return c
    }

    function identity(c) {
        const pair = new Int32Array(c.L).fill(-1)
        for (let i = 0; i < c.L && i < c.D; i++) pair[i] = i
        return pair
    }

    function naive(c) {
        const ref = new Map()
        for (let i = 0; i < c.L && i < c.D; i++) ref.set(c.hashes[i], c.distKeys[i])
        return ref
    }

    function ownersOf(ref) {
        const owners = new Map()
        for (const [h, key] of ref) {
            const list = owners.get(key)
            if (list) list.push(h)
            else owners.set(key, [h])
        }
        return owners
    }

    function claimed(c, owners, key) {
        const list = owners.get(key)
        return !!list && list.some(h => !c.rowOf.has(h))
    }

    function settle(c, owners, pair, anchor, i, d, best) {
        const gap = i - anchor - 1
        if (!gap) return 0
        const extra = []
        for (let q = anchor + 1 + d; q < i + best && q < c.D; q++) {
            if (claimed(c, owners, c.distKeys[q])) extra.push(q)
        }
        if (extra.length !== best - d) return gap
        let off = d
        let n = 0
        const target = k => {
            while (n < extra.length && extra[n] <= k + off) {
                off++
                n++
            }
            return k + off
        }
        const next = []
        for (let k = anchor + 1; k < i; k++) next.push(target(k))
        if (target(i) !== i + best) return gap
        next.forEach((j, k) => { pair[anchor + 1 + k] = j < c.D ? j : -1 })
        return 0
    }

    function walk(c, ref, owners) {
        const { hashes: H, distKeys: P, L, D } = c
        const pair = new Int32Array(L).fill(-1)
        let d = 0
        let bumps = 0
        let uncertain = 0
        let anchor = -1
        const score = (from, off) => {
            let hits = 0
            let seen = 0
            for (let k = from; k < L && seen < LOOKAHEAD; k++) {
                const r = ref.get(H[k])
                if (r === undefined) continue
                seen++
                if (P[k + off] === r) hits++
            }
            return hits
        }
        for (let i = 0; i < L; i++) {
            const r = ref.get(H[i])
            if (r !== undefined) {
                if (P[i + d] === r) {
                    anchor = i
                } else {
                    let best = d
                    let bestScore = score(i, d)
                    for (const j of c.where.get(r) || []) {
                        const off = j - i
                        if (off === d || Math.abs(off - d) > WINDOW) continue
                        const s = score(i, off)
                        if (s > bestScore || (s === bestScore && best !== d && Math.abs(off - d) < Math.abs(best - d))) {
                            best = off
                            bestScore = s
                        }
                    }
                    if (best !== d) {
                        bumps++
                        if (best > d) {
                            uncertain += settle(c, owners, pair, anchor, i, d, best)
                        } else {
                            uncertain += i - anchor - 1
                            for (let k = i - 1; k >= 0 && pair[k] >= i + best; k--) {
                                if (k <= anchor) uncertain++
                                pair[k] = -1
                            }
                        }
                        d = best
                        anchor = i
                    }
                }
            }
            const j = i + d
            if (j >= 0 && j < D) pair[i] = j
        }
        return { pair, bumps, uncertain }
    }

    function review(c, ref, pair) {
        const owner = new Int32Array(c.D).fill(-1)
        for (let i = 0; i < c.L; i++) {
            if (pair[i] >= 0) owner[pair[i]] = i
        }
        let known = 0
        let residual = 0
        for (let i = 0; i < c.L; i++) {
            const r = ref.get(c.hashes[i])
            if (r === undefined) continue
            known++
            const j = pair[i]
            if (j >= 0 && c.distKeys[j] === r) continue
            const spots = c.where.get(r) || []
            if (spots.some(k => k !== j && (owner[k] < 0 || ref.get(c.hashes[owner[k]]) !== r))) residual++
        }
        let used = 0
        for (let j = 0; j < c.D; j++) {
            if (owner[j] >= 0) used++
        }
        let paired = 0
        for (let i = 0; i < c.L; i++) {
            if (pair[i] >= 0) paired++
        }
        return { known, residual, orphanLod: c.L - paired, orphanDist: c.D - used }
    }

    function cross(c, ref, owners) {
        let n = 0
        for (let i = 0; i < c.L; i++) {
            const j = c.pair[i]
            const r = ref.get(c.hashes[i])
            if (j < 0 || r === undefined || c.distKeys[j] === r || !claimed(c, owners, c.distKeys[j])) continue
            c.pair[i] = -1
            c.fills.set(i, r)
            n++
        }
        return n
    }

    function largestCliques(n, linked) {
        let size = 0
        let found = []
        const set = []
        const grow = from => {
            if (set.length > size) {
                size = set.length
                found = []
            }
            if (size && set.length === size) found.push(set.slice())
            for (let k = from; k < n; k++) {
                if (set.every(s => linked[s][k])) {
                    set.push(k)
                    grow(k + 1)
                    set.pop()
                }
            }
        }
        grow(0)
        return found
    }

    function consensus(trusted) {
        const votes = new Map()
        for (const c of trusted) {
            for (let i = 0; i < c.L && i < c.D; i++) {
                let m = votes.get(c.hashes[i])
                if (!m) votes.set(c.hashes[i], m = new Map())
                m.set(c.distKeys[i], (m.get(c.distKeys[i]) || 0) + 1)
            }
        }
        const ref = new Map()
        for (const [h, m] of votes) {
            let total = 0
            for (const n of m.values()) total += n
            for (const [key, n] of m) {
                if (n * 2 > total) ref.set(h, key)
            }
        }
        return ref
    }

    function lineUp(list) {
        const cands = list.filter(c => c.usable && c.L && c.L === c.D)
        const linked = cands.map(() => new Array(cands.length).fill(false))
        const clashes = cands.map(() => [])
        const clean = (x, y) => {
            const ref = naive(y)
            const w = walk(x, ref, ownersOf(ref))
            return !w.bumps && !review(x, ref, w.pair).residual
        }
        for (let a = 0; a < cands.length; a++) {
            linked[a][a] = true
            for (let b = a + 1; b < cands.length; b++) {
                const ok = clean(cands[a], cands[b]) && clean(cands[b], cands[a])
                linked[a][b] = linked[b][a] = ok
                if (!ok) {
                    clashes[a].push(cands[b].resource)
                    clashes[b].push(cands[a].resource)
                }
            }
        }
        const found = largestCliques(cands.length, linked)
        const inAll = new Set(found.length ? found[0] : [])
        const inAny = new Set()
        for (const set of found) {
            for (const k of set) inAny.add(k)
            for (const k of [...inAll]) {
                if (!set.includes(k)) inAll.delete(k)
            }
        }
        const trusted = []
        cands.forEach((c, k) => {
            if (inAll.has(k)) {
                trusted.push(c)
                c.pair = identity(c)
            } else if (inAny.has(k)) {
                c.usable = false
                c.excluded = true
                c.reason = `its lights do not line up with ${clashes[k].join(', ')}, so it is unclear which copy is right`
                c.warnings.push(c.reason)
            }
        })
        const ref = consensus(trusted)
        const owners = ownersOf(ref)
        for (const c of list) {
            if (c.pair || !c.L || !c.D) continue
            if (!ref.size) {
                if (c.usable) {
                    c.usable = false
                    c.excluded = true
                    c.reason = 'its lod and dist files have different light counts and no other copy lines up'
                    c.warnings.push(c.reason)
                }
                continue
            }
            const w = walk(c, ref, owners)
            c.pair = w.pair
            let last = c.L - 1
            while (last >= 0 && c.pair[last] < 0) last--
            for (let i = last + 1; i < c.L; i++) {
                const key = ref.get(c.hashes[i])
                if (key !== undefined) c.fills.set(i, key)
            }
            const tail = c.fills.size
            const crossed = cross(c, ref, owners)
            const r = review(c, ref, c.pair)
            for (let i = 0; i < c.L; i++) {
                if (c.pair[i] !== (i < c.D ? i : -1)) c.misplaced++
            }
            if (!c.usable) continue
            if (!r.known && c.L !== c.D) {
                c.usable = false
                c.excluded = true
                c.reason = 'its lod and dist files have different light counts and share no lights with the other copies'
            } else if (r.residual || w.uncertain) {
                c.usable = false
                c.excluded = true
                c.reason = `its lod and dist rows are shifted and ${r.residual + w.uncertain} lights could not be lined up`
            }
            if (c.excluded) {
                c.warnings.push(c.reason)
                continue
            }
            if (c.misplaced) c.warnings.push(`its lod and dist rows were shifted, ${c.misplaced} lights were paired again`)
            if (r.orphanDist) c.warnings.push(`${r.orphanDist} dist rows have no lod light and were dropped`)
            if (tail) c.warnings.push(`its dist file is cut short, ${tail} lights took their position from the other copies`)
            if (crossed) c.warnings.push(`${crossed} lights sat on the position of a light it removed and got their own position back`)
            if (r.orphanLod > c.fills.size) c.warnings.push(`${r.orphanLod - c.fills.size} lod lights have no dist row and were dropped`)
        }
        return ref
    }

    function distKeyOf(c, i) {
        const j = c.pair ? c.pair[i] : i < c.D ? i : -1
        return j >= 0 ? c.distKeys[j] : c.fills.get(i)
    }

    function viewOf(c) {
        const view = new Map()
        for (let i = 0; i < c.L; i++) {
            const key = distKeyOf(c, i)
            if (key === undefined || view.has(c.hashes[i])) continue
            view.set(c.hashes[i], { sig: c.lodKeys[i] + key, gone: false })
        }
        return view
    }

    function gather(items, widths, pick) {
        const bufs = widths.map(width => Buffer.alloc(items.length * width))
        items.forEach((it, n) => {
            const row = Buffer.from(pick(it), 'latin1')
            let at = 0
            widths.forEach((width, k) => {
                row.copy(bufs[k], n * width, at, at + width)
                at += width
            })
        })
        return bufs
    }

    function fill(side, datas, count) {
        const W = KKCT.metawrite
        side.cols.forEach((col, k) => {
            if (!count) side.tree.root.refs.delete(col.at)
            else if (col.elem.type === W.T.STRUCT) side.tree.root.refs.set(col.at, W.structs(col.elem.refKey, datas[k]))
            else side.tree.root.refs.set(col.at, W.prims(col.elem.type, datas[k]))
        })
    }

    function adopt(side, list) {
        const W = KKCT.metawrite
        for (const col of side.cols) {
            if (col.elem.type !== W.T.STRUCT || W.info(side.tree, col.elem.refKey)) continue
            for (let i = list.length - 1; i >= 0 && !W.info(side.tree, col.elem.refKey); i--) {
                for (const other of [list[i].lod, list[i].dist]) {
                    if (other && W.info(other.tree, col.elem.refKey)) {
                        W.adoptInfos(side.tree, other.tree)
                        break
                    }
                }
            }
            if (!W.info(side.tree, col.elem.refKey)) throw new Error('no copy has the light position layout')
        }
    }

    function extents(side, lo, hi, margin) {
        const W = KKCT.metawrite
        const { tree } = side
        W.set(tree, tree.root, 'entitiesExtentsMin', lo.map(v => v - ENTITY_MARGIN))
        W.set(tree, tree.root, 'entitiesExtentsMax', hi.map(v => v + ENTITY_MARGIN))
        W.set(tree, tree.root, 'streamingExtentsMin', lo.map(v => v - margin))
        W.set(tree, tree.root, 'streamingExtentsMax', hi.map(v => v + margin))
    }

    function pack(side) {
        const out = KKCT.metawrite.write(side.tree)
        return KKCT.rsc7.pack(side.head, out.systemFlags, out.data)
    }

    function merge(copies, policy) {
        const mode = policy === 'union' ? 'union' : 'three-way'
        const input = Array.isArray(copies) ? copies : []
        const report = {
            kind: 'lodlights', policy: mode, effective: 'union', total: 0, street: 0,
            copies: [], totals: { merged: 0, added: 0, removed: 0, changed: 0, conflicts: 0, unresolved: 0 },
            warnings: [], digest: null
        }
        const failed = reason => ({ ok: false, reason, report })
        try {
            const list = input.map(inspect)
            lineUp(list)
            const voters = list.map(c => c.usable)
            const count = voters.filter(Boolean).length
            const views = list.map(c => c.L && c.D ? viewOf(c) : new Map())
            const vote = KKCT.mergevote.run({ views, voters, policy: mode })
            const lodTarget = list.reduce((t, c, i) => c.lod ? i : t, -1)
            const distTarget = list.reduce((t, c, i) => c.dist ? i : t, -1)
            const winner = list[list.length - 1]

            report.effective = vote.effective
            report.copies = list.map((c, i) => ({
                resource: c.resource,
                ...(vote.perCopy[i] || { total: 0, shared: 0, onlyHere: 0, removed: 0, lost: 0 }),
                excluded: !c.usable,
                target: i === lodTarget || i === distTarget,
                warnings: c.warnings
            }))
            if (winner && winner.excluded) {
                report.warnings.push(`the selected base copy ${winner.resource} is left out: ${winner.reason}`)
            }
            if (winner && winner.misplaced) {
                report.warnings.push(`the selected base copy ${winner.resource} is misaligned, ${winner.misplaced} lights need pairing`)
            }
            if (!list.length) return failed('there are no copies to merge')
            if (lodTarget < 0) return failed('no copy has a readable lod file')
            if (distTarget < 0) return failed('no copy has a readable dist file')
            if (count < 2) return failed(ONE_COPY)
            if (mode === 'three-way' && vote.effective === 'union') {
                report.warnings.push(`only ${count} copies can vote, so Majority keeps every light`)
            }

            const items = []
            for (const [hash, row] of vote.rows) {
                if (row.result === 'removed' || row.pick < 0) continue
                const c = list[row.pick]
                const i = c.rowOf.get(hash)
                const street = c.lod.cols[FLAGS_COLUMN].raw.readUInt32LE(i * 4) & STREET ? 1 : 0
                items.push({ hash, street, lodKey: c.lodKeys[i], distKey: distKeyOf(c, i) })
            }
            items.sort((a, b) => (b.street - a.street) || (a.hash - b.hash))
            const street = items.filter(it => it.street).length

            const lodSide = list[lodTarget].lod
            const distSide = list[distTarget].dist
            if (items.length) {
                adopt(lodSide, list)
                adopt(distSide, list)
            }
            fill(lodSide, gather(items, LOD_WIDTHS, it => it.lodKey), items.length)
            fill(distSide, gather(items, DIST_WIDTHS, it => it.distKey), items.length)
            KKCT.metawrite.store(distSide.tree.root.bytes, distSide.base + STREET_COUNT, distSide.streetType, street)

            if (items.length) {
                const lo = [Infinity, Infinity, Infinity]
                const hi = [-Infinity, -Infinity, -Infinity]
                for (const it of items) {
                    const row = Buffer.from(it.distKey, 'latin1')
                    for (let a = 0; a < 3; a++) {
                        const v = row.readFloatLE(a * 4)
                        if (v < lo[a]) lo[a] = v
                        if (v > hi[a]) hi[a] = v
                    }
                }
                if (lo.every(Number.isFinite) && hi.every(Number.isFinite)) {
                    extents(lodSide, lo, hi, LOD_MARGIN)
                    extents(distSide, lo, hi, DIST_MARGIN)
                }
            }

            const lod = pack(lodSide)
            const dist = pack(distSide)
            report.total = items.length
            report.street = street
            report.totals = vote.totals
            report.digest = sha1(Buffer.concat([lod, dist]))
            return { ok: true, lod, dist, lodTarget, distTarget, report }
        } catch (e) {
            return failed(`the lights could not be merged: ${e.message}`)
        }
    }

    return { merge }
})()
})()
