import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function extOf(file: string): string {
    const m = /\.([a-z0-9]+)/i.exec(file || '')
    return m ? m[1].toLowerCase() : 'other'
}

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function timeAgo(iso: string | null | undefined): string {
    if (!iso) return 'never'
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
    if (s < 60) return `${Math.floor(s)}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
}

export function fmtBytes(n: number): string {
    if (!n) return '0 B'
    if (n < 1024) return `${n} B`
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1048576).toFixed(1)} MB`
}
