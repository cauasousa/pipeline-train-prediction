/**
 * Training Results Image Manager
 * Gerencia exibição e organização de imagens de resultados em abas
 */

class TrainingResultsManager {
    constructor() {
        try {
            this.API_BASE = window.API ? window.API.API_BASE : '';
            this.reinitializeElements();

            this.jobSelect = document.getElementById('job-select');
            this.jobApplyBtn = document.getElementById('job-select-apply');
            this.jobRefreshBtn = document.getElementById('job-refresh-btn');

            // Evita duplicar listeners quando o TrainingControl já trata estes botões
            const shouldBind = !window.TrainingControl;

            if (shouldBind && this.jobApplyBtn) {
                this.jobApplyBtn.addEventListener('click', () => this.loadJobImages());
            }
            if (shouldBind && this.jobRefreshBtn) {
                this.jobRefreshBtn.addEventListener('click', () => this.refreshJobList());
            }

            console.log('[TrainingResultsManager] ✓ Constructor completed successfully');
        } catch (error) {
            console.error('[TrainingResultsManager] ✗ Constructor error:', error);
            // Ainda assim continua - criar instância parcial é melhor que nada
            this.tabsContainer = { batches: null, metrics: null, evolution: null };
            this.emptyStates = { batches: null, metrics: null, evolution: null };
        }
    }

    /**
     * Reinicializa referências aos elementos do DOM
     */
    reinitializeElements() {
        this.tabsContainer = {
            batches: document.getElementById('training-images-batches'),
            metrics: document.getElementById('training-images-metrics'),
            evolution: document.getElementById('training-images-evolution')
        };

        this.emptyStates = {
            batches: document.getElementById('batches-empty'),
            metrics: document.getElementById('metrics-empty'),
            evolution: document.getElementById('evolution-empty')
        };

        console.log('[TrainingResultsManager] Elementos reinicializados:', {
            batches: !!this.tabsContainer.batches,
            metrics: !!this.tabsContainer.metrics,
            evolution: !!this.tabsContainer.evolution,
            batchesEmpty: !!this.emptyStates.batches,
            metricsEmpty: !!this.emptyStates.metrics,
            evolutionEmpty: !!this.emptyStates.evolution
        });
    }

    /**
     * Atualiza lista de jobs disponíveis
     */
    async refreshJobList() {
        try {
            // Se o TrainingControl já faz esse trabalho, delega para evitar duplicação
            if (window.TrainingControl && typeof window.TrainingControl.refreshJobList === 'function') {
                await window.TrainingControl.refreshJobList();
                return;
            }

            if (window.consoleManager) {
                window.consoleManager.info('Buscando lista de jobs...');
            }

            const resp = await window.API.safeFetch(`${this.API_BASE}/train/jobs?prefix=treinamento_classificacao`);
            if (!resp || !Array.isArray(resp.jobs)) throw new Error('Resposta inválida da API');

            const select = this.jobSelect;
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = '';
            const addOption = (value, label) => {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = label;
                select.appendChild(opt);
            };

            addOption('', '— Último concluído / ativo —');
            resp.jobs.forEach(j => addOption(j, j));

            if (currentValue && resp.jobs.includes(currentValue)) {
                select.value = currentValue;
            }

            if (window.consoleManager) {
                window.consoleManager.success('Lista de jobs atualizada');
            }
        } catch (error) {
            if (window.consoleManager) {
                window.consoleManager.error(`Erro ao atualizar jobs: ${error.message}`);
            }
        }
    }

