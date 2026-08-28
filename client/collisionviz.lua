CT.CollisionViz = {
    boxes = {},
    sets = {},
    occl = nil,
    chunks = nil,
    dirty = false
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

function CV.Touch()
    CV.dirty = true
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
    CV.occl = nil
    CV.chunks = nil
    CV.dirty = false
end

local function rebuildChunks()
    CV.dirty = false
    local chunks = {}
    local map = {}
    local floor = math.floor
    for _, t in pairs(CV.sets) do
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

local function drawOcclBox(b)
    local cx, cy, cz0 = b.c[1], b.c[2], b.c[3]
    local hl, hw, hh = (b.l or 1) / 2, (b.w or 1) / 2, (b.h or 1) / 2
    if hl < 0.01 and hw < 0.01 and hh < 0.01 then return end
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
    quadBoth(t1, t2, t3, t4, 245, 158, 11, 45)
    quadBoth(c1, c2, t2, t1, 245, 158, 11, 30)
    quadBoth(c2, c3, t3, t2, 245, 158, 11, 30)
    quadBoth(c3, c4, t4, t3, 245, 158, 11, 30)
    quadBoth(c4, c1, t1, t4, 245, 158, 11, 30)
    local edges = { { c1, c2 }, { c2, c3 }, { c3, c4 }, { c4, c1 }, { t1, t2 }, { t2, t3 }, { t3, t4 }, { t4, t1 }, { c1, t1 }, { c2, t2 }, { c3, t3 }, { c4, t4 } }
    for _, e in ipairs(edges) do
        DrawLine(e[1][1], e[1][2], e[1][3], e[2][1], e[2][2], e[2][3], 245, 158, 11, 200)
    end
end

function CV.HasContent()
    return next(CV.boxes) ~= nil or next(CV.sets) ~= nil or (CV.occl ~= nil and #CV.occl > 0)
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
    local boxes = CV.boxes
    local chunks = CV.chunks
    local occl = CV.occl
    for _, b in ipairs(boxes) do
        drawBox(b, 255, 60, 60, 220)
    end
    if chunks and #chunks > 0 then
        local budget = 6000
        local wireD = xrOn and 3600.0 or 22500.0
        for ci = 1, #chunks do
            local c = chunks[ci]
            local cdx, cdy = c.x - px, c.y - py
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
                    for i = 1, #t, 12 do
                        if budget <= 0 then break end
                        local x1, y1, z1 = t[i], t[i + 1], t[i + 2]
                        local dx, dy = x1 - px, y1 - py
                        local d2 = dx * dx + dy * dy
                        if d2 < 90000.0 and (d2 < 22500.0 or (i % 24) < 12) then
                            local dz = z1 - pz
                            if dx * fx + dy * fy + dz * fz > -4.0 then
                                budget = budget - 1
                                local x2, y2, z2 = t[i + 3], t[i + 4], t[i + 5]
                                local x3, y3, z3 = t[i + 6], t[i + 7], t[i + 8]
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
                                if flip then
                                    DrawPoly(x3, y3, z3, x2, y2, z2, x1, y1, z1, 255, 40, 40, 90)
                                else
                                    DrawPoly(x1, y1, z1, x2, y2, z2, x3, y3, z3, 255, 40, 40, 90)
                                end
                                if d2 < wireD then
                                    DrawLine(x1, y1, z1, x2, y2, z2, 255, 90, 90, 140)
                                    DrawLine(x2, y2, z2, x3, y3, z3, 255, 90, 90, 140)
                                    DrawLine(x3, y3, z3, x1, y1, z1, 255, 90, 90, 140)
                                end
                            end
                        end
                    end
                    if budget <= 0 then break end
                end
            end
        end
    end
    if occl and #occl > 0 then
        local drawn = 0
        for _, b in ipairs(occl) do
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
                    drawOcclBox(b)
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
