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
            local r = d.hideRadius or 0.25
            local spots = d.spots
            if not (spots and #spots > 0) then
                spots = { { model = d.hash, pos = d.original.pos } }
            end
            for _, sp in ipairs(spots) do
                hideInstance(sp.model, sp.pos, r)
                applied[#applied + 1] = { x = sp.pos[1], y = sp.pos[2], z = sp.pos[3], r = r, hash = sp.model }
            end
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

function CT.VerifyRemoval(d)
    if not (d and d.hash and d.original and d.original.pos) then return end
    if not (d.targets and #d.targets > 0) then return end
    local spots = d.spots
    if not (spots and #spots > 0) then
        spots = { { model = d.hash, pos = d.original.pos } }
    end
    CreateThread(function()
        local r = (d.hideRadius or 0.25) + 1.0
        local persists = false
        for _ = 1, 3 do
            Wait(1200)
            persists = false
            for _, sp in ipairs(spots) do
                local obj = GetClosestObjectOfType(sp.pos[1], sp.pos[2], sp.pos[3], r, sp.model, false, false, false)
                if obj and obj ~= 0 and DoesEntityExist(obj) and not DoesEntityBelongToThisScript(obj, true) then
                    persists = true
                    break
                end
            end
            if not persists then return end
        end
        TriggerServerEvent('kk_ct:bury', {
            conflictId = d.conflictId,
            hash = d.hash,
            file = d.file,
            targets = d.targets,
            pos = d.original.pos
        })
        SendNUIMessage({
            action = 'notice',
            data = 'The game put this object back, so it cannot be removed at runtime. Queued a file edit that drops it 1000 units below the map. Run Resolve, then restart.'
        })
    end)
end

CT.ReapplyDecisions = function()
    if pending then applyDecisions(pending) end
end
