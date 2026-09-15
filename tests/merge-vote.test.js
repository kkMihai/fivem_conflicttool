const { describe, expect, test } = require('bun:test')

require('../server/lib/mergevote.js')

const view = state => state === null ? new Map() : new Map([['item', { sig: state, gone: false }]])
const result = (states, policy = 'three-way') => globalThis.KKCT.mergevote.run({
    views: states.map(view),
    voters: states.map(() => true),
    policy
}).rows.get('item')

describe('merge vote', () => {
    test('keeps an item present in most copies', () => {
        expect(result(['a', 'a', null])).toEqual({ pick: 1, result: 'added', conflict: false, unresolved: false })
    })

    test('removes an item absent from most copies', () => {
        expect(result(['a', null, null])).toEqual({ pick: 2, result: 'removed', conflict: false, unresolved: false })
    })

    test('keeps the value most copies share', () => {
        expect(result(['a', 'a', 'b'])).toEqual({ pick: 1, result: 'changed', conflict: false, unresolved: false })
    })

    test('uses load order when no value has a majority', () => {
        expect(result(['a', 'b', 'c'])).toEqual({ pick: 2, result: 'changed', conflict: true, unresolved: true })
    })

    test('keep all preserves a visible item over a hidden copy', () => {
        const visible = new Map([['item', { sig: 'a', gone: false }]])
        const hidden = new Map([['item', { sig: 'a', gone: true }]])
        const row = globalThis.KKCT.mergevote.run({ views: [visible, hidden], voters: [true, true], policy: 'union' }).rows.get('item')
        expect(row).toEqual({ pick: 0, result: 'added', conflict: false, unresolved: false })
    })

    test('removes an item hidden by every copy', () => {
        const hidden = () => new Map([['item', { sig: 'a', gone: true }]])
        const row = globalThis.KKCT.mergevote.run({ views: [hidden(), hidden(), hidden()], voters: [true, true, true], policy: 'three-way' }).rows.get('item')
        expect(row).toEqual({ pick: 2, result: 'removed', conflict: false, unresolved: false })
    })
})
