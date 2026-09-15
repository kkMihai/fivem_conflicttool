import type { ConflictResource } from '@/types'

export function partitionAssetCopies(resources: ConflictResource[], keepIndex: number) {
    const winner = resources[keepIndex]
    if (!winner) return null
    return {
        winner,
        losers: resources.filter((_, index) => index !== keepIndex)
    }
}
