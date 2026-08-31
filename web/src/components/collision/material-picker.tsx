import { useMemo, useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CollisionMatSlot } from '@/types'

interface MaterialPickerProps {
    names: string[]
    flagNames: string[]
    colors?: [number, number, number][]
    mat: CollisionMatSlot
    onSurface: (type: number) => void
    onFlags: (flags: number) => void
    onClose: () => void
    hideFlags?: boolean
    surfaceLabel?: string
}

const pretty = (name: string) => name.toLowerCase().replace(/_/g, ' ')

export function MaterialPicker({ names, flagNames, colors, mat, onSurface, onFlags, onClose, hideFlags, surfaceLabel }: MaterialPickerProps) {
    const [q, setQ] = useState('')

    const matches = useMemo(() => {
        const needle = q.trim().toLowerCase().replace(/\s+/g, '_')
        const all = names.map((name, type) => ({ name, type }))
        if (!needle) return all
        return all.filter(m => m.name.toLowerCase().includes(needle))
    }, [names, q])

    return (
        <div className="mt-1 rounded-md border border-border bg-background p-1.5">
            <div className="flex items-center gap-1.5">
                <MagnifyingGlass className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Input
                    autoFocus
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search surfaces"
                    aria-label="Search collision surfaces"
                    className="h-6 text-2xs"
                />
                <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 px-0" onClick={onClose} aria-label="Close the surface picker">
                    <X className="h-3 w-3" aria-hidden="true" />
                </Button>
            </div>

            <div className="mt-1 max-h-40 overflow-y-auto" role="listbox" aria-label="Collision surfaces">
                {matches.length === 0 && <div className="px-1 py-2 text-3xs text-muted-foreground">No surface matches that.</div>}
                {matches.map(m => (
                    <button
                        key={m.type}
                        type="button"
                        role="option"
                        aria-selected={m.type === mat.type}
                        onClick={() => onSurface(m.type)}
                        className={cn(
                            'flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors duration-150 cursor-pointer',
                            m.type === mat.type ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border"
                            style={colors?.[m.type] ? { backgroundColor: `rgb(${colors[m.type].join(',')})` } : undefined}
                        />
                        <span className="truncate font-mono text-3xs">{m.name}</span>
                        <span
                            className={cn(
                                'ml-auto shrink-0 font-mono text-3xs',
                                m.type === mat.type ? 'text-primary-foreground/70' : 'text-muted-foreground'
                            )}
                        >
                            {m.type}
                        </span>
                    </button>
                ))}
            </div>

            {surfaceLabel && <div className="px-1 pt-1 text-3xs text-muted-foreground">{surfaceLabel}</div>}

            {!hideFlags && flagNames.length > 0 && (
                <div className="mt-1.5 border-t border-border pt-1.5">
                    <div className="px-1 text-3xs font-semibold text-muted-foreground">Flags</div>
                    <div className="mt-1 grid grid-cols-2 gap-x-1">
                        {flagNames.map((flag, bit) => {
                            const on = (mat.flags & (1 << bit)) !== 0
                            return (
                                <label
                                    key={flag}
                                    className="flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-3xs transition-colors duration-150 hover:bg-accent"
                                >
                                    <input
                                        type="checkbox"
                                        checked={on}
                                        onChange={() => onFlags(on ? mat.flags & ~(1 << bit) : mat.flags | (1 << bit))}
                                        className="h-2.5 w-2.5 shrink-0 cursor-pointer accent-primary"
                                    />
                                    <span className={cn('truncate', on ? 'text-foreground' : 'text-muted-foreground')}>{pretty(flag)}</span>
                                </label>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
