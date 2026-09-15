import { useEffect, useState } from 'react'
import { CheckCircle, GitDiff, GitMerge, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/use-store'
import type { Conflict, MergePolicy } from '@/types'

const mergePolicies: { id: MergePolicy; label: string; title: string }[] = [
    { id: 'three-way', label: 'Majority', title: 'Keep what most copies agree on, so anything most copies removed stays removed' },
    { id: 'union', label: 'Keep all', title: 'Keep everything any copy has, even what other copies removed' }
]

const collisionPolicies: { id: MergePolicy; label: string; title: string }[] = [
    { id: 'three-way', label: 'Selected file only', title: 'Keep only the bounds already in the selected result file' },
    { id: 'union', label: 'Combine all bounds', title: 'Put every bound from every collision copy into the selected result file' }
]

export function MergePanel({ c }: { c: Conflict }) {
    const resolved = useStore(s => s.resolved)
    const mergePolicy = useStore(s => s.mergePolicy)
    const mergePreview = useStore(s => s.mergePreview)
    const setMergePolicy = useStore(s => s.setMergePolicy)
    const previewMerge = useStore(s => s.previewMerge)
    const queueMerge = useStore(s => s.queueMerge)
    const m = c.merge
    const baseCopies = c.resources.filter(copy => copy.rel && !copy.status.includes('outside stream') && !copy.status.includes('never loads'))
    const defaultBase = baseCopies[baseCopies.length - 1]
    const copyKey = (resource: string, rel: string) => JSON.stringify([resource, rel])
    const [baseKey, setBaseKey] = useState(defaultBase ? copyKey(defaultBase.name, defaultBase.rel) : '')
    useEffect(() => {
        setBaseKey(defaultBase ? copyKey(defaultBase.name, defaultBase.rel) : '')
        if (m?.kind === 'ybn') setMergePolicy('three-way')
    }, [c.id])
    const selectedCopy = baseCopies.find(copy => copyKey(copy.name, copy.rel) === baseKey) ?? defaultBase
    const selectedBase = selectedCopy ? { resource: selectedCopy.name, rel: selectedCopy.rel } : { resource: '', rel: '' }
    const disabledCopies = baseCopies.filter(copy => copyKey(copy.name, copy.rel) !== baseKey)
    if (!m) return null
    const p = mergePreview && (mergePreview.conflictId === c.id || (mergePreview.ids ?? []).includes(c.id)) ? mergePreview : null
    const running = p?.state === 'running'
    const done = p?.state === 'done' ? p : null
    const lights = m.kind === 'lodlights'
    const binary = !lights && m.kind !== 'entities'
    const collision = m.kind === 'ybn'
    const policies = collision ? collisionPolicies : mergePolicies
    const showPolicy = !binary || collision
    const unit = lights ? 'lights' : m.kind === 'entities' ? 'props' : m.kind === 'ybn' ? 'bounds' : m.kind === 'ydd' ? 'drawables' : 'models'
    const stale = showPolicy && !!done && done.policy !== mergePolicy
    const staleBase = !!done && (done.base?.resource !== selectedBase.resource || done.base?.rel !== selectedBase.rel)
    const canMerge = !!done && !!done.ok && !!done.digest && !done.queued && !stale && !staleBase && !resolved[c.id]
    const copies = done?.copies ?? []
    const totals = done?.totals
    const warnings = [
        ...(done?.warnings ?? []).map(text => ({ resource: '', text })),
        ...copies.flatMap(cp => (cp.warnings ?? []).map(text => ({ resource: cp.resource, text })))
    ]

    return (
        <div className="mx-3 mt-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-2xs font-bold">
                <GitMerge className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {lights ? 'Merge the light copies' : binary ? `Merge the ${m.kind.toUpperCase()} copies` : 'Merge the prop copies'}
            </div>
            <p className="text-3xs leading-relaxed text-secondary-foreground">
                {lights && m.lod && m.dist ? (
                    <>
                        Combines the lights of every copy of <span className="font-mono text-foreground">{m.lod}</span> and{' '}
                        <span className="font-mono text-foreground">{m.dist}</span> into the selected base copy and disables the rest.
                    </>
                ) : (
                    collision ? (
                    <>
                        Pick the file that stays enabled. The result is written there. Every other copy of{' '}
                        <span className="font-mono text-foreground">{c.file}</span> is disabled.
                    </>
                    ) : binary ? (
                    <>
                        Combines the {unit} from every copy of <span className="font-mono text-foreground">{c.file}</span> into the selected base copy and
                        disables the rest.
                    </>
                    ) : (
                    <>
                        Combines the {unit} of every copy of <span className="font-mono text-foreground">{c.file}</span> into the selected base copy and
                        disables the rest.
                    </>
                    )
                )}
            </p>
            {!lights && m.structural && <p className="text-3xs text-muted-foreground">LOD parent file, only field changes can merge.</p>}

            <label className="block space-y-0.5 text-3xs text-muted-foreground">
                <span>Result file, kept enabled</span>
                <select
                    value={baseKey}
                    disabled={running || !!done?.queued || !!resolved[c.id]}
                    onChange={event => setBaseKey(event.target.value)}
                    className="min-h-7 w-full rounded-md border border-border bg-background px-1.5 font-mono text-3xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {baseCopies.map(copy => (
                        <option key={copyKey(copy.name, copy.rel)} value={copyKey(copy.name, copy.rel)}>
                            KEEP: {copy.name} · {copy.rel}
                        </option>
                    ))}
                </select>
                <span className="block leading-relaxed">
                    {collision
                        ? `${selectedCopy?.name ?? 'Selected file'} stays enabled. ${disabledCopies.length} other ${disabledCopies.length === 1 ? 'copy' : 'copies'} will be disabled.`
                        : 'This file stays enabled and receives the merged result.'}
                </span>
            </label>

            {collision && selectedCopy && (
                <div className="rounded-md border border-border bg-card px-1.5 py-1 text-3xs">
                    <div className="flex gap-1.5">
                        <span className="w-12 shrink-0 font-semibold text-cat-vanilla">kept</span>
                        <span className="min-w-0 truncate font-mono" title={`${selectedCopy.name} · ${selectedCopy.rel}`}>
                            {selectedCopy.name} · {selectedCopy.rel}
                        </span>
                    </div>
                    {disabledCopies.map(copy => (
                        <div key={`disabled_${copyKey(copy.name, copy.rel)}`} className="flex gap-1.5 text-muted-foreground">
                            <span className="w-12 shrink-0 font-semibold">disabled</span>
                            <span className="min-w-0 truncate font-mono" title={`${copy.name} · ${copy.rel}`}>
                                {copy.name} · {copy.rel}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {showPolicy && <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Merge policy">
                {policies.map(o => (
                    <button
                        key={o.id}
                        type="button"
                        title={o.title}
                        onClick={() => setMergePolicy(o.id)}
                        aria-pressed={mergePolicy === o.id}
                        className={cn(
                            'min-h-6 flex-1 rounded-md px-1 py-1 text-3xs font-semibold transition-colors duration-150 cursor-pointer',
                            mergePolicy === o.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        )}
                    >
                        {o.label}
                    </button>
                ))}
            </div>}
            {!binary && m.copies < 3 && <p className="text-3xs text-muted-foreground">With two copies there is no majority, so Majority acts as Keep all.</p>}
            {collision && mergePolicy === 'three-way' && <p className="text-3xs text-muted-foreground">No bounds are copied from the disabled files. Existing doors and MLO entrances stay open.</p>}

            <Button
                size="sm"
                variant="secondary"
                className="w-full justify-start"
                disabled={running}
                onClick={() => previewMerge(c, selectedBase)}
                title="Compare every copy and show what the merged file would hold"
            >
                <GitDiff />
                <span className="truncate">{running ? 'Comparing…' : 'Preview merge'}</span>
            </Button>

            {done && copies.length > 0 && (
                <div role="status" className="rounded-md border border-border bg-card px-1.5 py-1 text-3xs">
                    <div className="flex items-end gap-1.5 px-1 leading-tight text-muted-foreground">
                        <span className="min-w-0 flex-1 truncate" title="Copies used for this merge">copy</span>
                        <span className="w-9 shrink-0 text-right">{unit}</span>
                        <span className="w-9 shrink-0 text-right">only here</span>
                        <span className="w-9 shrink-0 text-right">removed</span>
                        <span className="w-9 shrink-0 text-right" title="Ties this copy lost to a copy later in load order">lost ties</span>
                    </div>
                    <div className="mt-0.5 space-y-0.5">
                        {copies.map((cp, i) => (
                            <div
                                key={`${cp.resource}_${i}`}
                                className={cn(
                                    'flex items-center gap-1.5 rounded-sm px-1 py-0.5',
                                    cp.target && 'bg-cat-vanilla/10 text-cat-vanilla',
                                    cp.excluded && 'text-muted-foreground'
                                )}
                            >
                                <span className="min-w-0 truncate font-mono">{cp.resource}</span>
                                {cp.target && <span className="shrink-0">kept</span>}
                                {cp.excluded && <span className="shrink-0">disabled</span>}
                                <span className="ml-auto w-9 shrink-0 text-right font-mono">{cp.total}</span>
                                <span className="w-9 shrink-0 text-right font-mono">{cp.excluded ? '' : cp.onlyHere > 0 ? `+${cp.onlyHere}` : '0'}</span>
                                <span className="w-9 shrink-0 text-right font-mono">{cp.excluded ? '' : cp.removed > 0 ? `-${cp.removed}` : '0'}</span>
                                <span className="w-9 shrink-0 text-right font-mono">{cp.excluded ? '' : cp.lost}</span>
                            </div>
                        ))}
                    </div>
                    {totals && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 border-t border-border px-1 pt-1">
                            <span>
                                <span className="font-mono font-semibold">{totals.merged}</span> {unit} after merge
                            </span>
                            <span className="text-muted-foreground">
                                · <span className="font-mono">+{totals.added}</span> added
                            </span>
                            <span className="text-muted-foreground">
                                · <span className="font-mono">-{totals.removed}</span> removed
                            </span>
                            <span className="text-muted-foreground">
                                · <span className="font-mono">{totals.changed}</span> changed
                            </span>
                            {totals.conflicts > 0 && (
                                <span className="text-muted-foreground">
                                    · <span className="font-mono">{totals.conflicts}</span> ties
                                </span>
                            )}
                            {totals.unresolved > 0 && (
                                <span className="text-muted-foreground">
                                    · <span className="font-mono">{totals.unresolved}</span> unresolved
                                </span>
                            )}
                        </div>
                    )}
                    {(done.files ?? []).map(f => (
                        <div key={f.file} className="mt-0.5 flex items-center gap-1.5 px-1 text-muted-foreground">
                            <span className="min-w-0 truncate font-mono">{f.file}</span>
                            <span className="shrink-0">into</span>
                            <span className="shrink-0 font-mono">{f.target}</span>
                            <span className="ml-auto shrink-0 font-mono">{f.total}</span>
                        </div>
                    ))}
                </div>
            )}

            {!binary && done && done.effective && done.effective !== done.policy && (
                <p className="text-3xs text-muted-foreground">Fewer than 3 copies could vote, so Majority ran as Keep all.</p>
            )}

            {warnings.length > 0 && (
                <div className="flex items-start gap-1.5 rounded-md border border-cat-occl/40 bg-cat-occl/10 px-1.5 py-1 text-3xs text-cat-occl">
                    <Warning className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 space-y-0.5">
                        {warnings.map((w, i) => (
                            <div key={i}>
                                {w.resource && <span className="font-mono">{w.resource}</span>}
                                {w.resource ? ': ' : ''}
                                {w.text}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {done && !done.ok && (
                <div className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-1 text-3xs text-destructive">
                    <Warning className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{done.reason ?? 'The merge could not be built.'}</span>
                </div>
            )}

            {done?.queued && (
                <div className="flex items-start gap-1.5 rounded-md border border-cat-vanilla/40 bg-cat-vanilla/10 px-1.5 py-1 text-3xs text-cat-vanilla">
                    <CheckCircle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>
                        Merge queued. Resolve writes {lights ? 'both result files' : `the result into ${selectedCopy?.name ?? 'the selected file'}`} and
                        disables {disabledCopies.length} other {disabledCopies.length === 1 ? 'copy' : 'copies'}, then restart the server.
                    </span>
                </div>
            )}

            {stale && <p className="text-3xs text-muted-foreground">The policy changed. Preview again before merging.</p>}
            {staleBase && <p className="text-3xs text-muted-foreground">The kept result file changed. Preview again before merging.</p>}

            <Button
                size="sm"
                className="w-full"
                disabled={!canMerge}
                onClick={() => queueMerge(c)}
                title={stale ? 'The policy changed, preview again first' : 'Queue this merge. Resolve writes it.'}
            >
                <GitMerge />
                {selectedCopy ? `Queue result into ${selectedCopy.name}` : 'Queue merge'}
            </Button>
        </div>
    )
}
