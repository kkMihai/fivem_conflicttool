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
    drawOffset = nil
}

local CV = CT.CollisionViz
local DrawPoly = DrawPoly
local DrawLine = DrawLine
local CELL = 50.0
local PULL = 0.5

local xrOn = false
local xrX, xrY, xrZ = 0.0, 0.0, 0.0
local xrFx, xrFy, xrFz = 0.0, 1.0, 0.0

local function pull(x, y, z)
    if not xrOn then return x, y, z end
    local ox, oy, oz = x - xrX, y - xrY, z - xrZ
    if ox * xrFx + oy * xrFy + oz * xrFz < 0.3 then return x, y, z end
    local l = math.sqrt(ox * ox + oy * oy + oz * oz)
    if l < 1.0 then return x, y, z end
    local s = PULL / l
    return xrX + ox * s, xrY + oy * s, xrZ + oz * s
end

CV.Pull = pull

local BUCKETS = 56
local BUCKET_STEP = 300.0 / BUCKETS
local bTab, bOff, bN = {}, {}, {}
for i = 1, BUCKETS do
    bTab[i] = {}
    bOff[i] = {}
    bN[i] = 0
end

local function bucketReset()
    for i = 1, BUCKETS do
        bN[i] = 0
    end
end

local function bucketPush(dist, tbl, off)
    local b = 1 + math.floor(dist / BUCKET_STEP)
    if b < 1 then b = 1 elseif b > BUCKETS then b = BUCKETS end
    local n = bN[b] + 1
    bN[b] = n
    bTab[b][n] = tbl
    bOff[b][n] = off
end

CV.Buckets = { tab = bTab, off = bOff, n = bN, count = BUCKETS, reset = bucketReset, push = bucketPush, step = BUCKET_STEP }

function CV.Touch()
    CV.dirty = true
end

function CV.SurfaceColor(ty)
    local colors = CT.collMatColors
    if ty and ty >= 0 and colors then
        local c = colors[ty + 1]
        if c then return c[1], c[2], c[3] end
    end
    return 255, 40, 40
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
    CV.dirty = false
    CV.bounds = nil
    CV.boundKey = nil
    CV.editBi = nil
    CV.editM = nil
    CV.drawOffset = nil
    CV.boundMats = nil
end

local function xf(m, x, y, z)
    if not m then return x, y, z end
    return m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
        m[3] * x + m[7] * y + m[11] * z + m[15]
end

CV.Transform = xf

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

function CV.SetBounds(payload)
    if not (payload and payload.bounds) then
        CV.bounds = nil
        CV.boundKey = nil
        CV.editBi = nil
        CV.editM = nil
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
    CV.drawOffset = nil
    CV.RebuildStatic()
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
                pct = tested > 0 and math.floor(matched / tested * 100 + 0.5) or nil
            }
        end
        if not anyTested then
            CT.NuiSend('collVerify', { state = 'far', copies = out })
            return
        end
        CT.NuiSend('collVerify', { state = 'done', file = payload.file, copies = out })
    end)
end

function CV.BoundAt(bi)
    if not CV.bounds then return nil end
    for _, b in ipairs(CV.bounds) do
        if b.bi == bi then return b end
    end
    return nil
end

