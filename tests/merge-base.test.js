const { describe, expect, test } = require('bun:test')

globalThis.KKCT = globalThis.KKCT || {}
require('../server/merge.js')

describe('merge base selection', () => {
    test('moves the selected exact file to the merge target position', () => {
        const first = { resource: 'pack', rel: 'stream/a/file.ybn', inStream: true, parseError: null }
        const second = { resource: 'pack', rel: 'stream/b/file.ybn', inStream: true, parseError: null }
        const conflict = { id: 'c1', kind: 'dup-file', file: 'file.ybn', merge: { kind: 'ybn', ids: ['c1'] } }
        const priorScanner = KKCT.scanner
        const priorConflicts = KKCT.conflicts
        KKCT.scanner = { last: () => ({ conflicts: [conflict], index: new Map([['file.ybn', [first, second]]]) }) }
        KKCT.conflicts = { loadOrder: entries => [...entries] }
        try {
            const plan = KKCT.merge.plan('c1', 'file.ybn', { resource: 'pack', rel: first.rel })
            expect(plan.ok).toBe(true)
            expect(plan.base).toEqual({ resource: 'pack', rel: first.rel })
            expect(plan.copies.at(-1).chosen[0]).toBe(first)
        } finally {
            KKCT.scanner = priorScanner
            KKCT.conflicts = priorConflicts
        }
    })

    test('rejects a base file outside the scanned copies', () => {
        const entry = { resource: 'pack', rel: 'stream/file.ybn', inStream: true, parseError: null }
        const conflict = { id: 'c1', kind: 'dup-file', file: 'file.ybn', merge: { kind: 'ybn', ids: ['c1'] } }
        const priorScanner = KKCT.scanner
        const priorConflicts = KKCT.conflicts
        KKCT.scanner = { last: () => ({ conflicts: [conflict], index: new Map([['file.ybn', [entry]]]) }) }
        KKCT.conflicts = { loadOrder: entries => [...entries] }
        try {
            const plan = KKCT.merge.plan('c1', 'file.ybn', { resource: 'pack', rel: 'stream/missing.ybn' })
            expect(plan.ok).toBe(false)
            expect(plan.reason).toContain('selected base copy is not usable')
        } finally {
            KKCT.scanner = priorScanner
            KKCT.conflicts = priorConflicts
        }
    })
})
