(() => {
const fs = require('fs')
const path = require('path')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.assetkind = (() => {
    const META_FILES = new Set([
        'vehicles.meta',
        'carvariations.meta',
        'handling.meta',
        'peds.meta',
        'weapons.meta',
        'weaponarchetypes.meta'
    ])

    const MODEL_EXTS = new Set(['ydr', 'ydd', 'yft', 'ytd', 'ycd', 'awc'])
    const MAP_EXTS = new Set(['ymap', 'ytyp', 'ybn'])

    const VEHICLE_META = new Set(['vehicles.meta', 'carvariations.meta', 'handling.meta'])
    const PED_META = new Set(['peds.meta'])
    const WEAPON_META = new Set(['weapons.meta', 'weaponarchetypes.meta'])

    function tagValues(text, tag) {
        const out = []
        const re = new RegExp(`<${tag}\s*>([^<]+)</${tag}\s*>`, 'gi')
        let m
        while ((m = re.exec(text)) !== null) {
            const v = m[1].trim().toLowerCase()
            if (v && !/\s/.test(v)) out.push(v)
        }
        return out
    }

    const HINTS = [
        [/(^|[\/\[_-])(vehicles?|cars?|tuning|wheels)([\]_\-\/]|$)/, 'vehicle'],
        [/(^|[\/\[_-])(peds?|clothing|clothes|characters?)([\]_\-\/]|$)/, 'ped'],
        [/(^|[\/\[_-])(weapons?|guns?)([\]_\-\/]|$)/, 'weapon']
    ]

    function pathHint(p) {
        const low = String(p || '').toLowerCase().replace(/\\/g, '/')
        for (const [re, kind] of HINTS) {
            if (re.test(low)) return kind
        }
        return null
    }

    function baseName(file) {
        const name = file.toLowerCase().replace(/^.*[\\/]/, '')
        const cut = name.lastIndexOf('.')
        let base = cut > 0 ? name.slice(0, cut) : name
        base = base.replace(/[+_](hi|hidr)$/, '')
        const caret = base.indexOf('^')
        if (caret > 0) base = base.slice(0, caret)
        return base
    }

    function create() {
        const byResource = new Map()

        function entryFor(resource) {
            let r = byResource.get(resource)
            if (!r) {
                r = { vehicles: new Set(), peds: new Set(), weapons: new Set(), has: new Set(), hint: null }
                byResource.set(resource, r)
            }
            return r
        }

        function addResource(resource, metaFiles, dirPath) {
            const r = entryFor(resource)
            if (dirPath) r.hint = pathHint(dirPath) || pathHint(resource)
            if (!metaFiles || !metaFiles.length) return
            for (const abs of metaFiles) {
                const name = path.basename(abs).toLowerCase()
                let text
                try {
                    text = fs.readFileSync(abs, 'utf8')
                } catch {
                    continue
                }
                if (VEHICLE_META.has(name)) {
                    r.has.add('vehicle')
                    for (const v of tagValues(text, 'modelName')) r.vehicles.add(v)
                    for (const v of tagValues(text, 'handlingName')) r.vehicles.add(v)
                } else if (PED_META.has(name)) {
                    r.has.add('ped')
                    for (const v of tagValues(text, 'Name')) r.peds.add(v)
                } else if (WEAPON_META.has(name)) {
                    r.has.add('weapon')
                    for (const v of tagValues(text, 'Model')) r.weapons.add(v)
                    for (const v of tagValues(text, 'Name')) {
                        if (!v.startsWith('weapon_') && !v.startsWith('component_') && !v.startsWith('gadget_')) r.weapons.add(v)
                    }
                }
            }
        }

        function classify(resource, file) {
            const name = String(file || '').toLowerCase()
            const cut = name.lastIndexOf('.')
            const ext = cut > 0 ? name.slice(cut + 1) : ''
            if (MAP_EXTS.has(ext)) return 'map'
            const r = byResource.get(resource)
            if (r && MODEL_EXTS.has(ext)) {
                const base = baseName(name)
                if (r.vehicles.has(base)) return 'vehicle'
                if (r.peds.has(base)) return 'ped'
                if (r.weapons.has(base)) return 'weapon'
                if (r.has.size === 1) {
                    const only = [...r.has][0]
                    if (only === 'vehicle' || only === 'ped' || only === 'weapon') return only
                }
                if (!r.has.size && r.hint) return r.hint
            }
            if (MODEL_EXTS.has(ext)) return 'prop'
            return 'other'
        }

        return { addResource, classify, size: () => byResource.size }
    }

    return { create, META_FILES, baseName }
})()
})()
