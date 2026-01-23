/**
 * Exemplo de Integração - Como usar ConsoleManager e TrainingResultsManager
 * 
 * Adicione este código em training_control.js ou onde gerencia o treinamento
 */

// ====================================================================
// EXEMPLO 1: Usar ConsoleManager para logs do treinamento
// ====================================================================

class TrainingController {
    constructor() {
        this.console = window.consoleManager;  // Referência ao gerenciador
        this.results = window.TrainingResultsManager;
    }

    /**
     * Exemplo: Ao iniciar treinamento
     */
    startTraining() {
        this.console.info('🚀 Iniciando treinamento da rede neural...');

        fetch('/api/train/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'yolo11n', epochs: 100 })
        })
            .then(r => r.json())
            .then(data => {
                this.console.success(`Treinamento iniciado com ID: ${data.job_id}`);
                this.monitorTraining(data.job_id);
            })
            .catch(err => {
                this.console.error(`Falha ao iniciar: ${err.message}`);
            });
    }

    /**
     * Exemplo: Monitorar progresso em tempo real
     */
    monitorTraining(jobId) {
        const ws = new WebSocket(`ws://localhost:5000/train/${jobId}`);

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            // Diferentes tipos de mensagens
            switch (data.type) {
                case 'epoch_start':
                    this.console.info(`📍 Época ${data.epoch}/${data.total_epochs}`);
                    break;

                case 'epoch_progress':
                    this.console.info(`  Loss: ${data.loss.toFixed(4)}, Acc: ${data.accuracy.toFixed(2)}%`);
                    break;

                case 'epoch_complete':
                    this.console.success(`✓ Época ${data.epoch} completa - Loss final: ${data.loss.toFixed(4)}`);

                    // Se houver imagem de validação
                    if (data.batch_image) {
                        this.results.addImage({
                            url: data.batch_image,
                            filename: `val_batch_${data.epoch}.png`,
                            type: 'batch',
                            title: `Validação - Época ${data.epoch}`,
                            timestamp: new Date().toISOString()
                        }, 'batch');
                    }
                    break;

                case 'training_complete':
                    this.console.success('🏁 Treinamento completo!');

                    // Adicionar imagens finais
                    if (data.confusion_matrix) {
                        this.results.addImage({
                            url: data.confusion_matrix,
                            filename: 'confusion_matrix.png',
                            type: 'confusion',
                            title: 'Matriz de Confusão Final',
                            timestamp: new Date().toISOString()
                        }, 'metrics');
                    }

                    if (data.results_plot) {
                        this.results.addImage({
                            url: data.results_plot,
                            filename: 'results.png',
                            type: 'results',
                            title: 'Evolução do Treinamento',
                            timestamp: new Date().toISOString()
                        }, 'evolution');
                    }
                    break;

                case 'error':
                    this.console.error(`✗ Erro: ${data.message}`);
                    break;

                case 'warning':
                    this.console.warning(`⚠ Aviso: ${data.message}`);
                    break;
            }
        };

        ws.onerror = (err) => {
            this.console.error('Erro na conexão WebSocket');
        };
    }
}

// ====================================================================
// EXEMPLO 2: Estrutura de resposta da API
// ====================================================================

/*
Seu backend (Flask/FastAPI) deveria retornar algo como:

POST /api/train/start
{
    "job_id": "train_20240101_103045",
    "status": "started"
}

WebSocket /train/{job_id}
{
    "type": "epoch_progress",
    "epoch": 5,
    "total_epochs": 100,
    "loss": 0.1234,
    "accuracy": 95.67
}

{
    "type": "epoch_complete",
    "epoch": 5,
    "loss": 0.1234,
    "batch_image": "/runs/classify/train/5/batch_0.jpg"
}

{
    "type": "training_complete",
    "confusion_matrix": "/runs/classify/train/5/confusion_matrix.png",
    "results_plot": "/runs/classify/train/5/results.png"
}
*/

// ====================================================================
// EXEMPLO 3: Populating Job Selector
// ====================================================================

class JobManager {
    constructor() {
        this.console = window.consoleManager;
        this.results = window.TrainingResultsManager;
        this.jobSelect = document.getElementById('job-select');
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Quando clica em "Recarregar"
        document.getElementById('job-refresh-btn').addEventListener('click', () => {
            this.loadJobsList();
        });

        // Quando seleciona e clica "Exibir"
        document.getElementById('job-select-apply').addEventListener('click', () => {
            this.loadSelectedJob();
        });

        // Carrega jobs ao inicializar
        this.loadJobsList();
    }