    /**
     * Carrega imagens do job selecionado
     */
    async loadJobImages() {
        try {
            const jobName = this.jobSelect?.value;
            if (!jobName) {
                if (window.consoleManager) {
                    window.consoleManager.warning('Selecione um job primeiro');
                }
                return;
            }

            if (window.consoleManager) {
                window.consoleManager.info(`Carregando imagens do job: ${jobName}`);
            }

            // Delegar para o TrainingControl garante que polling/logs sigam a mesma rota
            if (window.TrainingControl && typeof window.TrainingControl.handleJobSelection === 'function') {
                window.TrainingControl.handleJobSelection(jobName);
                return;
            }

            // Fallback direto na rota de imagens
            const diagUrl = `${this.API_BASE}/train/images/${encodeURIComponent(jobName)}?t=${Date.now()}`;
            const diag = await window.API.safeFetch(diagUrl);
            if (!diag || !Array.isArray(diag.images)) {
                throw new Error('Nenhuma imagem retornada');
            }

            const images = diag.images.map(it => ({
                url: it.url || it.name ? `${this.API_BASE}/train/image/${encodeURIComponent(jobName)}/${encodeURIComponent((it.name || '').replace(/\.[^/.]+$/, ''))}` : '',
                filename: it.name || 'imagem',
                type: (it.name || '').toLowerCase().includes('confusion') ? 'metrics'
                    : (it.name || '').toLowerCase().includes('result') || (it.name || '').toLowerCase().includes('evol') ? 'evolution'
                        : 'batch',
                timestamp: it.mtime ? Number(it.mtime) * 1000 : Date.now()
            })).filter(img => !!img.url);

            this.displayImages(images);

            if (window.consoleManager) {
                window.consoleManager.success('Imagens carregadas com sucesso');
            }
        } catch (error) {
            if (window.consoleManager) {
                window.consoleManager.error(`Erro ao carregar imagens: ${error.message}`);
            }
        }
    }

    /**
     * Exibe imagens no layout de abas
     */
    displayImages(images) {
        // Limpa containers
        Object.values(this.tabsContainer).forEach(container => {
            if (container) container.innerHTML = '';
        });

        // Organiza imagens por tipo
        const byType = {
            batches: [],
            metrics: [],
            evolution: []
        };

        images.forEach(img => {
            if (img.type === 'batch') {
                byType.batches.push(img);
            } else if (img.type === 'metrics' || img.type === 'confusion') {
                byType.metrics.push(img);
            } else if (img.type === 'results' || img.type === 'evolution') {
                byType.evolution.push(img);
            }
        });

        // Renderiza cada tipo
        this.renderBatches(byType.batches);
        this.renderMetrics(byType.metrics);
        this.renderEvolution(byType.evolution);
    }

