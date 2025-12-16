# Cria um ambiente virtual (.venv) e instala dependências de desenvolvimento
# Uso: .\setup_dev.ps1

Write-Host "Preparando ambiente de desenvolvimento..."

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python não encontrado no PATH. Instale Python 3.8+ e tente novamente."
    exit 1
}

$venvPath = Join-Path $PSScriptRoot ".venv"

if (-not (Test-Path $venvPath)) {
    Write-Host "Criando virtualenv em $venvPath..."
    python -m venv $venvPath
} else {
    Write-Host "Virtualenv já existe em $venvPath"
}

Write-Host "Instalando dependências (requirements-dev.txt)..."

# Prefer usar o python dentro do virtualenv para garantir consistência
$venvPython = Join-Path $venvPath "Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Error "python não encontrado em $venvPath. Verifique se o virtualenv foi criado corretamente."
    exit 1
}

# Garantir que o pip exista no venv; se não, tentar ensurepip
try {
    & $venvPython -m pip --version > $null 2>&1
} catch {
    Write-Host "pip não encontrado no venv, tentando instalar via ensurepip..."
    try {
        & $venvPython -m ensurepip --upgrade
    } catch {
        Write-Error "Falha ao instalar pip no virtualenv. Saindo."
        exit 1
    }
}

Write-Host "Atualizando pip e instalando requerimentos..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $PSScriptRoot "requirements-dev.txt")

Write-Host "Instalação completa. Para ativar o ambiente (PowerShell):"
Write-Host "    . $venvPath\Scripts\Activate.ps1"
Write-Host "Depois rode o servidor (exemplo): .\run.ps1 8000"