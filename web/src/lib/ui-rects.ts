export interface UiRects {
    rects: number[][]
    w: number
    h: number
}

export function readUiRects(document: Document, viewport: Pick<Window, 'innerWidth' | 'innerHeight'>): UiRects {
    const w = viewport.innerWidth || 1
    const h = viewport.innerHeight || 1
    const rects = document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]')
        ? [[0, 0, 1, 1]]
        : Array.from(document.querySelectorAll('[data-panel]'))
            .map(el => el.getBoundingClientRect())
            .filter(r => r.width > 1 && r.height > 1)
            .map(r => [r.left / w, r.top / h, r.right / w, r.bottom / h])
    return { rects, w, h }
}

export function createUiRectsSender(post: (payload: UiRects) => Promise<unknown>, now = Date.now) {
    let last = ''
    let acknowledgedAt = 0
    let retryAt = 0
    let pending = false
    return async (payload: UiRects) => {
        const at = now()
        const key = JSON.stringify(payload)
        if (pending || at < retryAt || (key === last && at - acknowledgedAt < 2000)) return
        pending = true
        try {
            if (await post(payload) === true) {
                last = key
                acknowledgedAt = now()
                retryAt = 0
            } else {
                retryAt = now() + 1000
            }
        } catch (error) {
            console.error('[fivem_conflicttool] hitbox update failed', error)
            retryAt = now() + 1000
        } finally {
            pending = false
        }
    }
}
