#!/usr/bin/env python3
"""
Quick Start Guide - Console Manager & Training Results Manager
Teste rápido dos novos sistemas de monitoramento
"""

# ============================================================================
# TESTE 1: Console Manager (No seu HTML)
# ============================================================================

"""
Abra o navegador em: http://localhost:5000/projeto/views/treinamento.html

No console do navegador (F12), digite:

    // Test 1: Log automático
    console.log('Iniciando modelo...');
    
    // Test 2: Sucesso
    window.consoleManager.success('Modelo carregado com sucesso!');
    
    // Test 3: Erro
    window.consoleManager.error('CUDA memory exhausted');
    
    // Test 4: Aviso
    window.consoleManager.warning('Batch size reduzido para 32');
    
    // Test 5: Limpar
    window.consoleManager.clear();

Você deve ver os logs aparecerem coloridos na seção "Log de Treinamento"!
"""

# ============================================================================
# TESTE 2: Training Results Manager (Adicionar imagens)
# ============================================================================

"""
No console do navegador, execute:

    // Simular adição de imagens de treinamento
    for (let i = 1; i <= 3; i++) {
        window.TrainingResultsManager.addImage({
            url: 'https://via.placeholder.com/300x200?text=Batch+' + i,
            filename: `train_batch_${i}.jpg`,
            type: 'batch',
            title: `Batch ${i}`,
            timestamp: new Date().toISOString()
        }, 'batch');
    }
    
    // Adicionar imagem de confusão
    window.TrainingResultsManager.addImage({
        url: 'https://via.placeholder.com/300x200?text=Confusion+Matrix',
        filename: 'confusion_matrix.png',
        type: 'confusion',
        title: 'Matriz de Confusão',
        timestamp: new Date().toISOString()
    }, 'metrics');
    
    // Adicionar gráfico de resultados
    window.TrainingResultsManager.addImage({
        url: 'https://via.placeholder.com/300x200?text=Results',
        filename: 'results.png',
        type: 'results',
        title: 'Evolução do Treinamento',
        timestamp: new Date().toISOString()
    }, 'evolution');

Você deve ver as imagens aparecerem nas abas correspondentes!
Clique no botão "⛶" para expandir uma imagem em fullscreen.
"""

# ============================================================================
# TESTE 3: Sistema de Abas
# ============================================================================

"""
No console do navegador:

    // Ir para aba de amostragem
    document.querySelector('[data-tab="batches"]').click();
    
    // Ir para métricas
    document.querySelector('[data-tab="metrics"]').click();
    
    // Ir para evolução
    document.querySelector('[data-tab="evolution"]').click();

As abas devem trocar suavemente com as imagens aparecendo!
"""

# ============================================================================
# TESTE 4: Expandir Imagem
# ============================================================================

"""
Para expandir uma imagem programaticamente:

    TrainingResultsManager.expandImage(
        'any-id',
        'https://via.placeholder.com/600x400?text=Expanded',
        'Título da Imagem Expandida'
    );

Um modal fullscreen deve aparecer.
Clique fora ou pressione ESC para fechar!
"""

# ============================================================================
# IMPLEMENTAÇÃO REAL: Integração com Backend
# ============================================================================

"""
Para conectar ao seu treinamento real, você precisa:

1. No seu training_service.py ou onde faz o treinamento:

    from projeto.app import app
    
    def train_model(...):
        # ... seu código de treinamento ...
        
        for epoch in range(num_epochs):
            # ... treinar ...
            
            # Enviar imagem de batch para frontend
            batch_image = f'runs/classify/train/epoch_{epoch}/batch.jpg'
            
            # Se estiver usando WebSocket ou SSE, envie:
            # {
            #     "type": "batch_image_ready",
            #     "epoch": epoch,
            #     "url": batch_image
            # }
            
        # Ao final, envie métricas
        # {
        #     "type": "training_complete",
        #     "confusion_matrix": "runs/classify/train/confusion_matrix.png",
        #     "results": "runs/classify/train/results.png"
        # }

2. No seu app.py ou main:

    @app.route('/api/training/jobs', methods=['GET'])
    def get_training_jobs():
        jobs = []
        runs_dir = 'runs/classify/train'
        for job_name in os.listdir(runs_dir):
            jobs.append({
                'id': job_name,
                'name': job_name.replace('_', ' '),
                'created': os.path.getctime(os.path.join(runs_dir, job_name))
            })
        return jsonify(sorted(jobs, key=lambda x: x['created'], reverse=True))
    
    @app.route('/api/training/jobs/<job_id>/images', methods=['GET'])
    def get_job_images(job_id):
        images = []
        job_path = os.path.join('runs/classify/train', job_id)
        for file in os.listdir(job_path):
            if file.endswith(('.png', '.jpg')):
                images.append({
                    'url': f'/{job_path}/{file}',
                    'filename': file,
                    'type': 'batch' if 'batch' in file else 'metrics' if 'confusion' in file else 'evolution',
                    'title': file.replace('.png', '').replace('_', ' '),
                    'timestamp': datetime.fromtimestamp(os.path.getmtime(os.path.join(job_path, file))).isoformat()
                })
        return jsonify(images)

3. No seu JavaScript (training_control.js):

    class TrainingUI {
        constructor() {
            this.console = window.consoleManager;
            this.results = window.TrainingResultsManager;
        }
        
        async startTraining() {
            this.console.info('Iniciando treinamento...');
            
            const response = await fetch('/api/training/start', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    model: 'yolo11n',
                    epochs: 100,
                    batch_size: 32
                })
            });
            
            const data = await response.json();
            this.console.success(`Treinamento ${data.job_id} iniciado!`);
            
            this.monitorTraining(data.job_id);
        }
        
        monitorTraining(jobId) {
            const ws = new WebSocket(`ws://localhost:5000/train/${jobId}`);
            
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                
                if (msg.type === 'epoch_complete') {
                    this.console.success(`Época ${msg.epoch}/${msg.total} - Loss: ${msg.loss.toFixed(4)}`);
                    
                    if (msg.batch_image) {
                        this.results.addImage({
                            url: msg.batch_image,
                            filename: `batch_${msg.epoch}.jpg`,
                            type: 'batch',
                            title: `Validação Época ${msg.epoch}`,
                            timestamp: new Date().toISOString()
                        }, 'batch');
                    }
                }
            };
            
            ws.onerror = () => {
                this.console.error('Erro na conexão WebSocket');
            };
        }
    }
    
    // Inicializar quando página carregar
    document.addEventListener('DOMContentLoaded', () => {
        window.trainingUI = new TrainingUI();
        
        document.getElementById('start-training-btn')?.addEventListener('click', () => {
            window.trainingUI.startTraining();
        });
    });
"""

