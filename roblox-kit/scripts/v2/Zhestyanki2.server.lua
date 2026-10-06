-- «Жестянки» для Roblox — ВЕРСИЯ 2 (серверный скрипт).
-- Куда: ServerScriptService → Script. Старый скрипт Zhestyanki (версия 1) — удалить или выключить
-- (у скрипта галочка Enabled), иначе будут две игры сразу.
-- LocalScript TopDown из версии 1 оставить как есть — камера сверху и стрельба работают с этой версией.
--
-- Что нового:
--  * игрок — наш танк (картинка скина) вместо человечка; у каждого друга свой скин;
--  * враги и боссы — наши картинки без цветных квадратов, крупнее;
--  * ящики: аптечка, щит, скорострел, тройной; бочки взрываются, ежи держат пули;
--  * биомы: каждые 10 волн земля меняет цвет; таблица очков игроков (справа вверху).
--
-- Если ствол на картинке смотрит не туда, куда едет танк, поменяй SPRITE_YAW на 180, 90 или -90.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local aimEvent = ReplicatedStorage:FindFirstChild("Aim") or Instance.new("RemoteEvent")
aimEvent.Name = "Aim"
aimEvent.Parent = ReplicatedStorage
local fireEvent = ReplicatedStorage:FindFirstChild("Fire") or Instance.new("RemoteEvent")
fireEvent.Name = "Fire"
fireEvent.Parent = ReplicatedStorage
local waveText = ReplicatedStorage:FindFirstChild("WaveText") or Instance.new("StringValue")
waveText.Name = "WaveText"
waveText.Value = "Готовься к бою!"
waveText.Parent = ReplicatedStorage

-- ================== НАСТРОЙКИ ==================
local ARENA = 90            -- поле от -ARENA до +ARENA стадов
local BOSS_EVERY = 10
local TOTAL_WAVES = 100
local SPRITE_YAW = 180      -- поворот картинок танков (0 / 180 / 90 / -90); 180 — по тесту в Studio
local PLAYER_SPEED = 20     -- скорость танка игрока (стад/с)
local SHOT = { dmg = 15, cooldown = 0.24, rapidCooldown = 0.11, speed = 56 }
local DROP_CHANCE = 0.32    -- шанс ящика с врага (как на Норме)

-- номера картинок из Asset Manager (наш пакет sprites/)
local IMG = {
	enemies = {
		scout = "104698035850170", soldier = "117949760435656", heavy = "82438005825619",
		kam = "75084111374379", sniper = "90678569066087", mortar = "107799960230902", medic = "77287732372875",
	},
	bosses = { -- вид сверху, по номеру босса
		"118217220105181", "70934347508640", "131970877415399", "118998524315108", "77067341575569",
		"134906133111316", "100024489787416", "109062996408407", "78072802228378", "136883712590912",
	},
	pickups = {
		med = "109595786879722", shield = "84980694895118", rapid = "112383286951146", triple = "122013309497649",
		freeze = "114452384341914", magnet = "108948747318688", beam = "90443398758001",
	},
	props = { barrel = "113108139227187", hedge = "135192719488696", hedgeRusty = "96832642132484" },
	-- скины игроков: каждый, кто зашёл, получает следующий по списку
	skins = {
		{ "green", "140449782343537" }, { "tiger", "79130289567320" }, { "gorynych", "89718489038883" },
		{ "nightcar", "94250934287916" }, { "blue", "105455063008469" }, { "gold", "83544119329976" },
		{ "pirate", "139139663957071" }, { "spider", "98482940594061" }, { "lava", "104823044450462" },
		{ "camo", "84382925240565" }, { "ufo", "90509197355961" }, { "robot", "95921769228099" },
		{ "taxi", "106838508520511" }, { "police", "112695557745444" }, { "neon", "138266576939199" },
		{ "kolobok", "116820620131522" }, { "bogatyr", "138777042750695" }, { "firebird", "120234576891213" },
		{ "ghost", "138804864592771" }, { "panther", "118211965919963" }, { "iron", "86889474466599" },
		{ "captain", "71025684565479" }, { "thunder", "112513135650176" }, { "super", "81744092636143" },
		{ "jester", "89771531408055" }, { "speed", "117538325818143" }, { "amazon", "133128517310769" },
		{ "poseidon", "75341480061100" }, { "lantern", "139548129983797" }, { "yaga", "127930422720436" },
		{ "emelya", "134662900736235" }, { "double", "132891281768615" }, { "melon", "124001427011093" },
		{ "pink", "119837519602509" }, { "violet", "125450065754477" }, { "orange", "84932150137696" },
		{ "desert", "125362741715192" }, { "stealth", "78252225907151" }, { "gamma", "115035119580154" },
		{ "rainbow", "139075918966520" }, { "platinum", "118894282480662" }, { "champion", "130889872590043" },
	},
}

