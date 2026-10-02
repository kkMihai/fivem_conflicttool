import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const originalWindow = globalThis.window
const originalFetch = globalThis.fetch
const originalError = console.error
globalThis.window = { invokeNative: true, setTimeout, clearTimeout } as unknown as Window & typeof globalThis
const { fetchNui, startNuiReadiness } = await import('../web/src/lib/nui')
globalThis.window = originalWindow

let expire: () => void
let cleared: number[]
let errors: ReturnType<typeof mock>
let scheduled: { callback: () => void; delay: number }[]
let listeners: Map<string, () => void>

beforeEach(() => {
    cleared = []
    scheduled = []
    listeners = new Map()
    errors = mock(() => {})
    console.error = errors
    globalThis.window = {
        invokeNative: true,
        setTimeout: (callback: () => void, delay: number) => {
            scheduled.push({ callback, delay })
            expire = callback
            return 1
        },
        clearTimeout: (id: number) => cleared.push(id),
        addEventListener: (event: string, listener: () => void) => listeners.set(event, listener),
        removeEventListener: (event: string) => listeners.delete(event)
    } as unknown as Window & typeof globalThis
})

afterEach(() => {
    globalThis.window = originalWindow
    globalThis.fetch = originalFetch
    console.error = originalError
})

describe('NUI transport', () => {
    test('returns the callback acknowledgment and sends JSON once', async () => {
        const request = mock(async () => new Response('true'))
        globalThis.fetch = request as unknown as typeof fetch
        expect(await fetchNui('uiRects', { w: 1920 })).toBe(true)
        expect(request).toHaveBeenCalledTimes(1)
        expect(request.mock.calls[0]).toEqual([
            'https://fivem_conflicttool/uiRects',
            expect.objectContaining({ method: 'POST', body: '{"w":1920}', signal: expect.any(AbortSignal) })
        ])
        expect(cleared).toEqual([1])
        expect(scheduled[0].delay).toBe(5000)
        expect(errors).not.toHaveBeenCalled()
    })

    test('logs transport failure without retrying a mutation', async () => {
        const request = mock(async () => { throw new Error('connection lost') })
        globalThis.fetch = request as unknown as typeof fetch
        expect(await fetchNui('decide', { action: 'remove' })).toBeNull()
        expect(request).toHaveBeenCalledTimes(1)
        expect(errors.mock.calls[0][0]).toContain('decide failed')
        expect(cleared).toEqual([1])
    })

    test('rejects HTTP errors and invalid JSON acknowledgments', async () => {
        globalThis.fetch = mock(async () => new Response('true', { status: 500 })) as unknown as typeof fetch
        expect(await fetchNui('uiRects')).toBeNull()
        globalThis.fetch = mock(async () => new Response('invalid JSON')) as unknown as typeof fetch
        expect(await fetchNui('uiRects')).toBeNull()
        expect(errors).toHaveBeenCalledTimes(2)
    })

    test('aborts a stalled callback and releases its timeout', async () => {
        globalThis.fetch = mock((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
            options.signal!.addEventListener('abort', () => reject(new Error('request aborted')))
        })) as unknown as typeof fetch
        const pending = fetchNui('uiRects')
        expire()
        expect(await pending).toBeNull()
        expect(errors.mock.calls[0][0]).toContain('uiRects failed')
        expect(cleared).toEqual([1])
    })
})

describe('UI readiness lifecycle', () => {
    test('stops readiness retries after a valid acknowledgment', async () => {
        const post = mock(async () => true)
        const stop = startNuiReadiness(post)
        await Promise.resolve()
        expect(post).toHaveBeenCalledTimes(1)
        expect(scheduled).toHaveLength(0)
        expect(listeners.has('pagehide')).toBe(true)
        stop()
        expect(listeners.has('pagehide')).toBe(false)
    })

    test('retries lost readiness acknowledgments three times with bounded delays', async () => {
        const post = mock(async () => null)
        const stop = startNuiReadiness(post)
        await Promise.resolve()
        for (let attempt = 1; attempt < 3; attempt++) {
            expect(scheduled[attempt - 1].delay).toBe(1000)
            await scheduled[attempt - 1].callback()
        }
        expect(post).toHaveBeenCalledTimes(3)
        expect(scheduled).toHaveLength(2)
        expect(errors.mock.calls[0][0]).toContain('readiness was not acknowledged after 3 attempts')
        stop()
    })

    test('does not schedule retries after its effect is disposed', async () => {
        let resolve: (value: null) => void = () => {}
        const stop = startNuiReadiness(() => new Promise(done => { resolve = done }))
        stop()
        resolve(null)
        await Promise.resolve()
        expect(scheduled).toHaveLength(0)
        expect(errors).not.toHaveBeenCalled()
    })

    test('declares unload with the same page session and keeps the request alive', async () => {
        const request = mock(async () => new Response('true'))
        globalThis.fetch = request as unknown as typeof fetch
        const stop = startNuiReadiness()
        await Promise.resolve()
        listeners.get('pagehide')!()
        await Promise.resolve()
        expect(request).toHaveBeenCalledTimes(2)
        const ready = request.mock.calls[0] as unknown as [string, RequestInit]
        const unload = request.mock.calls[1] as unknown as [string, RequestInit]
        expect(ready[0]).toContain('/uiReady')
        expect(unload[0]).toContain('/uiUnloaded')
        expect(unload[1].keepalive).toBe(true)
        expect(unload[1].body).toBe(ready[1].body)
        expect(JSON.parse(String(ready[1].body)).session).toBeString()
        stop()
    })
})
