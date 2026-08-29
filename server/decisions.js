(() => {
const fs = require('fs')
const path = require('path')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.decisions = (() => {
    let data = { version: 1, updatedAt: null, entities: [], assets: [] }
    const journal = []
    let filePath = null
    let seq = 0

    function init(rootDir) {
        filePath = path.join(rootDir, 'data', 'decisions.json')
        load()
    }

    function load() {
        try {
            if (fs.existsSync(filePath)) {
                const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
                if (parsed && Array.isArray(parsed.entities) && Array.isArray(parsed.assets)) {
                    data = parsed
                }
            }
        } catch (e) {
            console.log(`[fivem_conflicttool] decisions load failed: ${e.message}`)
        }
    }

    function save() {
        data.updatedAt = new Date().toISOString()
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true })
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
        } catch (e) {
            console.log(`[fivem_conflicttool] decisions save failed: ${e.message}`)
        }
    }

    function nextId() {
        seq += 1
        return `d_${Date.now().toString(36)}_${seq}`
    }

    function addEntity(d) {
        const id = nextId()
        const rec = {
            id,
            conflictId: d.conflictId || null,
            action: d.action,
            archetype: d.archetype || null,
            hash: d.hash >>> 0,
            guid: (d.guid || 0) >>> 0,
            source: d.source || null,
            original: d.original,
            spots: Array.isArray(d.spots)
                ? d.spots
                      .filter(sp => sp && typeof sp.model === 'number' && Array.isArray(sp.pos) && sp.pos.length === 3)
                      .slice(0, 4)
                      .map(sp => ({ model: sp.model >>> 0, pos: sp.pos.map(Number) }))
                : null,
            new: d.new || null,
            hideRadius: typeof d.hideRadius === 'number' ? d.hideRadius : 0.25,
            createdAt: new Date().toISOString(),
            by: d.by || null
        }
        data.entities = data.entities.filter(e => !(e.hash === rec.hash && e.guid === rec.guid && samePos(e.original, rec.original)))
        data.entities.push(rec)
        journal.push({ kind: 'entity', id })
        save()
        return rec
    }

    function addAsset(d) {
        const id = nextId()
        const rec = {
            id,
            conflictId: d.conflictId || null,
            action: d.action === 'bury' || d.action === 'clip' ? d.action : 'disable',
            file: d.file,
            loser: d.loser,
            winner: d.winner || null,
            entity: d.entity || null,
            box: d.box || null,
            state: 'pending',
            bundleId: null,
            createdAt: new Date().toISOString(),
            by: d.by || null
        }
        data.assets = data.assets.filter(a => !(a.file === rec.file && a.action === rec.action && a.loser && rec.loser && a.loser.resource === rec.loser.resource && a.state === 'pending' && (rec.action !== 'clip' || (a.box && rec.box && a.box.index === rec.box.index))))
        data.assets.push(rec)
        journal.push({ kind: 'asset', id, group: d.group || null })
        save()
        return rec
    }

    function removeEntityByConflict(conflictId) {
        const before = data.entities.length
        data.entities = data.entities.filter(e => e.conflictId !== conflictId)
        if (data.entities.length !== before) save()
        return before - data.entities.length
    }

    function undo() {
        const last = journal.pop()
        if (!last) return null
        if (last.kind === 'entity') {
            const rec = data.entities.find(e => e.id === last.id)
            data.entities = data.entities.filter(e => e.id !== last.id)
            save()
            return rec ? { kind: 'entity', rec } : null
        }
        const batch = [last]
        while (last.group && journal.length && journal[journal.length - 1].kind === 'asset' && journal[journal.length - 1].group === last.group) {
            batch.push(journal.pop())
        }
        let result = null
        for (const entry of batch) {
            const rec = data.assets.find(a => a.id === entry.id)
            if (rec && rec.state === 'pending') {
                data.assets = data.assets.filter(a => a.id !== entry.id)
                result = { kind: 'asset', rec }
            }
        }
        if (result) save()
        return result
    }

    function samePos(a, b) {
        if (!a || !b || !a.pos || !b.pos) return false
        return Math.abs(a.pos[0] - b.pos[0]) < 0.01 && Math.abs(a.pos[1] - b.pos[1]) < 0.01 && Math.abs(a.pos[2] - b.pos[2]) < 0.01
    }

    function clearPending() {
        const n = data.assets.filter(a => a.state === 'pending').length
        data.assets = data.assets.filter(a => a.state !== 'pending')
        if (n) save()
        return n
    }

    return {
        init,
        save,
        addEntity,
        addAsset,
        removeEntityByConflict,
        undo,
        clearPending,
        queuedConflictIds: () => ({
            assets: data.assets.filter(a => a.state === 'pending' && a.conflictId).map(a => a.conflictId),
            entities: data.entities.filter(e => e.conflictId).map(e => e.conflictId)
        }),
        get: () => data,
        entities: () => data.entities,
        assets: () => data.assets,
        pendingAssets: () => data.assets.filter(a => a.state === 'pending'),
        meta: () => ({
            entities: data.entities.length,
            assetsPending: data.assets.filter(a => a.state === 'pending').length,
            assetsApplied: data.assets.filter(a => a.state === 'applied').length,
            updatedAt: data.updatedAt
        })
    }
})()
})()
