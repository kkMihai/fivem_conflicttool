CT.Picking = {}

local PK = CT.Picking
local lastHoverKey = nil
local lastHoverAt = 0

local function camRay()
    local origin, forward, yaw
    if CT.Freecam.active then
        origin = CT.Freecam.pos
        forward = CT.Freecam.Forward()
        yaw = math.rad(CT.Freecam.rot.z)
    else
        origin = GetGameplayCamCoord()
        forward = CT.CamForward()
        yaw = math.rad(GetGameplayCamRot(2).z)
    end
    if CT.camLook or CT.uiW <= 0 or CT.uiH <= 0 then
        return origin, forward
    end
    local cx, cy = GetNuiCursorPosition()
    local nx = (2.0 * cx / CT.uiW) - 1.0
    local ny = 1.0 - (2.0 * cy / CT.uiH)
    if nx < -1.2 or nx > 1.2 or ny < -1.2 or ny > 1.2 then
        return origin, forward
    end
    local tv = math.tan(math.rad(GetFinalRenderedCamFov()) / 2)
    local th = tv * (CT.uiW / CT.uiH)
    local right = vector3(math.cos(yaw), math.sin(yaw), 0.0)
    local up = vector3(
        right.y * forward.z - right.z * forward.y,
        right.z * forward.x - right.x * forward.z,
        right.x * forward.y - right.y * forward.x
    )
    local dir = forward + right * (nx * th) + up * (ny * tv)
    local len = #(dir)
    if len < 0.0001 then
        return origin, forward
    end
    return origin, dir / len
end

PK.CamRay = camRay

local function raycast(origin, dir)
    local target = origin + dir * 400.0
    local handle = StartExpensiveSynchronousShapeTestLosProbe(origin.x, origin.y, origin.z, target.x, target.y, target.z, 273, PlayerPedId(), 4)
    local _, hit, coords, _, entity = GetShapeTestResult(handle)
    return hit == 1, coords, entity
end

local function pointPick(ox, oy, oz, dx, dy, dz, range)
    local markers = CT.markers
    local best, bestT = nil, nil
    for i = 1, CT.markerCount do
        local m = markers[i]
        local vx, vy, vz = m.x - ox, m.y - oy, m.z - oz
        local t = vx * dx + vy * dy + vz * dz
        if t > 0.0 and t < range and (bestT == nil or t < bestT) then
            local px, py, pz = vx - dx * t, vy - dy * t, vz - dz * t
            local tol = 0.6 + t * 0.022
            if px * px + py * py + pz * pz < tol * tol then
                best, bestT = m, t
            end
        end
    end
    return best, bestT
end

local function beamPick(ox, oy, oz, dx, dy, dz, range)
    local denom = 1.0 - dz * dz
    if denom < 0.0001 then return nil end
    local markers = CT.markers
    local best, bestT = nil, nil
    for i = 1, CT.markerCount do
        local m = markers[i]
        local wx, wy, wz = ox - m.x, oy - m.y, oz - m.z
        local dw = dx * wx + dy * wy + dz * wz
        local t = (dz * wz - dw) / denom
        if t > 0.0 and t < range and (bestT == nil or t < bestT) then
            local s = (wz - dz * dw) / denom
            if s > -40.0 and s < 60.0 then
                local cx = ox + dx * t - m.x
                local cy = oy + dy * t - m.y
                local cz = oz + dz * t - (m.z + s)
                local tol = 0.5 + t * 0.014
                if cx * cx + cy * cy + cz * cz < tol * tol then
                    best, bestT = m, t
                end
            end
        end
    end
    return best, bestT
end

local function pickMarker(origin, dir, range)
    if CT.markerCount == 0 then return nil end
    local ox, oy, oz = origin.x, origin.y, origin.z
    local dx, dy, dz = dir.x, dir.y, dir.z
    local m, t = pointPick(ox, oy, oz, dx, dy, dz, range)
    if m then return m, t end
    if CT.showVisuals and not CT.xray then
        return beamPick(ox, oy, oz, dx, dy, dz, range)
    end
    return nil
