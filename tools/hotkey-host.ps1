param([string]$Specs = 'Ctrl+Alt+F12', [int]$Seconds = 20)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$src = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class HotKeyWindow : NativeWindow {
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    const int WM_HOTKEY = 0x0312;
    Dictionary<int, string> names = new Dictionary<int, string>();
    public List<string> Failed = new List<string>();
    public HotKeyWindow() {
        CreateHandle(new CreateParams());
    }
    public bool Add(int id, uint mods, uint vk, string name) {
        bool ok = RegisterHotKey(this.Handle, id, mods, vk);
        if (ok) names[id] = name; else Failed.Add(name);
        return ok;
    }
    protected override void WndProc(ref Message m) {
        if (m.Msg == WM_HOTKEY) {
            int id = m.WParam.ToInt32();
            string name;
            if (names.TryGetValue(id, out name)) Console.Out.WriteLine("{\"hotkey\":\"" + name + "\"}");
            Console.Out.Flush();
        }
        base.WndProc(ref m);
    }
}
'@
Add-Type -TypeDefinition $src -ReferencedAssemblies System.Windows.Forms

$w = New-Object HotKeyWindow
$map = @{ 'Ctrl' = 0x0002; 'Alt' = 0x0001; 'Shift' = 0x0004; 'Win' = 0x0008 }
$vk = @{}
for ($i = 1; $i -le 24; $i++) { $vk['F' + $i] = 0x6F + $i }
for ($c = 65; $c -le 90; $c++) { $vk[[string][char]$c] = $c }
for ($d = 0; $d -le 9; $d++) { $vk[[string]$d] = 0x30 + $d }

$id = 1
foreach ($spec in $Specs.Split(',')) {
  $parts = $spec.Trim().Split('+')
  $mods = 0
  $key = $null
  foreach ($p in $parts) {
    if ($map.ContainsKey($p)) { $mods = $mods -bor $map[$p] }
    else { $key = $p.ToUpper() }
  }
  if ($null -eq $key -or -not $vk.ContainsKey($key)) { Write-Output ('{"error":"unsupported key: ' + $spec + '"}'); continue }
  $ok = $w.Add($id, [uint32]$mods, [uint32]$vk[$key], $spec.Trim())
  if ($ok) { Write-Output ('{"registered":"' + $spec.Trim() + '"}') } else { Write-Output ('{"failed":"' + $spec.Trim() + '"}') }
  [Console]::Out.Flush()
  $id++
}

$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 50
}
Write-Output '{"end":true}'
