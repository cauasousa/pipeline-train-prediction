# Arquitetura do Projeto - Pipeline Train

## Visão Geral

Sistema modular para treinamento e predição de modelos YOLO de classificação, com interface web e API REST.

## Estrutura de Diretórios

```
pipeline_train/
├── app.py                          # Ponto de entrada Flask
├── projeto/
│   ├── app/
│   │   ├── routes/                 # Endpoints REST
│   │   │   ├── training.py         # /train/* - controle de treinamento
│   │   │   ├── prediction.py       # /predict/* - execução de predições
│   │   │   └── train_models.py     # Funções YOLO (treino/teste)
│   │   ├── services/               # Lógica de negócio
│   │   │   ├── prediction_service.py  # Resolução de modelos, execução
│   │   │   └── utils.py            # Utilitários compartilhados
│   │   └── paths.py                # Helpers de caminhos
│   └── views/                      # Frontend estático
│       ├── js/
│       │   ├── modules/            # Módulos reutilizáveis
│       │   │   ├── config.js       # Gerenciamento de configurações
│       │   │   ├── modal.js        # Modal de imagens
│       │   │   └── navigation.js   # Navegação entre páginas
│       │   ├── api.js              # Cliente HTTP
│       │   ├── finder.js           # Busca de imagens
│       │   ├── training_control.js # Controle de treinamento
│       │   └── ui.js               # Interface principal
│       ├── index.html
│       ├── treinamento.html
│       ├── predicao.html
│       ├── theme.css
│       └── styles.css
├── predictions/                    # Saídas de predição (timestampadas)
├── runs/logs/                      # Logs de treinamento
└── custom/models/                  # Modelos treinados

```

## Camadas da Aplicação

### 1. Backend (Flask)

#### Routes (Endpoints REST)
- **training.py**: Gerencia ciclo de vida do treinamento
  - `POST /train/start` - inicia treinamento assíncrono
  - `GET /train/status` - estado atual
  - `POST /train/cancel` - cancela treinamento ativo
  - `GET /train/logs/<job_id>` - streaming SSE de logs
  - `GET /train/datasets` - lista datasets disponíveis
  - `POST /train/upload-folder` - upload de dataset

- **prediction.py**: Executa avaliação de modelos
  - `POST /predict/run` - avalia modelos selecionados
  - Retorna métricas ou mock quando Ultralytics ausente

#### Services (Lógica de Negócio)
- **prediction_service.py**
  - `resolve_model_paths()`: busca fuzzy de modelos (absoluto/relativo/prefixo)
  - `get_default_dataset_path()`: caminho padrão para avaliação
  - `prepare_output_directory()`: cria/limpa diretório timestampado
  - `run_prediction()`: orquestra avaliação (resolve → executa → serializa)
  - `serialize_results()`: converte objetos Ultralytics para JSON

- **utils.py**
  - `safe_cleanup_directory()`: limpeza segura de diretórios
  - `ensure_directory()`: criação com `parents=True`

#### Core
- **train_models.py**
  - `function_train_yolo()`: wrapper para YOLO.train()
  - `function_test_yolo()`: wrapper para YOLO.val() com mock fallback
  - `get_base_path()`, `get_path()`: resolução de caminhos

- **paths.py**
  - Helpers para workspace, storage, datasets, modelos

### 2. Frontend (HTML/CSS/JS)

#### Módulos JavaScript

**api.js** (Cliente HTTP)
- `safeFetch()`: wrapper fetch com tratamento de erros
- `getModels()`, `postPredict()`: chamadas de API
- `getNegativeLines()`, `uploadDataset()`: treinamento
- `getPredictionsList()`, `listModelsInRun()`: navegação de resultados

**modules/config.js** (Configurações)
- Gerencia 100+ parâmetros de treinamento YOLO
- Persistência em `localStorage`
- Versionamento de configuração
- Funções: `loadConfig()`, `saveConfig()`, `resetConfig()`

**modules/modal.js** (Visualização de Imagens)
- Modal full-screen com navegação (setas/teclado)
- Auto-coleta de imagens da página
- Funções: `open()`, `close()`, `next()`, `prev()`

**modules/navigation.js** (SPA)
- Navegação entre páginas sem reload
- Cache de templates HTML
- Toggle de sidebar
- Funções: `navigate()`, `loadPage()`, `toggleSidebar()`

**training_control.js** (Treinamento)
- Streaming SSE de logs (`startLogStream()`)
- Polling de imagens de progresso (`startImagePolling()`)
- Controle de estado (start/cancel)
- Recuperação de último job concluído

