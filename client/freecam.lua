CT.Freecam = {
    active = false,
    cam = nil,
    pos = vector3(0.0, 0.0, 0.0),
    rot = vector3(0.0, 0.0, 0.0),
    speed = 1.0,
    lastFocus = 0
}

local FC = CT.Freecam

FC.move = { f = false, b = false, l = false, r = false, u = false, d = false, fast = false, slow = false }

function FC.ClearMove()
    for k in pairs(FC.move) do
        FC.move[k] = false
    end
end

local function bindHold(name, desc, key, field)
    RegisterCommand('+' .. name, function()
        FC.move[field] = true
    end, false)
    RegisterCommand('-' .. name, function()
        FC.move[field] = false
    end, false)
    RegisterKeyMapping('+' .. name, desc, 'keyboard', key)
end

bindHold('kkctCamFwd', 'Conflict tool: camera forward', 'W', 'f')
bindHold('kkctCamBack', 'Conflict tool: camera back', 'S', 'b')
bindHold('kkctCamLeft', 'Conflict tool: camera left', 'A', 'l')
bindHold('kkctCamRight', 'Conflict tool: camera right', 'D', 'r')
bindHold('kkctCamUp', 'Conflict tool: camera up', 'E', 'u')
bindHold('kkctCamDown', 'Conflict tool: camera down', 'Q', 'd')
bindHold('kkctCamFast', 'Conflict tool: camera fast', 'LSHIFT', 'fast')
bindHold('kkctCamSlow', 'Conflict tool: camera slow', 'LCONTROL', 'slow')

local function clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

function FC.Forward()
    local rx = math.rad(FC.rot.x)
    local rz = math.rad(FC.rot.z)
    local cosx = math.cos(rx)
    return vector3(-math.sin(rz) * cosx, math.cos(rz) * cosx, math.sin(rx))
end

function FC.Right()
    local rz = math.rad(FC.rot.z)
    return vector3(math.cos(rz), math.sin(rz), 0.0)
end

function FC.Start(pos, rot)
    if FC.active then
        if pos then FC.SetTo(pos) end
        return
    end
    local ped = PlayerPedId()
    FC.pos = pos or GetGameplayCamCoord()
    local gr = GetGameplayCamRot(2)
    FC.rot = rot or vector3(gr.x, 0.0, gr.z)
    FC.cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', FC.pos.x, FC.pos.y, FC.pos.z, FC.rot.x, 0.0, FC.rot.z, 55.0, false, 0)
    SetCamActive(FC.cam, true)
    RenderScriptCams(true, true, 500, true, true)
    FreezeEntityPosition(ped, true)
    SetEntityVisible(ped, false, false)
    SetEntityCollision(ped, false, false)
    FC.active = true
    CreateThread(FC.Loop)
end

function FC.Stop()
    if not FC.active then return end
    FC.active = false
    local ped = PlayerPedId()
    RenderScriptCams(false, true, 500, true, true)
    if FC.cam then
        DestroyCam(FC.cam, false)
        FC.cam = nil
    end
    ClearFocus()
    local found, gz = GetGroundZFor_3dCoord(FC.pos.x, FC.pos.y, FC.pos.z, false)
    SetEntityCoords(ped, FC.pos.x, FC.pos.y, found and (gz + 1.0) or FC.pos.z, false, false, false, false)
    FreezeEntityPosition(ped, false)
    SetEntityVisible(ped, true, false)
    SetEntityCollision(ped, true, true)
end

function FC.SetTo(pos)
    local target = vector3(pos[1] or pos.x, pos[2] or pos.y, pos[3] or pos.z)
    local offset = vector3(-14.0, -14.0, 10.0)
    local camPos = target - vector3(offset.x, offset.y, -offset.z)
    if not FC.active then
        FC.Start(camPos)
    else
        FC.pos = camPos
    end
    local dir = target - FC.pos
    local dist = #(dir)
    if dist > 0.01 then
        local pitch = math.deg(math.asin(clamp(dir.z / dist, -1.0, 1.0)))
        local yaw = math.deg(math.atan(dir.y, dir.x)) - 90.0
        FC.rot = vector3(pitch, 0.0, yaw)
    end
    if FC.cam then
        SetCamCoord(FC.cam, FC.pos.x, FC.pos.y, FC.pos.z)
        SetCamRot(FC.cam, FC.rot.x, 0.0, FC.rot.z, 2)
    end
    SetFocusPosAndVel(FC.pos.x, FC.pos.y, FC.pos.z, 0.0, 0.0, 0.0)
end

function FC.Loop()
    FC.lastFocus = 0
    while FC.active do
        Wait(0)
        do
            if CT.camLook then
                local lookX = GetDisabledControlNormal(0, 1)
                local lookY = GetDisabledControlNormal(0, 2)
                FC.rot = vector3(clamp(FC.rot.x - lookY * 8.0, -89.0, 89.0), 0.0, FC.rot.z - lookX * 10.0)
            end
            local mult = 1.0
            local mv = FC.move
            if mv.fast then mult = 4.5 end
            if mv.slow then mult = 0.25 end
            local move = vector3(0.0, 0.0, 0.0)
            local fwd = FC.Forward()
            local right = FC.Right()
            if mv.f then move = move + fwd end
            if mv.b then move = move - fwd end
            if mv.r then move = move + right end
            if mv.l then move = move - right end
            if mv.u then move = move + vector3(0.0, 0.0, 1.0) end
            if mv.d then move = move - vector3(0.0, 0.0, 1.0) end
            FC.pos = FC.pos + move * (FC.speed * mult * GetFrameTime() * 20.0)
        end
        if FC.cam then
            SetCamCoord(FC.cam, FC.pos.x, FC.pos.y, FC.pos.z)
            SetCamRot(FC.cam, FC.rot.x, 0.0, FC.rot.z, 2)
        end
        local f = FC.Forward()
        CT.CollisionViz.DrawFrame(FC.pos.x, FC.pos.y, FC.pos.z, f.x, f.y, f.z)
        local now = GetGameTimer()
        if now - FC.lastFocus > 500 then
            SetFocusPosAndVel(FC.pos.x, FC.pos.y, FC.pos.z, 0.0, 0.0, 0.0)
            FC.lastFocus = now
        end
    end
end
