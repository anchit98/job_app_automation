# NVIDIA bakeoff: Node writes request JSON, curl posts it. No app changes.
$ErrorActionPreference = "Continue"
$Root = Resolve-Path (Join-Path $PSScriptRoot "../..")
Set-Location $Root

Get-Content (Join-Path $Root ".env.testing.local") | ForEach-Object {
  if ($_ -match '^\s*NVIDIA_API_KEY=(.*)$') { $env:NVIDIA_API_KEY = $matches[1].Trim() }
}
if (-not $env:NVIDIA_API_KEY) { throw "NVIDIA_API_KEY missing" }

$Models = @(
  @{ Id = "google/gemma-4-31b-it"; Label = "Gemma 4 31B IT" },
  @{ Id = "moonshotai/kimi-k2.6"; Label = "Kimi K2.6" },
  @{ Id = "z-ai/glm-5.2"; Label = "GLM-5.2" }
)
$MaxTokens = @{
  jd_parse = 3072
  resume = 6144
  cover_letter = 4096
  cold_email = 4096
}

$Manifest = Get-Content (Join-Path $Root "bakeoff-out/manifest.json") -Raw | ConvertFrom-Json
$OutRaw = Join-Path $Root "bakeoff-out/raw"
$ResultsPath = Join-Path $Root "bakeoff-out/results.json"
New-Item -ItemType Directory -Force -Path $OutRaw | Out-Null

$Results = @()
if (Test-Path $ResultsPath) {
  try {
    $raw = [System.IO.File]::ReadAllText($ResultsPath)
    $raw = $raw -replace '^\uFEFF', ''
    $Results = @(($raw | ConvertFrom-Json))
  } catch { $Results = @() }
}

function Done-Ok($modelId, $app, $kind) {
  foreach ($r in $Results) {
    if ($r.model_id -eq $modelId -and $r.app -eq $app -and $r.kind -eq $kind -and $r.http_ok -eq $true) { return $true }
  }
  return $false
}

function Extract-Json([string]$raw) {
  $text = $raw.Trim()
  if ($text -match '(?s)```(?:json)?\s*(.*?)```') { $text = $Matches[1].Trim() }
  $o = $text.IndexOf("{"); $a = $text.IndexOf("[")
  $start = if ($o -lt 0) { $a } elseif ($a -lt 0) { $o } else { [Math]::Min($o, $a) }
  if ($start -lt 0) { throw "No JSON found" }
  return $text.Substring($start)
}

function Score-Kind($kind, $parsed) {
  $issues = @()
  switch ($kind) {
    "jd_parse" {
      if (-not ($parsed.company -or $parsed.Company)) { $issues += "missing_company" }
      if (-not ($parsed.role -or $parsed.title -or $parsed.job_title)) { $issues += "missing_role" }
    }
    "resume" {
      if (-not ($parsed.experience -or $parsed.bullets -or $parsed.skills)) { $issues += "missing_experience_or_skills" }
    }
    "cover_letter" {
      if (-not ($parsed.body -or $parsed.cover_letter -or $parsed.why_this_company -or $parsed.opening)) { $issues += "missing_body_fields" }
    }
    "cold_email" {
      $emails = $parsed.emails; if (-not $emails) { $emails = $parsed.items }
      if (-not $emails -or $emails.Count -lt 1) { $issues += "missing_emails_array" }
    }
  }
  return $issues
}

Write-Host "Bakeoff models=$($Models.Count) prompts=$($Manifest.Count)"

