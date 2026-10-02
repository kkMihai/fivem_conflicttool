import { describe, expect, test } from 'bun:test'
import { createUiRectsSender, readUiRects } from '../web/src/lib/ui-rects'

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

describe('UI hitbox delivery', () => {
    const payload = { rects: [[0, 0, 1, 1]], w: 1920, h: 1080 }

    test('retries unchanged geometry after a lost acknowledgment with a bounded delay', async () => {
        let at = 0
        let calls = 0
        const send = createUiRectsSender(async () => ++calls === 1 ? null : true, () => at)
        await send(payload)
        at = 200
        await send(payload)
        expect(calls).toBe(1)
        at = 1000
        await send(payload)
        await send(payload)
        expect(calls).toBe(2)
        at = 3000
        await send(payload)
        expect(calls).toBe(3)
    })

    test('does not accept an invalid acknowledgment as delivered geometry', async () => {
        let at = 0
        let calls = 0
        const send = createUiRectsSender(async () => { calls++; return { ok: true } }, () => at)
        await send(payload)
        at = 1000
        await send(payload)
        expect(calls).toBe(2)
    })

    test('serializes requests and sends a viewport change after the pending acknowledgment', async () => {
        const sent: unknown[] = []
        let acknowledge: (value: boolean) => void = () => {}
        const send = createUiRectsSender(data => {
            sent.push(data)
            return new Promise(resolve => { acknowledge = resolve })
        })
        const first = send(payload)
        const resized = { ...payload, w: 2560, h: 1440 }
        await send(resized)
        expect(sent).toEqual([payload])
        acknowledge(true)
        await first
        const next = send(resized)
        acknowledge(true)
        await next
        expect(sent).toEqual([payload, resized])
    })
})
