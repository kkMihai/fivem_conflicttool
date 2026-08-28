(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.joaatCase = function (str) {
    const s = String(str)
    let h = 0
    for (let i = 0; i < s.length; i++) {
        h = (h + s.charCodeAt(i)) | 0
        h = (h + (h << 10)) | 0
        h = h ^ (h >>> 6)
    }
    h = (h + (h << 3)) | 0
    h = h ^ (h >>> 11)
    h = (h + (h << 15)) | 0
    return h >>> 0
}

KKCT.joaat = function (str) {
    const s = String(str).toLowerCase()
    let h = 0
    for (let i = 0; i < s.length; i++) {
        h = (h + s.charCodeAt(i)) | 0
        h = (h + (h << 10)) | 0
        h = h ^ (h >>> 6)
    }
    h = (h + (h << 3)) | 0
    h = h ^ (h >>> 11)
    h = (h + (h << 15)) | 0
    return h >>> 0
}
})()
