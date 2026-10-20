# 간단한 정적 파일 서버 (Node.js/Python 없이 실행)
# 사용법: powershell -ExecutionPolicy Bypass -File serve.ps1  →  http://localhost:8080
param([int]$Port = 8080)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

$types = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"; ".json" = "application/json; charset=utf-8"
  ".svg" = "image/svg+xml"; ".png" = "image/png"; ".jpg" = "image/jpeg"; ".ico" = "image/x-icon"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
    if ($path -eq "") { $path = "index.html" }
    $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))
    if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
