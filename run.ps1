# Run the app on a single port (PowerShell)
# Usage: .\run.ps1  [PORT]

param(
    [int]$PORT = 8000
)

Write-Host "Starting app on port $PORT..."

# Set environment variable for this PowerShell session
$env:PORT = $PORT

# Start the Flask app
python -u "$PSScriptRoot\app.py"
