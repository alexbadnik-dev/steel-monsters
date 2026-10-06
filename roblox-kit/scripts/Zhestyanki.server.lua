-- «Жестянки» для Roblox — СЕРВЕРНЫЙ скрипт-заготовка.
-- Куда положить: ServerScriptService → Script (не LocalScript!), вставить этот текст.
-- Что делает: волны врагов, босс каждые 10 волн, пули, урон, чекпоинт по десяткам.
-- Цифры взяты из веб-версии (game-data.json). 1 пиксель веб-версии ≈ 0.1 стада.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- связь с игроками: клиент шлёт «стреляю сюда», сервер пишет номер волны
local fireEvent = Instance.new("RemoteEvent")
fireEvent.Name = "Fire"
fireEvent.Parent = ReplicatedStorage
local waveText = Instance.new("StringValue")
waveText.Name = "WaveText"
waveText.Value = "Готовься к бою!"
waveText.Parent = ReplicatedStorage

-- ================== НАСТРОЙКИ ==================
local ARENA = 90            -- поле от -ARENA до +ARENA стадов (Baseplate шаблона подходит)
local BOSS_EVERY = 10
local TOTAL_WAVES = 100
local PLAYER_SHOT = { dmg = 15, cooldown = 0.24, speed = 56 }

-- враги: hp, скорость (стад/с), урон, интервал стрельбы, размер, цвет, на каком расстоянии держится
-- decal — номер картинки из Asset Manager (sprites/enemies/*.png): "123456" или "rbxassetid://123456"
local ETYPES = {
	scout   = { hp = 20, speed = 15,   dmg = 6,  fire = {1.0, 1.9}, size = 3.2, color = Color3.fromRGB(159, 209, 232), keep = 22, decal = "" },
	soldier = { hp = 35, speed = 9.5,  dmg = 8,  fire = {1.4, 2.6}, size = 3.8, color = Color3.fromRGB(143, 166, 184), keep = 22, decal = "" },
	heavy   = { hp = 90, speed = 5.2,  dmg = 14, fire = {2.0, 3.2}, size = 5.0, color = Color3.fromRGB(194, 160, 107), keep = 20, decal = "" },
	kam     = { hp = 18, speed = 23.5, dmg = 26, fire = nil,        size = 3.0, color = Color3.fromRGB(255, 141, 107), keep = 0,  decal = "" },
	sniper  = { hp = 48, speed = 7,    dmg = 19, fire = {3.0, 4.4}, size = 3.6, color = Color3.fromRGB(184, 155, 224), keep = 42, decal = "", bulletSpeed = 85 },
}

-- боссы: hpMult — крепче, speed — быстрее/медленнее, fan — лишние пули в веере
local BOSSES = {
	{ name = "ЖЕЛЕЗНЫЙ КУЛАК", color = Color3.fromRGB(232, 76, 61),  minion = "scout" },
	{ name = "ОХОТНИК",        color = Color3.fromRGB(143, 166, 184), minion = "scout",   speed = 1.5 },
	{ name = "КРЕПОСТЬ",       color = Color3.fromRGB(194, 160, 107), minion = "soldier", hpMult = 1.35, speed = 0.6, fan = 1 },
	{ name = "ШЕРШЕНЬ",        color = Color3.fromRGB(255, 216, 77),  minion = "scout" },
	{ name = "МОРОЗ",          color = Color3.fromRGB(159, 217, 232), minion = "scout",   fan = 2 },
	{ name = "ПАУК",           color = Color3.fromRGB(90, 74, 106),   minion = "kam" },
	{ name = "ФАНТОМ",         color = Color3.fromRGB(232, 238, 242), minion = "soldier", speed = 1.35 },
	{ name = "ВУЛКАН",         color = Color3.fromRGB(90, 44, 32),    minion = "heavy",   hpMult = 1.2 },
	{ name = "ШТОРМ",          color = Color3.fromRGB(109, 179, 242), minion = "soldier" },
	{ name = "ИМПЕРАТОР",      color = Color3.fromRGB(246, 211, 45),  minion = "soldier", hpMult = 1.25 },
}
-- ===============================================

local enemies = {}   -- { part, hp, maxHp, t (тип), fireT, boss = true/nil, ... }
local bullets = {}   -- { part, vel, dmg, fromPlayer, life }
local wave = 1
local bossesBeaten = 0
local lastShot = {}  -- [player] = время последнего выстрела (защита от «пулемёта»)

local function rand(a, b) return a + math.random() * (b - a) end

-- рост сложности с номером волны (как в веб-версии)
local function diffFor(n)
	return { hp = 1 + (n - 1) * 0.02, dmg = math.min(2.1, 1 + (n - 1) * 0.012) }
end

local function alivePlayers()
	local list = {}
	for _, pl in ipairs(Players:GetPlayers()) do
		local ch = pl.Character
		local hum = ch and ch:FindFirstChildOfClass("Humanoid")
		local root = ch and ch:FindFirstChild("HumanoidRootPart")
		if hum and root and hum.Health > 0 then
			table.insert(list, { hum = hum, root = root })
		end
	end
	return list
end

local function nearestPlayer(pos)
	local best, bestD = nil, math.huge
	for _, p in ipairs(alivePlayers()) do
		local d = (p.root.Position - pos).Magnitude
		if d < bestD then best, bestD = p, d end
	end
	return best, bestD
end

local function flat(v) return Vector3.new(v.X, 0, v.Z) end

-- ---------- пули ----------
local function spawnBullet(origin, dir, speed, dmg, fromPlayer)
	local p = Instance.new("Part")
	p.Shape = Enum.PartType.Ball
	p.Size = Vector3.new(0.9, 0.9, 0.9)
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.Material = Enum.Material.Neon
	p.Color = fromPlayer and Color3.fromRGB(255, 216, 77) or Color3.fromRGB(255, 110, 90)
	p.Position = origin
	p.Parent = workspace
	table.insert(bullets, { part = p, vel = dir.Unit * speed, dmg = dmg, fromPlayer = fromPlayer, life = 3 })
end

-- ---------- враги ----------
local function addHpBar(e, title)
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.new(0, 160, 0, 30)
	bb.StudsOffset = Vector3.new(0, e.part.Size.Y + 1, 0)
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

local function makeTankPart(size, color, decalId)
	local p = Instance.new("Part")
	p.Size = Vector3.new(size, size * 0.6, size)
	p.Anchored = true
	p.CanCollide = false
	p.Color = color
	p.Material = Enum.Material.SmoothPlastic
	if decalId and decalId ~= "" then
		-- можно вставлять просто номер из Asset Manager — приставку добавим сами
		if not string.find(decalId, "rbxassetid") then decalId = "rbxassetid://" .. decalId end
		local d = Instance.new("Decal")
		d.Texture = decalId
		d.Face = Enum.NormalId.Top
		d.Parent = p
	end
	return p
end

-- side: 1 = справа (+X), 2 = слева, 3 = сверху (-Z), 4 = снизу; nil — случайный край
local function spawnEnemy(typeName, n, side)
	local T = ETYPES[typeName] or ETYPES.soldier
	local D = diffFor(n)
	side = side or math.random(1, 4)
	local x, z
	if side == 1 then x, z = ARENA - 4, rand(-ARENA + 6, ARENA - 6)
	elseif side == 2 then x, z = -ARENA + 4, rand(-ARENA + 6, ARENA - 6)
	elseif side == 3 then x, z = rand(-ARENA + 6, ARENA - 6), -ARENA + 4
	else x, z = rand(-ARENA + 6, ARENA - 6), ARENA - 4 end
	local part = makeTankPart(T.size, T.color, T.decal)
	part.Name = "Enemy_" .. typeName
	part.Position = Vector3.new(x, part.Size.Y / 2, z)
	part.Parent = workspace
	local hp = T.hp * D.hp
	local e = { part = part, hp = hp, maxHp = hp, t = T, dmg = T.dmg * D.dmg,
		fireT = T.fire and rand(T.fire[1], T.fire[2]) or 99, strafe = (math.random() < 0.5) and 1 or -1 }
	table.insert(enemies, e)
	return e
end

local function spawnBoss(n)
	local num = math.floor(n / BOSS_EVERY)
	local def = BOSSES[((num - 1) % #BOSSES) + 1]
	local final = (n == TOTAL_WAVES)
	-- здоровье как в веб-версии: база растёт с номером, плюс +6% за номер (до 10-го)
	local grow = 1 + 0.06 * math.min(num - 1, 9)
	local hp = (380 + 240 * num + (final and 400 or 0)) * grow * (def.hpMult or 1)
	local part = makeTankPart(final and 12 or 10, def.color, "")
	part.Name = "Boss"
	part.Position = Vector3.new(ARENA * 0.55, part.Size.Y / 2, 0)
	part.Parent = workspace
	local e = { part = part, hp = hp, maxHp = hp, boss = true, def = def, num = num,
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
		-- веер в игрока
		local c = (enraged and 5 or 3) + (e.def.fan or 0)
		for i = 0, c - 1 do
			local a = baseA + (i - (c - 1) / 2) * 0.2
			spawnBullet(origin, Vector3.new(math.cos(a), 0, math.sin(a)), 28 * (enraged and 1.15 or 1), e.dmg, false)
		end
	else
		-- круговой залп
		local cnt = enraged and 14 or 10
		for i = 0, cnt - 1 do
			local a = baseA + i * (math.pi * 2 / cnt)
			spawnBullet(origin, Vector3.new(math.cos(a), 0, math.sin(a)), 23, e.dmg - 2, false)
		end
	end
end

local function killEnemy(i)
	local e = enemies[i]
	table.remove(enemies, i)
	if e.boss then
		bossesBeaten = bossesBeaten + 1
		-- награда за босса: урон +20% от базы
		PLAYER_SHOT.dmg = 15 * (1 + 0.2 * bossesBeaten)
		for _, p in ipairs(alivePlayers()) do p.hum.Health = math.min(p.hum.MaxHealth, p.hum.Health + p.hum.MaxHealth * 0.5) end
		waveText.Value = e.def.name .. " ПОВЕРЖЕН!"
	end
	local boom = Instance.new("Explosion")
	boom.Position = e.part.Position
	boom.BlastPressure = 0
	boom.DestroyJointRadiusPercent = 0
	boom.Parent = workspace
	e.part:Destroy()
end

local function clearAll()
	for _, e in ipairs(enemies) do e.part:Destroy() end
	for _, b in ipairs(bullets) do b.part:Destroy() end
	enemies, bullets = {}, {}
end

-- ---------- выстрел игрока ----------
fireEvent.OnServerEvent:Connect(function(pl, targetPos)
	if typeof(targetPos) ~= "Vector3" then return end
	local now = os.clock()
	if lastShot[pl] and now - lastShot[pl] < PLAYER_SHOT.cooldown * 0.9 then return end
	lastShot[pl] = now
	local ch = pl.Character
	local root = ch and ch:FindFirstChild("HumanoidRootPart")
	if not root then return end
	local dir = flat(targetPos - root.Position)
	if dir.Magnitude < 0.1 then return end
	spawnBullet(root.Position + dir.Unit * 3, dir, PLAYER_SHOT.speed, PLAYER_SHOT.dmg, true)
end)
Players.PlayerRemoving:Connect(function(pl) lastShot[pl] = nil end)

-- ---------- каждый кадр: движение врагов и пуль ----------
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
			if e.t.keep == 0 then
				move = dir -- камикадзе несётся напрямик
			elseif d > e.t.keep then
				move = dir
			else
				move = Vector3.new(-dir.Z, 0, dir.X) * 0.45 * (e.strafe or 1) -- кружит вокруг
			end
			local np = pos + move * e.t.speed * dt
			np = Vector3.new(math.clamp(np.X, -ARENA, ARENA), pos.Y, math.clamp(np.Z, -ARENA, ARENA))
			e.part.CFrame = CFrame.lookAt(np, np + dir)
			if e.t.keep == 0 and d < 4 then
				target.hum:TakeDamage(e.dmg)
				killEnemy(i)
			elseif e.boss then
				e.fireT = e.fireT - dt
				if e.fireT <= 0 then
					bossShoot(e, target)
					local rate = math.max(0.8, 1.35 - e.num * 0.04)
					e.fireT = rate * ((e.hp <= e.maxHp / 2) and 0.66 or 1)
				end
				-- свита выходит со стороны босса (справа), не больше двух
				e.minionT = e.minionT - dt
				if e.minionT <= 0 and #enemies < 3 then
					spawnEnemy(e.def.minion, wave, 1)
					e.minionT = 9
				end
			elseif e.t.fire then
				e.fireT = e.fireT - dt
				if e.fireT <= 0 then
					spawnBullet(np + dir * (e.t.size * 0.7), dir, e.t.bulletSpeed or 30, e.dmg, false)
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
		if b.fromPlayer then
			for j = #enemies, 1, -1 do
				local e = enemies[j]
				if (flat(e.part.Position - np)).Magnitude < e.part.Size.X / 2 + 0.6 then
					e.hp = e.hp - b.dmg
					if e.label then e.label.Text = e.title .. "  " .. math.max(0, math.ceil(e.hp)) end
					if e.hp <= 0 then killEnemy(j) end
					hit = true
					break
				end
			end
		else
			for _, p in ipairs(alivePlayers()) do
				if (flat(p.root.Position - np)).Magnitude < 2.4 then
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
end)

-- ---------- волны ----------
local function waveComposition(n)
	local count = math.min(11, 3 + math.floor(n / 9))
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

local function startWave(n)
	if n % BOSS_EVERY == 0 then
		spawnBoss(n)
	else
		waveText.Value = "ВОЛНА " .. n .. " / " .. TOTAL_WAVES
		for i, t in ipairs(waveComposition(n)) do
			task.delay((i - 1) * 0.42, function() spawnEnemy(t, n) end)
		end
	end
end

task.spawn(function()
	-- ждём первого игрока
	while #alivePlayers() == 0 do task.wait(0.5) end
	task.wait(2)
	while true do
		startWave(wave)
		task.wait(1)
		-- ждём, пока поле очистится (или пока все не погибнут)
		while #enemies > 0 do
			task.wait(0.3)
			if #alivePlayers() == 0 then break end
		end
		if #alivePlayers() == 0 then
			-- все подбиты: назад к началу десятки (чекпоинт), ждём респавна
			clearAll()
			wave = math.floor((wave - 1) / BOSS_EVERY) * BOSS_EVERY + 1
			waveText.Value = "ПОДБИТ! Снова с волны " .. wave
			while #alivePlayers() == 0 do task.wait(0.5) end
			task.wait(2)
		else
			wave = wave + 1
			task.wait(0.9)
		end
	end
end)