-- ЛИСТЫ «корпус + башня» (sheets/tanks_hull.png и sheets/tanks_turret.png): загрузи обе картинки
-- в Asset Manager и впиши их номера сюда. Пока пусто — танки цельные (башня не крутится).
local SHEET_HULL = "70604598370510"   -- …870 (основа)
local SHEET_TURRET = "99291122208702" -- …871 (башни)
local CELL, COLS = 128, 8
local CELLS = {
	"skin:green", "skin:blue", "skin:desert", "skin:pink", "skin:violet", "skin:orange",
	"skin:camo", "skin:melon", "skin:taxi", "skin:tiger", "skin:pirate", "skin:double",
	"skin:stealth", "skin:robot", "skin:police", "skin:iron", "skin:spider", "skin:ghost",
	"skin:gamma", "skin:captain", "skin:thunder", "skin:panther", "skin:lava", "skin:neon",
	"skin:ufo", "skin:gold", "skin:speed", "skin:jester", "skin:super", "skin:amazon",
	"skin:poseidon", "skin:lantern", "skin:nightcar", "skin:kolobok", "skin:bogatyr", "skin:yaga",
	"skin:gorynych", "skin:firebird", "skin:emelya", "skin:platinum", "skin:champion", "skin:rainbow",
	"enemy:scout", "enemy:soldier", "enemy:heavy", "enemy:kam", "enemy:sniper", "enemy:mortar",
	"enemy:medic", "boss:1", "boss:2", "boss:3", "boss:4", "boss:5",
	"boss:6", "boss:7", "boss:8", "boss:9", "boss:10"
}
local CELL_OF = {}
for i, k in ipairs(CELLS) do CELL_OF[k] = i end

-- враги: hp, скорость, урон, интервал стрельбы, size — «тело» для попаданий, keep — дистанция
local ETYPES = {
	scout   = { hp = 20, speed = 15,   dmg = 6,  fire = {1.0, 1.9}, size = 3.2, keep = 22 },
	soldier = { hp = 35, speed = 9.5,  dmg = 8,  fire = {1.4, 2.6}, size = 3.8, keep = 22 },
	heavy   = { hp = 90, speed = 5.2,  dmg = 14, fire = {2.0, 3.2}, size = 5.0, keep = 20 },
	kam     = { hp = 18, speed = 23.5, dmg = 26, fire = nil,        size = 3.0, keep = 0 },
	sniper  = { hp = 48, speed = 7,    dmg = 19, fire = {3.0, 4.4}, size = 3.6, keep = 42, bulletSpeed = 85 },
}
local BOSSES = {
	{ name = "ЖЕЛЕЗНЫЙ КУЛАК", minion = "scout" },
	{ name = "ОХОТНИК",        minion = "scout",   speed = 1.5 },
	{ name = "КРЕПОСТЬ",       minion = "soldier", hpMult = 1.35, speed = 0.6, fan = 1 },
	{ name = "ШЕРШЕНЬ",        minion = "scout" },
	{ name = "МОРОЗ",          minion = "scout",   fan = 2 },
	{ name = "ПАУК",           minion = "kam" },
	{ name = "ФАНТОМ",         minion = "soldier", speed = 1.35 },
	{ name = "ВУЛКАН",         minion = "heavy",   hpMult = 1.2 },
	{ name = "ШТОРМ",          minion = "soldier" },
	{ name = "ИМПЕРАТОР",      minion = "soldier", hpMult = 1.25 },
}
-- биомы: каждые 10 волн — новая земля (цвета из веб-версии, чуть светлее для 3D)
local BIOMES = {
	{ "СТЕПЬ", Color3.fromRGB(58, 68, 80) }, { "ПУСТЫНЯ", Color3.fromRGB(110, 92, 60) },
	{ "СНЕГА", Color3.fromRGB(150, 165, 180) }, { "БОЛОТО", Color3.fromRGB(52, 70, 50) },
	{ "РЖАВЫЕ ЗЕМЛИ", Color3.fromRGB(92, 66, 56) }, { "ДЖУНГЛИ", Color3.fromRGB(44, 76, 52) },
	{ "ПЕПЕЛИЩЕ", Color3.fromRGB(62, 60, 68) }, { "ЛЕДНИК", Color3.fromRGB(84, 120, 146) },
	{ "СУМРАК", Color3.fromRGB(60, 52, 86) }, { "ВУЛКАН", Color3.fromRGB(86, 50, 44) },
}
-- ===============================================

