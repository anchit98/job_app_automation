$Root = Resolve-Path (Join-Path $PSScriptRoot "../..")
Set-Location $Root
Get-Content ".env.testing.local" | ForEach-Object {
  if ($_ -match '^\s*NVIDIA_API_KEY=(.*)$') { $env:NVIDIA_API_KEY = $matches[1].Trim() }
}
$body = '{"model":"google/gemma-4-31b-it","messages":[{"role":"user","content":"Reply with {\"ok\":true} only"}],"max_tokens":32,"temperature":0,"stream":false}'
try {
  $r = Invoke-RestMethod -Uri "https://integrate.api.nvidia.com/v1/chat/completions" -Method POST -Headers @{Authorization="Bearer $env:NVIDIA_API_KEY"; "Content-Type"="application/json"} -Body $body -TimeoutSec 90
  Write-Output "OK"
  Write-Output $r.choices[0].message.content
} catch {
  Write-Output "FAIL $($_.Exception.Message)"
}