    /**
     * Busca lista de jobs do servidor
     */
    async loadJobsList() {
        this.console.info('Buscando lista de jobs...');

        try {
            const response = await fetch('/api/training/jobs');
            const jobs = await response.json();

            // Limpa select
            this.jobSelect.innerHTML = '<option value="">-- Selecione um job --</option>';

            // Adiciona jobs (mais recente primeiro)
            jobs
                .sort((a, b) => new Date(b.created) - new Date(a.created))
                .forEach(job => {
                    const option = document.createElement('option');
                    option.value = job.id;
                    option.textContent = `${job.name} (${new Date(job.created).toLocaleString('pt-BR')})`;
                    this.jobSelect.appendChild(option);
                });

            if (jobs.length > 0) {
                // Seleciona o primeiro (mais recente) por padrão
                this.jobSelect.value = jobs[0].id;
                this.console.success(`${jobs.length} job(s) encontrado(s)`);
            } else {
                this.console.warning('Nenhum job disponível');
            }
        } catch (error) {
            this.console.error(`Erro ao carregar jobs: ${error.message}`);
        }
    }

    /**
     * Carrega imagens do job selecionado
     */
    async loadSelectedJob() {
        const jobId = this.jobSelect.value;
        if (!jobId) {
            this.console.warning('Selecione um job primeiro');
            return;
        }

        this.console.info(`Carregando imagens do job ${jobId}...`);

        try {
            const response = await fetch(`/api/training/jobs/${jobId}/images`);
            const images = await response.json();

            // Limpa imagens anteriores
            this.results.clearImages();

            // Exibe as imagens
            if (images.length > 0) {
                this.results.displayImages(images);
                this.console.success(`${images.length} imagem(ns) carregada(s)`);
            } else {
                this.console.warning('Nenhuma imagem disponível para este job');
            }
        } catch (error) {
            this.console.error(`Erro ao carregar imagens: ${error.message}`);
        }
    }
}

// ====================================================================
// EXEMPLO 4: Inicializar tudo quando página carrega
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Aguarda carregamento dos módulos
    if (window.consoleManager && window.TrainingResultsManager) {
        window.consoleManager.info('Página de treinamento pronta');

        // Inicializa gerenciador de jobs
        window.jobManager = new JobManager();

        // Inicializa controller de treinamento
        window.trainingController = new TrainingController();

        // Registra listener do botão de iniciar treinamento
        document.getElementById('start-training-btn').addEventListener('click', () => {
            window.trainingController.startTraining();
        });
    } else {
        console.warn('Módulos de gerenciamento não carregados');
    }
});

// ====================================================================
// EXEMPLO 5: Python Backend (Flask)
// ====================================================================

/*
from flask import Flask, jsonify
from datetime import datetime
import os
import json

app = Flask(__name__)

# Simulando jobs armazenados
JOBS_DIR = 'runs/classify/train'

@app.route('/api/training/jobs', methods=['GET'])
def get_jobs():
    """Retorna lista de jobs (diretórios em runs/)"""
    jobs = []
    
    if os.path.exists(JOBS_DIR):
        for job_name in os.listdir(JOBS_DIR):
            job_path = os.path.join(JOBS_DIR, job_name)
            if os.path.isdir(job_path):
                jobs.append({
                    'id': job_name,
                    'name': job_name.replace('_', ' '),
                    'created': os.path.getctime(job_path),
                    'size': sum(os.path.getsize(os.path.join(dirpath, filename)) 
                               for dirpath, dirnames, filenames in os.walk(job_path) 
                               for filename in filenames)
                })
    
    return jsonify(sorted(jobs, key=lambda x: x['created'], reverse=True))

@app.route('/api/training/jobs/<job_id>/images', methods=['GET'])
def get_job_images(job_id):
    """Retorna imagens de um job específico"""
    job_path = os.path.join(JOBS_DIR, job_id)
    images = []
    
    # Extensões de imagem
    image_exts = ('.png', '.jpg', '.jpeg')
    
    for root, dirs, files in os.walk(job_path):
        for file in files:
            if file.lower().endswith(image_exts):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, JOBS_DIR)
                
                # Determina tipo baseado no nome do arquivo
                if 'batch' in file.lower():
                    img_type = 'batch'
                elif 'confusion' in file.lower():
                    img_type = 'confusion'
                elif 'results' in file.lower():
                    img_type = 'results'
                else:
                    img_type = 'unknown'
                
                images.append({
                    'url': f'/runs/classify/train/{rel_path}',
                    'filename': file,
                    'type': img_type,
                    'title': file.replace('_', ' ').replace('.png', ''),
                    'timestamp': datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
                })
    
    return jsonify(sorted(images, key=lambda x: x.get('timestamp', ''), reverse=True))

if __name__ == '__main__':
    app.run(debug=True)
*/

// ====================================================================
// Exportar para uso em outro módulo
// ====================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TrainingController,
        JobManager
    };
}
