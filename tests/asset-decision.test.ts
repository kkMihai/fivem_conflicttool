import { describe, expect, test } from 'bun:test'
import { partitionAssetCopies } from '../web/src/lib/asset-decision'
import type { ConflictResource } from '../web/src/types'

const copy = (rel: string): ConflictResource => ({
    name: 'same-resource',
    rel,
    size: 1,
    sha1: rel,
    status: 'active'
})

describe('asset decision', () => {
    test('distinguishes copies in the same resource by index', () => {
        const first = copy('stream/a/file.ydr')
        const second = copy('stream/b/file.ydr')
        const selected = partitionAssetCopies([first, second], 1)

        expect(selected).toEqual({ winner: second, losers: [first] })
    })
})