-- точка появления из шаблона Baseplate (белая площадка со звездой): оставляем, но делаем невидимой
for _, d in ipairs(workspace:GetDescendants()) do
	if d:IsA("SpawnLocation") then
		d.Transparency = 1
		for _, x in ipairs(d:GetChildren()) do if x:IsA("Decal") then x:Destroy() end end
	end
end

local enemies, bullets, pickups, props = {}, {}, {}, {}
local wave = 1
local bossesBeaten = 0
local pstate = {}     -- [player] = { last = время выстрела, rapidUntil, tripleUntil }
local skinCounter = 0

local function rand(a, b) return a + math.random() * (b - a) end
local function flat(v) return Vector3.new(v.X, 0, v.Z) end
local function asset(id) return (string.find(id, "rbxassetid") and id) or ("rbxassetid://" .. id) end
local function diffFor(n) return { hp = 1 + (n - 1) * 0.02, dmg = math.min(2.1, 1 + (n - 1) * 0.012) } end

-- плоская невидимая «табличка» с картинкой сверху — так танк выглядит как в веб-версии
local function makeSprite(imageId, visual)
	local p = Instance.new("Part")
	p.Size = Vector3.new(visual, 0.2, visual)
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Transparency = 1
	if imageId and imageId ~= "" then
		local d = Instance.new("Decal")
		d.Texture = asset(imageId)
		d.Face = Enum.NormalId.Top
		d.Parent = p
	end
	return p
end
-- клетка листа на верхней грани невидимой детали (SurfaceGui + кусок большой картинки)
local function sheetSprite(sheetId, cell, visual)
	local p = makeSprite("", visual)
	local g = Instance.new("SurfaceGui")
	g.Face = Enum.NormalId.Top
	g.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	g.PixelsPerStud = 24
	g.LightInfluence = 0
	local im = Instance.new("ImageLabel")
	im.Size = UDim2.fromScale(1, 1)
	im.BackgroundTransparency = 1
	im.Image = asset(sheetId)
	local i = cell - 1
	im.ImageRectOffset = Vector2.new((i % COLS) * CELL, math.floor(i / COLS) * CELL)
	im.ImageRectSize = Vector2.new(CELL, CELL)
	im.Parent = g
	g.Parent = p
	return p
end
-- танк: корпус + отдельная башня (если листы загружены), иначе цельная картинка
local function makeTank(key, fallbackImg, visual)
	local cell = CELL_OF[key]
	if SHEET_HULL ~= "" and SHEET_TURRET ~= "" and cell then
		return sheetSprite(SHEET_HULL, cell, visual), sheetSprite(SHEET_TURRET, cell, visual)
	end
	return makeSprite(fallbackImg, visual), nil
end
local function spriteCF(pos, dir)
	return CFrame.lookAt(pos, pos + dir) * CFrame.Angles(0, math.rad(SPRITE_YAW), 0)
end

local function alivePlayers()
	local list = {}
	for _, pl in ipairs(Players:GetPlayers()) do
		local ch = pl.Character
		local hum = ch and ch:FindFirstChildOfClass("Humanoid")
		local root = ch and ch:FindFirstChild("HumanoidRootPart")
		if hum and root and hum.Health > 0 then
			table.insert(list, { pl = pl, hum = hum, root = root, ch = ch })
		end
	end
	return list
end
local function nearestPlayer(pos)
	local best, bestD = nil, math.huge
	for _, p in ipairs(alivePlayers()) do
		local d = (flat(p.root.Position - pos)).Magnitude
		if d < bestD then best, bestD = p, d end
	end
	return best, bestD
end

-- ---------- игрок-танк ----------
local function setupLeaderstats(pl)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local sc = Instance.new("IntValue"); sc.Name = "Очки"; sc.Parent = ls
	local wv = Instance.new("IntValue"); wv.Name = "Волна"; wv.Value = wave; wv.Parent = ls
	ls.Parent = pl
