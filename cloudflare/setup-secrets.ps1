# Sets the four Worker secrets in one go.
#
#   powershell -ExecutionPolicy Bypass -File setup-secrets.ps1
#
# The Gmail credentials are read straight out of the Python project's .env and
# piped into wrangler, so they are never typed, echoed, or pasted anywhere.
# The dashboard password is generated here and shown once, in your terminal.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Wrangler needs the API token. This app's shells may predate `setx`, so read
# it from the user profile rather than relying on inheritance.
foreach ($name in @("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID")) {
  $value = [Environment]::GetEnvironmentVariable($name, "User")
  if ($value) { Set-Item -Path "env:$name" -Value $value }
}
if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Host "CLOUDFLARE_API_TOKEN is not set. Run setx first." -ForegroundColor Red
  exit 1
}

# ---- Gmail credentials, lifted from the existing .env ----------------------
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envFile)) {
  Write-Host "Could not find $envFile" -ForegroundColor Red
  exit 1
}

$settings = @{}
foreach ($line in Get-Content $envFile) {
  $trimmed = $line.Trim()
  if ($trimmed -and -not $trimmed.StartsWith("#") -and $trimmed.Contains("=")) {
    $key, $rest = $trimmed -split "=", 2
    $settings[$key.Trim()] = $rest.Trim()
  }
}

$smtpUser = $settings["EMAIL_USER"]
$smtpPass = $settings["EMAIL_PASS"]

if (-not $smtpUser -or -not $smtpPass -or $smtpPass.StartsWith("xxxx")) {
  Write-Host "EMAIL_USER / EMAIL_PASS are not filled in inside $envFile" -ForegroundColor Red
  exit 1
}

# ---- Dashboard login -------------------------------------------------------
$dashUser = Read-Host "Dashboard username (Enter for 'admin')"
if (-not $dashUser) { $dashUser = "admin" }

# Ambiguous characters left out so it can be read off the screen reliably.
$alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray()
$bytes = [byte[]]::new(20)
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$dashPass = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })

# ---- Push them -------------------------------------------------------------
function Put-Secret($name, $value) {
  Write-Host "  setting $name ..." -NoNewline
  $value | npx wrangler secret put $name 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host " ok" -ForegroundColor Green }
  else { Write-Host " FAILED" -ForegroundColor Red }
}

Write-Host ""
Write-Host "Pushing secrets to the Worker:" -ForegroundColor Cyan
Put-Secret "SMTP_USER" $smtpUser
Put-Secret "SMTP_PASS" $smtpPass
Put-Secret "DASH_USER" $dashUser
Put-Secret "DASH_PASS" $dashPass

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Yellow
Write-Host " Dashboard login - save this now, it is not shown again" -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "   https://birthday.akhileshnagargoje.in"
Write-Host "   username: $dashUser"
Write-Host "   password: $dashPass"
Write-Host ""
Write-Host "Put it in a password manager. Do not paste it into a chat." -ForegroundColor DarkGray
Write-Host ""

npx wrangler secret list
