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
    return best
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
    return best
end

local function pickMarker(origin, dir, range)
    if CT.markerCount == 0 then return nil end
    local ox, oy, oz = origin.x, origin.y, origin.z
    local dx, dy, dz = dir.x, dir.y, dir.z
    local m = pointPick(ox, oy, oz, dx, dy, dz, range)
    if m then return m end
    if CT.showVisuals and not CT.xray then
        return beamPick(ox, oy, oz, dx, dy, dz, range)
    end
    return nil
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
    return pickMarker(origin, dir, range), model
end

function PK.Click()
    if not CT.open or CT.mode == 'transform' or not CT.picking then return end
    local target, model = probe()
    if target then
        SendNUIMessage({ action = 'worldSelect', data = { id = target.id, model = model ~= 0 and model or nil } })
        return
    end
    CT.missAt = GetGameTimer()
    if CT.camLook or CT.uiW <= 0 or CT.uiH <= 0 then
        CT.missX, CT.missY = 0.5, 0.5
    else
        local mx, my = GetNuiCursorPosition()
        CT.missX, CT.missY = mx / CT.uiW, my / CT.uiH
    end
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
