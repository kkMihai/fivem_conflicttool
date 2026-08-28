CT = {
    open = false,
    mode = 'browse',
    markers = {},
    markerCount = 0,
    total = 0,
    selected = nil,
    selectedIndex = 0,
    selectedLabel = nil,
    picking = true,
    hoverEntity = 0,
    showVisuals = true,
    xray = false,
    camLook = false,
    typing = false,
    overUi = false,
    hoverMarker = nil,
    missAt = 0,
    missX = 0.5,
    missY = 0.5,
    cursorMode = false,
    uiRects = {},
    uiW = 0,
    uiH = 0,
    colors = {
        a = { 139, 69, 247 },
        b = { 34, 211, 238 },
        vanilla = { 34, 197, 94 },
        coll = { 239, 68, 68 },
        occl = { 245, 158, 11 },
        prop = { 34, 211, 238 },
        asset = { 168, 85, 247 }
    }
}

function CT.CamForward()
    if CT.Freecam.active then
        return CT.Freecam.Forward()
    end
    local r = GetGameplayCamRot(2)
    local rx, rz = math.rad(r.x), math.rad(r.z)
    local cosx = math.cos(rx)
    return vector3(-math.sin(rz) * cosx, math.cos(rz) * cosx, math.sin(rx))
end

function CT.CategoryColor(cat, colorIdx)
    if colorIdx == 2 then return CT.colors.vanilla end
    if colorIdx == 1 then return CT.colors.b end
    if cat == 'coll' then return CT.colors.coll end
    if cat == 'occl' then return CT.colors.occl end
    if cat == 'prop' then return CT.colors.prop end
    return CT.colors.asset
end