**finder.js** (Busca de Imagens)
- Encontra imagens de predição (confusion matrix, val batches, etc.)
- Testa existência via HEAD/GET antes de exibir

**ui.js** (Interface Principal)
- Binding de eventos para páginas
- Coleta de payload de treinamento
- Gerenciamento de negativos (linhas, tipos, quantidades)
- Validação de divisões train/val/test (soma = 100%)

## Fluxos Principais

### Fluxo de Predição

```
1. Usuário seleciona modelos na UI (predicao.html)
2. ui.js coleta seleção → API.postPredict()
3. Flask prediction.py recebe POST /predict/run
4. prediction_service.resolve_model_paths() busca arquivos
5. prediction_service.run_prediction() chama train_models.function_test_yolo()
6. Ultralytics executa val() ou retorna mock
7. Resultados serializados → JSON response
8. ui.js renderiza comparação lado a lado com imagens
9. finder.js busca imagens em /predictions/<timestamp>/<modelo>/
```

### Fluxo de Treinamento

```
1. Usuário configura dataset, modelo, hiperparâmetros (treinamento.html)
2. ui.collectTrainingPayload() coleta config completa
3. training_control.startTraining() → POST /train/start
4. training.py inicia processo em background (multiprocessing)
5. SSE /train/logs/<job_id> transmite logs em tempo real
6. training_control.startImagePolling() busca imagens a cada 3s
7. Ao concluir, TRAINING_COMPLETE no log → UI desabilita controles
8. Último job ID persistido → recarregar página mostra progresso
```

## Padrões e Convenções

### Backend

**Respostas JSON**
```json
// Sucesso
{"status": "completed", "data": {...}}

// Erro
{"detail": "Mensagem de erro", "error_code": "...", ...}, 400/500
```

**Mock quando Ultralytics ausente**
- `function_test_yolo()` retorna dict com métricas simuladas
- Permite desenvolvimento/testes sem GPU/dependências pesadas

**Versionamento de Config**
- `config_version` em payload garante compatibilidade

### Frontend

**Convenções de Nomenclatura**
- Funções públicas: camelCase (`loadConfig`)
- Privadas: prefixo `_` (`_normalizeSrc`)
- Globais: PascalCase modules (`ConfigManager`, `ImageModal`)

**Estado e Persistência**
- Configuração: `localStorage` com chave versionada
- Seleção de modelos: persiste entre navegações
- Job ativo: verifica `/train/status` ao carregar

**Acessibilidade**
- `aria-live`, `aria-hidden` em modais e áreas dinâmicas
- Labels descritivos em inputs/botões
- Navegação por teclado em modal de imagens

## Tolerância a Falhas

- **Ultralytics ausente**: mock previsível em predições/testes
- **Dataset não encontrado**: mensagem clara, não quebra UI
- **Modelo não encontrado**: lista em `missing`, continua com válidos
- **Logs SSE desconectado**: tenta reconectar, fallback para polling
- **Imagens 404**: placeholder, não quebra layout

## Escalabilidade

### Possíveis Melhorias

1. **Backend**
   - Redis para jobs (substituir multiprocessing)
   - Celery para fila de treinamento
   - PostgreSQL para histórico (em vez de arquivos)

2. **Frontend**
   - Build step (webpack/vite) para modules
   - TypeScript para type safety
   - React/Vue para UI complexa

3. **Infraestrutura**
   - Docker multi-stage para prod
   - Nginx para servir estáticos
   - S3/blob storage para artefatos grandes

## Testes

### Cobertura Atual
- Manual: interface funcional, endpoints básicos

### Próximos Passos
- pytest para rotas (`test_prediction.py`, `test_training.py`)
- Mock de Ultralytics em testes
- Testes de integração (upload → treino → predição)
- Testes E2E com Playwright/Selenium

## Deployment

### Desenvolvimento
```bash
.\setup_dev.ps1
.\.venv\Scripts\Activate.ps1
.\run.ps1 8000
```

### Produção (sugestão)
```bash
# Usar gunicorn ou waitress
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

## Troubleshooting

**Problema**: Modelos não encontrados  
**Solução**: Verifica `custom_models_dir()` e `storage_models_yolo_dir()` em paths.py

**Problema**: Logs SSE não chegam  
**Solução**: Verifica processo de treino ativo, log_path correto, permissões de arquivo

**Problema**: Imagens de treinamento não aparecem  
**Solução**: Job ID correto? Endpoint `/train/image/<job_id>/<name>` retorna 200?

**Problema**: Config não salva  
**Solução**: localStorage disponível? Verifica console do browser, quota exceeded?