    /**
     * Renderiza cards de batches
     */
    renderBatches(images) {
        const container = this.tabsContainer.batches;
        const emptyState = this.emptyStates.batches;

        if (!container) return;

        if (images.length === 0) {
            emptyState.style.display = 'block';
            container.innerHTML = '';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = images.map(img => this.createImageCard(img, 'Batch de Treinamento')).join('');
    }

    /**
     * Renderiza cards de métricas
     */
    renderMetrics(images) {
        const container = this.tabsContainer.metrics;
        const emptyState = this.emptyStates.metrics;

        if (!container) return;

        if (images.length === 0) {
            emptyState.style.display = 'block';
            container.innerHTML = '';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = images.map(img => {
            const title = img.type === 'confusion' ? 'Matriz de Confusão' : 'Métricas de Performance';
            return this.createImageCard(img, title);
        }).join('');
    }

    /**
     * Renderiza cards de evolução
     */
    renderEvolution(images) {
        const container = this.tabsContainer.evolution;
        const emptyState = this.emptyStates.evolution;

        if (!container) return;

        if (images.length === 0) {
            emptyState.style.display = 'block';
            container.innerHTML = '';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = images.map(img => this.createImageCard(img, 'Evolução do Treinamento')).join('');
    }

    /**
     * Cria HTML de um card de imagem
     */
    createImageCard(image, title) {
        const imageId = `img-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = image.timestamp ? new Date(image.timestamp).toLocaleString('pt-BR') : 'Data desconhecida';

        return `
            <div class="image-result-card">
                <div class="image-result-header">
                    <h4>${title}</h4>
                </div>
                <div class="image-result-body" id="${imageId}-body">
                    <img src="${image.url}" alt="${title}" loading="lazy" />
                    <button class="image-expand-btn" onclick="TrainingResultsManager.expandImage('${imageId}', '${image.url}', '${title}')">
                        ⛶
                    </button>
                </div>
                <div class="image-result-footer">
                    <div><strong>${image.label || 'Arquivo:'}</strong> ${image.filename || 'desconhecido'}</div>
                    <div style="font-size: 0.75em; margin-top: 4px;">📅 ${timestamp}</div>
                </div>
            </div>
        `;
    }

    /**
     * Expande imagem em fullscreen
     */
    static expandImage(cardId, imageUrl, title) {
        // Cria modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.9);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;

        modal.innerHTML = `
            <div style="color: white; margin-bottom: 16px; text-align: center;">
                <h2 style="margin: 0 0 8px 0;">${title}</h2>
                <small>Clique fora ou pressione ESC para fechar</small>
            </div>
            <img src="${imageUrl}" alt="${title}" style="max-width: 90vw; max-height: 80vh; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);" />
        `;

        // Fechar ao clicar fora
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Fechar com ESC
        const closeOnEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', closeOnEsc);
            }
        };
        document.addEventListener('keydown', closeOnEsc);

        document.body.appendChild(modal);
    }

    /**
     * Adiciona uma imagem ao resultado (para uso durante o treinamento)
     */
    addImage(image, type) {
        try {
            // Validar tipo
            if (!['batch', 'metrics', 'evolution'].includes(type)) {
                console.error(`[TrainingResultsManager] Tipo inválido: ${type}. Use 'batch', 'metrics' ou 'evolution'`);
                return;
            }

            // Busca elementos dinamicamente (podem ter sido carregados depois)
            let container = type === 'batch' ? this.tabsContainer.batches :
                type === 'metrics' ? this.tabsContainer.metrics :
                    this.tabsContainer.evolution;

            // Se não encontrou no cache, tenta buscar do DOM diretamente
            if (!container) {
                const elementId = type === 'batch' ? 'training-images-batches' :
                    type === 'metrics' ? 'training-images-metrics' :
                        'training-images-evolution';

                container = document.getElementById(elementId);

                if (container) {
                    console.log(`[TrainingResultsManager] ✓ Elemento '${type}' encontrado no DOM durante addImage()`);
                    // Atualiza cache para proximas chamadas
                    if (type === 'batch') this.tabsContainer.batches = container;
                    else if (type === 'metrics') this.tabsContainer.metrics = container;
                    else this.tabsContainer.evolution = container;
                }
            }

            if (!container) {
                console.error(`[TrainingResultsManager] ✗ Container para tipo "${type}" não encontrado no DOM`, {
                    batches: !!this.tabsContainer.batches,
                    metrics: !!this.tabsContainer.metrics,
                    evolution: !!this.tabsContainer.evolution
                });
                return;
            }

            // Busca emptyState dinamicamente também
            let emptyState = type === 'batch' ? this.emptyStates.batches :
                type === 'metrics' ? this.emptyStates.metrics :
                    this.emptyStates.evolution;

            if (!emptyState && container) {
                emptyState = container.querySelector('.empty-state');
                if (emptyState) {
                    if (type === 'batch') this.emptyStates.batches = emptyState;
                    else if (type === 'metrics') this.emptyStates.metrics = emptyState;
                    else this.emptyStates.evolution = emptyState;
                }
            }

            if (emptyState) emptyState.style.display = 'none';

            const cardHtml = this.createImageCard(image, image.title || 'Imagem do Treinamento');
            container.insertAdjacentHTML('beforeend', cardHtml);

            console.log(`[TrainingResultsManager] ✓ Imagem adicionada: ${image.filename} → ${type}`);

            if (window.consoleManager) {
                window.consoleManager.info(`Imagem adicionada: ${image.filename}`);
            }
        } catch (error) {
            console.error('[TrainingResultsManager] ✗ Erro ao adicionar imagem:', error);
        }
    }

    /**
     * Limpa todas as imagens
     */
    clearImages() {
        Object.values(this.tabsContainer).forEach(container => {
            if (container) container.innerHTML = '';
        });
        Object.values(this.emptyStates).forEach(state => {
            if (state) state.style.display = 'block';
        });
    }
}

// Instancia globalmente IMEDIATAMENTE ao carregar o script
console.log('[TrainingResultsManager] ===== INICIANDO CARREGAMENTO DO SCRIPT =====');
console.log('[TrainingResultsManager] Timestamp:', new Date().toISOString());

try {
    // Cria a instância antes de qualquer otra coisa
    console.log('[TrainingResultsManager] Tentando criar instância global...');
    window.TrainingResultsManager = new TrainingResultsManager();
    console.log('[TrainingResultsManager] ✓ Instância global criada com sucesso');
    console.log('[TrainingResultsManager] Instância disponível:', !!window.TrainingResultsManager);
    console.log('[TrainingResultsManager] Tipo:', typeof window.TrainingResultsManager);
    console.log('[TrainingResultsManager] Tem método addImage?', typeof window.TrainingResultsManager.addImage === 'function');
} catch (error) {
    console.error('[TrainingResultsManager] ✗ ERRO ao criar instância global:');
    console.error('[TrainingResultsManager] Message:', error.message);
    console.error('[TrainingResultsManager] Stack:', error.stack);

    // Tenta criar uma instância vazia como fallback
    console.log('[TrainingResultsManager] Criando fallback vazio...');
    window.TrainingResultsManager = {
        tabsContainer: { batches: null, metrics: null, evolution: null },
        emptyStates: { batches: null, metrics: null, evolution: null },
        addImage: function () {
            console.warn('[TrainingResultsManager] FALLBACK: addImage chamado em modo fallback');
        }
    };
    console.log('[TrainingResultsManager] Fallback criado');
}

// Expõe também como uma função de inicialização para garantir que funciona mesmo com carregamento tardio
if (typeof window.initializeTrainingResults !== 'function') {
    window.initializeTrainingResults = function () {
        console.log('[TrainingResultsManager] initializeTrainingResults() chamado às', new Date().toISOString());
        try {
            if (!window.TrainingResultsManager || typeof window.TrainingResultsManager.addImage !== 'function') {
                console.log('[TrainingResultsManager] Manager não está funcional, criando nova instância...');
                window.TrainingResultsManager = new TrainingResultsManager();
                console.log('[TrainingResultsManager] ✓ Instância criada via factory function');
            } else {
                console.log('[TrainingResultsManager] Instância já funcional, reinicializando elementos...');
                if (typeof window.TrainingResultsManager.reinitializeElements === 'function') {
                    window.TrainingResultsManager.reinitializeElements();
                    console.log('[TrainingResultsManager] ✓ Elementos reinicializados via factory function');
                }
            }
        } catch (error) {
            console.error('[TrainingResultsManager] ✗ Erro na factory function:', error.message);
        }
        return window.TrainingResultsManager;
    };
}

console.log('[TrainingResultsManager] ===== SCRIPT LOAD SUMMARY =====');
console.log('[TrainingResultsManager] Manager global criado?', !!window.TrainingResultsManager);
console.log('[TrainingResultsManager] Factory function registrada?', typeof window.initializeTrainingResults === 'function');
if (window.TrainingResultsManager) {
    console.log('[TrainingResultsManager] Método addImage disponível?', typeof window.TrainingResultsManager.addImage === 'function');
}
console.log('[TrainingResultsManager] ===== FIM DO LOAD DO SCRIPT =====');


// Garante que está sempre disponível quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function () {
    console.log('[TrainingResultsManager] DOMContentLoaded event disparado');

    if (!window.TrainingResultsManager) {
        console.log('[TrainingResultsManager] Instância global não existe, criando agora...');
        window.TrainingResultsManager = new TrainingResultsManager();
    } else {
        console.log('[TrainingResultsManager] Instância global já existe, reinicializando elementos...');
    }

    if (window.TrainingResultsManager && typeof window.TrainingResultsManager.reinitializeElements === 'function') {
        window.TrainingResultsManager.reinitializeElements();
        console.log('[TrainingResultsManager] Elementos reinicializados com sucesso');
    }

    console.log('[TrainingResultsManager] DOMContentLoaded completo - Manager pronto para uso');
});
