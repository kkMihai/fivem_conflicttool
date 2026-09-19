local hash = 0xfedcba98
local objects = {
    [1] = { model = hash - 0x100000000, pos = { 1, 2, 3 }, original = true },
    [2] = { model = 200, pos = { 4, 5, 6 }, original = true }
}
local nextHandle = 2
local deletes = 0
local hidden = 0

CT = { ReapplyDecisions = function() end }
IsModelValid = function() return true end
RequestModel = function() end
HasModelLoaded = function() return true end
GetGameTimer = function() return 0 end
Wait = function() end
CreateObjectNoOffset = function(model, x, y, z)
    nextHandle = nextHandle + 1
    objects[nextHandle] = { model = model - 0x100000000, pos = { x, y, z } }
    return nextHandle
end
SetEntityQuaternion = function(handle, x, y, z, w) objects[handle].rot = { x, y, z, w } end
GetEntityQuaternion = function() return 0, 0, 0, 1 end
FreezeEntityPosition = function() end
SetEntityCollision = function() end
SetEntityAlpha = function() end
SetModelAsNoLongerNeeded = function() end
DoesEntityExist = function(handle) return objects[handle] ~= nil end
GetEntityModel = function(handle) return objects[handle].model end
GetEntityCoords = function(handle)
    local p = objects[handle].pos
    return { x = p[1], y = p[2], z = p[3] }
end
DoesEntityBelongToThisScript = function(handle) return not objects[handle].original end
GetClosestObjectOfType = function(x, y, z, radius, model)
    local best, distance = 0, radius * radius
    for handle, obj in pairs(objects) do
        local p = obj.pos
        local d = (p[1] - x)^2 + (p[2] - y)^2 + (p[3] - z)^2
        if (obj.model & 0xffffffff) == (model & 0xffffffff) and d <= distance then
            best, distance = handle, d
        end
    end
    return best
end
SetEntityAsMissionEntity = function() end
DeleteEntity = function(handle) deletes = deletes + 1 objects[handle] = nil end
DeleteObject = function(handle) deletes = deletes + 1 objects[handle] = nil end
SetEntityCoordsNoOffset = function(handle, x, y, z) objects[handle].pos = { x, y, z } end
RemoveModelHide = function() hidden = hidden - 1 end
CreateModelHideExcludingScriptObjects = function() hidden = hidden + 1 end
AddEventHandler = function() end

dofile('client/preview.lua')

local callbacks = {}
RegisterNUICallback = function(name, fn) callbacks[name] = fn end
RegisterNetEvent = function() end
CreateThread = function(fn) fn() end
SendNUIMessage = function() end
CT.open = true
CT.ApplyFocus = function() end
CT.Gizmo = {
    Start = function(handle) CT.Gizmo.entity = handle end,
    SetMode = function() end,
    Stop = function(commit)
        local pos = GetEntityCoords(CT.Gizmo.entity)
        CT.Gizmo.entity = nil
        return commit and { pos = { pos.x, pos.y, pos.z } } or nil
    end
}
dofile('client/nui.lua')

local entries = {
    { index = 0, model = hash, pos = { 1, 2, 3 } },
    { index = 1, model = 200, pos = { 4, 5, 6 } }
}
local result
callbacks.startTransform({ model = hash, pos = { 1, 2, 3 }, group = entries, anchorIndex = 0 }, function(value) result = value end)
assert(result.ok and CT.Gizmo.entity == 1)
SetEntityCoordsNoOffset(1, 11, 12, 13)
CT.Preview.MoveGroup({ x = 11, y = 12, z = 13 })
assert(objects[2].pos[1] == 14 and objects[2].pos[2] == 15 and objects[2].pos[3] == 16)

callbacks.endTransform({ commit = false }, function() end)
assert(objects[1].pos[1] == 1 and objects[1].pos[2] == 2 and objects[1].pos[3] == 3)
assert(objects[2].pos[1] == 4 and objects[2].pos[2] == 5 and objects[2].pos[3] == 6)
assert(deletes == 0 and hidden == 0)

callbacks.startTransform({ model = hash, pos = { 1, 2, 3 }, group = entries, anchorIndex = 0 }, function(value) result = value end)
assert(result.ok)
SetEntityCoordsNoOffset(1, 21, 22, 23)
CT.Preview.MoveGroup({ x = 21, y = 22, z = 23 })
local applied
callbacks.endTransform({ commit = true }, function(value) applied = value end)
assert(applied.pos[1] == 21 and applied.pos[2] == 22 and applied.pos[3] == 23)
assert(objects[1].pos[1] == 1 and objects[2].pos[1] == 4)
assert(deletes == 0)

local ghost = CT.Preview.SpawnGhost(hash, { 1, 2, 3 }, { 0, 0, 0, 1 })
CT.Preview.ClearTransform()
assert(objects[ghost] == nil)
assert(objects[1] and objects[2])
assert(deletes == 1)
