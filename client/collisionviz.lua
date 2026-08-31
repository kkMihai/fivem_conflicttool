CT.CollisionViz = {
    boxes = {},
    sets = {},
    setMats = {},
    occl = nil,
    chunks = nil,
    dirty = false,
    bounds = nil,
    boundKey = nil,
    editBi = nil,
    boundSel = nil,
    boundMats = nil,
    editM = nil,
    drawOffset = nil,
    gen = 0,
    dynGen = 0,
    dynActive = false
}

local CV = CT.CollisionViz
local DrawPoly = DrawPoly
local DrawLine = DrawLine
local floor = math.floor
local sqrt = math.sqrt
local CELL = 50.0
local PULL = 0.5

local POLY_TOTAL = 5000
local LINE_TOTAL = 4000
local DYN_POLY = 2500
local DYN_LINE = 2000
local WIRE_R = 25.0
local WIRE_D2 = WIRE_R * WIRE_R
local DRAW_R = 300.0
local DRAW_D2 = DRAW_R * DRAW_R
local MIN_PX = 4.0
local CAM_STEP2 = 0.25
local CAM_TURN = 0.99966
local BOX_LIMIT = 40
local BOX_D2 = 160000.0

local xrOn = false
local xrX, xrY, xrZ = 0.0, 0.0, 0.0
local xrFx, xrFy, xrFz = 0.0, 1.0, 0.0

local function pull(x, y, z)
    if not xrOn then return x, y, z end
    local ox, oy, oz = x - xrX, y - xrY, z - xrZ
    if ox * xrFx + oy * xrFy + oz * xrFz < 0.3 then return x, y, z end
    local l = sqrt(ox * ox + oy * oy + oz * oz)
    if l < 1.0 then return x, y, z end
    local s = PULL / l
    return xrX + ox * s, xrY + oy * s, xrZ + oz * s
end

CV.Pull = pull

local pnx, pny, pnz = {}, {}, {}
local eyeX, eyeY, eyeZ = 0.0, 0.0, 0.0
local areaTh = 5e-11

local function buildFrustum(px, py, pz, fx, fy, fz)
    eyeX, eyeY, eyeZ = px, py, pz
    local rx, ry = fy, -fx
    local rl = sqrt(rx * rx + ry * ry)
    if rl < 0.0001 then
        rx, ry, rl = 1.0, 0.0, 1.0
    end
    rx, ry = rx / rl, ry / rl
    local ux = ry * fz
    local uy = -rx * fz
    local uz = rx * fy - ry * fx
    local tv = math.tan(math.rad(GetFinalRenderedCamFov()) * 0.5)
    local aspect = (CT.uiW > 0 and CT.uiH > 0) and (CT.uiW / CT.uiH) or 1.7777
    local th = tv * aspect
    local h = (CT.uiH > 0) and CT.uiH or 1080.0
    local t2 = tv * tv
    local h2 = h * h
    areaTh = 64.0 * MIN_PX * MIN_PX * t2 * t2 / (h2 * h2)
    local sh = 1.0 / sqrt(th * th + 1.0)
    local sv = 1.0 / sqrt(tv * tv + 1.0)
    pnx[1], pny[1], pnz[1] = (th * fx + rx) * sh, (th * fy + ry) * sh, (th * fz) * sh
    pnx[2], pny[2], pnz[2] = (th * fx - rx) * sh, (th * fy - ry) * sh, (th * fz) * sh
    pnx[3], pny[3], pnz[3] = (tv * fx + ux) * sv, (tv * fy + uy) * sv, (tv * fz + uz) * sv
    pnx[4], pny[4], pnz[4] = (tv * fx - ux) * sv, (tv * fy - uy) * sv, (tv * fz - uz) * sv
    pnx[5], pny[5], pnz[5] = fx, fy, fz
end

local function sphereVisible(cx, cy, cz, r)
    local dx, dy, dz = cx - eyeX, cy - eyeY, cz - eyeZ
    for i = 1, 5 do
        if dx * pnx[i] + dy * pny[i] + dz * pnz[i] < -r then return false end
    end
    return true
end

CV.SphereVisible = sphereVisible
CV.BuildFrustum = buildFrustum

local BUCKETS = 56
local BUCKET_STEP = DRAW_R / BUCKETS

local function newBuckets()
    local bk = { tab = {}, off = {}, col = {}, knd = {}, n = {} }
    for i = 1, BUCKETS do
        bk.tab[i] = {}
        bk.off[i] = {}
        bk.col[i] = {}
        bk.knd[i] = {}
        bk.n[i] = 0
    end
    return bk
end

local S = newBuckets()
local D = newBuckets()

local function resetBuckets(bk)
    local n = bk.n
    for i = 1, BUCKETS do
        n[i] = 0
    end
end

