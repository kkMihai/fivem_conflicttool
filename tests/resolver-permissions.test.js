const { describe, expect, test } = require('bun:test')
const fs = require('fs')
const vm = require('vm')
const path = require('path').posix
const crypto = require('crypto')

function resolverWithFiles(files, decisions, options = {}) {
    const contents = new Map(Object.entries(files).map(([name, value]) => [name, Buffer.from(value)]))
    const fakeFs = {
        existsSync: name => contents.has(name),
        readFileSync: name => {
            const value = contents.get(name)
            if (!value) throw new Error(`missing ${name}`)
            return Buffer.from(value)
        },
        writeFileSync: (name, value) => contents.set(name, Buffer.from(value)),
        copyFileSync: (src, dest) => {
            if (options.denyWrite !== false && dest === '/resources/map/stream/tree.ymap') throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
            contents.set(dest, Buffer.from(contents.get(src)))
        },
        unlinkSync: name => contents.delete(name),
        mkdirSync: () => {},
        statSync: name => ({ size: contents.get(name)?.length ?? 0 })
    }
    const context = {
        KKCT: {
            decisions,
            ymap: options.ymap || { patch: () => ({ buf: Buffer.from('patched') }), parse: () => ({ entities: [] }) }
        },
        Buffer,
        console,
        process: { platform: 'linux' },
        setImmediate,
        GetResourcePath: name => name === 'map' ? '/resources/map' : null,
        require: name => {
            if (name === 'fs') return fakeFs
            if (name === 'path') return path
            if (name === 'crypto') return crypto
            if (name === 'child_process') return { execFileSync: () => { throw new Error('blocked') } }
            throw new Error(name)
        }
    }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/resolver.js'), 'utf8'), context)
    context.KKCT.resolver.init('/tool')
    return { resolver: context.KKCT.resolver, fsops: context.KKCT.fsops, contents }
}

describe('resolver write permissions', () => {
    test('rejects a failed copy when the old destination still exists', () => {
        const setup = resolverWithFiles({ source: 'new', '/resources/map/stream/tree.ymap': 'old' }, {})
        expect(() => setup.fsops.copyInto('source', '/resources/map/stream/tree.ymap')).toThrow('write access')
        expect(setup.contents.get('/resources/map/stream/tree.ymap').toString()).toBe('old')
    })

    test('keeps a failed YMAP edit queued and out of resolved conflicts', async () => {
        const job = {
            id: 'decision-1', conflictId: 'conflict-1', action: 'move', hash: 123,
            archetype: 'tree', original: { pos: [0, 0, 0] },
            new: { pos: [1, 0, 0], rot: [0, 0, 0, 1] },
            targets: [{ resource: 'map', rel: 'stream/tree.ymap', from: [0, 0, 0], model: 123 }],
            state: 'live'
        }
        const decisions = {
            pendingAssets: () => [],
            entities: () => [job],
            entityFileJobs: () => [job],
            assets: () => [],
            save: () => {}
        }
        const setup = resolverWithFiles({ '/resources/map/stream/tree.ymap': 'original' }, decisions)
        const result = await setup.resolver.apply(() => {})
        expect(result.errors).toHaveLength(1)
        expect(result.conflictIds).toEqual([])
        expect(result.failedConflictIds).toEqual(['conflict-1'])
        expect(result.permissionResources).toEqual(['map'])
        expect(job.state).toBe('live')
        expect(setup.contents.get('/resources/map/stream/tree.ymap').toString()).toBe('original')
    })
})

describe('whole YMAP resolve', () => {
    test('writes the translated file and keeps its original backup', async () => {
        const original = JSON.stringify([[1, 2, 3], [4, 5, 6]])
        const job = {
            id: 'decision-2', conflictId: 'ymap-1', action: 'ymap-move', file: 'tree.ymap',
            loser: { resource: 'map', rel: 'stream/tree.ymap' },
            ymapMove: { delta: [10, -2, 5] }, state: 'pending'
        }
        const decisions = {
            pendingAssets: () => [job],
            assets: () => [job],
            entities: () => [],
            entityFileJobs: () => [],
            get: () => ({}),
            save: () => {}
        }
        const ymap = {
            parse: buf => ({ entities: JSON.parse(buf.toString()).map(p => ({ p })) }),
            translate: (buf, delta) => ({ buf: Buffer.from(JSON.stringify(JSON.parse(buf.toString()).map(p => p.map((v, i) => v + delta[i])))) })
        }
        const setup = resolverWithFiles({ '/resources/map/stream/tree.ymap': original }, decisions, { denyWrite: false, ymap })
        const result = await setup.resolver.apply(() => {})
        expect(result.errors).toEqual([])
        expect(result.conflictIds).toEqual(['ymap-1'])
        expect(job.state).toBe('applied')
        expect(JSON.parse(setup.contents.get('/resources/map/stream/tree.ymap').toString())).toEqual([[11, 0, 8], [14, 3, 11]])
        expect([...setup.contents.values()].some(value => value.toString() === original)).toBe(true)
    })
})
