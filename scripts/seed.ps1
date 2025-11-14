Write-Host "Executando seed de dispositivos do laboratório..."
$env:PORT=3000
Push-Location "$PSScriptRoot\..\iot2025back-main"
if (Test-Path ".env") { Get-Content .env | Write-Output | Out-Null }
npm run seed:lab
Pop-Location
