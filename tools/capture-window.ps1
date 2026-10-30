# Capture one window off-screen: no focus change, no virtual display needed.
# usage: powershell -File tools/capture-window.ps1 -Name Everything -Out state/xx.png
param([string]$Name, [string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class Cap {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
}
'@
$p = Get-Process -Name $Name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Error ('no window for ' + $Name); exit 3 }
$h = [IntPtr]$p.MainWindowHandle
$r = New-Object Cap+RECT
[void][Cap]::GetWindowRect($h, [ref]$r)
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
$ok = [Cap]::PrintWindow($h, $dc, 2)
$g.ReleaseHdc($dc); $g.Dispose()
$bmp.Save($Out); $bmp.Dispose()
Write-Output ('captured ' + $w + 'x' + $ht + ' ok=' + $ok + ' -> ' + $Out)