end
local function addScore(pl, v)
	local ls = pl and pl:FindFirstChild("leaderstats")
	if ls and ls:FindFirstChild("Очки") then ls["Очки"].Value = ls["Очки"].Value + v end
end
local function onCharacter(pl, ch)
	local root = ch:WaitForChild("HumanoidRootPart", 10)
	local hum = ch:WaitForChild("Humanoid", 10)
	if not root or not hum then return end
	hum.WalkSpeed = PLAYER_SPEED
	task.wait(0.2) -- дать догрузиться аксессуарам
	-- человечек становится невидимым: остаётся только танк-картинка
	for _, d in ipairs(ch:GetDescendants()) do
		if d:IsA("Accessory") then d:Destroy()
		elseif d:IsA("BasePart") then d.Transparency = 1
		elseif d:IsA("Decal") then d.Transparency = 1 end
	end
	local skin = IMG.skins[(pstate[pl] and pstate[pl].skinIndex) or 1]
	local spr, tur = makeTank("skin:" .. skin[1], skin[2], 7.5)
	spr.Name = "TankSprite"
	spr.Anchored = false
	spr.Massless = true
	-- картинка висит у «ног» танка (а не на уровне земли) — видна поверх любой площадки
	local below = hum.HipHeight + root.Size.Y / 2 - 0.4
	spr.CFrame = root.CFrame * CFrame.new(0, -below, 0) * CFrame.Angles(0, math.rad(SPRITE_YAW), 0)
	local w = Instance.new("WeldConstraint")
	w.Part0 = root; w.Part1 = spr; w.Parent = spr
	spr.Parent = ch
	local st = pstate[pl]
	if st then
		if st.tur then st.tur:Destroy() end
		st.tur, st.below = tur, below
		if tur then tur.Parent = workspace end -- башня отдельно: крутится за прицелом
		hum.Died:Connect(function() if st.tur == tur and tur then tur:Destroy(); st.tur = nil end end)
	end
