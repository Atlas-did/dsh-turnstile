# 一键建沙盒并自检（Windows）。用法：powershell -File platform\bootstrap.ps1 -Root D:\lab -Port 18770
param(
  [Parameter(Mandatory = $true)][string]$Root,
  [int]$Port = 18770,
  [string]$DshBin = ''
)
$ErrorActionPreference = 'Stop'
# node 输出是 UTF-8，PowerShell 默认按本地代码页解释 → 中文乱码
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

if (-not $DshBin) {
  $candidate = Join-Path $Root 'runtime\node_modules\@deepseek-ai\dsh\lib\bin.js'
  if (Test-Path $candidate) { $DshBin = $candidate }
}

if ($DshBin) {
  node tools/new-sandbox.mjs --root $Root --profiles mini --port $Port --dsh-bin $DshBin | Out-Host
} else {
  Write-Host '没有找到 DSH 入口：先装 @deepseek-ai/dsh 到 <Root>\runtime，或传 -DshBin'
}

if ($DshBin) { node tools/sandbox-verify.mjs --root $Root --port $Port --dsh-bin $DshBin | Out-Host }
else { node tools/sandbox-verify.mjs --root $Root --port $Port | Out-Host }