foreach ($model in $Models) {
  foreach ($item in $Manifest) {
    if (Done-Ok $model.Id $item.app $item.kind) {
      Write-Host "SKIP $($model.Label) | $($item.app)/$($item.kind)"
      continue
    }
    $Results = @($Results | Where-Object { -not ($_.model_id -eq $model.Id -and $_.app -eq $item.app -and $_.kind -eq $item.kind) })

    $promptPath = Join-Path $Root $item.file
    $tag = "$($item.app)__$($item.kind)__$($model.Id.Replace('/','_'))"
    $reqPath = Join-Path $OutRaw "$tag.req.json"
    $apiPath = Join-Path $OutRaw "$tag.api.json"
    $mt = $MaxTokens[$item.kind]
    if (-not $mt) { $mt = 4096 }

    Write-Host "`n>>> $($model.Label) | $($item.app)/$($item.kind)"
    node (Join-Path $Root "web/scripts/bakeoff-write-request.mjs") $model.Id $promptPath $reqPath $mt | Out-Host

    $ok = $false
    $content = $null
    $errorMsg = $null
    $usage = $null
    $finish = $null
    $http = 0
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $maxAttempts = 4
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
      if (Test-Path $apiPath) { Remove-Item $apiPath -Force -ErrorAction SilentlyContinue }
      $curlOut = & curl.exe -sS -m 300 -w "`n__CURL_HTTP__:%{http_code}" `
        "https://integrate.api.nvidia.com/v1/chat/completions" `
        -H "Authorization: Bearer $($env:NVIDIA_API_KEY)" `
        -H "Content-Type: application/json" `
        --data-binary "@$reqPath" `
        -o $apiPath 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0 -and -not ($curlOut -match "__CURL_HTTP__:\d+")) {
        $errorMsg = "curl_exit=$LASTEXITCODE $curlOut"
        $http = 0
      } else {
      $http = 0
      if ($curlOut -match "__CURL_HTTP__:(\d+)") { $http = [int]$Matches[1] }

      $content = $null; $errorMsg = $null; $usage = $null; $finish = $null; $ok = $false
      if (Test-Path $apiPath) {
        try {
          $api = Get-Content $apiPath -Raw -Encoding UTF8 | ConvertFrom-Json
          if ($http -eq 200 -and $api.choices -and $api.choices[0].message.content) {
            $content = [string]$api.choices[0].message.content
            $usage = $api.usage
            $finish = $api.choices[0].finish_reason
            $ok = $true
          } else {
            $snip = ($api | ConvertTo-Json -Compress)
            if ($snip.Length -gt 400) { $snip = $snip.Substring(0,400) }
            $errorMsg = $snip
          }
        } catch {
          $errorMsg = $_.Exception.Message
        }
      } else {
        $errorMsg = "No API file. $curlOut"
      }
      }

      if ($ok) { break }
      $retryable = ($http -in 0,429,500,502,503) -or ($errorMsg -match "Inference connection|timeout|timed out|curl_exit")
      if (-not $retryable -or $attempt -eq $maxAttempts) { break }
      $backoff = [Math]::Min(90, 10 * [Math]::Pow(2, $attempt - 1))
      Write-Host "  retry $attempt/$maxAttempts after http=$http sleep=${backoff}s"
      Start-Sleep -Seconds $backoff
    }
    $sw.Stop()

    $extractOk = $false; $parseOk = $false; $schemaOk = $false
    $schemaIssues = @(); $extractError = $null; $jsonText = $null; $parsed = $null
    if ($ok -and $content) {
      try {
        $jsonText = Extract-Json $content
        $extractOk = $true
        $parsed = $jsonText | ConvertFrom-Json
        $parseOk = $true
        $schemaIssues = @(Score-Kind $item.kind $parsed)
        $schemaOk = ($schemaIssues.Count -eq 0)
      } catch { $extractError = $_.Exception.Message }
    }

    $quality = 3
    if (-not ($extractOk -and $parseOk)) { $quality = 1 }
    elseif ($schemaIssues.Count -gt 0) { $quality = 2 }
    elseif ($item.kind -eq "resume" -and $parsed.experience -and $parsed.experience.Count -ge 2) { $quality = 4 }

    $row = [pscustomobject]@{
      model_id = $model.Id
      model_label = $model.Label
      app = $item.app
      company = $item.company
      role = $item.role
      kind = $item.kind
      http_ok = $ok
      http_status = $http
      error = $errorMsg
      latency_ms = $sw.ElapsedMilliseconds
      finish_reason = $finish
      usage = $usage
      raw_chars = if ($content) { $content.Length } else { 0 }
      extract_ok = $extractOk
      parse_ok = $parseOk
      extract_error = $extractError
      schema_issues = $schemaIssues
      schema_ok = $schemaOk
      quality_heuristic = $quality
    }
    $Results += $row
    $json = ($Results | ConvertTo-Json -Depth 10)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($ResultsPath, $json, $utf8NoBom)

    $txtPath = Join-Path $OutRaw "$tag.txt"
    if ($content) { Set-Content $txtPath $content -Encoding UTF8 }
    else { Set-Content $txtPath "ERROR ${http}: $errorMsg" -Encoding UTF8 }
    if ($jsonText) { Set-Content (Join-Path $OutRaw "$tag.json") $jsonText -Encoding UTF8 }

    Write-Host ("  ok={0} extract={1} schema={2} q={3} {4}ms chars={5} err={6}" -f $ok, $extractOk, $schemaOk, $quality, $sw.ElapsedMilliseconds, $row.raw_chars, ($(if ($errorMsg) { $errorMsg } else { "-" })))
    Start-Sleep -Seconds 5
  }
}

Write-Host "`nDone. Rows=$($Results.Count)"
