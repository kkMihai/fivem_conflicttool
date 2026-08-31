CT.FaceSel = {
    active = false,
    moving = false,
    moveM = nil,
    bi = nil,
    file = nil,
    resource = nil,
    conflictId = nil,
    count = 0,
    brush = 0.6,
    lastSlot = nil,
    loading = false
}

local FS = CT.FaceSel
local CV = CT.CollisionViz

local world = nil
local mats = nil
local polys = nil
local sel = nil
local grid = nil
local centroids = nil
local triCount = 0
local painting = false
local dirty = false
local moveSeed = nil
local moveCur = nil
local moveSession = 0
local pressAt = 0
local erasing = false
local lastTick = 0

local CELL = 2.0
local MAX_BRUSH = 6.0
local MIN_BRUSH = 0.2

local floor = math.floor
local sqrt = math.sqrt

local function cellKey(x, y, z)
    return (floor(x / CELL) % 1024) * 1048576 + (floor(y / CELL) % 1024) * 1024 + (floor(z / CELL) % 1024)
end

local function gridAdd(key, i)
    local b = grid[key]
    if not b then
        b = {}
        grid[key] = b
    end
    b[#b + 1] = i
end

local function buildGrid()
    grid = {}
    centroids = {}
    for i = 1, triCount do
        local o = (i - 1) * 9
        local x1, y1, z1 = world[o + 1], world[o + 2], world[o + 3]
        local x2, y2, z2 = world[o + 4], world[o + 5], world[o + 6]
        local x3, y3, z3 = world[o + 7], world[o + 8], world[o + 9]
        local c = (i - 1) * 3
        centroids[c + 1] = (x1 + x2 + x3) / 3
        centroids[c + 2] = (y1 + y2 + y3) / 3
        centroids[c + 3] = (z1 + z2 + z3) / 3
        local mnx = math.min(x1, x2, x3)
        local mny = math.min(y1, y2, y3)
        local mnz = math.min(z1, z2, z3)
        local mxx = math.max(x1, x2, x3)
        local mxy = math.max(y1, y2, y3)
        local mxz = math.max(z1, z2, z3)
        local gx0, gx1 = floor(mnx / CELL), floor(mxx / CELL)
        local gy0, gy1 = floor(mny / CELL), floor(mxy / CELL)
        local gz0, gz1 = floor(mnz / CELL), floor(mxz / CELL)
        if (gx1 - gx0) > 6 or (gy1 - gy0) > 6 or (gz1 - gz0) > 6 then
            gridAdd(cellKey(centroids[c + 1], centroids[c + 2], centroids[c + 3]), i)
        else
            for gx = gx0, gx1 do
                for gy = gy0, gy1 do
                    for gz = gz0, gz1 do
                        gridAdd((gx % 1024) * 1048576 + (gy % 1024) * 1024 + (gz % 1024), i)
                    end
                end
            end
        end
    end
end

local function rayTri(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, cx, cy, cz)
    local e1x, e1y, e1z = bx - ax, by - ay, bz - az
    local e2x, e2y, e2z = cx - ax, cy - ay, cz - az
    local px = dy * e2z - dz * e2y
    local py = dz * e2x - dx * e2z
    local pz = dx * e2y - dy * e2x
    local det = e1x * px + e1y * py + e1z * pz
    if det > -0.0000001 and det < 0.0000001 then return nil end
    local inv = 1.0 / det
    local tx, ty, tz = ox - ax, oy - ay, oz - az
    local u = (tx * px + ty * py + tz * pz) * inv
    if u < 0.0 or u > 1.0 then return nil end
    local qx = ty * e1z - tz * e1y
    local qy = tz * e1x - tx * e1z
    local qz = tx * e1y - ty * e1x
    local v = (dx * qx + dy * qy + dz * qz) * inv
    if v < 0.0 or u + v > 1.0 then return nil end
    local t = (e2x * qx + e2y * qy + e2z * qz) * inv
    if t > 0.01 then return t end
    return nil
end

local function pick(origin, dir, range)
    if not (world and grid) then return nil end
    local ox, oy, oz = origin.x, origin.y, origin.z
    local dx, dy, dz = dir.x, dir.y, dir.z
    local seen = {}
    local best, bestT = nil, nil
    local step = CELL * 0.5
    local dist = 0.0
    while dist < range do
        local sx, sy, sz = ox + dx * dist, oy + dy * dist, oz + dz * dist
        local gx0, gy0, gz0 = floor(sx / CELL), floor(sy / CELL), floor(sz / CELL)
        for ax = -1, 1 do
            for ay = -1, 1 do
                for az = -1, 1 do
                    local key = ((gx0 + ax) % 1024) * 1048576 + ((gy0 + ay) % 1024) * 1024 + ((gz0 + az) % 1024)
                    local bucket = grid[key]
                    if bucket and not seen[key] then
                        seen[key] = true
                        for k = 1, #bucket do
                            local i = bucket[k]
                            local o = (i - 1) * 9
                            local t = rayTri(ox, oy, oz, dx, dy, dz,
                                world[o + 1], world[o + 2], world[o + 3],
                                world[o + 4], world[o + 5], world[o + 6],
                                world[o + 7], world[o + 8], world[o + 9])
                            if t and (bestT == nil or t < bestT) then
                                best, bestT = i, t
                            end
                        end
                    end
                end
            end
        end
        if best and bestT and bestT < dist then break end
        dist = dist + step
    end
    if not best then return nil end
    return best, ox + dx * bestT, oy + dy * bestT, oz + dz * bestT
end

local function setSel(i, on)
    if on then
        if not sel[i] then
            sel[i] = true
            FS.count = FS.count + 1
        end
    elseif sel[i] then
        sel[i] = nil
        FS.count = FS.count - 1
    end
end

local function emit()
    CT.NuiSend('faceSel', {
        bi = FS.bi,
        count = FS.count,
        brush = math.floor(FS.brush * 100 + 0.5) / 100,
        slot = FS.lastSlot,
        loading = FS.loading,
        moving = FS.moving,
        offset = moveCur and moveSeed and {
            math.floor((moveCur[13] - moveSeed[1]) * 100 + 0.5) / 100,
            math.floor((moveCur[14] - moveSeed[2]) * 100 + 0.5) / 100,
            math.floor((moveCur[15] - moveSeed[3]) * 100 + 0.5) / 100
        } or nil,
        yaw = moveCur and math.floor(math.deg(math.atan(moveCur[2], moveCur[1])) * 10 + 0.5) / 10 or nil
    })
end

FS.Emit = emit

local function brushAround(hx, hy, hz, on)
    local r2 = FS.brush * FS.brush
    local gx0, gy0, gz0 = floor(hx / CELL), floor(hy / CELL), floor(hz / CELL)
    local reach = math.max(1, math.ceil(FS.brush / CELL))
    local seen = {}
    for ax = -reach, reach do
        for ay = -reach, reach do
            for az = -reach, reach do
                local key = ((gx0 + ax) % 1024) * 1048576 + ((gy0 + ay) % 1024) * 1024 + ((gz0 + az) % 1024)
                local bucket = grid[key]
                if bucket and not seen[key] then
                    seen[key] = true
                    for k = 1, #bucket do
                        local i = bucket[k]
                        local c = (i - 1) * 3
                        local ddx = centroids[c + 1] - hx
                        local ddy = centroids[c + 2] - hy
                        local ddz = centroids[c + 3] - hz
                        if ddx * ddx + ddy * ddy + ddz * ddz <= r2 then
                            setSel(i, on)
                        end
                    end
                end
            end
        end
    end
end

function FS.SetBrush(delta)
    if not FS.active then return end
    FS.brush = math.max(MIN_BRUSH, math.min(MAX_BRUSH, FS.brush + delta))
    emit()
end

function FS.SelectSlot(slot)
    if not (FS.active and mats) then return end
    for i = 1, triCount do
        if mats[i] == slot then
            setSel(i, true)
        end
    end
    emit()
end

function FS.SelectAllLike()
    if FS.lastSlot then
        FS.SelectSlot(FS.lastSlot)
    end
end

function FS.Clear()
    if not FS.active then return end
    sel = {}
    FS.count = 0
    emit()
end

function FS.SelectAll()
    if not FS.active then return end
    for i = 1, triCount do
        setSel(i, true)
    end
    emit()
end

function FS.Press()
    if not (FS.active and not FS.moving) then return end
    erasing = IsDisabledControlPressed(0, 36) or IsControlPressed(0, 36)
    pressAt = GetGameTimer()
    painting = false
    local origin, dir = CT.Picking.CamRay()
    local i = pick(origin, dir, 300.0)
    if not i then return end
    FS.lastSlot = mats[i]
    if erasing then
        setSel(i, false)
    else
        setSel(i, not sel[i] and true or false)
    end
    emit()
end

function FS.Release()
    painting = false
    pressAt = 0
end

function FS.Tick()
    if not (FS.active and not FS.moving and pressAt > 0) then return end
    local now = GetGameTimer()
    if now - pressAt < 180 then return end
    if now - lastTick < 50 then return end
    lastTick = now
    painting = true
    local origin, dir = CT.Picking.CamRay()
    local i, hx, hy, hz = pick(origin, dir, 300.0)
    if not i then return end
    FS.lastSlot = mats[i]
    brushAround(hx, hy, hz, not erasing)
    emit()
end

local function moveDelta()
    if not (moveCur and moveSeed) then return nil end
    local cx, cy, cz = moveSeed[1], moveSeed[2], moveSeed[3]
    local d = {
        moveCur[1], moveCur[2], moveCur[3], 0.0,
        moveCur[5], moveCur[6], moveCur[7], 0.0,
        moveCur[9], moveCur[10], moveCur[11], 0.0,
        0.0, 0.0, 0.0, 1.0
    }
    d[13] = moveCur[13] - (cx * d[1] + cy * d[5] + cz * d[9])
    d[14] = moveCur[14] - (cx * d[2] + cy * d[6] + cz * d[10])
    d[15] = moveCur[15] - (cx * d[3] + cy * d[7] + cz * d[11])
    return d
end

local function selectionCenter()
    local sx, sy, sz, n = 0.0, 0.0, 0.0, 0
    for i in pairs(sel) do
        local c = (i - 1) * 3
        sx = sx + centroids[c + 1]
        sy = sy + centroids[c + 2]
        sz = sz + centroids[c + 3]
        n = n + 1
    end
    if n == 0 then return nil end
    return { sx / n, sy / n, sz / n }
end

function FS.BeginMove()
    if not (FS.active and world) then return false, 'The faces are still loading.' end
    if FS.moving then return false, nil end
    if FS.count == 0 then return false, 'No faces are selected.' end
    local c = selectionCenter()
    if not c then return false, 'No faces are selected.' end
    if CT.Gizmo.supported == nil then
        local probe = DataView.ArrayBuffer(64)
        probe:SetFloat32(0, 1.0):SetFloat32(20, 1.0):SetFloat32(40, 1.0):SetFloat32(60, 1.0)
        local ok, res = pcall(function()
            return Citizen.InvokeNative(0xEB2EDCA2, probe:Buffer(), 'kk_ct_gizmo_probe', Citizen.ReturnResultAnyway())
        end)
        CT.Gizmo.supported = ok and res ~= nil
    end
    if not CT.Gizmo.supported then
        return false, 'The gizmo native is unavailable on this server build, this editor needs it.'
    end
    moveSeed = c
    moveCur = { 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, c[1], c[2], c[3], 1.0 }
    FS.moving = true
    FS.moveM = moveDelta()
    CT.Gizmo.pendingMode = CT.Gizmo.mode == 'scale' and 'translate' or CT.Gizmo.mode
    CT.Gizmo.EmitSpace()
    moveSession = moveSession + 1
    local mySession = moveSession
    CreateThread(function()
        local emitAt = 0
        while FS.moving and moveSession == mySession do
            Wait(0)
            if not (FS.moving and moveSession == mySession and moveCur) then break end
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 140, true)
            DisablePlayerFiring(PlayerId(), true)
            local view = DataView.ArrayBuffer(64)
            for i = 1, 16 do
                view:SetFloat32((i - 1) * 4, moveCur[i])
            end
            local changed = Citizen.InvokeNative(0xEB2EDCA2, view:Buffer(), 'kk_ct_faces', Citizen.ReturnResultAnyway())
            if changed then
                local m = {}
                for i = 1, 16 do
                    m[i] = view:GetFloat32((i - 1) * 4)
                end
                for _, row in ipairs({ 1, 5, 9 }) do
                    local len = math.sqrt(m[row] * m[row] + m[row + 1] * m[row + 1] + m[row + 2] * m[row + 2])
                    if len > 0.0001 then
                        m[row], m[row + 1], m[row + 2] = m[row] / len, m[row + 1] / len, m[row + 2] / len
                    else
                        m[row], m[row + 1], m[row + 2] = moveCur[row], moveCur[row + 1], moveCur[row + 2]
                    end
                end
                for i = 1, 16 do
                    moveCur[i] = m[i]
                end
                FS.moveM = moveDelta()
            end
            local now = GetGameTimer()
            if now - emitAt > 100 then
                emitAt = now
                emit()
            end
        end
    end)
    emit()
    return true
