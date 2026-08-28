(() => {
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.scanner = (() => {
    const EXTS = new Set(['.ymap', '.ytyp', '.ybn', '.ydr', '.ydd', '.ytd', '.yft'])
    const OVERSIZE = 16 * 1024 * 1024
    const SKIP_DIRS = new Set(['node_modules', '.git', '.vscode', 'web'])

    let scanning = false
    let lastScan = null
    const PARSE_VERSION = 2
    let cacheDir = null
    let rootDir = null
    let hashCache = new Map()
    let hashCacheDirty = false
    const parseMem = new Map()

    async function pmap(items, limit, fn) {
        const out = new Array(items.length)
        let next = 0
        const n = Math.min(limit, items.length)
        const workers = []
        for (let w = 0; w < n; w++) {
            workers.push((async () => {
                for (;;) {
                    const i = next++
                    if (i >= items.length) return
                    out[i] = await fn(items[i], i)
                }
            })())
        }
        await Promise.all(workers)
        return out
    }

    function init(root) {
        rootDir = root
        cacheDir = path.join(root, 'data', 'cache')
        fs.mkdirSync(cacheDir, { recursive: true })
        try {
            for (const name of fs.readdirSync(cacheDir)) {
                if (name.endsWith('.json') && name !== 'hashes.json' && !name.endsWith(`.v${PARSE_VERSION}.json`)) {
                    fs.unlinkSync(path.join(cacheDir, name))
                }
            }
        } catch {}
        try {
            const hp = path.join(cacheDir, 'hashes.json')
            if (fs.existsSync(hp)) {
                hashCache = new Map(Object.entries(JSON.parse(fs.readFileSync(hp, 'utf8'))))
            }
        } catch {}
    }

    function saveHashCache() {
        if (!hashCacheDirty) return
        try {
            fs.writeFileSync(path.join(cacheDir, 'hashes.json'), JSON.stringify(Object.fromEntries(hashCache)))
            hashCacheDirty = false
        } catch {}
    }

    async function walk(dir, out, depth, metas) {
        if (depth > 12) return
        let entries
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const e of entries) {
            if (e.isDirectory()) {
                if (!SKIP_DIRS.has(e.name.toLowerCase())) {
                    await walk(path.join(dir, e.name), out, depth + 1, metas)
                }
            } else {
                const lower = e.name.toLowerCase()
                const ext = path.extname(lower)
                if (EXTS.has(ext)) {
                    out.push(path.join(dir, e.name))
                } else if (metas && KKCT.assetkind.META_FILES.has(lower)) {
                    metas.push(path.join(dir, e.name))
                }
            }
        }
    }

    function sha1(buf) {
        return crypto.createHash('sha1').update(buf).digest('hex')
    }

    function cachedParse(hash, kind, getBuf) {
        const mem = parseMem.get(hash)
        if (mem !== undefined) return mem
        const cp = path.join(cacheDir, `${hash}.v${PARSE_VERSION}.json`)
        try {
            const parsed = JSON.parse(fs.readFileSync(cp, 'utf8'))
            parseMem.set(hash, parsed)
            return parsed
        } catch {}
        const buf = getBuf()
        let parsed
        if (kind === 'ymap') parsed = KKCT.ymap.parse(buf)
        else if (kind === 'ytyp') parsed = KKCT.ytyp.parse(buf)
        else if (kind === 'ybn') parsed = KKCT.ybn.parse(buf)
        else return null
        parseMem.set(hash, parsed)
        try {
            fs.writeFileSync(cp, JSON.stringify(parsed))
        } catch {}
        return parsed
    }

    async function run(progress) {
        if (scanning) return null
        scanning = true
        const started = Date.now()
        try {
            const resources = []
            const num = GetNumResources()
            const selfName = GetCurrentResourceName()
            for (let i = 0; i < num; i++) {
                const name = GetResourceByFindIndex(i)
                if (!name || name === selfName) continue
                if (GetResourceState(name) !== 'started') continue
                const rpath = GetResourcePath(name)
                if (!rpath) continue
                resources.push({ name, path: rpath.replace(/\//g, path.sep), order: i })
            }

            const files = []
            let walked = 0
            progress({ phase: 'walk', resource: '', current: 0, total: resources.length })
            const kinds = KKCT.assetkind.create()
            const walkResults = await pmap(resources, 8, async r => {
                const found = []
                const metas = []
                await walk(r.path, found, 0, metas)
                kinds.addResource(r.name, metas, r.path)
                walked++
                if (walked % 10 === 0) {
                    progress({ phase: 'walk', resource: r.name, current: walked, total: resources.length })
                }
                return found
            })
            for (let i = 0; i < resources.length; i++) {
                const r = resources[i]
                for (const abs of walkResults[i]) {
                    files.push({ resource: r.name, order: r.order, abs, rel: path.relative(r.path, abs).replace(/\\/g, '/') })
                }
            }

            const parseErrors = []
            let done = 0
            let lastProgressAt = 0
            let sinceYield = 0
            const results = await pmap(files, 32, async f => {
                done++
                const now = Date.now()
                if (now - lastProgressAt > 120) {
                    lastProgressAt = now
                    progress({ phase: 'parse', resource: f.resource, current: done, total: files.length })
                }
                const ext = path.extname(f.abs).toLowerCase()
                let st
                try {
                    st = await fsp.stat(f.abs)
                } catch {
                    return { err: { resource: f.resource, file: f.rel, msg: 'unreadable' } }
                }
                const hashKey = `${f.abs}|${st.size}|${Math.floor(st.mtimeMs)}`
                let buf = null
                let fileSha = hashCache.get(hashKey)
                if (!fileSha) {
                    try {
                        buf = await fsp.readFile(f.abs)
                    } catch {
                        return { err: { resource: f.resource, file: f.rel, msg: 'unreadable' } }
                    }
                    fileSha = sha1(buf)
                    hashCache.set(hashKey, fileSha)
                    hashCacheDirty = true
                }
                const entry = {
                    resource: f.resource,
                    order: f.order,
                    abs: f.abs,
                    rel: f.rel,
                    ext: ext.slice(1),
                    size: st.size,
                    sha1: fileSha,
                    inStream: f.rel.toLowerCase().split('/').slice(0, -1).includes('stream'),
                    parsed: null,
                    parseError: null
                }
                let err = null
                if (ext === '.ymap' || ext === '.ytyp' || ext === '.ybn') {
                    if (!parseMem.has(entry.sha1)) {
                        sinceYield++
                        if (sinceYield >= 25) {
                            sinceYield = 0
                            await new Promise(res => setImmediate(res))
                        }
                    }
                    try {
                        entry.parsed = cachedParse(entry.sha1, ext.slice(1), () => buf ?? fs.readFileSync(f.abs))
                    } catch (e) {
                        entry.parseError = e.message
                        err = { resource: f.resource, file: f.rel, msg: e.message }
                    }
                }
                return { entry, err }
            })

            const index = new Map()
            const weightMap = new Map()
            for (let i = 0; i < files.length; i++) {
                const r = results[i]
                if (!r) continue
                if (r.err) parseErrors.push(r.err)
                if (!r.entry) continue
                const key = path.basename(files[i].abs).toLowerCase()
                if (!index.has(key)) index.set(key, [])
                index.get(key).push(r.entry)
                const e = r.entry
                let w = weightMap.get(e.resource)
                if (!w) {
                    w = { name: e.resource, bytes: 0, files: 0, over: [] }
                    weightMap.set(e.resource, w)
                }
                w.bytes += e.size
                w.files++
                if (e.size >= OVERSIZE && w.over.length < 10) {
                    w.over.push({ rel: e.rel, size: e.size })
                }
            }
            const weights = [...weightMap.values()].sort((a, b) => b.bytes - a.bytes)
            for (const w of weights) w.over.sort((a, b) => b.size - a.size)

            for (const [key] of index) {
                KKCT.names.add(key.replace(/\.[^.]+$/, ''))
            }

            const modPacks = new Set(files.map(f => f.resource))

            progress({ phase: 'detect', resource: '', current: 0, total: 0 })
            const conflicts = KKCT.conflicts.detect(index, resources, kinds)
            if (KKCT.ignores) KKCT.ignores.markScan(conflicts)

            lastScan = {
                scanId: `s_${Date.now().toString(36)}`,
                scannedAt: new Date().toISOString(),
                durationMs: Date.now() - started,
                resourceCount: resources.length,
                modPackCount: modPacks.size,
                fileCount: files.length,
                parseErrors: parseErrors.slice(0, 200),
                conflicts,
                weights,
                index
            }
            saveHashCache()
            return lastScan
        } finally {
            scanning = false
        }
    }

    return {
        init,
        run,
        isScanning: () => scanning,
        last: () => lastScan
    }
})()
})()
