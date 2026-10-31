param(
  [ValidateSet('list','tree','find','text')][string]$Action = 'list',
  [int]$Depth = 3,
  [string]$Name = '',
  [int]$TargetPid = 0,
  [int]$Max = 200
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
function Node-Brief($el, $level) {
  $p = $el.Current
  [pscustomobject]@{
    name = [string]$p.Name
    type = [string]$p.ControlType.ProgrammaticName -replace '^ControlType\.', ''
    automationId = [string]$p.AutomationId
    className = [string]$p.ClassName
    processId = [int]$p.ProcessId
    enabled = [bool]$p.IsEnabled
    offscreen = [bool]$p.IsOffscreen
    level = $level
  }
}

function Get-Children($el) {
  $out = @()
  $child = $walker.GetFirstChild($el)
  while ($child -ne $null) {
    $out += $child
    $child = $walker.GetNextSibling($child)
  }
  return $out
}

if ($Action -eq 'list') {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $items = Get-Children $root | ForEach-Object { Node-Brief $_ 0 }
  $items | ConvertTo-Json -Depth 3 -Compress
  exit 0
}

if ($Action -eq 'tree') {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $all = @()
  $queue = @()
  foreach ($c in Get-Children $root) { $queue += ,@($c, 0) }
  while ($queue.Count -gt 0 -and $all.Count -lt $Max) {
    $pair = $queue[0]
    $queue = $queue[1..($queue.Count)]
    if ($queue.Count -eq 1 -and $queue[0] -eq $null) { $queue = @() }
    $el = $pair[0]; $lvl = [int]$pair[1]
    $b = Node-Brief $el $lvl
    if ($TargetPid -gt 0 -and $b.processId -ne $TargetPid) { continue }
    $all += $b
    if ($lvl -lt $Depth) { foreach ($c in Get-Children $el) { $queue += ,@($c, $lvl + 1) } }
  }
  $all | ConvertTo-Json -Depth 3 -Compress
  exit 0
}

if ($Action -eq 'find') {
  if (-not $Name) { Write-Output '{"error":"find 需要 -Name"}'; exit 2 }
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
  $hits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
  $all = @()
  foreach ($h in $hits) { if ($all.Count -ge $Max) { break }; $all += Node-Brief $h 0 }
  $all | ConvertTo-Json -Depth 3 -Compress
  exit 0
}

if ($Action -eq 'text') {
  $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
  $b = Node-Brief $focused 0
  $value = ''
  try {
    $vp = $focused.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $value = [string]$vp.Current.Value
  } catch { }
  if (-not $value) { $value = [string]$b.name }
  [pscustomobject]@{ focused = $b; value = $value } | ConvertTo-Json -Depth 4 -Compress
  exit 0
}