end

local function rayBox(o, d, h, range)
    local tmin, tmax = 0.0, range
    local axis, sign = nil, nil
    for a = 1, 3 do
        local da = d[a]
        if da > -0.000001 and da < 0.000001 then
            if o[a] < -h[a] or o[a] > h[a] then return nil end
        else
            local inv = 1.0 / da
            local t1 = (-h[a] - o[a]) * inv
            local t2 = (h[a] - o[a]) * inv
            if t1 > t2 then t1, t2 = t2, t1 end
            if t1 > tmin then
                tmin = t1
                axis = a
                sign = da > 0 and -1 or 1
            end
            if t2 < tmax then tmax = t2 end
            if tmin > tmax then return nil end
        end
    end
    return tmin, axis, sign
end

local function occlPick(origin, dir, range)
    local boxes = CT.CollisionViz.occl
    if not (boxes and CT.selected and CT.showVisuals) then return nil end
    local ox, oy, oz = origin.x, origin.y, origin.z
    local dx, dy, dz = dir.x, dir.y, dir.z
    local best, bestT, bestAxis, bestSign = nil, nil, nil, nil
    for i = 1, #boxes do
        local b = boxes[i]
        local hl, hw, hh = (b.l or 0) / 2, (b.w or 0) / 2, (b.h or 0) / 2
        if hl > 0.01 and hw > 0.01 and hh > 0.01 then
            local co, si = b.cz or 1.0, b.sz or 0.0
            local len = math.sqrt(co * co + si * si)
            if len > 0.001 then
                co, si = co / len, si / len
            else
                co, si = 1.0, 0.0
            end
            local px, py, pz = ox - b.c[1], oy - b.c[2], oz - b.c[3]
            local lx = px * co + py * si
            local ly = -px * si + py * co
            local ldx = dx * co + dy * si
            local ldy = -dx * si + dy * co
            local t, axis, sign = rayBox({ lx, ly, pz }, { ldx, ldy, dz }, { hl, hw, hh }, range)
            if t and (bestT == nil or t < bestT) then
                best, bestT = i, t
                bestAxis, bestSign = axis, sign
            end
        end
    end
    return best, bestT, bestAxis, bestSign
end

