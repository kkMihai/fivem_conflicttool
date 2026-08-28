import { Check, EyeSlash, Lock } from '@phosphor-icons/react'
import type { Conflict } from '@/types'
import { cn } from '@/lib/utils'

const railClass: Record<string, string> = {
    coll: 'bg-cat-coll',
    occl: 'bg-cat-occl',
    prop: 'bg-cat-prop',
    asset: 'bg-cat-asset'
}

const sevClass: Record<string, string> = {
    cosmetic: 'text-cat-prop',
    medium: 'text-cat-occl',
    high: 'text-cat-coll'
}

export function ConflictRow({
    conflict,
    index,
    selected,
    resolved,
    checked,
    onCheck,
    onClick
}: {
    conflict: Conflict
    index: number
    selected: boolean
    resolved: string | undefined
    checked: boolean
    onCheck: (shift: boolean) => void
    onClick: () => void
}) {
    const c = conflict
    const state = [c.ignored ? 'ignored' : null, resolved ?? null].filter(Boolean).join(', ')
    return (
        <div
            className={cn(
                'relative w-full overflow-hidden rounded-lg border text-left transition-colors duration-150',
                selected
                    ? 'border-ring/50 bg-accent'
                    : 'border-border bg-card hover:border-ring/30 hover:bg-muted',
                resolved && 'opacity-75',
                c.ignored && 'opacity-70'
            )}
        >
            <button
                type="button"
                onClick={e => {
                    if (e.detail > 0) e.currentTarget.blur()
                    onClick()
                }}
                aria-pressed={selected}
                aria-label={`${c.title}, ${c.sev} severity, ${c.resources[0]?.name ?? ''} versus ${c.resources[1]?.name ?? ''}${state ? `, ${state}` : ''}`}
                className="absolute inset-0 z-0 cursor-pointer rounded-lg focus-visible:-outline-offset-2"
            />
            <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 z-10 w-0.75', railClass[c.cat])} />
            <div className="pointer-events-none relative z-10 py-1.5 pl-3.5 pr-2.5">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={`Select ${c.title}`}
                        onClick={e => {
                            e.stopPropagation()
                            onCheck(e.shiftKey)
                        }}
                        className="pointer-events-auto -m-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md"
                    >
                        <span
                            className={cn(
                                'flex h-4 w-4 items-center justify-center rounded-sm border transition-colors duration-100',
                                checked ? 'border-primary bg-primary text-primary-foreground' : 'border-ring/30 bg-background'
                            )}
                        >
                            {checked && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
                        </span>
                    </button>
                    <span className="truncate font-mono text-xs font-bold">{c.title}</span>
                    {c.isNew && !c.ignored && (
                        <span className="shrink-0 rounded-sm bg-primary px-1 py-px text-3xs font-bold uppercase leading-tight tracking-wide text-primary-foreground">new</span>
                    )}
                    {c.ignored && <EyeSlash className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    {c.vanilla && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cat-vanilla" title="vanilla" aria-hidden="true" />}
                    {resolved && <Check className="h-3 w-3 shrink-0 text-cat-vanilla" aria-hidden="true" />}
                    {c.badges.includes('FILES UNAVAILABLE') && <Lock className="h-3 w-3 shrink-0 text-destructive" aria-hidden="true" />}
                    <span className="ml-auto shrink-0 text-3xs text-muted-foreground">#{index}</span>
                </div>
                <div className="mt-0.5 truncate text-3xs">
                    <span className="font-mono text-res-a">{c.resources[0]?.name}</span>
                    <span className="text-muted-foreground"> vs </span>
                    <span className="font-mono text-res-b">{c.resources[1]?.name}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-3xs">
                    <span className={cn('font-bold uppercase tracking-wide', sevClass[c.sev])}>{c.sev}</span>
                    <span className="truncate text-muted-foreground">
                        {resolved ?? c.badges.filter(b => b !== 'FILES UNAVAILABLE').join(' · ')}
                    </span>
                </div>
            </div>
        </div>
    )
}
