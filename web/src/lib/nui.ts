import { useEffect, useRef } from 'react'

export const isEnvBrowser = (): boolean => !(window as any).invokeNative

const resourceName = (window as any).GetParentResourceName
    ? (window as any).GetParentResourceName()
    : 'fivem_conflicttool'

export async function fetchNui<T = unknown>(event: string, data?: unknown): Promise<T | null> {
    if (isEnvBrowser()) {
        return null
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    try {
        const resp = await fetch(`https://${resourceName}/${event}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(data ?? {}),
            signal: controller.signal
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        return (await resp.json()) as T
    } catch (error) {
        console.error(`[${resourceName}] NUI request ${event} failed`, error)
        return null
    } finally {
        window.clearTimeout(timeout)
    }
}

type NuiHandler<T> = (data: T) => void

export function useNuiEvent<T = any>(action: string, handler: NuiHandler<T>) {
    const saved = useRef<NuiHandler<T>>(handler)
    useEffect(() => {
        saved.current = handler
    }, [handler])
    useEffect(() => {
        const listener = (event: MessageEvent) => {
            const msg = event.data
            if (msg && msg.action === action) {
                saved.current(msg.data as T)
            }
        }
        window.addEventListener('message', listener)
        return () => window.removeEventListener('message', listener)
    }, [action])
}

export async function decodeChunks(chunks: string[]): Promise<any> {
    const b64 = chunks.join('')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const ds = new DecompressionStream('gzip')
    const stream = new Blob([bytes]).stream().pipeThrough(ds)
    const text = await new Response(stream).text()
    return JSON.parse(text)
}
