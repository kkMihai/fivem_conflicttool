(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.ytyp = (() => {
    function parse(buf) {
        const { data } = KKCT.rsc7.parse(buf)
        const meta = KKCT.meta.parse(data)
        const mt = meta.readRoot(KKCT.joaatCase('CMapTypes'))
        if (!mt) throw new Error('no CMapTypes block')

        const mloHash = KKCT.joaatCase('CMloArchetypeDef')
        const archetypes = []
        let mloCount = 0
        for (const a of Array.isArray(mt.archetypes) ? mt.archetypes : []) {
            if (!a) continue
            if (a.__struct === mloHash) mloCount++
            archetypes.push({
                name: (a.name ?? 0) >>> 0,
                assetName: (a.assetName ?? 0) >>> 0,
                assetType: a.assetType ?? 0,
                lodDist: Math.round(a.lodDist ?? 0)
            })
        }

        return {
            name: (mt.name ?? 0) >>> 0,
            archetypes,
            mloCount
        }
    }

    return { parse }
})()
})()
