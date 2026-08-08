# Servidor local em PowerShell - nao requer Python nem Node
# Serve a pasta atual em http://localhost:8000 e abre o navegador
$ErrorActionPreference = "Stop"
$port = 8000
$arquivo = "index.html"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "========================================================"
Write-Host "  Servidor rodando em http://localhost:$port"
Write-Host "  Aplicacao: http://localhost:$port/$arquivo"
Write-Host "  Para parar: feche esta janela ou pressione Ctrl+C"
Write-Host "========================================================"

# abre o navegador
Start-Process "http://localhost:$port/$arquivo"

$mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="application/javascript";
  ".css"="text/css"; ".vtt"="text/vtt"; ".json"="application/json";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".svg"="image/svg+xml"
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart("/"))
    if ([string]::IsNullOrEmpty($rel)) { $rel = $arquivo }
    $path = Join-Path $root $rel
    if (Test-Path $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
      $res.Headers.Add("Cache-Control","no-store")
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes,0,$bytes.Length)
      Write-Host "  > 200 $rel"
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - nao encontrado: $rel")
      $res.OutputStream.Write($msg,0,$msg.Length)
      Write-Host "  > 404 $rel"
    }
    $res.OutputStream.Close()
  }
} finally {
  $listener.Stop()
}
