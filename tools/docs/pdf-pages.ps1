# Renders pages of a PDF to PNG with Windows' own PDF renderer (no extra software), to look at a built document.
#   powershell -File tools/docs/pdf-pages.ps1 -Pdf <file.pdf> -OutDir <dir> -Pages 3,5
param([Parameter(Mandatory)] [string]$Pdf, [Parameter(Mandatory)] [string]$OutDir, [int[]]$Pages = @(1))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$ext = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asOp = ($ext | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asAct = ($ext | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function Await($op, [type]$t) { $task = $asOp.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }
$full = (Resolve-Path $Pdf).Path
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync("$full")) ([Windows.Storage.StorageFile])
$doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
New-Item -ItemType Directory -Force $OutDir | Out-Null
$folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync("$((Resolve-Path $OutDir).Path)")) ([Windows.Storage.StorageFolder])
$base = [IO.Path]::GetFileNameWithoutExtension($full) -replace '[^\w-]', '_'
foreach ($n in $Pages) {
    if ($n -lt 1 -or $n -gt $doc.PageCount) { continue }
    $page = $doc.GetPage($n - 1)
    $png = Await ($folder.CreateFileAsync("$base-p$n.png", [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
    $stream = Await ($png.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
    $asAct.Invoke($null, @($page.RenderToStreamAsync($stream))).Wait()
    $stream.Dispose(); $page.Dispose()
}
"$($doc.PageCount) pages; rendered $($Pages -join ',') to $OutDir"
