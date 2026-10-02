import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const originalWindow = globalThis.window
const originalFetch = globalThis.fetch
const originalError = console.error
globalThis.window = { invokeNative: true, setTimeout, clearTimeout } as unknown as Window & typeof globalThis
const { fetchNui } = await import('../web/src/lib/nui')
globalThis.window = originalWindow

let expire: () => void
let cleared: number[]
let errors: ReturnType<typeof mock>

beforeEach(() => {
    cleared = []
    errors = mock(() => {})
    console.error = errors
    globalThis.window = {
        invokeNative: true,
        setTimeout: (callback: () => void, delay: number) => {
            expect(delay).toBe(5000)
            expire = callback
            return 1
        },
        clearTimeout: (id: number) => cleared.push(id)
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
