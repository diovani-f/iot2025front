Write-Host "Subindo stack Docker (mongo, mosquitto, backend, frontend)..."
docker compose -f "$PSScriptRoot\..\docker-compose.yml" up -d
