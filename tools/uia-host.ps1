param([int]$IdleSeconds = 900)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
# Win32 fallback for focus: UIA SetFocus can block on a busy app; SetForegroundWindow does not.
Add-Type -Namespace Win32 -Name User -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
'@
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker

function Brief($el, $level) {
  $p = $el.Current
  [pscustomobject]@{
    name = [string]$p.Name; type = [string]$p.ControlType.ProgrammaticName -replace '^ControlType\.', '';
    automationId = [string]$p.AutomationId; className = [string]$p.ClassName;
    processId = [int]$p.ProcessId; enabled = [bool]$p.IsEnabled; offscreen = [bool]$p.IsOffscreen; level = $level
  }
}
function Children($el) { $o = @(); $c = $walker.GetFirstChild($el); while ($c -ne $null) { $o += $c; $c = $walker.GetNextSibling($c) }; $o }
function FindByName($name) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
  $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
}

function Handle($req) {
  switch ($req.action) {
    'ping' { return @{ pong = $true } }
    'windows' {
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      return @(Children $root | ForEach-Object { Brief $_ 0 })
    }
    'find' {
      $hits = FindByName $req.name
      return @($hits | ForEach-Object { Brief $_ 0 })
    }
    'focus' {
      # top-level windows only, then Win32 SetForegroundWindow (no UIA call that can block)
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      $target = $null
      foreach ($w in Children $root) { if ($w.Current.Name -eq $req.name) { $target = $w; break } }
      if ($null -eq $target) {
        $hits = FindByName $req.name
        if ($hits.Count -eq 0) { throw 'element not found: ' + $req.name }
        $target = $hits[0]
      }
      $hwnd = [IntPtr]$target.Current.NativeWindowHandle
      if ($hwnd -eq [IntPtr]::Zero) { throw 'element has no native window handle (not a top-level window)' }
      [void][Win32.User]::ShowWindow($hwnd, 5)
      $ok = [Win32.User]::SetForegroundWindow($hwnd)
      $fg = [Win32.User]::GetForegroundWindow()
      return @{ focused = (Brief $target 0); handle = $hwnd.ToInt64(); setForeground = $ok; foregroundMatches = ($fg -eq $hwnd) }
    }
    'invoke' {
      $hits = FindByName $req.name
      if ($hits.Count -eq 0) { throw 'element not found: ' + $req.name }
      $el = $hits[0]
      $pat = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $pat.Invoke()
      return @{ invoked = (Brief $el 0) }
    }
    'toggle' {
      $hits = FindByName $req.name
      if ($hits.Count -eq 0) { throw 'element not found: ' + $req.name }
      $el = $hits[0]
      $pat = $el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
      $pat.Toggle()
      return @{ toggled = (Brief $el 0); state = [string]$pat.Current.ToggleState }
    }
    'setvalue' {
      $hits = FindByName $req.name
      if ($hits.Count -eq 0) { throw 'element not found: ' + $req.name }
      $el = $hits[0]
      $pat = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      $pat.SetValue([string]$req.value)
      return @{ value = [string]$pat.Current.Value }
    }
    default { throw 'unknown action: ' + $req.action }
  }
}

$deadline = (Get-Date).AddSeconds($IdleSeconds)
while ((Get-Date) -lt $deadline) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if (-not $line) { continue }
  $deadline = (Get-Date).AddSeconds($IdleSeconds)
  try {
    $req = $line | ConvertFrom-Json
    $data = Handle $req
    @{ id = $req.id; ok = $true; data = $data } | ConvertTo-Json -Depth 8 -Compress | Write-Output
  } catch {
    @{ id = (try { $req.id } catch { $null }); ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Depth 4 -Compress | Write-Output
  }
  [Console]::Out.Flush()
}