end
local function initPlayer(pl)
	if pstate[pl] then return end
	skinCounter = skinCounter + 1
	pstate[pl] = { last = 0, rapidUntil = 0, tripleUntil = 0, skinIndex = ((skinCounter - 1) % #IMG.skins) + 1, aim = nil }
	setupLeaderstats(pl)
	pl.CharacterAdded:Connect(function(ch) onCharacter(pl, ch) end)
	if pl.Character then task.spawn(onCharacter, pl, pl.Character) end
end
Players.PlayerAdded:Connect(initPlayer)
for _, pl in ipairs(Players:GetPlayers()) do initPlayer(pl) end -- в Studio игрок может войти раньше скрипта
Players.PlayerRemoving:Connect(function(pl)
	if pstate[pl] and pstate[pl].tur then pstate[pl].tur:Destroy() end
	pstate[pl] = nil
end)

-- ---------- пули ----------
local function spawnBullet(origin, dir, speed, dmg, owner)
	local p = Instance.new("Part")
	p.Shape = Enum.PartType.Ball
	p.Size = owner and Vector3.new(1.1, 1.1, 1.1) or Vector3.new(1.3, 1.3, 1.3)
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.Material = Enum.Material.Neon
	p.Color = owner and Color3.fromRGB(255, 216, 77) or Color3.fromRGB(255, 100, 80)
	p.Position = Vector3.new(origin.X, 1, origin.Z)
	p.Parent = workspace
	table.insert(bullets, { part = p, vel = dir.Unit * speed, dmg = dmg, owner = owner, life = 3 })
end

-- ---------- взрыв (бочка, камикадзе) ----------
local explodeBarrel -- объявим ниже (цепная реакция)
local function boomFx(pos, r)
	local e = Instance.new("Explosion")
	e.Position = pos
	e.BlastRadius = r
	e.BlastPressure = 0
	e.DestroyJointRadiusPercent = 0
	e.Parent = workspace
end

-- ---------- ящики ----------
local PICK_TYPES = { "med", "med", "shield", "rapid", "triple" }
local function dropPickup(pos)
	if math.random() > DROP_CHANCE then return end
	local kind = PICK_TYPES[math.random(1, #PICK_TYPES)]
	local p = makeSprite(IMG.pickups[kind], 3.2)
	p.CFrame = CFrame.new(pos.X, 0.4, pos.Z)
	p.Parent = workspace
	table.insert(pickups, { part = p, kind = kind, life = 14 })
end
local function applyPickup(p, kind)
	local st = pstate[p.pl]
	if kind == "med" then
		p.hum.Health = math.min(p.hum.MaxHealth, p.hum.Health + 35)
	elseif kind == "shield" then
		local ff = Instance.new("ForceField")
		ff.Parent = p.ch
		task.delay(6, function() if ff then ff:Destroy() end end)
	elseif kind == "rapid" and st then
		st.rapidUntil = os.clock() + 7
	elseif kind == "triple" and st then
		st.tripleUntil = os.clock() + 10
	end
end

-- ---------- враги ----------
local function addHpBar(e, title)
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.new(0, 180, 0, 30)
	bb.StudsOffset = Vector3.new(0, 4, 0)
	bb.AlwaysOnTop = true
	local lbl = Instance.new("TextLabel")
	lbl.Size = UDim2.new(1, 0, 1, 0)
	lbl.BackgroundTransparency = 1
	lbl.TextColor3 = Color3.fromRGB(255, 120, 100)
	lbl.TextStrokeTransparency = 0.3
	lbl.Font = Enum.Font.GothamBold
	lbl.TextScaled = true
	lbl.Parent = bb
	bb.Parent = e.part
	e.title = title
	e.label = lbl
	lbl.Text = title .. "  " .. math.ceil(e.hp)
end
local function edgePoint(side)
	if side == 1 then return ARENA - 4, rand(-ARENA + 6, ARENA - 6)
	elseif side == 2 then return -ARENA + 4, rand(-ARENA + 6, ARENA - 6)
	elseif side == 3 then return rand(-ARENA + 6, ARENA - 6), -ARENA + 4
	else return rand(-ARENA + 6, ARENA - 6), ARENA - 4 end
end
local function spawnEnemy(typeName, n, side)
	local T = ETYPES[typeName] or ETYPES.soldier
	local D = diffFor(n)
	local x, z = edgePoint(side or math.random(1, 4))
	local part, tur = makeTank("enemy:" .. typeName, IMG.enemies[typeName], T.size * 2.1) -- картинка крупнее «тела»: у спрайта поля
	part.Name = "Enemy_" .. typeName
	part.CFrame = spriteCF(Vector3.new(x, 0.3, z), Vector3.new(-x, 0, -z))
	part.Parent = workspace
	if tur then tur.CFrame = spriteCF(Vector3.new(x, 0.36, z), Vector3.new(-x, 0, -z)); tur.Parent = workspace end
	local hp = T.hp * D.hp
	table.insert(enemies, { part = part, tur = tur, hp = hp, maxHp = hp, t = T, dmg = T.dmg * D.dmg, hitR = T.size / 2 + 0.6,
		fireT = T.fire and rand(T.fire[1], T.fire[2]) or 99, strafe = (math.random() < 0.5) and 1 or -1 })
end
local function spawnBoss(n)
	local num = math.floor(n / BOSS_EVERY)
	local idx = ((num - 1) % #BOSSES) + 1
	local def = BOSSES[idx]
	local final = (n == TOTAL_WAVES)
	local grow = 1 + 0.06 * math.min(num - 1, 9)
	local hp = (380 + 240 * num + (final and 400 or 0)) * grow * (def.hpMult or 1)
	-- игроков больше — босс крепче (каждый следующий +60%)
	hp = hp * (1 + 0.6 * math.max(0, #alivePlayers() - 1))
	local part, tur = makeTank("boss:" .. idx, IMG.bosses[idx], final and 22 or 19)
	part.Name = "Boss"
	part.CFrame = spriteCF(Vector3.new(ARENA * 0.55, 0.3, 0), Vector3.new(-1, 0, 0))
	part.Parent = workspace
	if tur then tur.CFrame = spriteCF(Vector3.new(ARENA * 0.55, 0.36, 0), Vector3.new(-1, 0, 0)); tur.Parent = workspace end
	local e = { part = part, tur = tur, hp = hp, maxHp = hp, boss = true, def = def, num = num, hitR = final and 7 or 6,
		dmg = 12 + num, fireT = 1.2, pattern = 0, minionT = 6, t = { speed = 6 * (def.speed or 1), keep = 34 } }
	addHpBar(e, def.name)
	table.insert(enemies, e)
	waveText.Value = "ВОЛНА " .. n .. " · БОСС: " .. def.name
end
local function bossShoot(e, target)
	e.pattern = (e.pattern + 1) % 4
	local enraged = e.hp <= e.maxHp / 2
	local base = flat(target.root.Position - e.part.Position)
	local baseA = math.atan2(base.Z, base.X)
	local origin = e.part.Position
	if e.pattern < 3 then
		local c = (enraged and 5 or 3) + (e.def.fan or 0)
		for i = 0, c - 1 do
			local a = baseA + (i - (c - 1) / 2) * 0.2
			spawnBullet(origin, Vector3.new(math.cos(a), 0, math.sin(a)), 28 * (enraged and 1.15 or 1), e.dmg, nil)
		end
	else
		local cnt = enraged and 14 or 10
		for i = 0, cnt - 1 do
			local a = baseA + i * (math.pi * 2 / cnt)
			spawnBullet(origin, Vector3.new(math.cos(a), 0, math.sin(a)), 23, e.dmg - 2, nil)
		end
	end
end
local function removeParts(e)
	e.part:Destroy()
	if e.tur then e.tur:Destroy() end
end
local function killEnemy(i, killer)
	local e = enemies[i]
	table.remove(enemies, i)
	addScore(killer, e.boss and (500 + e.num * 250) or math.floor(e.maxHp * 3))
	if e.boss then
		bossesBeaten = bossesBeaten + 1
		SHOT.dmg = 15 * (1 + 0.2 * bossesBeaten) -- награда за босса: урон +20% от базы
		for _, p in ipairs(alivePlayers()) do p.hum.Health = math.min(p.hum.MaxHealth, p.hum.Health + p.hum.MaxHealth * 0.5) end
		waveText.Value = e.def.name .. " ПОВЕРЖЕН! Снаряд крепче"
	else
		dropPickup(e.part.Position)
	end
	boomFx(e.part.Position, e.boss and 12 or 4)
	removeParts(e)
end

-- ---------- бочки и ежи ----------
local function clearProps()
	for _, pr in ipairs(props) do pr.part:Destroy() end
	props = {}
end
local function spawnProps(biomeIdx)
	clearProps()
	local function place(kind, count)
		for _ = 1, count do
			local x, z = rand(-ARENA + 12, ARENA - 12), rand(-ARENA + 12, ARENA - 12)
			if math.abs(x) > 14 or math.abs(z) > 14 then -- не на точке появления
				local img = kind == "barrel" and IMG.props.barrel
					or ((biomeIdx == 5 or biomeIdx == 10) and IMG.props.hedgeRusty or IMG.props.hedge)
				local p = makeSprite(img, kind == "barrel" and 3.4 or 4.4)
				p.CFrame = CFrame.new(x, 0.3, z)
				p.Parent = workspace
				table.insert(props, { part = p, kind = kind, hp = kind == "barrel" and 1 or 5, r = kind == "barrel" and 1.4 or 1.9 })
			end
		end
	end
	place("barrel", 6)
	place("hedge", 8)
end
explodeBarrel = function(idx, killer)
	local pr = props[idx]
	if not pr then return end
	table.remove(props, idx)
	local pos = pr.part.Position
	pr.part:Destroy()
	boomFx(pos, 9)
	for j = #enemies, 1, -1 do
		local e = enemies[j]
		if (flat(e.part.Position - pos)).Magnitude < 9.5 + e.hitR then
			e.hp = e.hp - (e.boss and 70 or 55)
			if e.label then e.label.Text = e.title .. "  " .. math.max(0, math.ceil(e.hp)) end
			if e.hp <= 0 then killEnemy(j, killer) end
		end
	end
	for _, p in ipairs(alivePlayers()) do
		if (flat(p.root.Position - pos)).Magnitude < 8 then p.hum:TakeDamage(12) end
	end
	-- цепная реакция: соседние бочки рвутся чуть позже
	for k = #props, 1, -1 do
		local o = props[k]
		if o.kind == "barrel" and (flat(o.part.Position - pos)).Magnitude < 11 then
			task.delay(rand(0.15, 0.4), function()
				for m = #props, 1, -1 do if props[m] == o then explodeBarrel(m, killer) break end end
			end)
		end
	end
end

local function clearAll()
	for _, e in ipairs(enemies) do removeParts(e) end
	for _, b in ipairs(bullets) do b.part:Destroy() end
	for _, p in ipairs(pickups) do p.part:Destroy() end
	enemies, bullets, pickups = {}, {}, {}
end

-- ---------- выстрел игрока ----------
aimEvent.OnServerEvent:Connect(function(pl, targetPos)
	if typeof(targetPos) == "Vector3" and pstate[pl] then pstate[pl].aim = targetPos end
end)
fireEvent.OnServerEvent:Connect(function(pl, targetPos)
	if typeof(targetPos) ~= "Vector3" then return end
	local st = pstate[pl]
	if not st then return end
	st.aim = targetPos
	local now = os.clock()
	local cd = (now < st.rapidUntil) and SHOT.rapidCooldown or SHOT.cooldown
	if now - st.last < cd * 0.85 then return end
	st.last = now
	local ch = pl.Character
	local root = ch and ch:FindFirstChild("HumanoidRootPart")
	local hum = ch and ch:FindFirstChildOfClass("Humanoid")
	if not root or not hum or hum.Health <= 0 then return end
	local dir = flat(targetPos - root.Position)
	if dir.Magnitude < 0.1 then return end
	local a = math.atan2(dir.Z, dir.X)
	local offs = (now < st.tripleUntil) and { -0.16, 0, 0.16 } or { 0 }
	for _, o in ipairs(offs) do
		local d = Vector3.new(math.cos(a + o), 0, math.sin(a + o))
		spawnBullet(root.Position + d * 3.5, d, SHOT.speed, SHOT.dmg, pl)
	end
end)

-- ---------- каждый кадр ----------
RunService.Heartbeat:Connect(function(dt)
	-- враги
	for i = #enemies, 1, -1 do
		local e = enemies[i]
		local target, d = nearestPlayer(e.part.Position)
		if target then
			local pos = e.part.Position
			local to = flat(target.root.Position - pos)
			local dir = to.Magnitude > 0.01 and to.Unit or Vector3.new(1, 0, 0)
			local move
			if e.t.keep == 0 or d > e.t.keep then move = dir
			else move = Vector3.new(-dir.Z, 0, dir.X) * 0.45 * (e.strafe or 1) end
			local np = pos + move * e.t.speed * dt
			np = Vector3.new(math.clamp(np.X, -ARENA, ARENA), 0.3, math.clamp(np.Z, -ARENA, ARENA))
			local mv = flat(np - pos)
			e.part.CFrame = spriteCF(np, mv.Magnitude > 0.001 and mv.Unit or dir) -- корпус — по ходу
			if e.tur then e.tur.CFrame = spriteCF(np + Vector3.new(0, 0.06, 0), dir) end -- башня — на игрока
			if e.t.keep == 0 and d < 4 then
				target.hum:TakeDamage(e.dmg)
				boomFx(np, 5)
				table.remove(enemies, i)
				removeParts(e)
			elseif e.boss then
				e.fireT = e.fireT - dt
				if e.fireT <= 0 then
					bossShoot(e, target)
					e.fireT = math.max(0.8, 1.35 - e.num * 0.04) * ((e.hp <= e.maxHp / 2) and 0.66 or 1)
				end
				e.minionT = e.minionT - dt
				if e.minionT <= 0 and #enemies < 3 + #alivePlayers() then
					spawnEnemy(e.def.minion, wave, 1) -- свита выходит со стороны босса
					e.minionT = 9
				end
			elseif e.t.fire then
				e.fireT = e.fireT - dt
				if e.fireT <= 0 then
					spawnBullet(np + dir * (e.t.size * 0.7), dir, e.t.bulletSpeed or 30, e.dmg, nil)
					e.fireT = rand(e.t.fire[1], e.t.fire[2])
				end
			end
		end
	end
	-- пули
	for i = #bullets, 1, -1 do
		local b = bullets[i]
		local np = b.part.Position + b.vel * dt
		b.part.Position = np
		b.life = b.life - dt
		local hit = false
		-- ежи держат пули обеих сторон, бочки взрываются
		for k = #props, 1, -1 do
			local pr = props[k]
			if (flat(pr.part.Position - np)).Magnitude < pr.r + 0.6 then
				hit = true
				if pr.kind == "barrel" then explodeBarrel(k, b.owner)
				else
					pr.hp = pr.hp - 1
					if pr.hp <= 0 then pr.part:Destroy(); table.remove(props, k) end
				end
				break
			end
		end
		if not hit and b.owner then
			for j = #enemies, 1, -1 do
				local e = enemies[j]
				if (flat(e.part.Position - np)).Magnitude < e.hitR then
					e.hp = e.hp - b.dmg
					if e.label then e.label.Text = e.title .. "  " .. math.max(0, math.ceil(e.hp)) end
					if e.hp <= 0 then killEnemy(j, b.owner) end
					hit = true
					break
				end
			end
		elseif not hit then
			for _, p in ipairs(alivePlayers()) do
				if (flat(p.root.Position - np)).Magnitude < 2.6 then
					p.hum:TakeDamage(b.dmg)
					hit = true
					break
				end
			end
		end
		if hit or b.life <= 0 or math.abs(np.X) > ARENA + 10 or math.abs(np.Z) > ARENA + 10 then
			b.part:Destroy()
			table.remove(bullets, i)
		end
	end
	-- башни игроков: за прицелом мыши/пальца
	for pl, st in pairs(pstate) do
		local ch = pl.Character
		local root = ch and ch:FindFirstChild("HumanoidRootPart")
		if st.tur and root then
			local base = root.Position - Vector3.new(0, (st.below or 2.6) - 0.06, 0)
			local d = st.aim and flat(st.aim - root.Position) or Vector3.zero
			if d.Magnitude < 0.5 then d = flat(root.CFrame.LookVector) end
			st.tur.CFrame = spriteCF(base, d.Unit)
		end
	end
	-- ящики: подбор наездом
	for i = #pickups, 1, -1 do
		local pk = pickups[i]
		pk.life = pk.life - dt
		local taken = false
		for _, p in ipairs(alivePlayers()) do
			if (flat(p.root.Position - pk.part.Position)).Magnitude < 3.5 then
				applyPickup(p, pk.kind)
				taken = true
				break
			end
		end
		if taken or pk.life <= 0 then
			pk.part:Destroy()
			table.remove(pickups, i)
		end
	end
end)

-- ---------- волны ----------
local function waveComposition(n)
	local count = math.min(11, 3 + math.floor(n / 9)) + math.max(0, #alivePlayers() - 1) * 2 -- друзья — больше врагов
	local list = {}
	for _ = 1, count do
		local r = math.random()
		local t = "soldier"
		if n >= 8 and r < 0.12 then t = "sniper"
		elseif n >= 6 and r < 0.27 then t = "kam"
		elseif n >= 4 and r < 0.45 then t = "heavy"
		elseif r < 0.7 then t = "scout" end
		table.insert(list, t)
	end
	return list
end
local function setWaveStat(n)
	for _, pl in ipairs(Players:GetPlayers()) do
		local ls = pl:FindFirstChild("leaderstats")
		if ls and ls:FindFirstChild("Волна") then ls["Волна"].Value = n end
	end
end
local function startWave(n)
	setWaveStat(n)
	local bi = (math.floor((n - 1) / BOSS_EVERY) % #BIOMES) + 1
	if n % BOSS_EVERY == 1 or #props == 0 then
		local base = workspace:FindFirstChild("Baseplate")
		if base then base.Color = BIOMES[bi][2] end
		spawnProps(bi)
	end
	if n % BOSS_EVERY == 0 then
		spawnBoss(n)
	else
		waveText.Value = "ВОЛНА " .. n .. " / " .. TOTAL_WAVES .. ((n % BOSS_EVERY == 1) and (" · " .. BIOMES[bi][1]) or "")
		for i, t in ipairs(waveComposition(n)) do
			task.delay((i - 1) * 0.42, function() spawnEnemy(t, n) end)
		end
	end
end

task.spawn(function()
	while #alivePlayers() == 0 do task.wait(0.5) end
	task.wait(2)
	while true do
		startWave(wave)
		task.wait(1)
		while #enemies > 0 do
			task.wait(0.3)
			if #alivePlayers() == 0 then break end
		end
		if #alivePlayers() == 0 then
			clearAll()
			wave = math.floor((wave - 1) / BOSS_EVERY) * BOSS_EVERY + 1
			waveText.Value = "ПОДБИТЫ! Снова с волны " .. wave
			while #alivePlayers() == 0 do task.wait(0.5) end
			task.wait(2)
		else
			wave = wave + 1
			task.wait(0.9)
		end
	end
end)
