Write-Host "Derrubando stack Docker..."
docker compose -f "$PSScriptRoot\..\docker-compose.yml" down -v
