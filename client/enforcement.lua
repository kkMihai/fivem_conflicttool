local applied = {}
local ghosts = {}
local pending = nil
local worldReady = false

local function clearApplied()
    for _, h in ipairs(applied) do
        RemoveModelHide(h.x, h.y, h.z, h.r, h.hash, false)
    end
    for _, obj in ipairs(ghosts) do
        if DoesEntityExist(obj) then
            SetEntityAsMissionEntity(obj, false, true)
            DeleteEntity(obj)
        end
    end
    applied = {}
    ghosts = {}
end

local function spawnGhost(d)
    local hash = d.hash
    if not IsModelValid(hash) then return end
    RequestModel(hash)
    local deadline = GetGameTimer() + 5000
    while not HasModelLoaded(hash) and GetGameTimer() < deadline do
        Wait(10)
    end
    if not HasModelLoaded(hash) then return end
    local obj = CreateObjectNoOffset(hash, d.new.pos[1], d.new.pos[2], d.new.pos[3], false, false, false)
    if obj and obj ~= 0 then
        SetEntityQuaternion(obj, d.new.rot[1], d.new.rot[2], d.new.rot[3], d.new.rot[4])
        FreezeEntityPosition(obj, true)
        SetEntityCollision(obj, true, true)
        SetEntityInvincible(obj, true)
        ghosts[#ghosts + 1] = obj
    end
    SetModelAsNoLongerNeeded(hash)
end

local function hideInstance(hash, p, r)
    CreateModelHideExcludingScriptObjects(p[1], p[2], p[3], r, hash, true)
    local obj = GetClosestObjectOfType(p[1], p[2], p[3], r + 0.5, hash, false, false, false)
    if obj and obj ~= 0 then
        SetEntityAsMissionEntity(obj, true, true)
        DeleteEntity(obj)
    end
end

CT.HideInstance = hideInstance

local function applyDecisions(list)
    clearApplied()
    if not list then return end
    for _, d in ipairs(list) do
        if d.action == 'remove' or d.action == 'move' then
            local p = d.original.pos
            local r = d.hideRadius or 0.25
            hideInstance(d.hash, p, r)
            applied[#applied + 1] = { x = p[1], y = p[2], z = p[3], r = r, hash = d.hash }
            if d.action == 'move' and d.new then
                CreateThread(function() spawnGhost(d) end)
            end
        end
    end
end

RegisterNetEvent('kk_ct:decisions', function(list)
    pending = list or {}
    if worldReady then
        applyDecisions(pending)
    end
end)

CreateThread(function()
    while not NetworkIsSessionStarted() do
        Wait(500)
    end
    Wait(2000)
    worldReady = true
    if pending == nil then
        TriggerServerEvent('kk_ct:requestDecisions')
    else
        applyDecisions(pending)
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then
        clearApplied()
    end
end)

CT.ReapplyDecisions = function()
    if pending then applyDecisions(pending) end
end
