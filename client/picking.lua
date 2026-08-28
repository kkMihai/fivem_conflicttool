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

local function raycast()
    local origin, dir = camRay()
    local target = origin + dir * 400.0
    local handle = StartExpensiveSynchronousShapeTestLosProbe(origin.x, origin.y, origin.z, target.x, target.y, target.z, 273, PlayerPedId(), 4)
    local _, hit, coords, _, entity = GetShapeTestResult(handle)
    return hit == 1, coords, entity
end

local function nearestMarker(coords, maxDist)
    local best, bestDist2 = nil, maxDist * maxDist
    local cx, cy, cz = coords.x, coords.y, coords.z
    for i = 1, CT.markerCount do
        local m = CT.markers[i]
        local dx, dy, dz = m.x - cx, m.y - cy, m.z - cz
        local d2 = dx * dx + dy * dy + dz * dz
        if d2 < bestDist2 then
            best = m
            bestDist2 = d2
        end
    end
    return best
end

function PK.Click()
    if not CT.open or CT.mode == 'transform' or not CT.picking then return end
    local hit, coords, entity = raycast()
    if not hit then return end
    local model = 0
    if entity ~= 0 and IsEntityAnObject(entity) then
        model = GetEntityModel(entity)
    end
    local target = nearestMarker(coords, 80.0)
    if target then
        SendNUIMessage({ action = 'worldSelect', data = { id = target.id, model = model ~= 0 and model or nil } })
    end
end

CreateThread(function()
    while true do
        if CT.open and CT.picking and CT.mode ~= 'transform' and not CT.overUi and not CT.typing then
            Wait(0)
            local now = GetGameTimer()
            if now - lastHoverAt > 150 then
                lastHoverAt = now
                local hit, coords, entity = raycast()
                local model = 0
                if hit and entity ~= 0 and IsEntityAnObject(entity) then
                    model = GetEntityModel(entity)
                end
                local near = nil
                if hit then
                    near = nearestMarker(coords, 40.0)
                end
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
            Wait(250)
        end
    end
end)
