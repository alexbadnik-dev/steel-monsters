-- «Жестянки» для Roblox — КЛИЕНТСКИЙ скрипт-заготовка.
-- Куда положить: StarterPlayer → StarterPlayerScripts → LocalScript, вставить этот текст.
-- Что делает: камера сверху (как в веб-версии), стрельба мышкой/пробелом/касанием, надпись волны.
-- Ходит персонаж стандартно: WASD на компе, джойстик на телефоне.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local mouse = player:GetMouse()
local fireEvent = ReplicatedStorage:WaitForChild("Fire")
local waveText = ReplicatedStorage:WaitForChild("WaveText")

local HEIGHT = 75        -- высота камеры: больше — видно больше поля
local COOLDOWN = 0.24    -- как у танка «Балбес»
local firing = false
local lastShot = 0

-- надпись волны вверху экрана
local gui = Instance.new("ScreenGui")
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")
local label = Instance.new("TextLabel")
label.Size = UDim2.new(1, 0, 0, 40)
label.Position = UDim2.new(0, 0, 0, 8)
label.BackgroundTransparency = 1
label.TextColor3 = Color3.fromRGB(241, 196, 15)
label.TextStrokeTransparency = 0.4
label.Font = Enum.Font.GothamBlack
label.TextSize = 28
label.Text = waveText.Value
label.Parent = gui
waveText.Changed:Connect(function(v) label.Text = v end)

-- камера строго сверху, «верх экрана» = −Z
RunService.RenderStepped:Connect(function()
	local ch = player.Character
	local root = ch and ch:FindFirstChild("HumanoidRootPart")
	if root then
		camera.CameraType = Enum.CameraType.Scriptable
		camera.CFrame = CFrame.new(root.Position + Vector3.new(0, HEIGHT, 0)) * CFrame.Angles(-math.pi / 2, 0, 0)
	end
	if firing and os.clock() - lastShot >= COOLDOWN then
		lastShot = os.clock()
		fireEvent:FireServer(mouse.Hit.Position)
	end
end)

-- огонь: левая кнопка мыши, пробел или касание экрана (не по джойстику)
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.UserInputType == Enum.UserInputType.MouseButton1
		or input.UserInputType == Enum.UserInputType.Touch
		or input.KeyCode == Enum.KeyCode.Space then
		firing = true
	end
end)
UserInputService.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1
		or input.UserInputType == Enum.UserInputType.Touch
		or input.KeyCode == Enum.KeyCode.Space then
		firing = false
	end
end)