local function rebuildChunks()
    CV.dirty = false
    local chunks = {}
    local map = {}
    local floor = math.floor
    for tag, t in pairs(CV.sets) do
        local types = CV.setMats[tag]
        local n = #t
        for i = 1, n - 8, 9 do
            local x1, y1, z1 = t[i], t[i + 1], t[i + 2]
            local x2, y2, z2 = t[i + 3], t[i + 4], t[i + 5]
            local x3, y3, z3 = t[i + 6], t[i + 7], t[i + 8]
            local key = floor(x1 / CELL) * 100000 + floor(y1 / CELL)
            local c = map[key]
            if not c then
                c = { x = 0.0, y = 0.0, n = 0, t = {} }
                map[key] = c
                chunks[#chunks + 1] = c
            end
            local ux, uy, uz = x2 - x1, y2 - y1, z2 - z1
            local vx, vy, vz = x3 - x1, y3 - y1, z3 - z1
            local a = c.t
            local b = #a
            a[b + 1], a[b + 2], a[b + 3] = x1, y1, z1
            a[b + 4], a[b + 5], a[b + 6] = x2, y2, z2
            a[b + 7], a[b + 8], a[b + 9] = x3, y3, z3
            a[b + 10], a[b + 11], a[b + 12] = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            a[b + 13] = types and types[(i + 8) // 9] or -1
            c.x = c.x + x1
            c.y = c.y + y1
            c.n = c.n + 1
        end
    end
    for i = 1, #chunks do
        local c = chunks[i]
        c.x = c.x / c.n
        c.y = c.y / c.n
    end
    CV.chunks = chunks
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
    local len = math.sqrt(co * co + si * si)
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
        local y = (math.floor(i / 2) % 2 == 1) and mx[2] or mn[2]
        local z = (math.floor(i / 4) % 2 == 1) and mx[3] or mn[3]
        local wx, wy, wz = xf(m, x, y, z)
        c[i + 1] = { pull(wx + ox, wy + oy, wz + oz) }
    end
    local edges = { { 1, 2 }, { 2, 4 }, { 4, 3 }, { 3, 1 }, { 5, 6 }, { 6, 8 }, { 8, 7 }, { 7, 5 }, { 1, 5 }, { 2, 6 }, { 3, 7 }, { 4, 8 } }
    for _, e in ipairs(edges) do
        DrawLine(c[e[1]][1], c[e[1]][2], c[e[1]][3], c[e[2]][1], c[e[2]][2], c[e[2]][3], r, g, bl, a)
    end
end

function CV.DrawFrame(px, py, pz, fx, fy, fz)
    if not (CT.open and CT.showVisuals) then return end
    if not CV.HasContent() then return end
    if CV.dirty then
        rebuildChunks()
    end
    xrOn = CT.xray
    xrX, xrY, xrZ = px, py, pz
    xrFx, xrFy, xrFz = fx, fy, fz
    local sqrt = math.sqrt
    local hlen = sqrt(fx * fx + fy * fy)
    local hx, hy
    if hlen > 0.35 then
        hx, hy = fx / hlen, fy / hlen
    end
    bucketReset()
    local boxes = CV.boxes
    local chunks = CV.chunks
    local occl = CV.occl
    local ox, oy, oz = 0.0, 0.0, 0.0
    local off = CV.drawOffset
    if off then
        ox, oy, oz = off[1], off[2], off[3]
    end
    for _, b in ipairs(boxes) do
        drawBox(b, 255, 60, 60, 220)
    end
    local wireD = xrOn and 3600.0 or 22500.0
    if chunks and #chunks > 0 then
        local budget = 6000
        for ci = 1, #chunks do
            local c = chunks[ci]
            local cdx, cdy = c.x + ox - px, c.y + oy - py
            local cd2 = cdx * cdx + cdy * cdy
            if cd2 < 160000.0 then
                local visible = true
                if hx and cd2 > 10000.0 then
                    if (cdx * hx + cdy * hy) < 0.25 * sqrt(cd2) - CELL then
                        visible = false
                    end
                end
                if visible then
                    local t = c.t
                    for i = 1, #t, 13 do
                        if budget <= 0 then break end
                        local x1, y1, z1 = t[i] + ox, t[i + 1] + oy, t[i + 2] + oz
                        local dx, dy = x1 - px, y1 - py
                        local d2 = dx * dx + dy * dy
                        if d2 < 90000.0 and (d2 < 22500.0 or (i % 26) < 13) then
                            local dz = z1 - pz
                            if dx * fx + dy * fy + dz * fz > -4.0 then
                                budget = budget - 1
                                bucketPush(sqrt(d2 + dz * dz), t, i)
                            end
                        end
                    end
                    if budget <= 0 then break end
                end
            end
        end
    end
    for b = BUCKETS, 1, -1 do
        local n = bN[b]
        if n > 0 then
            local tabs = bTab[b]
            local offs = bOff[b]
            for k = 1, n do
                local t = tabs[k]
                local i = offs[k]
                local x1, y1, z1 = t[i] + ox, t[i + 1] + oy, t[i + 2] + oz
                local x2, y2, z2 = t[i + 3] + ox, t[i + 4] + oy, t[i + 5] + oz
                local x3, y3, z3 = t[i + 6] + ox, t[i + 7] + oy, t[i + 8] + oz
                local dx, dy, dz = x1 - px, y1 - py, z1 - pz
                local d2 = dx * dx + dy * dy
                local flip = t[i + 9] * dx + t[i + 10] * dy + t[i + 11] * dz >= 0.0
                if xrOn then
                    local o2x, o2y, o2z = x2 - px, y2 - py, z2 - pz
                    local o3x, o3y, o3z = x3 - px, y3 - py, z3 - pz
                    if dx * fx + dy * fy + dz * fz > 0.3
                        and o2x * fx + o2y * fy + o2z * fz > 0.3
                        and o3x * fx + o3y * fy + o3z * fz > 0.3 then
                        x1, y1, z1 = pull(x1, y1, z1)
                        x2, y2, z2 = pull(x2, y2, z2)
                        x3, y3, z3 = pull(x3, y3, z3)
                    end
                end
                local cr, cg, cb = CV.SurfaceColor(t[i + 12])
                if flip then
                    DrawPoly(x3, y3, z3, x2, y2, z2, x1, y1, z1, cr, cg, cb, 255)
                else
                    DrawPoly(x1, y1, z1, x2, y2, z2, x3, y3, z3, cr, cg, cb, 255)
                end
                if d2 < wireD then
                    local wr, wg, wb = cr * 0.35 + 15, cg * 0.35 + 15, cb * 0.35 + 15
                    DrawLine(x1, y1, z1, x2, y2, z2, wr, wg, wb, 255)
                    DrawLine(x2, y2, z2, x3, y3, z3, wr, wg, wb, 255)
                    DrawLine(x3, y3, z3, x1, y1, z1, wr, wg, wb, 255)
                end
            end
        end
    end

    if CT.FaceSel and CT.FaceSel.active then
        CT.FaceSel.Draw(px, py, pz, fx, fy, fz)
    end
    local editing = CV.editBi and CV.editM and CV.BoundAt(CV.editBi) or nil
    if editing and editing.tris then
        local m = CV.editM
        local t = editing.tris
        local slots = editing.faceSlots
        local slotType = CV.boundMats and CV.boundMats[CV.editBi] or nil
        local budget = 4000
        bucketReset()
        local k = 0
        for i = 1, #t - 8, 9 do
            k = k + 1
            if budget <= 0 then break end
            local x1, y1, z1 = xf(m, t[i], t[i + 1], t[i + 2])
            local dx, dy, dz = x1 - px, y1 - py, z1 - pz
            local d2 = dx * dx + dy * dy
            if d2 < 90000.0 and dx * fx + dy * fy + dz * fz > -4.0 then
                budget = budget - 1
                bucketPush(sqrt(d2 + dz * dz), t, i)
            end
        end
        for b = BUCKETS, 1, -1 do
            local n = bN[b]
            if n > 0 then
                local offs = bOff[b]
                for j = 1, n do
                    local i = offs[j]
                    local x1, y1, z1 = pull(xf(m, t[i], t[i + 1], t[i + 2]))
                    local x2, y2, z2 = pull(xf(m, t[i + 3], t[i + 4], t[i + 5]))
                    local x3, y3, z3 = pull(xf(m, t[i + 6], t[i + 7], t[i + 8]))
                    local slot = slots and slots[(i + 8) // 9]
                    local cr, cg, cb = CV.SurfaceColor(slot and slotType and slotType[slot] or -1)
                    DrawPoly(x1, y1, z1, x2, y2, z2, x3, y3, z3, cr, cg, cb, 255)
                    DrawPoly(x3, y3, z3, x2, y2, z2, x1, y1, z1, cr, cg, cb, 255)
                    DrawLine(x1, y1, z1, x2, y2, z2, 255, 230, 130, 255)
                    DrawLine(x2, y2, z2, x3, y3, z3, 255, 230, 130, 255)
                    DrawLine(x3, y3, z3, x1, y1, z1, 255, 230, 130, 255)
                end
            end
        end
    end

    if CV.bounds then
        for _, b in ipairs(CV.bounds) do
            local sel = CV.editBi == b.bi
            if sel then
                drawBoundBox(b, CV.editM or b.m, 0.0, 0.0, 0.0, 255, 220, 90, 235)
            elseif CV.boundSel == b.bi then
                drawBoundBox(b, b.m, ox, oy, oz, 255, 255, 255, 200)
            else
                drawBoundBox(b, b.m, ox, oy, oz, 255, 90, 90, 120)
            end
        end
    end

    if occl and #occl > 0 then
        local drawn = 0
        for bi, b in ipairs(occl) do
            local dx, dy = b.c[1] - px, b.c[2] - py
            local d2 = dx * dx + dy * dy
            if d2 < 250000.0 then
                local visible = true
                if hx and d2 > 10000.0 then
                    local dist = sqrt(d2)
                    if (dx * hx + dy * hy) < 0.25 * dist - (b.l or 20) then
                        visible = false
                    end
                end
                if visible then
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