end

local gizmoDrag = false

function FS.GizmoDragStart()
    if not FS.moving or gizmoDrag then return end
    gizmoDrag = true
    ExecuteCommand('+gizmoSelect')
end

function FS.GizmoDragStop()
    if not gizmoDrag then return end
    gizmoDrag = false
    ExecuteCommand('-gizmoSelect')
end

function FS.CancelMove()
    if not FS.moving then return end
    FS.GizmoDragStop()
    FS.moving = false
    FS.moveM = nil
    moveSession = moveSession + 1
    moveSeed, moveCur = nil, nil
    emit()
end

function FS.ApplyMove()
    if not (FS.moving and moveCur and moveSeed) then return end
    local d = moveDelta()
    local polys = FS.Selection()
    FS.CancelMove()
    if not (d and polys and #polys > 0) then return end
    TriggerServerEvent('kk_ct:moveFaces', {
        conflictId = FS.conflictId,
        file = FS.file,
        resource = FS.resource,
        bi = FS.bi,
        polys = polys,
        m = d
    })
end

function FS.Selection()
    if not (FS.active and polys) then return nil end
    local out = {}
    local n = 0
    for i in pairs(sel) do
        n = n + 1
        out[n] = polys[i]
    end
    return out, n
end

function FS.Load(payload)
    if not payload then return end
    local keep = sel or {}
    local keptPolys = {}
    if polys then
        for i in pairs(keep) do
            if polys[i] then keptPolys[polys[i]] = true end
        end
    end
    local m = payload.m
    local t = payload.tris or {}
    triCount = floor(#t / 9)
    world = {}
    for i = 1, triCount do
        local o = (i - 1) * 9
        for v = 0, 2 do
            local x, y, z = t[o + v * 3 + 1], t[o + v * 3 + 2], t[o + v * 3 + 3]
            local wx, wy, wz = CV.Transform(m, x, y, z)
            world[o + v * 3 + 1] = wx
            world[o + v * 3 + 2] = wy
            world[o + v * 3 + 3] = wz
        end
    end
    mats = payload.mats or {}
    polys = payload.polys or {}
    sel = {}
    FS.count = 0
    for i = 1, triCount do
        if keptPolys[polys[i]] then
            sel[i] = true
            FS.count = FS.count + 1
        end
    end
    FS.loading = false
    buildGrid()
    emit()
end

function FS.Reload()
    if not (FS.active and FS.file) then return end
    dirty = true
    FS.loading = true
    emit()
    TriggerServerEvent('kk_ct:faceData', FS.file, FS.resource, FS.bi)
end

function FS.Repaint(slot, changed)
    if not (FS.active and polys and mats) then return end
    dirty = true
    local want = {}
    for _, p in ipairs(changed or {}) do
        want[p] = true
    end
    for i = 1, triCount do
        if want[polys[i]] then
            mats[i] = slot
        end
    end
end

function FS.Start(d)
    if not (d and d.file and type(d.bi) == 'number') then
        return false, 'This conflict has no collision bound to edit.'
    end
    if CT.CollEdit.active then
        CT.CollEdit.Stop(true)
    end
    FS.active = true
    FS.bi = d.bi
    FS.file = d.file
    FS.resource = d.resource
    FS.conflictId = d.conflictId
    FS.loading = true
    FS.lastSlot = nil
    FS.count = 0
    dirty = false
    sel = {}
    world, mats, polys, grid, centroids = nil, nil, nil, nil, nil
    triCount = 0
    CV.editBi = d.bi
    CV.editM = nil
    CV.drawOffset = nil
    CV.RebuildStatic()
    TriggerServerEvent('kk_ct:faceData', d.file, d.resource, d.bi)
    emit()
    return true
end

function FS.Stop()
    if not FS.active then return end
    FS.active = false
    FS.bi = nil
    FS.count = 0
    FS.moving = false
    FS.moveM = nil
    moveSession = moveSession + 1
    moveSeed, moveCur = nil, nil
    FS.loading = false
    FS.lastSlot = nil
    local repainted = dirty
    local file, resource = FS.file, FS.resource
    world, mats, polys, sel, grid, centroids = nil, nil, nil, nil, nil, nil
    triCount = 0
    painting = false
    dirty = false
    pressAt = 0
    CV.editBi = nil
    CV.RebuildStatic()
    if repainted and file then
        TriggerServerEvent('kk_ct:collisionBounds', file, resource)
    end
    CT.NuiSend('faceSelDone')
end

function FS.Draw(px, py, pz, fx, fy, fz)
    if not (FS.active and world) then return end
    local slotType = CV.boundMats and CV.boundMats[FS.bi] or nil
    local surfaceColor = CV.SurfaceColor
    local xray = CT.xray
    local pullFn = CV.Pull
    local dm = FS.moving and FS.moveM or nil
    local bk = CV.Buckets
    local budget = 6000
    bk.reset()
    for i = 1, triCount do
        if budget <= 0 then break end
        local c = (i - 1) * 3
        local dx = centroids[c + 1] - px
        local dy = centroids[c + 2] - py
        local dz = centroids[c + 3] - pz
        local d2 = dx * dx + dy * dy
        if d2 < 40000.0 and dx * fx + dy * fy + dz * fz > -3.0 then
            budget = budget - 1
            bk.push(sqrt(d2 + dz * dz), world, i)
        end
    end
    for b = bk.count, 1, -1 do
        local n = bk.n[b]
        if n > 0 then
            local offs = bk.off[b]
            for k = 1, n do
                local i = offs[k]
                local o = (i - 1) * 9
                local x1, y1, z1 = world[o + 1], world[o + 2], world[o + 3]
                local x2, y2, z2 = world[o + 4], world[o + 5], world[o + 6]
                local x3, y3, z3 = world[o + 7], world[o + 8], world[o + 9]
                local picked = sel[i]
                if picked and dm then
                    x1, y1, z1 = CV.Transform(dm, x1, y1, z1)
                    x2, y2, z2 = CV.Transform(dm, x2, y2, z2)
                    x3, y3, z3 = CV.Transform(dm, x3, y3, z3)
                end
                if xray then
                    x1, y1, z1 = pullFn(x1, y1, z1)
                    x2, y2, z2 = pullFn(x2, y2, z2)
                    x3, y3, z3 = pullFn(x3, y3, z3)
                end
                local r, g, bl = surfaceColor(slotType and slotType[mats[i]] or -1)
                if picked then
                    r, g, bl = 255, 245, 130
                end
                DrawPoly(x1, y1, z1, x2, y2, z2, x3, y3, z3, r, g, bl, 255)
                DrawPoly(x3, y3, z3, x2, y2, z2, x1, y1, z1, r, g, bl, 255)
                local c2 = (i - 1) * 3
                local ddx, ddy = centroids[c2 + 1] - px, centroids[c2 + 2] - py
                if picked or ddx * ddx + ddy * ddy < 3600.0 then
                    local lr, lg, lb = r * 0.3 + 12, g * 0.3 + 12, bl * 0.3 + 12
                    if picked then
                        lr, lg, lb = 255, 255, 255
                    end
                    DrawLine(x1, y1, z1, x2, y2, z2, lr, lg, lb, 255)
                    DrawLine(x2, y2, z2, x3, y3, z3, lr, lg, lb, 255)
                    DrawLine(x3, y3, z3, x1, y1, z1, lr, lg, lb, 255)
                end
            end
        end
    end
end