local function push(bk, dist, tbl, off, col, knd)
    local b = 1 + floor(dist / BUCKET_STEP)
    if b < 1 then b = 1 elseif b > BUCKETS then b = BUCKETS end
    local i = bk.n[b] + 1
    bk.n[b] = i
    bk.tab[b][i] = tbl
    bk.off[b][i] = off
    bk.col[b][i] = col
    bk.knd[b][i] = knd
end

local colCache = {}

function CV.Touch()
    CV.dirty = true
    CV.DropEditCache()
    CV.gen = CV.gen + 1
    CV.dynGen = CV.dynGen + 1
    colCache = {}
end

function CV.Invalidate()
    CV.gen = CV.gen + 1
    CV.dynGen = CV.dynGen + 1
end

function CV.InvalidateDyn()
    CV.dynGen = CV.dynGen + 1
end

function CV.ResetColors()
    colCache = {}
    CV.Invalidate()
end

function CV.SurfaceColor(ty)
    local colors = CT.collMatColors
    if ty and ty >= 0 and colors then
        local c = colors[ty + 1]
        if c then return c[1], c[2], c[3] end
    end
    return 255, 40, 40
end

local function packSurface(ty)
    local p = colCache[ty]
    if p then return p end
    local r, g, b = CV.SurfaceColor(ty)
    p = floor(r) * 65536 + floor(g) * 256 + floor(b)
    colCache[ty] = p
    return p
end

CV.PackSurface = packSurface

function CV.PackColor(r, g, b)
    return floor(r) * 65536 + floor(g) * 256 + floor(b)
end

local dynPoly, dynLine = 0, 0

function CV.BeginDyn()
    resetBuckets(D)
    dynPoly, dynLine = DYN_POLY, DYN_LINE
end

function CV.PushDynTri(dist, tbl, off, col, knd)
    if dynPoly <= 0 then return false end
    dynPoly = dynPoly - 1
    if knd ~= 0 then
        if dynLine < 3 then
            knd = 0
        else
            dynLine = dynLine - 3
        end
    end
    push(D, dist, tbl, off, col, knd)
    return true
end

local function rotatePoint(px, py, pz, q)
    local x, y, z, w = q[1], q[2], q[3], q[4]
    local ux, uy, uz = x, y, z
    local s = w
    local dotUV = ux * px + uy * py + uz * pz
    local dotUU = ux * ux + uy * uy + uz * uz
    local cx = uy * pz - uz * py
    local cy = uz * px - ux * pz
    local cz = ux * py - uy * px
    return
        2.0 * dotUV * ux + (s * s - dotUU) * px + 2.0 * s * cx,
        2.0 * dotUV * uy + (s * s - dotUU) * py + 2.0 * s * cy,
        2.0 * dotUV * uz + (s * s - dotUU) * pz + 2.0 * s * cz
end

function CV.SetBox(model, pos, quat)
    if not IsModelValid(model) then return end
    local mn, mx = GetModelDimensions(model)
    CV.boxes = { { min = mn, max = mx, pos = pos, quat = quat or { 0.0, 0.0, 0.0, 1.0 } } }
end

function CV.ClearBox()
    CV.boxes = {}
end

function CV.Clear()
    CV.boxes = {}
    CV.sets = {}
    CV.setMats = {}
    CV.occl = nil
    CV.chunks = nil
    CV.bounds = nil
    CV.boundKey = nil
    CV.editBi = nil
    CV.editM = nil
    CV.DropEditCache()
    CV.drawOffset = nil
    CV.boundMats = nil
    CV.Touch()
    CV.dirty = false
end

local function xf(m, x, y, z)
    if not m then return x, y, z end
    return m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
        m[3] * x + m[7] * y + m[11] * z + m[15]
end

CV.Transform = xf

local function newChunk()
    return {
        t = {}, tn = 0, e = {}, en = 0,
        vid = {}, vn = 0, eseen = {},
        mnx = 1e30, mny = 1e30, mnz = 1e30,
        mxx = -1e30, mxy = -1e30, mxz = -1e30,
        cx = 0.0, cy = 0.0, cz = 0.0, r = 0.0, d2 = 0.0
    }
end

local function grow(c, x, y, z)
    if x < c.mnx then c.mnx = x end
    if y < c.mny then c.mny = y end
    if z < c.mnz then c.mnz = z end
    if x > c.mxx then c.mxx = x end
    if y > c.mxy then c.mxy = y end
    if z > c.mxz then c.mxz = z end
end

local function vertId(c, x, y, z)
    local k = (floor(x * 50) % 262144) * 68719476736 + (floor(y * 50) % 262144) * 262144 + (floor(z * 50) % 262144)
    local id = c.vid[k]
    if id then return id end
    id = c.vn + 1
    c.vn = id
    c.vid[k] = id
    return id
end

local function addEdge(c, a, b, x1, y1, z1, x2, y2, z2, ty)
    local lo, hi = a, b
    if lo > hi then lo, hi = hi, lo end
    local k = lo * 1048576 + hi
    if c.eseen[k] then return end
    c.eseen[k] = true
    local e = c.e
    local o = c.en * 7
    e[o + 1], e[o + 2], e[o + 3] = x1, y1, z1
    e[o + 4], e[o + 5], e[o + 6] = x2, y2, z2
    e[o + 7] = ty
    c.en = c.en + 1
