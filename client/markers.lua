local DrawMarker = DrawMarker
local DrawLine = DrawLine
local DrawRect = DrawRect
local World3dToScreen2d = World3dToScreen2d

local function drawLabel3d(x, y, z, text)
    local onScreen, sx, sy = World3dToScreen2d(x, y, z)
    if not onScreen then return end
    SetTextFont(4)
    SetTextScale(0.32, 0.32)
    SetTextColour(255, 255, 255, 235)
    SetTextOutline()
    SetTextCentre(true)
    SetTextEntry('STRING')
    AddTextComponentString(text)
    DrawText(sx, sy)
end

local function drawOne(m, sel, xray)
    local a = sel and 220 or 130
    if xray then
        local onScreen, sx, sy = World3dToScreen2d(m.x, m.y, m.z)
        if onScreen then
            local s = sel and 1.8 or 1.0
            DrawRect(sx, sy, 0.004 * s, 0.007 * s, m.r, m.g, m.b, a)
        end
    else
        local scale = sel and 1.6 or 1.0
        DrawMarker(28, m.x, m.y, m.z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.35 * scale, 0.35 * scale, 0.35 * scale, m.r, m.g, m.b, a, false, false, 2, false, nil, nil, false)
        DrawLine(m.x, m.y, m.z - 40.0, m.x, m.y, m.z + 60.0, m.r, m.g, m.b, sel and 200 or 90)
    end
    if sel and CT.selectedLabel then
        drawLabel3d(m.x, m.y, m.z + 1.1, CT.selectedLabel)
    end
end

local function drawScreenBox(sx, sy, half, r, g, b, a)
    local aspect = (CT.uiW > 0 and CT.uiH > 0) and (CT.uiW / CT.uiH) or 1.7777
    local hx = half / aspect
    local t = 0.0016
    DrawRect(sx, sy - half, hx * 2.0, t, r, g, b, a)
    DrawRect(sx, sy + half, hx * 2.0, t, r, g, b, a)
    DrawRect(sx - hx, sy, t / aspect, half * 2.0, r, g, b, a)
    DrawRect(sx + hx, sy, t / aspect, half * 2.0, r, g, b, a)
end

CreateThread(function()
    while true do
        if CT.open and CT.showVisuals and CT.markerCount > 0 then
            Wait(0)
            local camPos = CT.Freecam.active and CT.Freecam.pos or GetGameplayCamCoord()
            local cx, cy = camPos.x, camPos.y
            local fwd = CT.CamForward()
            local hfx, hfy = fwd.x, fwd.y
            local markers = CT.markers
            local count = CT.markerCount
            local selected = CT.selected
            local transforming = CT.mode == 'transform'
            local xray = CT.xray
            local drawn = 0
            if selected and not transforming then
                for i = 1, count do
                    local m = markers[i]
                    if m.id == selected then
                        drawOne(m, true, xray)
                        drawn = 1
                        break
                    end
                end
            end
            for i = 1, count do
                local m = markers[i]
                if m.id ~= selected then
                    local dx = m.x - cx
                    local dy = m.y - cy
                    if dx * dx + dy * dy < 160000.0 and dx * hfx + dy * hfy > -60.0 then
                        drawn = drawn + 1
                        if drawn > 200 then break end
                        drawOne(m, false, xray)
                    end
                end
            end
        else
            Wait(400)
        end
    end
end)

CreateThread(function()
    while true do
        if CT.open and CT.showVisuals and not CT.overUi and not CT.typing then
            Wait(0)
            local m = CT.hoverMarker
            if m then
                local onScreen, sx, sy = World3dToScreen2d(m.x, m.y, m.z)
                if onScreen then
                    drawScreenBox(sx, sy, 0.011, 255, 255, 255, 190)
                end
            end
            local since = GetGameTimer() - CT.missAt
            if since < 350 then
                drawScreenBox(CT.missX, CT.missY, 0.008, 239, 68, 68, math.floor(190 * (1.0 - since / 350)))
            end
        else
            Wait(200)
        end
    end
end)
