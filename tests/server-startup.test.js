const { describe, expect, test } = require('bun:test')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const serverCode = fs.readFileSync(path.join(__dirname, '../server/main.js'), 'utf8')
const startupSteps = ['resourcePath', 'data', 'decisions', 'ignores', 'scanner', 'resolver', 'names', 'vanilla']

function loadServer({ failAt, permitted = true, authDuringStartup = false } = {}) {
    const netHandlers = new Map()
    const localHandlers = new Map()
    const emitted = []
    const initialized = []
    const operations = []
    const logs = []
    const step = name => {
        initialized.push(name)
        if (authDuringStartup) netHandlers.get('kk_ct:auth')(name)
        if (failAt === name) throw new Error(`${name} failed`)
    }
    const context = {
        source: 42,
        require: name => name === 'fs' ? { mkdirSync: () => step('data') } : require(name),
        Buffer,
        console: { log: message => logs.push(message) },
        GetCurrentResourceName: () => 'fivem_conflicttool',
        GetResourcePath: () => { step('resourcePath'); return '/resources/fivem_conflicttool' },
        IsPlayerAceAllowed: (src, ace) => {
            expect(src).toBe('42')
            expect(ace).toBe('fivem_conflicttool')
            return permitted
        },
        onNet: (event, callback) => netHandlers.set(event, callback),
        on: (event, callback) => localHandlers.set(event, callback),
        emitNet: (...args) => emitted.push(args),
        KKCT: {
            decisions: {
                init: () => step('decisions'),
                entities: () => { operations.push('entities'); return [] }
            },
            ignores: { init: () => step('ignores') },
            scanner: {
                init: () => step('scanner'),
                isScanning: () => false,
                run: () => { operations.push('scan'); return new Promise(() => {}) }
            },
            resolver: {
                init: () => step('resolver'),
                apply: () => { operations.push('apply'); return new Promise(() => {}) }
            },
            names: { loadDictionary: () => step('names'), size: () => 123 },
            conflicts: { loadVanilla: () => step('vanilla') },
            backups: { list: () => { operations.push('backups'); return [] } }
        }
    }
    vm.runInNewContext(serverCode, context, { filename: 'server/main.js' })
    return { netHandlers, localHandlers, emitted, initialized, operations, logs }
}

describe('server authentication startup', () => {
    test.each(startupSteps)('keeps auth available when %s initialization fails', failAt => {
        const server = loadServer({ failAt })
        expect([...server.netHandlers.keys()]).toEqual(['kk_ct:auth'])
        expect(server.localHandlers.size).toBe(0)
        expect(server.operations).toEqual([])
        expect(server.initialized).toEqual(startupSteps.slice(0, startupSteps.indexOf(failAt) + 1))
        expect(server.logs).toHaveLength(1)
        expect(server.logs[0]).toContain('initialization failed')
        expect(server.logs[0]).toContain(`${failAt} failed`)

        server.netHandlers.get('kk_ct:auth')('request-7')
        expect(server.emitted).toEqual([['kk_ct:authResult', 42, false, 'unavailable', 'request-7']])
    })

    test('reports ACE denial when setup failed', () => {
        const server = loadServer({ failAt: 'scanner', permitted: false })
        server.netHandlers.get('kk_ct:auth')('request-8')
        expect(server.emitted).toEqual([['kk_ct:authResult', 42, false, 'denied', 'request-8']])
    })

    test('auth cannot grant access before initialization finishes', () => {
        const server = loadServer({ authDuringStartup: true })
        expect(server.initialized).toEqual(startupSteps)
        expect(server.emitted).toEqual(startupSteps.map(step => ['kk_ct:authResult', 42, false, 'unavailable', step]))

        server.netHandlers.get('kk_ct:auth')('finished')
        expect(server.emitted.at(-1)).toEqual(['kk_ct:authResult', 42, true, null, 'finished'])
    })

    test('healthy auth grants allowed players and supports the existing request shape', () => {
        const server = loadServer()
        server.netHandlers.get('kk_ct:auth')()
        expect(server.emitted).toEqual([['kk_ct:authResult', 42, true, null, null]])
        expect(server.logs).toEqual(['[fivem_conflicttool] loaded (123 known object names)'])
    })

    test('healthy auth denies players without ACE permission', () => {
        const server = loadServer({ permitted: false })
        server.netHandlers.get('kk_ct:auth')('request-9')
        expect(server.emitted).toEqual([['kk_ct:authResult', 42, false, 'denied', 'request-9']])
    })

    test('healthy authorized handlers can scan, apply, and list backups', () => {
        const server = loadServer()
        server.netHandlers.get('kk_ct:scan')()
        server.netHandlers.get('kk_ct:apply')()
        server.netHandlers.get('kk_ct:backups')()
        expect(server.operations).toEqual(['scan', 'apply', 'backups'])
        expect(server.emitted).toEqual([['kk_ct:backupsList', 42, []]])
    })

    test('healthy operational handlers still require ACE permission', () => {
        const server = loadServer({ permitted: false })
        server.netHandlers.get('kk_ct:scan')()
        server.netHandlers.get('kk_ct:apply')()
        server.netHandlers.get('kk_ct:backups')()
        expect(server.operations).toEqual([])
        expect(server.emitted).toEqual([])
    })
})
