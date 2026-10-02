import { describe, expect, test } from 'bun:test'
import { readUiRects } from '../web/src/lib/ui-rects'

function panels(modal = false): Document {
    return {
        querySelector: () => modal ? {} : null,
        querySelectorAll: () => [
            { getBoundingClientRect: () => ({ left: 100, top: 50, right: 500, bottom: 250, width: 400, height: 200 }) },
            { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) }
        ]
    } as unknown as Document
}

describe('UI hitbox viewport', () => {
    test('changes the payload identity when a full-screen dialog resizes', () => {
        const before = readUiRects(panels(true), { innerWidth: 1920, innerHeight: 1080 })
        const after = readUiRects(panels(true), { innerWidth: 2560, innerHeight: 1440 })
        expect(after.rects).toEqual(before.rects)
        expect(JSON.stringify(after)).not.toBe(JSON.stringify(before))
        expect(after.w).toBe(2560)
        expect(after.h).toBe(1440)
    })

    test('normalizes visible panel bounds against the current viewport', () => {
        expect(readUiRects(panels(), { innerWidth: 1000, innerHeight: 500 })).toEqual({
            rects: [[0.1, 0.1, 0.5, 0.5]], w: 1000, h: 500
        })
    })
})
