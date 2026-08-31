(() => {
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.conflicts = (() => {
    let vanillaSet = null

    function loadVanilla(rootDir) {
        if (vanillaSet) return
        vanillaSet = new Set()
        try {
            const p = path.join(rootDir, 'server', 'data', 'vanilla-files.json.gz')
            if (fs.existsSync(p)) {
                const list = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'))
                for (const n of list) vanillaSet.add(String(n).toLowerCase())
            }
        } catch (e) {
            console.log(`[fivem_conflicttool] vanilla index load failed: ${e.message}`)
        }
    }

    const short = h => (h || '').slice(0, 8)

    const byResource = (a, b) => (a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0)
    const rpos = p => `${Math.round(p[0] * 4)}_${Math.round(p[1] * 4)}_${Math.round(p[2] * 4)}`
    const center = ext => ext ? [(ext.min[0] + ext.max[0]) / 2, (ext.min[1] + ext.max[1]) / 2, (ext.min[2] + ext.max[2]) / 2] : null

    function ymapPos(parsed) {
        if (!parsed) return null
        if (parsed.entitiesExtents) return center(parsed.entitiesExtents)
        if (parsed.streamingExtents) return center(parsed.streamingExtents)
        if (parsed.boxOccluders && parsed.boxOccluders.length) return parsed.boxOccluders[0].c
        return null
    }

    function entKey(e) {
        if (e.g) return `g${e.g}`
        return `a${e.a}_${Math.round(e.p[0] * 4)}_${Math.round(e.p[1] * 4)}_${Math.round(e.p[2] * 4)}`
    }

    function quatDot(a, b) {
        return Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
    }

    const HIDDEN_DROP = 200
    const HIDDEN_DEEP = -5000
    const HIDDEN_SCREEN = -250
    const NEIGHBOUR_R2 = 150 * 150

    const hiddenCache = new WeakMap()

    function hiddenEntity(e, entities) {
        if (e.p[2] < HIDDEN_DEEP) return true
        if (e.p[2] >= HIDDEN_SCREEN) return false
        if (!entities) return false
        let seen = hiddenCache.get(entities)
        if (!seen) {
            seen = new Map()
            hiddenCache.set(entities, seen)
        }
        const key = `${e.a}_${e.g}_${rpos(e.p)}`
        const memo = seen.get(key)
        if (memo !== undefined) return memo
        const near = []
        for (const o of entities) {
            if (o === e || o.mlo) continue
            const dx = o.p[0] - e.p[0], dy = o.p[1] - e.p[1]
            if (dx * dx + dy * dy <= NEIGHBOUR_R2) near.push(o.p[2])
        }
        let result = false
        if (near.length) {
            near.sort((a, b) => a - b)
            result = near[Math.floor(near.length / 2)] - e.p[2] > HIDDEN_DROP
        }
        seen.set(key, result)
        return result
    }

    function dist3(a, b) {
        const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
        return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }

    function detect(index, resources, kinds) {
        const out = []
        let seq = 0
        const nid = p => `${p}_${++seq}`
        const resolveName = h => KKCT.names.resolve(h)

        const allOccluders = []
        const uniqueEntities = []
        const ytypWinners = []
        const archPos = new Map()

        for (const [, entries] of index) {
            for (const entry of entries) {
                if (entry.ext !== 'ymap' || !entry.parsed) continue
                for (const e of entry.parsed.entities || []) {
                    if (!archPos.has(e.a)) archPos.set(e.a, e.p)
                }
            }
        }

        for (const [key, entries] of index) {
            const sorted = [...entries].sort((a, b) =>
                ((a.inStream ? 1 : 0) - (b.inStream ? 1 : 0)) || byResource(a, b) || (a.order - b.order))
            const winner = sorted[sorted.length - 1]
            if (winner.ext === 'ymap' && winner.parsed) {
                for (const b of winner.parsed.boxOccluders || []) {
                    allOccluders.push({ resource: winner.resource, file: key, rel: winner.rel, bi: b.bi, c: b.c, l: b.l, w: b.w, h: b.h, cz: b.cz, sz: b.sz })
                }
            }
            if (winner.ext === 'ytyp' && winner.parsed) {
                ytypWinners.push({ file: key, resource: winner.resource, order: winner.order, archetypes: winner.parsed.archetypes || [] })
            }
            if (entries.length < 2) {
                if (winner.ext === 'ymap' && winner.parsed && winner.parsed.entities.length) {
                    for (const e of winner.parsed.entities) {
                        if (!e.mlo) uniqueEntities.push({ res: winner.resource, file: key, e, all: winner.parsed.entities })
                    }
                }
                continue
            }

            const versions = new Set(sorted.map(e => e.sha1)).size
            const identical = versions === 1
            const vanilla = vanillaSet ? vanillaSet.has(key) : false
            const hasErrors = sorted.some(e => e.parseError)
            const losers = sorted.slice(0, -1)
            const ext = winner.ext

            let cat = 'asset'
            if (ext === 'ybn') cat = 'coll'
            else if (ext === 'ymap' && winner.parsed && !winner.parsed.entities.length && (winner.parsed.boxOccluders.length || winner.parsed.occludeModels.length)) cat = 'occl'
            else if (key.includes('occl')) cat = 'occl'

            const resCount = new Set(sorted.map(e => e.resource)).size
            const deadCount = winner.inStream ? sorted.filter(e => !e.inStream).length : 0
            const badges = [`${sorted.length} scripts · ${versions} version${versions > 1 ? 's' : ''}`]
            if (deadCount) badges.push(`${deadCount} cop${deadCount > 1 ? 'ies' : 'y'} outside stream`)
            if (ext === 'ytd') badges.push('texture dict')
            let staleLod = false
            if (ext === 'ymap' && !identical && winner.parsed) {
                const lp = losers.find(l => l.parsed)
                if (lp && lp.parsed.entities.length === winner.parsed.entities.length && winner.parsed.entities.length > 0) {
                    const wl = winner.parsed.entities.map(e => `${e.ld}_${e.cld}_${e.ll}`).join('|')
                    const ll = lp.parsed.entities.map(e => `${e.ld}_${e.cld}_${e.ll}`).join('|')
                    if (wl !== ll) staleLod = true
                }
                if (key.includes('lodlight')) staleLod = true
            }
            if (staleLod) badges.push('stale LOD')
            if (hasErrors) badges.push('FILES UNAVAILABLE')

            let pos = null
            if (ext === 'ymap') pos = ymapPos(winner.parsed || (losers.find(l => l.parsed) || {}).parsed)
            else if (ext === 'ybn' && winner.parsed) pos = [(winner.parsed.bmin[0] + winner.parsed.bmax[0]) / 2, (winner.parsed.bmin[1] + winner.parsed.bmax[1]) / 2, (winner.parsed.bmin[2] + winner.parsed.bmax[2]) / 2]
            else if (ext === 'ydr' || ext === 'ydd' || ext === 'yft') pos = archPos.get(KKCT.joaat(key.replace(/\.[^.]+$/, ''))) || null

            const summary = resCount === 1
                ? `${winner.resource} ships ${sorted.length} copies of ${key}. Only the streamed copy loads in game, the rest sit unused in the resource folder.`
                : identical
                    ? `${sorted.length} resources ship an identical copy of ${key}. Only one is needed, the rest waste memory and load time.`
                    : ext === 'ytd'
                        ? `${sorted.length} resources ship different versions of texture dictionary ${key}. Only the last loaded wins, so models using it can show the wrong textures.`
                        : `${sorted.length} resources ship different versions of ${key}. Map files override by name, so only the copy that registers last takes effect.`
            const note = vanilla
                ? 'This file overrides a vanilla GTA map file. Removing every copy restores the base game.'
                : resCount === 1
                    ? 'Both copies sit in one resource, so which one the game picks is decided when the resource is packed, not by load order.'
                    : 'The game registers streaming files in resource name order and the last one overrides the rest, so the copy shown as active is the one players get. Restarting a resource while the server runs re-registers it and hands it the win instead.'

            out.push({
                id: nid(cat === 'coll' ? 'c_coll' : cat === 'occl' ? 'c_occl' : 'c_asset'),
                key: `dup|${key}|${sorted.map(s => s.resource).sort().join('+')}`,
                cat,
                sev: cat === 'coll' ? 'high' : 'medium',
                kind: 'dup-file',
                title: key,
                sub: resCount === 1 ? `${winner.resource} · internal copies` : sorted.map(s => s.resource).join(' vs '),
                file: key,
                badges,
                vanilla,
                pos,
                autoRes: identical ? 'assets' : (vanilla && cat !== 'coll' ? 'assets' : null),
                resources: sorted.map((s, i) => ({
                    name: s.resource,
                    rel: s.rel,
                    size: s.size,
                    sha1: short(s.sha1),
                    fullSha1: s.sha1,
                    status: i === sorted.length - 1
                        ? 'registers last · active'
                        : (winner.inStream && !s.inStream
                            ? 'never loads · outside stream'
                            : (identical ? 'identical copy' : 'overridden'))
                })),
                entity: null,
                target: null,
                near: null,
                boxes: cat === 'occl' && winner.parsed && winner.parsed.boxOccluders && winner.parsed.boxOccluders.length
                    ? winner.parsed.boxOccluders.slice(0, 60)
                    : null,
                explain: { summary, note },
                suggested: { action: 'disable', losers: losers.map(l => ({ resource: l.resource, rel: l.rel, sha1: l.sha1 })) }
            })

            if (ext === 'ymap' && !identical && winner.parsed) {
                for (const loser of losers) {
                    if (!loser.parsed) continue
                    diffEntities(key, winner, loser)
                }
            }
        }

        function diffEntities(key, winner, loser) {
            const wMap = new Map()
            for (const e of winner.parsed.entities) wMap.set(entKey(e), e)
            const lMap = new Map()
            for (const e of loser.parsed.entities) lMap.set(entKey(e), e)
            let emitted = 0
            for (const [k, le] of lMap) {
                if (emitted >= 300 || out.length > 1800) break
                const we = wMap.get(k)
                const name = resolveName(le.a)
                if (!we) {
                    emitted++
                    out.push(entityConflict(nid('c_prop'), key, name, le, {
                        kind: 'entity-removed',
                        lines: [
                            { res: winner.resource, status: 'removed it', bad: true },
                            { res: loser.resource, status: 'ships it unchanged', bad: false }
                        ],
                        summary: `${winner.resource} removed this object from ${key}, but ${loser.resource} still ships the original file that places it.`,
                        winner, loser, target: null, hidden: hiddenEntity(le, loser.parsed.entities)
                    }))
                } else if (le.g && we.g === le.g && we.a !== le.a) {
                    emitted++
                    out.push(entityConflict(nid('c_prop'), key, name, le, {
                        kind: 'entity-retyped',
                        lines: [
                            { res: winner.resource, status: `re-modelled it as ${resolveName(we.a)}`, bad: true },
                            { res: loser.resource, status: `still places the original ${name}`, bad: false }
                        ],
                        summary: `${winner.resource} replaced this object with a different model (${name} -> ${resolveName(we.a)}), but ${loser.resource} still places the original.`,
                        winner, loser, target: { pos: we.p, rot: we.r, model: we.a },
                        hidden: hiddenEntity(we, winner.parsed.entities) && hiddenEntity(le, loser.parsed.entities)
                    }))
                } else if (dist3(we.p, le.p) > 0.05 || quatDot(we.r, le.r) < 0.9999) {
                    emitted++
                    const wHid = hiddenEntity(we, winner.parsed.entities)
                    const lHid = hiddenEntity(le, loser.parsed.entities)
                    out.push(entityConflict(nid('c_prop'), key, name, le, {
                        kind: 'entity-moved',
                        lines: [
                            { res: winner.resource, status: wHid ? 'hides it under the map' : `moved it ${dist3(we.p, le.p).toFixed(2)}m`, bad: true },
                            { res: loser.resource, status: lHid ? 'hides it under the map' : 'ships the original position', bad: !!lHid }
                        ],
                        summary: wHid
                            ? `${winner.resource} hides this object far under the map, but ${loser.resource} still places it in the open. Which one you see depends on load order.`
                            : lHid
                              ? `${loser.resource} hides this object far under the map, but ${winner.resource} places it in the open. Which one you see depends on load order.`
                              : `${winner.resource} moved this object, but ${loser.resource} still ships the original placement. Which one you see depends on load order.`,
                        winner, loser, target: { pos: we.p, rot: we.r, model: we.a }, hidden: wHid && lHid
                    }))
                }
            }
        }

        function entityConflict(id, file, name, e, opts) {
            return {
                id,
                key: `${opts.kind}|${file}|${e.g ? `g${e.g}` : `${e.a}@${rpos(e.p)}`}|${opts.winner.resource}+${opts.loser.resource}`,
                cat: 'prop',
                sev: 'cosmetic',
                kind: opts.kind,
                title: name,
                sub: `${opts.winner.resource} vs ${opts.loser.resource}`,
                file,
                badges: [`${opts.winner.resource} ${opts.kind === 'entity-removed' ? 'removed' : opts.kind === 'entity-moved' ? 'moved' : 'changed'} · 1 unchanged`],
                vanilla: vanillaSet ? vanillaSet.has(file) : false,
                hidden: !!opts.hidden,
                pos: opts.target && dist3(opts.target.pos, e.p) <= 100 ? opts.target.pos : e.p,
                autoRes: null,
                resources: [
                    { name: opts.winner.resource, rel: opts.winner.rel, size: opts.winner.size, sha1: short(opts.winner.sha1), status: opts.lines[0].status },
                    { name: opts.loser.resource, rel: opts.loser.rel, size: opts.loser.size, sha1: short(opts.loser.sha1), status: opts.lines[1].status }
                ],
                entity: { model: e.a, name, guid: e.g, pos: e.p, rot: e.r, radius: 0.5 },
                target: opts.target,
                near: null,
                explain: {
                    summary: opts.summary,
                    note: 'Map files override by name, so only the script loaded last takes effect.'
                },
                suggested: { action: 'keep', losers: [] }
            }
        }

        const grid = new Map()
        const cell = p => `${Math.floor(p[0] / 2)}_${Math.floor(p[1] / 2)}_${Math.floor(p[2] / 4)}`
        for (const u of uniqueEntities) {
            const k = `${u.e.a}_${cell(u.e.p)}`
            if (!grid.has(k)) grid.set(k, [])
            grid.get(k).push(u)
        }
        let spatialCount = 0
        for (const [, group] of grid) {
            if (spatialCount >= 200 || out.length > 1900) break
            if (group.length < 2) continue
            for (let i = 0; i < group.length && spatialCount < 200; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    const a = group[i], b = group[j]
                    if (a.res === b.res) continue
                    if (dist3(a.e.p, b.e.p) > 0.5) continue
                    spatialCount++
                    const name = resolveName(a.e.a)
                    const later = a.file > b.file ? a : b
                    out.push({
                        id: nid('c_prop'),
                        key: `spatial|${a.e.a}|${rpos(a.e.p)}|${[a.res, b.res].sort().join('+')}`,
                        cat: 'prop',
                        sev: 'cosmetic',
                        kind: 'spatial-dup',
                        title: name,
                        sub: `${a.res} vs ${b.res}`,
                        file: `${a.file} + ${b.file}`,
                        badges: ['double placement'],
                        vanilla: false,
                        hidden: hiddenEntity(a.e, a.all) && hiddenEntity(b.e, b.all),
                        pos: a.e.p,
                        autoRes: 'props',
                        resources: [
                            { name: a.res, rel: a.file, size: 0, sha1: '', status: 'places it' },
                            { name: b.res, rel: b.file, size: 0, sha1: '', status: 'places it too' }
                        ],
                        entity: { model: a.e.a, name, guid: later.e.g, pos: later.e.p, rot: later.e.r, radius: 0.5 },
                        target: null,
                        near: null,
                        explain: {
                            summary: `${a.res} and ${b.res} both place ${name} at the same spot in different ymaps. The models z-fight and double the cost.`,
                            note: 'Removing one instance is safe, they are duplicates.'
                        },
                        suggested: { action: 'remove', losers: [] }
                    })
                    break
                }
            }
        }

        const OCELL = 150
        const occlGrid = new Map()
        for (let i = 0; i < allOccluders.length; i++) {
            const o = allOccluders[i]
            o.rad = Math.hypot(o.l || 0, o.w || 0) / 2
            const k = `${Math.floor(o.c[0] / OCELL)}_${Math.floor(o.c[1] / OCELL)}`
            if (!occlGrid.has(k)) occlGrid.set(k, [])
            occlGrid.get(k).push(i)
        }
        const occlNeighbors = i => {
            const a = allOccluders[i]
            const cx = Math.floor(a.c[0] / OCELL), cy = Math.floor(a.c[1] / OCELL)
            const list = []
            for (let gx = cx - 1; gx <= cx + 1; gx++) {
                for (let gy = cy - 1; gy <= cy + 1; gy++) {
                    const cellArr = occlGrid.get(`${gx}_${gy}`)
                    if (cellArr) list.push(...cellArr)
                }
            }
            return list
        }
        const occlParent = allOccluders.map((_, i) => i)
        const occlFind = i => {
            while (occlParent[i] !== i) {
                occlParent[i] = occlParent[occlParent[i]]
                i = occlParent[i]
            }
            return i
        }
        const occlTouch = (a, b) => {
            const dx = a.c[0] - b.c[0], dy = a.c[1] - b.c[1]
            const rr = a.rad + b.rad
            if (dx * dx + dy * dy > rr * rr) return false
            return Math.abs(a.c[2] - b.c[2]) <= (a.h + b.h) / 2
        }
        for (let i = 0; i < allOccluders.length; i++) {
            for (const j of occlNeighbors(i)) {
                if (j <= i) continue
                if (occlTouch(allOccluders[i], allOccluders[j])) {
                    occlParent[occlFind(j)] = occlFind(i)
                }
            }
        }
        const occlClusters = new Map()
        for (let i = 0; i < allOccluders.length; i++) {
            const r = occlFind(i)
            if (!occlClusters.has(r)) occlClusters.set(r, [])
            occlClusters.get(r).push(i)
        }
        let occlCount = 0
        for (const members of occlClusters.values()) {
            if (occlCount >= 100) break
            if (members.length < 2) continue
            const resSet = new Set(members.map(i => allOccluders[i].resource))
            if (resSet.size < 2) continue
            occlCount++
            const cluster = members.slice(0, 12).map(i => allOccluders[i])
            const resNames = [...resSet]
            const anchor = cluster[0]
            const centroid = [0, 0, 0]
            for (const o of cluster) {
                centroid[0] += o.c[0] / cluster.length
                centroid[1] += o.c[1] / cluster.length
                centroid[2] += o.c[2] / cluster.length
            }
            const near = occlNeighbors(members[0])
                .filter(oi => !members.includes(oi))
                .map(oi => ({ label: `MODEL #${oi + 1}`, dist: Math.round(dist3(allOccluders[oi].c, anchor.c) * 10) / 10 }))
                .filter(n => n.dist > 0 && n.dist < 150)
                .sort((x, y) => x.dist - y.dist)
                .slice(0, 4)
            const badges = ['overlapping occluders']
            if (cluster.length > 2) badges.push(`${cluster.length} boxes`)
            if (members.length > 12) badges.push(`${members.length - 12} more not shown`)
            const subNames = resNames.slice(0, 3).join(' vs ') + (resNames.length > 3 ? ` +${resNames.length - 3}` : '')
            out.push({
                id: nid('c_occl'),
                key: `occl|${cluster.map(o => `${o.resource}#${o.bi}`).sort().join('+')}`,
                cat: 'occl',
                sev: 'medium',
                kind: 'occl-overlap',
                title: `box occluder overlap`,
                sub: subNames,
                file: [...new Set(cluster.map(o => o.file))].join(' + '),
                badges,
                vanilla: false,
                pos: centroid.map(v => Math.round(v * 100) / 100),
                autoRes: null,
                resources: cluster.map((o, i) => ({ name: o.resource, rel: o.rel, size: 0, sha1: '', status: `occluder ${i + 1}` })),
                entity: null,
                target: null,
                near,
                boxes: cluster,
                explain: {
                    summary: `${cluster.length} box occluders from ${subNames} overlap. Overlapping occluders can make geometry pop in and out or disappear.`,
                    note: 'Occluders hide whatever is behind them. Only one should cover a given volume.'
                },
                suggested: { action: 'keep', losers: [] }
            })
        }

        const archMap = new Map()
        for (const w of ytypWinners) {
            for (const a of w.archetypes) {
                if (!a.name) continue
                let list = archMap.get(a.name)
                if (!list) {
                    list = []
                    archMap.set(a.name, list)
                }
                if (!list.some(x => x.resource === w.resource)) {
                    list.push({ resource: w.resource, file: w.file, order: w.order, lodDist: a.lodDist })
                }
            }
        }
        let archCount = 0
        for (const [hash, list] of archMap) {
            if (archCount >= 150 || out.length > 1900) break
            if (list.length < 2) continue
            archCount++
            const sorted = [...list].sort((a, b) => a.order - b.order)
            const name = resolveName(hash)
            const lods = new Set(sorted.map(e => e.lodDist))
            const badges = ['archetype defined twice']
            if (lods.size > 1) badges.push(`LOD dist ${sorted.map(e => e.lodDist).join(' vs ')}`)
            out.push({
                id: nid('c_asset'),
                key: `arch|${hash}|${sorted.map(e => e.resource).sort().join('+')}`,
                cat: 'asset',
                sev: 'medium',
                kind: 'dup-archetype',
                title: name,
                sub: sorted.map(e => e.resource).join(' vs '),
                file: sorted.map(e => e.file).join(' + '),
                badges,
                vanilla: false,
                pos: archPos.get(hash) || null,
                autoRes: null,
                resources: sorted.map((e, i) => ({
                    name: e.resource,
                    rel: e.file,
                    size: 0,
                    sha1: '',
                    status: i === sorted.length - 1 ? `defines it · loads last · wins (LOD ${e.lodDist})` : `defines it (LOD ${e.lodDist})`
                })),
                entity: null,
                target: null,
                near: null,
                explain: {
                    summary: `${sorted.length} resources define the archetype ${name} in different ytyp files. Only the definition loaded last is used in game.`,
                    note: lods.size > 1
                        ? 'The definitions disagree on LOD distance, so how far this model stays visible depends on load order.'
                        : 'The definitions may disagree on texture dictionary, flags or LOD distance depending on version.'
                },
                suggested: { action: 'keep', losers: [] }
            })
        }

        const kindRank = { vehicle: 0, ped: 1, weapon: 2, map: 3, prop: 4, other: 5 }
        for (const c of out) {
            let best = 'other'
            if (kinds) {
                for (const r of c.resources || []) {
                    const got = kinds.classify(r.name, r.rel || c.file)
                    if (kindRank[got] < kindRank[best]) best = got
                }
            }
            c.akind = best
        }

        const order = { coll: 0, occl: 1, asset: 2, prop: 3 }
        out.sort((x, y) => (order[x.cat] - order[y.cat]) || x.id.localeCompare(y.id))
        return out
    }

    return { detect, loadVanilla }
})()
})()
