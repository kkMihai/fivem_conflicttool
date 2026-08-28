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
            for i = 1, count do
                local m = markers[i]
                local dx = m.x - cx
                local dy = m.y - cy
                if dx * dx + dy * dy < 160000.0 and dx * hfx + dy * hfy > -60.0 then
                    local sel = selected == m.id
                    if not (sel and transforming) then
                        drawn = drawn + 1
                        if drawn > 200 then break end
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
                end
            end
        else
            Wait(400)
        end
    end
end)