local function collPick(origin, dir, range)
    local bounds = CT.CollisionViz.bounds
    if not (bounds and CT.selected and CT.showVisuals) then return nil end
    local ox, oy, oz = origin.x, origin.y, origin.z
    local dx, dy, dz = dir.x, dir.y, dir.z
    local best, bestT = nil, nil
    for i = 1, #bounds do
        local b = bounds[i]
        local mn, mx = b.bmin, b.bmax
        if mn and mx then
            local m = b.m
            local px, py, pz = ox, oy, oz
            local ldx, ldy, ldz = dx, dy, dz
            if m then
                local rx, ry, rz = ox - m[13], oy - m[14], oz - m[15]
                px = rx * m[1] + ry * m[2] + rz * m[3]
                py = rx * m[5] + ry * m[6] + rz * m[7]
                pz = rx * m[9] + ry * m[10] + rz * m[11]
                ldx = dx * m[1] + dy * m[2] + dz * m[3]
                ldy = dx * m[5] + dy * m[6] + dz * m[7]
                ldz = dx * m[9] + dy * m[10] + dz * m[11]
            end
            local cx, cy, cz = (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2, (mn[3] + mx[3]) / 2
            local hx, hy, hz = (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2, (mx[3] - mn[3]) / 2
            if hx > 0.01 and hy > 0.01 and hz > 0.01 then
                local t = rayBox({ px - cx, py - cy, pz - cz }, { ldx, ldy, ldz }, { hx, hy, hz }, range)
                if t and (bestT == nil or t < bestT) then
                    best, bestT = b.bi, t
                end
            end
        end
    end
    return best, bestT
end

local function probe()
    local origin, dir = camRay()
    local hit, coords, entity = raycast(origin, dir)
    local model = 0
    local range = 400.0
    if hit then
        if entity ~= 0 and IsEntityAnObject(entity) then
            model = GetEntityModel(entity)
        end
        if not CT.xray then
            range = #(coords - origin) + 6.0
        end
    end
    local marker, markerT = pickMarker(origin, dir, range)
    return marker, model, markerT, origin, dir, range, hit and coords or nil
end

local function cursorNorm()
    if CT.camLook or CT.uiW <= 0 or CT.uiH <= 0 then
        return 0.5, 0.5
    end
    local mx, my = GetNuiCursorPosition()
    return mx / CT.uiW, my / CT.uiH
end

function PK.Click()
    if not CT.open or CT.mode == 'transform' or not CT.picking then return end
    local target, model, _, _, _, _, hitPos = probe()
    if target then
        SendNUIMessage({ action = 'worldSelect', data = { id = target.id, model = model ~= 0 and model or nil } })
        return
    end
    if model ~= 0 then
        SendNUIMessage({ action = 'worldSelect', data = { model = model, hit = hitPos and { hitPos.x, hitPos.y, hitPos.z } or nil } })
        return
    end
    SendNUIMessage({ action = 'closeContext' })
    CT.missAt = GetGameTimer()
    CT.missX, CT.missY = cursorNorm()
end

function PK.Context()
    if not CT.open or not CT.picking then return end
    if CT.CollEdit and CT.CollEdit.active then return end
    if CT.FaceSel and CT.FaceSel.active then return end
    if CT.OcclEdit.active then
        local origin, dir = camRay()
        local index, _, axis, sign = occlPick(origin, dir, 400.0)
        if index and axis then
            CT.OcclEdit.PickFace(index - 1, axis, sign)
        end
        return
    end
    if CT.mode == 'transform' then return end
    local marker, _, markerT, origin, dir, range = probe()
    local boxIndex, boxT = occlPick(origin, dir, range)
    local boundIndex, boundT = collPick(origin, dir, range)
    local id, bx, cbx = nil, nil, nil
    if boxIndex and (not marker or not markerT or boxT <= markerT) then
        id, bx = CT.selected, boxIndex - 1
    elseif boundIndex and (not marker or not markerT or boundT <= markerT) then
        id, cbx = CT.selected, boundIndex
    elseif marker then
        id, bx = marker.id, marker.bx
    end
    if not id then
        SendNUIMessage({ action = 'closeContext' })
        return
    end
    CT.CollisionViz.boundSel = cbx
    local cx, cy = cursorNorm()
    SendNUIMessage({ action = 'worldContext', data = { id = id, bx = bx, cbx = cbx, x = cx, y = cy } })
end

CreateThread(function()
    while true do
        if CT.open and CT.picking and CT.mode ~= 'transform' and not CT.overUi and not CT.typing then
            Wait(0)
            local now = GetGameTimer()
            if now - lastHoverAt > 150 then
                lastHoverAt = now
                local near, model = probe()
                CT.hoverMarker = near
                local hoverKey = tostring(model) .. '_' .. tostring(near and near.id or '')
                if hoverKey ~= lastHoverKey then
                    lastHoverKey = hoverKey
                    if model ~= 0 or near then
                        SendNUIMessage({ action = 'hoverInfo', data = { model = model ~= 0 and model or nil, id = near and near.id or nil } })
                    else
                        SendNUIMessage({ action = 'hoverInfo', data = nil })
                    end
                end
            end
        else
            if lastHoverKey ~= nil then
                lastHoverKey = nil
                SendNUIMessage({ action = 'hoverInfo', data = nil })
            end
            CT.hoverMarker = nil
            Wait(250)
        end
    end
end)
