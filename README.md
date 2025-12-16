Pipeline-Train — como rodar em uma única porta

Arquitetura (visão rápida)

- Backend: Flask + Blueprints em projeto/app/routes
- Frontend: HTML/CSS/JS em projeto/views consumindo APIs same-origin
- Artefatos: runs/logs (treinamento) e predictions (resultados de predição)
- Serviços: projeto/app/services (lógica de negócio reutilizável)

Principais módulos

Backend:
- app.py — Servidor Flask principal com endpoints de imagens e predições
- projeto/app/routes/training.py — API de treinamento (status/start/cancel/logs)
- projeto/app/routes/prediction.py — API de predição (executa avaliação dos modelos)
- projeto/app/routes/train_models.py — funções utilitárias para treinar/testar YOLO
- projeto/app/services/prediction_service.py — lógica de resolução de modelos e execução
- projeto/app/services/training_service.py — lógica de preparação de dataset e treinamento
- projeto/app/services/utils.py — utilitários compartilhados
- projeto/app/paths.py — utilitários de caminhos (workspace, storage)

Frontend:
- projeto/views/js/api.js — cliente HTTP para APIs
- projeto/views/js/finder.js — busca de imagens de predição
- projeto/views/js/modules/config.js — gerenciamento de configurações
- projeto/views/js/modules/modal.js — visualização de imagens em tela cheia
- projeto/views/js/modules/navigation.js — navegação entre páginas
- projeto/views/js/training_control.js — controle de treinamento (SSE, polling)
- projeto/views/js/ui.js — lógica principal da interface

Decisões

- Framework único: consolidado em Flask (FastAPI removido para evitar duplicidade)
- Respostas: JSON consistentes com chaves status/detail em erros
- Tolerância a ambiente: lida com ausência de Ultralytics retornando mock
- Modularização: serviços backend e módulos frontend separados para reutilização
- Código limpo: candidate_roots consolidado em função helper, imports organizados

Rápido:

- Abra PowerShell na pasta do projeto.
-       .\setup_dev.ps1
-       .\.venv\Scripts\Activate.ps1
-       .\run.ps1 8000
-       
-       
- Execute (exemplo porta 8000):

	.\run.ps1 8000

Isto define a variável de ambiente PORT para a sessão e inicia `app.py` (Flask) que serve as rotas e arquivos estáticos a partir de `projeto/views` ou `frontend/build`.

Variáveis de ambiente:

- PORT: porta onde o servidor irá escutar (padrão no script: 8000)

Notas:
usa Flask (`app.py`) como servidor principal com blueprints em `projeto/app/routes/*.py`
- O servidor registra blueprints e serve arquivos estáticos de `projeto/views`
- FastAPI (`projeto/app/main.py`) foi removido para eliminar duplicidade de frameworkstado para registrar os blueprints em `projeto/app/routes` e servir `projeto/views`.
- Se preferir usar FastAPI/uvicorn, eu posso ajudar a migrar ou a criar uma camada ASGI que reúna tudo numa porta; isso exige converter as blueprints Flask para routers FastAPI ou expor o Flask app via ASGI adaptador.

Como testar rapidamente:

- No PowerShell, após iniciar o servidor, acesse no navegador `http://localhost:8000/`.
- Para checar rota de exemplo (lista de modelos): `http://localhost:8000/models` deve retornar JSON.

Se quiser, eu aplico as mudanças restantes (documentação mais extensa, testes rápidos, ou conversão para FastAPI). 