end

local function finishChunk(c)
    c.cx = (c.mnx + c.mxx) * 0.5
    c.cy = (c.mny + c.mxy) * 0.5
    c.cz = (c.mnz + c.mxz) * 0.5
    local hx, hy, hz = c.mxx - c.cx, c.mxy - c.cy, c.mxz - c.cz
    c.r = sqrt(hx * hx + hy * hy + hz * hz)
    c.vid = nil
    c.eseen = nil
end

function CV.BuildChunks(src, count, types, useIndex)
    local chunks = {}
    local map = {}
    for i = 1, count do
        local o = (i - 1) * 9
        local x1, y1, z1 = src[o + 1], src[o + 2], src[o + 3]
        local x2, y2, z2 = src[o + 4], src[o + 5], src[o + 6]
        local x3, y3, z3 = src[o + 7], src[o + 8], src[o + 9]
        local key = floor(x1 / CELL) * 100000 + floor(y1 / CELL)
        local c = map[key]
        if not c then
            c = newChunk()
            map[key] = c
            chunks[#chunks + 1] = c
        end
        local ux, uy, uz = x2 - x1, y2 - y1, z2 - z1
        local vx, vy, vz = x3 - x1, y3 - y1, z3 - z1
        local nx = uy * vz - uz * vy
        local ny = uz * vx - ux * vz
        local nz = ux * vy - uy * vx
        local ty = useIndex and i or (types and types[i] or -1)
        local a = c.t
        local b = c.tn * 14
        a[b + 1], a[b + 2], a[b + 3] = x1, y1, z1
        a[b + 4], a[b + 5], a[b + 6] = x2, y2, z2
        a[b + 7], a[b + 8], a[b + 9] = x3, y3, z3
        a[b + 10], a[b + 11], a[b + 12] = nx, ny, nz
        a[b + 13] = ty
        a[b + 14] = nx * nx + ny * ny + nz * nz
        c.tn = c.tn + 1
        grow(c, x1, y1, z1)
        grow(c, x2, y2, z2)
        grow(c, x3, y3, z3)
        if not useIndex and c.vn < 1000000 then
            local i1 = vertId(c, x1, y1, z1)
            local i2 = vertId(c, x2, y2, z2)
            local i3 = vertId(c, x3, y3, z3)
            addEdge(c, i1, i2, x1, y1, z1, x2, y2, z2, ty)
            addEdge(c, i2, i3, x2, y2, z2, x3, y3, z3, ty)
            addEdge(c, i3, i1, x3, y3, z3, x1, y1, z1, ty)
        end
    end
    for i = 1, #chunks do
        finishChunk(chunks[i])
    end
    return chunks
end

local function byDist(a, b)
    return a.d2 < b.d2
end

function CV.SortByDist(chunks, px, py, pz)
    for i = 1, #chunks do
        local c = chunks[i]
        local dx, dy, dz = c.cx - px, c.cy - py, c.cz - pz
        c.d2 = dx * dx + dy * dy + dz * dz
    end
    table.sort(chunks, byDist)
end

function CV.AreaVisible(lenSq, d2)
    return lenSq > areaTh * d2 * d2
end

CV.WireD2 = WIRE_D2
CV.DrawD2 = DRAW_D2
CV.WireR = WIRE_R
CV.DrawR = DRAW_R

function CV.RebuildStatic()
    if not CV.bounds then return end
    local out = {}
    local types = {}
    local n = 0
    local tn = 0
    for _, b in ipairs(CV.bounds) do
        if b.bi ~= CV.editBi and b.tris then
            local t = b.tris
            local m = b.m
            local slots = b.faceSlots
            local slotType = CV.boundMats and CV.boundMats[b.bi] or nil
            local k = 0
            for i = 1, #t - 8, 9 do
                k = k + 1
                local x1, y1, z1 = xf(m, t[i], t[i + 1], t[i + 2])
                local x2, y2, z2 = xf(m, t[i + 3], t[i + 4], t[i + 5])
                local x3, y3, z3 = xf(m, t[i + 6], t[i + 7], t[i + 8])
                out[n + 1], out[n + 2], out[n + 3] = x1, y1, z1
                out[n + 4], out[n + 5], out[n + 6] = x2, y2, z2
                out[n + 7], out[n + 8], out[n + 9] = x3, y3, z3
                n = n + 9
                tn = tn + 1
                local slot = slots and slots[k]
                types[tn] = (slot and slotType and slotType[slot]) or -1
            end
        end
    end
    CV.sets['coll'] = n > 0 and out or nil
    CV.setMats['coll'] = n > 0 and types or nil
    CV.Touch()
end

local function boundSphere(b)
    local mn, mx = b.bmin, b.bmax
    if not (mn and mx) then
        b.wr = -1.0
        return
    end
    local mnx, mny, mnz = 1e30, 1e30, 1e30
    local mxx, mxy, mxz = -1e30, -1e30, -1e30
    for i = 0, 7 do
        local x = (i % 2 == 1) and mx[1] or mn[1]
        local y = (floor(i / 2) % 2 == 1) and mx[2] or mn[2]
        local z = (floor(i / 4) % 2 == 1) and mx[3] or mn[3]
        local wx, wy, wz = xf(b.m, x, y, z)
        if wx < mnx then mnx = wx end
        if wy < mny then mny = wy end
        if wz < mnz then mnz = wz end
        if wx > mxx then mxx = wx end
        if wy > mxy then mxy = wy end
        if wz > mxz then mxz = wz end
    end
    b.wcx, b.wcy, b.wcz = (mnx + mxx) * 0.5, (mny + mxy) * 0.5, (mnz + mxz) * 0.5
    local hx, hy, hz = mxx - b.wcx, mxy - b.wcy, mxz - b.wcz
    b.wr = sqrt(hx * hx + hy * hy + hz * hz)
end

function CV.SetBounds(payload)
    if not (payload and payload.bounds) then
        CV.bounds = nil
        CV.boundKey = nil
        CV.editBi = nil
        CV.editM = nil
        CV.DropEditCache()
        CV.sets['coll'] = nil
        CV.setMats['coll'] = nil
        CV.boundMats = nil
        CV.Touch()
        return
    end
    CV.bounds = payload.bounds
    CV.boundKey = payload.key
    CV.editBi = nil
    CV.editM = nil
    CV.DropEditCache()
    CV.drawOffset = nil
    for _, b in ipairs(payload.bounds) do
        boundSphere(b)
    end
    CV.RebuildStatic()
end

function CV.BoundAt(bi)
    if not CV.bounds then return nil end
    for _, b in ipairs(CV.bounds) do
        if b.bi == bi then return b end
    end
    return nil
end

local editLocal, editLocalN, editLocalKey = nil, 0, nil
local editScratch = {}

local function buildEditLocal()
    editLocal, editLocalN = nil, 0
    editLocalKey = tostring(CV.boundKey) .. '|' .. tostring(CV.editBi)
    local b = CV.editBi and CV.BoundAt(CV.editBi) or nil
    if not (b and b.tris) then return end
    local t = b.tris
    local slots = b.faceSlots
    local slotType = CV.boundMats and CV.boundMats[CV.editBi] or nil
    local w = {}
    local n = 0
    local k = 0
    for i = 1, #t - 8, 9 do
        k = k + 1
        local x1, y1, z1 = t[i], t[i + 1], t[i + 2]
        local x2, y2, z2 = t[i + 3], t[i + 4], t[i + 5]
        local x3, y3, z3 = t[i + 6], t[i + 7], t[i + 8]
        local ux, uy, uz = x2 - x1, y2 - y1, z2 - z1
        local vx, vy, vz = x3 - x1, y3 - y1, z3 - z1
        local nx = uy * vz - uz * vy
        local ny = uz * vx - ux * vz
        local nz = ux * vy - uy * vx
        local o = n * 14
        w[o + 1], w[o + 2], w[o + 3] = x1, y1, z1
        w[o + 4], w[o + 5], w[o + 6] = x2, y2, z2
        w[o + 7], w[o + 8], w[o + 9] = x3, y3, z3
        w[o + 10], w[o + 11], w[o + 12] = nx, ny, nz
        local slot = slots and slots[k]
        w[o + 13] = (slot and slotType and slotType[slot]) or -1
        w[o + 14] = nx * nx + ny * ny + nz * nz
        n = n + 1
    end
    editLocal, editLocalN = w, n
end

function CV.DropEditCache()
    editLocalKey = nil
end

local verifySession = 0

function CV.ProbeSets(payload)
    local sets = payload and payload.sets
    if not (sets and #sets > 0) then
        CT.NuiSend('collVerify', { state = 'none' })
        return
    end
    verifySession = verifySession + 1
    local mySession = verifySession
    CT.NuiSend('collVerify', { state = 'running' })
    CreateThread(function()
        local cam = CT.Freecam.active and CT.Freecam.pos or GetGameplayCamCoord()
        local px, py, pz = cam.x, cam.y, cam.z
        local ped = PlayerPedId()
        local out = {}
        local anyTested = false
        for si = 1, #sets do
            if verifySession ~= mySession then return end
            local set = sets[si]
            local tested, matched = 0, 0
            for k = 1, #(set.points or {}) do
                if verifySession ~= mySession then return end
                local pt = set.points[k]
                local c, n = pt.c, pt.n
                local dx, dy, dz = c[1] - px, c[2] - py, c[3] - pz
                if dx * dx + dy * dy + dz * dz < 3600.0 then
                    local ok = false
                    for _, sign in ipairs({ 1.0, -1.0 }) do
                        if ok then break end
                        local h = StartExpensiveSynchronousShapeTestLosProbe(
                            c[1] + n[1] * 0.4 * sign, c[2] + n[2] * 0.4 * sign, c[3] + n[3] * 0.4 * sign,
                            c[1] - n[1] * 0.4 * sign, c[2] - n[2] * 0.4 * sign, c[3] - n[3] * 0.4 * sign,
                            1, ped, 4)
                        local _, res, coords = GetShapeTestResult(h)
                        if res == 1 then
                            local ex, ey, ez = coords.x - c[1], coords.y - c[2], coords.z - c[3]
                            if ex * ex + ey * ey + ez * ez < 0.16 then
                                ok = true
                            end
                        end
                    end
                    tested = tested + 1
                    if ok then matched = matched + 1 end
                    if tested % 6 == 0 then Wait(0) end
                end
            end
            if tested > 0 then anyTested = true end
            out[#out + 1] = {
                resource = set.resource,
                unique = set.unique,
                total = set.total,
                tested = tested,
                matched = matched,
                pct = tested > 0 and floor(matched / tested * 100 + 0.5) or nil
            }
        end
        if not anyTested then
            CT.NuiSend('collVerify', { state = 'far', copies = out })
            return
        end
        CT.NuiSend('collVerify', { state = 'done', file = payload.file, copies = out })
    end)
end

local function rebuildChunks()
    CV.dirty = false
    local chunks = {}
    for tag, t in pairs(CV.sets) do
        local part = CV.BuildChunks(t, floor(#t / 9), CV.setMats[tag], false)
        for i = 1, #part do
            chunks[#chunks + 1] = part[i]
        end
    end
    CV.chunks = chunks
end

local function gatherStatic(px, py, pz, fx, fy, fz)
    resetBuckets(S)
    local chunks = CV.chunks
    if not (chunks and #chunks > 0) then return end
    local ox, oy, oz = 0.0, 0.0, 0.0
    local off = CV.drawOffset
    if off then
        ox, oy, oz = off[1], off[2], off[3]
    end
    CV.SortByDist(chunks, px - ox, py - oy, pz - oz)
    local poly = CV.dynActive and (POLY_TOTAL - DYN_POLY) or POLY_TOTAL
    local line = CV.dynActive and (LINE_TOTAL - DYN_LINE) or LINE_TOTAL
    for ci = 1, #chunks do
        if poly <= 0 then break end
        local c = chunks[ci]
        local r = c.r
        local far = DRAW_R + r
        if c.d2 < far * far and sphereVisible(c.cx + ox, c.cy + oy, c.cz + oz, r) then
            local t = c.t
            for j = 0, c.tn - 1 do
                if poly <= 0 then break end
                local o = j * 14
                local dx = t[o + 1] + ox - px
                local dy = t[o + 2] + oy - py
                local dz = t[o + 3] + oz - pz
                local d2 = dx * dx + dy * dy + dz * dz
                if d2 < DRAW_D2 and t[o + 14] > areaTh * d2 * d2
                    and dx * fx + dy * fy + dz * fz > -4.0 then
                    poly = poly - 1
                    push(S, sqrt(d2), t, o, packSurface(t[o + 13]), 0)
                end
            end
            local near = WIRE_R + r
            if line > 0 and c.d2 < near * near then
                local e = c.e
                for j = 0, c.en - 1 do
                    if line <= 0 then break end
                    local o = j * 7
                    local dx = e[o + 1] + ox - px
                    local dy = e[o + 2] + oy - py
                    local dz = e[o + 3] + oz - pz
                    local d2 = dx * dx + dy * dy + dz * dz
                    if d2 < WIRE_D2 then
                        line = line - 1
                        push(S, sqrt(d2), e, o, packSurface(e[o + 7]), 2)
                    end
                end
            end
        end
    end
end

local function gatherEdit(px, py, pz, fx, fy, fz)
    local key = tostring(CV.boundKey) .. '|' .. tostring(CV.editBi)
    if editLocalKey ~= key then
        buildEditLocal()
    end
    local L = editLocal
    if not L then return end
    local m = CV.editM
    local a1, a2, a3 = m[1], m[2], m[3]
    local b1, b2, b3 = m[5], m[6], m[7]
    local c1, c2, c3 = m[9], m[10], m[11]
    local t1, t2, t3 = m[13], m[14], m[15]
    local w = editScratch
    local n = 0
    for j = 0, editLocalN - 1 do
        local o = j * 14
        local lx, ly, lz = L[o + 1], L[o + 2], L[o + 3]
        local x1 = a1 * lx + b1 * ly + c1 * lz + t1
        local y1 = a2 * lx + b2 * ly + c2 * lz + t2
        local z1 = a3 * lx + b3 * ly + c3 * lz + t3
        local dx, dy, dz = x1 - px, y1 - py, z1 - pz
        local d2 = dx * dx + dy * dy + dz * dz
        if d2 < DRAW_D2 and L[o + 14] > areaTh * d2 * d2
            and dx * fx + dy * fy + dz * fz > -4.0 then
            local q = n * 14
            lx, ly, lz = L[o + 4], L[o + 5], L[o + 6]
            w[q + 4] = a1 * lx + b1 * ly + c1 * lz + t1
            w[q + 5] = a2 * lx + b2 * ly + c2 * lz + t2
            w[q + 6] = a3 * lx + b3 * ly + c3 * lz + t3
            lx, ly, lz = L[o + 7], L[o + 8], L[o + 9]
            w[q + 7] = a1 * lx + b1 * ly + c1 * lz + t1
            w[q + 8] = a2 * lx + b2 * ly + c2 * lz + t2
            w[q + 9] = a3 * lx + b3 * ly + c3 * lz + t3
            lx, ly, lz = L[o + 10], L[o + 11], L[o + 12]
            w[q + 1], w[q + 2], w[q + 3] = x1, y1, z1
            w[q + 10] = a1 * lx + b1 * ly + c1 * lz
            w[q + 11] = a2 * lx + b2 * ly + c2 * lz
            w[q + 12] = a3 * lx + b3 * ly + c3 * lz
            n = n + 1
            if not CV.PushDynTri(sqrt(d2), w, q, packSurface(L[o + 13]), d2 < WIRE_D2 and 3 or 0) then
                return
            end
        end
    end
end

local function drawBucket(bk, b, n, ox, oy, oz, px, py, pz)
    local tabs, offs, cols, knds = bk.tab[b], bk.off[b], bk.col[b], bk.knd[b]
    for k = 1, n do
        local t = tabs[k]
        local i = offs[k]
        local col = cols[k]
        local knd = knds[k]
        local r = col // 65536
        local g = (col // 256) % 256
        local bl = col % 256
        if knd == 2 then
            local x1, y1, z1 = t[i + 1] + ox, t[i + 2] + oy, t[i + 3] + oz
            local x2, y2, z2 = t[i + 4] + ox, t[i + 5] + oy, t[i + 6] + oz
            if xrOn then
                x1, y1, z1 = pull(x1, y1, z1)
                x2, y2, z2 = pull(x2, y2, z2)
            end
            DrawLine(x1, y1, z1, x2, y2, z2, r * 0.35 + 15, g * 0.35 + 15, bl * 0.35 + 15, 255)
        else
            local x1, y1, z1 = t[i + 1] + ox, t[i + 2] + oy, t[i + 3] + oz
            local x2, y2, z2 = t[i + 4] + ox, t[i + 5] + oy, t[i + 6] + oz
            local x3, y3, z3 = t[i + 7] + ox, t[i + 8] + oy, t[i + 9] + oz
            local flip = t[i + 10] * (x1 - px) + t[i + 11] * (y1 - py) + t[i + 12] * (z1 - pz) >= 0.0
            if xrOn then
                x1, y1, z1 = pull(x1, y1, z1)
                x2, y2, z2 = pull(x2, y2, z2)
                x3, y3, z3 = pull(x3, y3, z3)
            end
            if flip then
                DrawPoly(x3, y3, z3, x2, y2, z2, x1, y1, z1, r, g, bl, 255)
            else
                DrawPoly(x1, y1, z1, x2, y2, z2, x3, y3, z3, r, g, bl, 255)
            end
            if knd ~= 0 then
                local lr, lg, lb
                if knd == 3 then
                    lr, lg, lb = 255, 255, 255
                else
                    lr, lg, lb = r * 0.3 + 12, g * 0.3 + 12, bl * 0.3 + 12
                end
                DrawLine(x1, y1, z1, x2, y2, z2, lr, lg, lb, 255)
                DrawLine(x2, y2, z2, x3, y3, z3, lr, lg, lb, 255)
                DrawLine(x3, y3, z3, x1, y1, z1, lr, lg, lb, 255)
            end
        end
    end
end

local function drawBox(b, r, g, bl, a)
    local c = {}
    local corners = {
        { b.min.x, b.min.y, b.min.z }, { b.max.x, b.min.y, b.min.z },
        { b.max.x, b.max.y, b.min.z }, { b.min.x, b.max.y, b.min.z },
        { b.min.x, b.min.y, b.max.z }, { b.max.x, b.min.y, b.max.z },
        { b.max.x, b.max.y, b.max.z }, { b.min.x, b.max.y, b.max.z }
    }
    for i = 1, 8 do
        local x, y, z = rotatePoint(corners[i][1], corners[i][2], corners[i][3], b.quat)
        c[i] = { pull(x + b.pos[1], y + b.pos[2], z + b.pos[3]) }
    end
    local edges = { { 1, 2 }, { 2, 3 }, { 3, 4 }, { 4, 1 }, { 5, 6 }, { 6, 7 }, { 7, 8 }, { 8, 5 }, { 1, 5 }, { 2, 6 }, { 3, 7 }, { 4, 8 } }
    for _, e in ipairs(edges) do
        DrawLine(c[e[1]][1], c[e[1]][2], c[e[1]][3], c[e[2]][1], c[e[2]][2], c[e[2]][3], r, g, bl, a)
    end
end

local function quadBoth(p1, p2, p3, p4, r, g, b, a)
    DrawPoly(p1[1], p1[2], p1[3], p2[1], p2[2], p2[3], p3[1], p3[2], p3[3], r, g, b, a)
    DrawPoly(p3[1], p3[2], p3[3], p2[1], p2[2], p2[3], p1[1], p1[2], p1[3], r, g, b, a)
    DrawPoly(p1[1], p1[2], p1[3], p3[1], p3[2], p3[3], p4[1], p4[2], p4[3], r, g, b, a)
    DrawPoly(p4[1], p4[2], p4[3], p3[1], p3[2], p3[3], p1[1], p1[2], p1[3], r, g, b, a)
end

local function drawOcclBox(b, idx)
    local cx, cy, cz0 = b.c[1], b.c[2], b.c[3]
    local hl, hw, hh = (b.l or 1) / 2, (b.w or 1) / 2, (b.h or 1) / 2
    if hl < 0.01 and hw < 0.01 and hh < 0.01 then return end
    local palette = CT.occlPalette
    local col = palette[((idx or 1) - 1) % #palette + 1]
    local cr, cg, cb = col[1], col[2], col[3]
    local co, si = b.cz or 1.0, b.sz or 0.0
    local len = sqrt(co * co + si * si)
    if len > 0.001 then
        co, si = co / len, si / len
    else
        co, si = 1.0, 0.0
    end
    local function corner(sx, sy, sz)
        local lx, ly = sx * hl, sy * hw
        return { pull(lx * co - ly * si + cx, lx * si + ly * co + cy, cz0 + sz * hh) }
    end
    local c1, c2, c3, c4 = corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1)
    local t1, t2, t3, t4 = corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)
    quadBoth(t1, t2, t3, t4, cr, cg, cb, 45)
    quadBoth(c1, c2, t2, t1, cr, cg, cb, 30)
    quadBoth(c2, c3, t3, t2, cr, cg, cb, 30)
    quadBoth(c3, c4, t4, t3, cr, cg, cb, 30)
    quadBoth(c4, c1, t1, t4, cr, cg, cb, 30)
    local edges = { { c1, c2 }, { c2, c3 }, { c3, c4 }, { c4, c1 }, { t1, t2 }, { t2, t3 }, { t3, t4 }, { t4, t1 }, { c1, t1 }, { c2, t2 }, { c3, t3 }, { c4, t4 } }
    for _, e in ipairs(edges) do
        DrawLine(e[1][1], e[1][2], e[1][3], e[2][1], e[2][2], e[2][3], cr, cg, cb, 200)
    end
    local oe = CT.OcclEdit
    if oe.active and oe.face and idx == oe.vizIndex then
        local ax, sg = oe.face.axis, oe.face.sign
        local f1, f2, f3, f4
        if ax == 1 then
            f1, f2, f3, f4 = corner(sg, -1, -1), corner(sg, 1, -1), corner(sg, 1, 1), corner(sg, -1, 1)
        elseif ax == 2 then
            f1, f2, f3, f4 = corner(-1, sg, -1), corner(1, sg, -1), corner(1, sg, 1), corner(-1, sg, 1)
        else
            f1, f2, f3, f4 = corner(-1, -1, sg), corner(1, -1, sg), corner(1, 1, sg), corner(-1, 1, sg)
        end
        quadBoth(f1, f2, f3, f4, 255, 255, 255, 110)
        for _, e in ipairs({ { f1, f2 }, { f2, f3 }, { f3, f4 }, { f4, f1 } }) do
            DrawLine(e[1][1], e[1][2], e[1][3], e[2][1], e[2][2], e[2][3], 255, 255, 255, 255)
        end
    end
end

function CV.HasContent()
    return next(CV.boxes) ~= nil or next(CV.sets) ~= nil or (CV.occl ~= nil and #CV.occl > 0)
        or (CV.bounds ~= nil and #CV.bounds > 0)
end

local function drawBoundBox(b, m, ox, oy, oz, r, g, bl, a)
    local mn, mx = b.bmin, b.bmax
    if not (mn and mx) then return end
    local c = {}
    for i = 0, 7 do
        local x = (i % 2 == 1) and mx[1] or mn[1]
        local y = (floor(i / 2) % 2 == 1) and mx[2] or mn[2]
        local z = (floor(i / 4) % 2 == 1) and mx[3] or mn[3]
        local wx, wy, wz = xf(m, x, y, z)
        c[i + 1] = { pull(wx + ox, wy + oy, wz + oz) }
    end
    local edges = { { 1, 2 }, { 2, 4 }, { 4, 3 }, { 3, 1 }, { 5, 6 }, { 6, 8 }, { 8, 7 }, { 7, 5 }, { 1, 5 }, { 2, 6 }, { 3, 7 }, { 4, 8 } }
    for _, e in ipairs(edges) do
        DrawLine(c[e[1]][1], c[e[1]][2], c[e[1]][3], c[e[2]][1], c[e[2]][2], c[e[2]][3], r, g, bl, a)
    end
end

local lastPx, lastPy, lastPz = 1e30, 1e30, 1e30
local lastFx, lastFy, lastFz = 0.0, 0.0, 0.0
local lastGen, lastDynGen = -1, -1
local lastXray = nil

function CV.DrawFrame(px, py, pz, fx, fy, fz)
    if not (CT.open and CT.showVisuals) then return end
    if not CV.HasContent() then return end
    if CV.dirty then
        rebuildChunks()
    end
    xrOn = CT.xray
    xrX, xrY, xrZ = px, py, pz
    xrFx, xrFy, xrFz = fx, fy, fz
    buildFrustum(px, py, pz, fx, fy, fz)

    local mx, my, mz = px - lastPx, py - lastPy, pz - lastPz
    local moved = (mx * mx + my * my + mz * mz) > CAM_STEP2
        or (fx * lastFx + fy * lastFy + fz * lastFz) < CAM_TURN
        or xrOn ~= lastXray

    local fs = CT.FaceSel
    local fsOn = fs and fs.active and fs.HasWorld()
    CV.dynActive = fsOn or (CV.editBi ~= nil and CV.editM ~= nil)

    if moved or CV.dynGen ~= lastDynGen then
        lastDynGen = CV.dynGen
        CV.BeginDyn()
        if fsOn then
            fs.Gather(px, py, pz, fx, fy, fz)
        end
        if CV.editBi and CV.editM then
            gatherEdit(px, py, pz, fx, fy, fz)
        end
    end

    if moved or CV.gen ~= lastGen then
        lastGen = CV.gen
        gatherStatic(px, py, pz, fx, fy, fz)
    end

    if moved then
        lastPx, lastPy, lastPz = px, py, pz
        lastFx, lastFy, lastFz = fx, fy, fz
        lastXray = xrOn
    end

    local ox, oy, oz = 0.0, 0.0, 0.0
    local off = CV.drawOffset
    if off then
        ox, oy, oz = off[1], off[2], off[3]
    end

    for _, b in ipairs(CV.boxes) do
        drawBox(b, 255, 60, 60, 220)
    end

    for b = BUCKETS, 1, -1 do
        local sn = S.n[b]
        if sn > 0 then
            drawBucket(S, b, sn, ox, oy, oz, px, py, pz)
        end
        local dn = D.n[b]
        if dn > 0 then
            drawBucket(D, b, dn, 0.0, 0.0, 0.0, px, py, pz)
        end
    end

    if CV.bounds then
        local drawn = 0
        for _, b in ipairs(CV.bounds) do
            if CV.editBi == b.bi then
                drawBoundBox(b, CV.editM or b.m, 0.0, 0.0, 0.0, 255, 220, 90, 235)
            elseif b.wr and b.wr >= 0.0 then
                local bx = b.wcx + ox - px
                local by = b.wcy + oy - py
                local bz = b.wcz + oz - pz
                if bx * bx + by * by + bz * bz < BOX_D2
                    and sphereVisible(b.wcx + ox, b.wcy + oy, b.wcz + oz, b.wr) then
                    if CV.boundSel == b.bi then
                        drawBoundBox(b, b.m, ox, oy, oz, 255, 255, 255, 200)
                    elseif drawn < BOX_LIMIT then
                        drawn = drawn + 1
                        drawBoundBox(b, b.m, ox, oy, oz, 255, 90, 90, 120)
                    end
                end
            end
        end
    end

    local occl = CV.occl
    if occl and #occl > 0 then
        local drawn = 0
        for bi, b in ipairs(occl) do
            local edx, edy, edz = b.c[1] - px, b.c[2] - py, b.c[3] - pz
            if edx * edx + edy * edy + edz * edz < 250000.0 then
                local rad = ((b.l or 20) + (b.w or 20) + (b.h or 20)) * 0.5
                if sphereVisible(b.c[1], b.c[2], b.c[3], rad) then
                    drawn = drawn + 1
                    if drawn > 40 then break end
                    drawOcclBox(b, bi)
                end
            end
        end
    end
end

CreateThread(function()
    while true do
        if CT.open and CT.showVisuals and not CT.Freecam.active and CV.HasContent() then
            Wait(0)
            local camPos = GetGameplayCamCoord()
            local fwd = CT.CamForward()
            CV.DrawFrame(camPos.x, camPos.y, camPos.z, fwd.x, fwd.y, fwd.z)
        elseif CT.Freecam.active then
            Wait(200)
        else
            Wait(400)
        end
    end
end)