# ============================================================================
# CHECKLIST DE IMPLEMENTAÇÃO
# ============================================================================

"""
Para usar os novos sistemas com seu backend, você precisa:

FRONTEND:
  ✅ Adicionar console_manager.js ao HTML
  ✅ Adicionar training_results_manager.js ao HTML
  ✅ Adicionar sistema de abas ao HTML
  ✅ Testar console com console.log()
  ✅ Testar imagens com addImage()
  
BACKEND (Python/Flask):
  ⚠️ Criar rota GET /api/training/jobs
  ⚠️ Criar rota GET /api/training/jobs/<job_id>/images
  ⚠️ Salvar imagens em runs/classify/train/
  
INTEGRAÇÃO (JavaScript):
  ⚠️ Conectar TrainingControl ao ConsoleManager
  ⚠️ Enviar logs via console.log()
  ⚠️ Adicionar imagens via addImage()
  ⚠️ Implementar WebSocket (opcional mas recomendado)
  
TESTE:
  ⚠️ Testar console colorido
  ⚠️ Testar navegação de abas
  ⚠️ Testar expansão de imagem
  ⚠️ Testar com dados reais
"""

# ============================================================================
# ESTRUTURA DE DADOS ESPERADA
# ============================================================================

"""
GET /api/training/jobs - Resposta esperada:
[
    {
        "id": "train_20240101_103045",
        "name": "train 20240101 103045",
        "created": 1704102645.1234567
    },
    {
        "id": "train_20240101_093000",
        "name": "train 20240101 093000",
        "created": 1704099000.5678901
    }
]

GET /api/training/jobs/{job_id}/images - Resposta esperada:
[
    {
        "url": "/runs/classify/train/job_id/batch_0.jpg",
        "filename": "batch_0.jpg",
        "type": "batch",
        "title": "Batch 0",
        "timestamp": "2024-01-01T10:30:45"
    },
    {
        "url": "/runs/classify/train/job_id/confusion_matrix.png",
        "filename": "confusion_matrix.png",
        "type": "metrics",
        "title": "Confusion Matrix",
        "timestamp": "2024-01-01T11:30:00"
    },
    {
        "url": "/runs/classify/train/job_id/results.png",
        "filename": "results.png",
        "type": "evolution",
        "title": "Results",
        "timestamp": "2024-01-01T11:31:00"
    }
]

WebSocket /train/{job_id} - Mensagens esperadas:
{
    "type": "epoch_start",
    "epoch": 1,
    "total_epochs": 100
}

{
    "type": "epoch_progress",
    "epoch": 1,
    "loss": 0.5234,
    "accuracy": 82.3
}

{
    "type": "epoch_complete",
    "epoch": 1,
    "loss": 0.4921,
    "accuracy": 84.1,
    "batch_image": "/runs/classify/train/job_id/batch_1.jpg"
}

{
    "type": "training_complete",
    "confusion_matrix": "/runs/classify/train/job_id/confusion_matrix.png",
    "results": "/runs/classify/train/job_id/results.png"
}

{
    "type": "error",
    "message": "CUDA out of memory"
}
"""

# ============================================================================
# SUPORTE & DOCUMENTAÇÃO
# ============================================================================

"""
Mais informações:

📄 MONITORING_IMPLEMENTATION.md - Documentação completa
📄 training_integration_example.js - Exemplos de código
📄 SETUP_GUIDE.md - Guia de setup
📄 IMPLEMENTATION_SUMMARY.md - Resumo visual

Arquivos de código:
- projeto/views/js/console_manager.js
- projeto/views/js/training_results_manager.js
- projeto/views/js/training_integration_example.js

Teste agora acessando:
http://localhost:5000/projeto/views/treinamento.html

E usando o console do navegador (F12) para testar as APIs!
"""

print(__doc__)
