local pass, fail = 0, 0

local function check(name, cond)
    if cond then
        pass = pass + 1
        print(('  ok   %s'):format(name))
    else
        fail = fail + 1
        print(('  FAIL %s'):format(name))
    end
end

local world = {}
local nextHandle = 100
local hides = {}

local function spawn(model, pos, mine)
    nextHandle = nextHandle + 1
    world[nextHandle] = { model = model, pos = pos, mine = mine, alive = true, visible = true }
    return nextHandle
end

CT = {}

function Wait() end
function GetGameTimer() return 0 end
function IsModelValid() return true end
function RequestModel() end
function HasModelLoaded() return true end
function SetModelAsNoLongerNeeded() end
function FreezeEntityPosition() end
function SetEntityInvincible() end
function SetEntityQuaternion() end
function SetEntityAlpha() end
function GetCurrentResourceName() return 'test' end
function NetworkIsSessionStarted() return true end
function TriggerServerEvent() end
function SendNUIMessage() end
function PlayerPedId() return 1 end
function StartExpensiveSynchronousShapeTestLosProbe() return 0 end
function GetShapeTestResult() return 0, 0, nil, nil, 0 end

function CreateObjectNoOffset(model, x, y, z)
    return spawn(model, { x, y, z }, true)
end

function DoesEntityExist(h) return world[h] ~= nil and world[h].alive end
function GetEntityModel(h) return world[h] and world[h].model or 0 end
function DoesEntityBelongToThisScript(h) return world[h] ~= nil and world[h].mine == true end
function SetEntityAsMissionEntity() end
function SetEntityVisible(h, on) if world[h] then world[h].visible = on end end
function SetEntityCollision() end

function DeleteEntity(h)
    if world[h] then world[h].alive = false end
end

function CreateModelHideExcludingScriptObjects(x, y, z, r, hash)
    hides[#hides + 1] = { x, y, z, r, hash }
end

function RemoveModelHide(x, y, z, r, hash)
    for i, h in ipairs(hides) do
        if h[1] == x and h[2] == y and h[3] == z and h[5] == hash then
            table.remove(hides, i)
            return
        end
    end
end

function GetClosestObjectOfType(x, y, z, r, model)
    local best, bestD
    for h, e in pairs(world) do
        if e.alive and e.model == model then
            local dx, dy, dz = e.pos[1] - x, e.pos[2] - y, e.pos[3] - z
            local d = math.sqrt(dx * dx + dy * dy + dz * dz)
            if d <= r and (not bestD or d < bestD or (d == bestD and e.mine)) then
                best, bestD = h, d
            end
        end
    end
    return best or 0
end

local netEvents = {}
function RegisterNetEvent(name, fn) netEvents[name] = fn end
function AddEventHandler() end

function CreateThread(fn)
    local co = coroutine.create(fn)
    while coroutine.status(co) ~= 'dead' do
        local ok, err = coroutine.resume(co)
        if not ok then error(err) end
    end
end

local root = (arg and arg[0] or ''):gsub('[^/\\]*$', '') .. '..'
dofile(root .. '/client/preview.lua')
dofile(root .. '/client/enforcement.lua')

local MODEL = 12345
local SPOT = { 100.0, 200.0, 30.0 }

print('remove while the gizmo holds a preview object')

local streamed = spawn(MODEL, SPOT, false)
CT.Preview.Hide(MODEL, SPOT, 0.25)
check('preview hides the streamed prop instead of deleting it', DoesEntityExist(streamed) and world[streamed].visible == false)

local ghost = CT.Preview.SpawnGhost(MODEL, SPOT, nil)
check('preview ghost spawned', ghost and DoesEntityExist(ghost))

netEvents['kk_ct:decisions']({
    {
        action = 'remove',
        hash = MODEL,
        hideRadius = 0.25,
        original = { pos = SPOT },
        spots = { { model = MODEL, pos = SPOT } }
    }
})

local function hidden(pos, model)
    for _, h in ipairs(hides) do
        if h[1] == pos[1] and h[2] == pos[2] and h[3] == pos[3] and h[5] == model then return true end
    end
    return false
end

check('the gizmo keeps its object when a remove lands', DoesEntityExist(ghost))
check('the spot is still hidden', hidden(SPOT, MODEL))

CT.Preview.Reset()
check('reset deletes the ghost it owns', not DoesEntityExist(ghost))

print('stale handle after the engine reclaims a ghost')

local g2 = CT.Preview.SpawnGhost(MODEL, SPOT, nil)
world[g2].alive = false
world[g2] = { model = 999, pos = SPOT, mine = false, alive = true, visible = true }
CT.Preview.RemoveGhost()
check('a recycled handle is left alone', DoesEntityExist(g2) and GetEntityModel(g2) == 999)
check('the ghost handle is cleared', CT.Preview.ghost == nil)

print('move ghosts survive a hide for a neighbouring prop')

local near = { 100.2, 200.0, 30.0 }
local other = spawn(MODEL, near, false)
netEvents['kk_ct:decisions']({
    {
        action = 'move',
        hash = MODEL,
        hideRadius = 0.25,
        original = { pos = SPOT },
        new = { pos = near, rot = { 0, 0, 0, 1 } },
        spots = { { model = MODEL, pos = SPOT } }
    },
    {
        action = 'remove',
        hash = MODEL,
        hideRadius = 0.4,
        original = { pos = near },
        spots = { { model = MODEL, pos = near } }
    }
})
local moved = GetClosestObjectOfType(near[1], near[2], near[3], 0.5, MODEL)
check('the move ghost lands next to the removed prop', moved ~= 0 and DoesEntityExist(moved) and moved ~= other)
check('the remove does not eat the move ghost', DoesEntityExist(moved))
check('the removed prop is gone', not DoesEntityExist(other))

print(('\n%d passed, %d failed'):format(pass, fail))
os.exit(fail == 0 and 0 or 1)
