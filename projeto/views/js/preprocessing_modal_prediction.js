/**
 * Módulo de controle de pré-processamento ESPECÍFICO PARA PREDIÇÃO
 * Separado do modal de treinamento para permitir configurações diferentes
 */
(function (global) {
    'use strict';

    const PreprocessingPrediction = {
        selectedTechniques: [],
        selectedTechniqueParams: [],
        availableTechniques: [],
        techniquesFromTraining: [],
        paramsFromTraining: [],

        init() {
            this.loadAvailableTechniques();
            this.attachEventListeners();
        },

        async loadAvailableTechniques() {
            try {
                const techniques = await window.API.getPreprocessingTechniques();
                this.availableTechniques = techniques || [];
                this.renderUI();
            } catch (e) {
                console.error('[PreprocessingPrediction] Erro ao carregar técnicas:', e);
            }
        },

        renderUI() {
            const container = document.getElementById('prediction-preprocessing-container');
            if (!container) return;

            // Se não há técnicas disponíveis no geral
            if (this.availableTechniques.length === 0) {
                container.innerHTML = `
                    <div style="color: #999; font-size: 0.9rem; padding: 12px; background: #f5f5f5; border-radius: 6px;">
                        ℹ️ Nenhuma técnica de pré-processamento disponível.
                    </div>
                `;
                return;
            }

            let html = `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <!-- SEÇÃO 1: ORDEM DE APLICAÇÃO (Pipeline) -->
                    <div>
                        <div style="font-size: 0.8rem; color: #666; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            Ordem de Aplicação
                        </div>
                        <ul id="prediction-pipeline-list" style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; min-height: 60px; padding: 8px; background: #f9f9f9; border-radius: 4px; border: 1px solid #e1e4e8;">
                            <!-- Técnicas adicionadas apareçam aqui -->
                        </ul>
                    </div>

                    <!-- SEÇÃO 2: TÉCNICAS DISPONÍVEIS (Seletor) -->
                    <div>
                        <div style="font-size: 0.8rem; color: #666; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            Técnicas Disponíveis
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <select id="prediction-technique-select" style="flex: 1; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; background: white; color: #333; font-size: 0.85rem;">
                                <option value="">Selecione uma técnica...</option>
            `;

            // Popula seletor com técnicas disponíveis
            this.availableTechniques.forEach(tech => {
                html += `<option value="${tech}">${tech}</option>`;
            });

            html += `
                            </select>
                            <button id="prediction-add-technique-btn" style="padding: 6px 12px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 0.85rem; white-space: nowrap;">
                                + Adicionar
                            </button>
                        </div>
                    </div>

                    <!-- SEÇÃO 3: PARÂMETROS DAS TÉCNICAS -->
                    <div id="prediction-params-section">
                        <!-- Parâmetros das técnicas selecionadas apareçam aqui -->
                    </div>
                </div>
            `;

            container.innerHTML = html;

            // Renderiza pipeline e parâmetros
            this.renderPipeline();
            this.renderParameterEditors();

            // Attach event listeners
            const addBtn = document.getElementById('prediction-add-technique-btn');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.addTechnique());
            }

            const select = document.getElementById('prediction-technique-select');
            if (select) {
                select.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.addTechnique();
                });
            }
        },

        renderPipeline() {
            const pipelineList = document.getElementById('prediction-pipeline-list');
            if (!pipelineList) return;

            if (this.selectedTechniques.length === 0) {
                pipelineList.innerHTML = `
                    <li style="padding: 12px 8px; text-align: center; color: #999; font-size: 0.8rem; font-style: italic;">
                        Nenhuma técnica adicionada
                    </li>
                `;
                return;
            }

            let html = '';
            this.selectedTechniques.forEach((tech, idx) => {
                const isFromTraining = this.techniquesFromTraining.includes(tech);
                const borderColor = isFromTraining ? '#28a745' : '#0066cc';

                html += `
                    <li style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 6px 8px;
                        background: white;
                        border-radius: 3px;
                        border-left: 2px solid ${borderColor};
                        font-size: 0.85rem;
                    ">
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                            <span style="font-size: 0.75rem; font-weight: 600; color: #999; min-width: 20px;">${idx + 1}.</span>
                            <span style="font-weight: 500; color: #333; flex: 1; overflow: hidden; text-overflow: ellipsis;">${tech}</span>
                            ${isFromTraining ? '<span style="font-size: 0.7rem; color: #999; white-space: nowrap;">trein.</span>' : ''}
                        </div>
                        <div style="display: flex; gap: 3px; flex-shrink: 0;">
                            ${idx > 0 ? `<button data-index="${idx}" class="btn-move-up" style="padding: 3px 6px; border: 1px solid #ddd; background: white; border-radius: 2px; cursor: pointer; font-size: 0.7rem; color: #666;">↑</button>` : ''}
                            ${idx < this.selectedTechniques.length - 1 ? `<button data-index="${idx}" class="btn-move-down" style="padding: 3px 6px; border: 1px solid #ddd; background: white; border-radius: 2px; cursor: pointer; font-size: 0.7rem; color: #666;">↓</button>` : ''}
                            <button data-index="${idx}" class="btn-remove" style="padding: 3px 6px; border: 1px solid #ddd; background: white; border-radius: 2px; cursor: pointer; font-size: 0.7rem; color: #d9534f;">✕</button>
                        </div>
                    </li>
                `;
            });

            pipelineList.innerHTML = html;

            // Attach event listeners
            const removeButtons = pipelineList.querySelectorAll('.btn-remove');
            const upButtons = pipelineList.querySelectorAll('.btn-move-up');
            const downButtons = pipelineList.querySelectorAll('.btn-move-down');

            removeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.index);
                    this.removeTechnique(idx);
                });
            });

            upButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.index);
                    this.moveTechniqueUp(idx);
                });
            });

            downButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.index);
                    this.moveTechniqueDown(idx);
                });
            });
        },

        addTechnique() {
            const select = document.getElementById('prediction-technique-select');
            if (!select || !select.value) {
                alert('Selecione uma técnica primeiro');
                return;
            }

            const tech = select.value;
            this.selectedTechniques.push(tech);

            // Inicializa parâmetros padrão
            let defaultParams = {};
            if (tech === 'Rotation') {
                defaultParams = { angle: 30 };
            } else if (tech === 'Histogram Matching') {
                defaultParams = { reference_path: '' };
            }
            this.selectedTechniqueParams.push(defaultParams);

            select.value = '';
            this.renderPipeline();
            this.renderParameterEditors();
        },

        removeTechnique(index) {
            this.selectedTechniques.splice(index, 1);
            this.selectedTechniqueParams.splice(index, 1);
            this.renderPipeline();
            this.renderParameterEditors();
        },

        moveTechniqueUp(index) {
            if (index === 0) return;
            const temp = this.selectedTechniques[index];
            this.selectedTechniques[index] = this.selectedTechniques[index - 1];
            this.selectedTechniques[index - 1] = temp;
            const tempP = this.selectedTechniqueParams[index];
            this.selectedTechniqueParams[index] = this.selectedTechniqueParams[index - 1];
            this.selectedTechniqueParams[index - 1] = tempP;
            this.renderPipeline();
            this.renderParameterEditors();
        },

        moveTechniqueDown(index) {
            if (index === this.selectedTechniques.length - 1) return;
            const temp = this.selectedTechniques[index];
            this.selectedTechniques[index] = this.selectedTechniques[index + 1];
            this.selectedTechniques[index + 1] = temp;
            const tempP = this.selectedTechniqueParams[index];
            this.selectedTechniqueParams[index] = this.selectedTechniqueParams[index + 1];
            this.selectedTechniqueParams[index + 1] = tempP;
            this.renderPipeline();
            this.renderParameterEditors();
        },

        renderParameterEditors() {
            const section = document.getElementById('prediction-params-section');
            if (!section) return;

            if (this.selectedTechniques.length === 0) {
                section.innerHTML = '';
                return;
            }

            let html = '';

            this.selectedTechniques.forEach((tech, idx) => {
                const params = this.selectedTechniqueParams[idx] || {};

                if (tech === 'Rotation') {
                    html += `
                        <div style="padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 0.85rem;">
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <span style="color: #666; min-width: 120px; font-weight: 500;">${tech} - Ângulo (°):</span>
                                <input type="number" min="-180" max="180" step="1" value="${params.angle || 30}" 
                                    data-tech-index="${idx}" data-param="angle" 
                                    style="width: 80px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 3px; font-size: 0.85rem;">
                            </label>
                        </div>
                    `;
                } else if (tech === 'Histogram Matching') {
                    html += `
                        <div style="padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 0.85rem;">
                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <span style="color: #666; min-width: 120px; font-weight: 500;">${tech} - Referência:</span>
                                <input type="file" accept="image/*" data-tech-index="${idx}" data-param="file"
                                    style="padding: 4px; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; font-size: 0.85rem; flex: 1;">
                            </label>
                            ${params.reference_path ? '<div style="font-size: 0.75rem; color: #28a745; padding-left: 120px;">✓ Arquivo carregado</div>' : ''}
                        </div>
                    `;
                }
            });

            section.innerHTML = html;

            // Attach param listeners
            const numberInputs = section.querySelectorAll('input[type="number"]');
            numberInputs.forEach(input => {
                input.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.techIndex);
                    const param = e.target.dataset.param;
                    const value = parseFloat(e.target.value);
                    if (Number.isFinite(value)) {
                        this.selectedTechniqueParams[idx] = Object.assign({}, this.selectedTechniqueParams[idx], { [param]: value });
                    }
                });
            });

            const fileInputs = section.querySelectorAll('input[type="file"]');
            fileInputs.forEach(input => {
                input.addEventListener('change', async (e) => {
                    const idx = parseInt(e.target.dataset.techIndex);
                    if (!e.target.files || e.target.files.length === 0) return;
                    const fd = new FormData();
                    fd.append('file', e.target.files[0]);
                    const resp = await (global.API && global.API.uploadPreprocessingReference ? global.API.uploadPreprocessingReference(fd) : Promise.resolve(null));
                    if (resp && resp.reference_path) {
                        this.selectedTechniqueParams[idx] = Object.assign({}, this.selectedTechniqueParams[idx], { reference_path: resp.reference_path });
                        this.renderParameterEditors();
                    }
                });
            });
        },

        attachEventListeners() {
            // Listener para quando o dataset é selecionado (para carregar técnicas de treinamento)
            const datasetSelect = document.getElementById('prediction-dataset');
            if (datasetSelect) {
                datasetSelect.addEventListener('change', () => this.onDatasetChanged());
            }
        },

        // Chamado quando o dataset de predição é selecionado
        onDatasetChanged() {
            // Por enquanto, mantém as técnicas do treinamento atual
            // Se necessário, pode-se implementar busca de técnicas específicas por dataset
        },

        // Chamado de fora para carregar as técnicas do treinamento
        loadFromTraining(techniquesWithParams) {
            if (!Array.isArray(techniquesWithParams)) return;

            this.techniquesFromTraining = [];
            this.paramsFromTraining = [];
            this.selectedTechniques = [];
            this.selectedTechniqueParams = [];

            techniquesWithParams.forEach(item => {
                let tech, params = {};
                if (typeof item === 'string') {
                    tech = item;
                } else if (typeof item === 'object' && item.name) {
                    tech = item.name;
                    params = item.params || {};
                } else {
                    return;
                }

                this.techniquesFromTraining.push(tech);
                this.paramsFromTraining.push(params);
                this.selectedTechniques.push(tech);
                this.selectedTechniqueParams.push({ ...params });
            });

            this.renderUI();
        },

        // Retorna o pipeline atual para predição
        getPipeline() {
            return this.selectedTechniques.map((name, idx) => ({
                name: name,
                params: this.selectedTechniqueParams[idx] || {}
            }));
        }
    };

    // Expõe globalmente
    global.PreprocessingPrediction = PreprocessingPrediction;

})(window);
