# Windows に入っている文字の読み取り（Windows.Media.Ocr、日本語）で、画像の文字と位置を JSON に書き出す
# 使い方: powershell -NoProfile -ExecutionPolicy Bypass -File ocr_windows.ps1 <画像の一覧のテキスト>
#   一覧の1行が「画像のパス<TAB>書き出す JSON のパス」。もう JSON があれば読み取り直さない
#   JSON: {"w":幅,"h":高さ,"lines":[{"words":[{"t":文字,"x":左,"y":上,"w":幅,"h":高さ}, ...]}, ...]}
param([string]$ListPath)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
    $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $t.Wait(-1) | Out-Null
    $t.Result
}
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("ja"))
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($line in [System.IO.File]::ReadAllLines($ListPath, $utf8)) {
    if (-not $line.Trim()) { continue }
    $img, $out = $line.Split("`t")
    if (Test-Path -LiteralPath $out) { continue }
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($img)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines = foreach ($l in $res.Lines) {
        $words = foreach ($w in $l.Words) {
            $r = $w.BoundingRect
            @{ t = $w.Text; x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height }
        }
        @{ words = @($words) }
    }
    $json = @{ w = $bitmap.PixelWidth; h = $bitmap.PixelHeight; lines = @($lines) } | ConvertTo-Json -Depth 6 -Compress
    [System.IO.File]::WriteAllText($out, $json, $utf8)
    $stream.Dispose()
    Write-Output "done $out"  # PowerShell 5.1 は BOM のない .ps1 を Shift_JIS で読むので、出す文字は英字だけにする
}
