/**
 * Módulo de controle do modal de pré-processamento interativo
 */
(function (global) {
    'use strict';

    const PreprocessingModal = {
        modal: null,
        pipelineList: null,
        availableSelect: null,
        selectedTechniques: [],
        selectedTechniqueParams: [],
        availableTechniques: [],
        currentDataset: '',
        previewOriginal: null,
        previewResult: null,
        previewIsolated: null,
        _lastPreviewData: null,
        isolatedSelect: null,
        stepsGallery: null,

        init() {
            this.modal = document.getElementById('preprocess-modal');
            this.pipelineList = document.getElementById('preprocessing-pipeline-list');
            this.availableSelect = document.getElementById('available-techniques-select');
            this.previewOriginal = document.querySelector('.preprocess-modal .preview-img.original');
            this.previewResult = document.querySelector('.preprocess-modal .preview-img.result');
            this.previewIsolated = document.querySelector('.preprocess-modal .preview-img.isolated');
            this.isolatedSelect = document.getElementById('isolated-technique-select');
            this.stepsGallery = document.getElementById('pipeline-steps-gallery');

            if (!this.modal || !this.pipelineList || !this.availableSelect) {
                console.warn('[PreprocessingModal] Elementos necessários não encontrados');
                return;
            }

            // Event listeners
            document.getElementById('open-preprocess-modal-btn')?.addEventListener('click', () => this.open());
            document.getElementById('close-preprocess-modal-btn')?.addEventListener('click', () => this.close());
            document.getElementById('apply-preprocess-btn')?.addEventListener('click', () => this.apply());
            document.getElementById('add-technique-btn')?.addEventListener('click', () => this.addTechnique());
            // Listener para selecionar técnica isolada
            this.isolatedSelect?.addEventListener('change', () => {
                const idx = Number(this.isolatedSelect.value);
                if (Number.isFinite(idx) && idx > 0) this.showIsolated(idx - 1);
            });

            // Fecha modal ao clicar no fundo escuro
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.close();
                }
            });

            // Carrega técnicas disponíveis
            this.loadAvailableTechniques();
        },

        setDataset(name) {
            this.currentDataset = name || '';
        },

        async loadAvailableTechniques() {
            try {
                const techniques = await window.API.getPreprocessingTechniques();
                this.availableTechniques = techniques || [];

                // Atualiza select
                this.availableSelect.innerHTML = '<option value="">Selecione uma técnica...</option>';
                this.availableTechniques.forEach(tech => {
                    const option = document.createElement('option');
                    option.value = tech;
                    option.textContent = tech;
                    this.availableSelect.appendChild(option);
                });

                // Também atualiza os checkboxes ocultos para compatibilidade
                this.updateHiddenCheckboxes();
            } catch (e) {
                console.error('[PreprocessingModal] Erro ao carregar técnicas:', e);
                this.availableSelect.innerHTML = '<option value="">Erro ao carregar técnicas</option>';
            }
        },

        updateHiddenCheckboxes() {
            // Mantém os checkboxes ocultos atualizados para compatibilidade com código existente
            const container = document.getElementById('tipo-checkboxes-preprocessing');
            if (!container) return;

            container.innerHTML = '';
            this.availableTechniques.forEach(tech => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = tech;
                checkbox.checked = this.selectedTechniques.includes(tech);
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(` ${tech}`));
                container.appendChild(label);
            });
        },

        open() {
            if (!this.modal) return;
            if (!this.currentDataset) {
                alert('Selecione um dataset antes de configurar o pré-processamento.');
                return;
            }

            // Carrega técnicas selecionadas dos checkboxes ocultos APENAS NA PRIMEIRA ABERTURA
            if (this.selectedTechniques.length === 0 && this._firstOpen !== false) {
                this.loadSelectedFromCheckboxes();
                this._firstOpen = false;
            }

            // Renderiza pipeline
            this.renderPipeline();

            // Carrega imagem de amostra do dataset
            this.loadSampleImage(this.currentDataset).catch(() => {
                // silencioso; preview não crítica
            });

            // Tenta atualizar a pré-visualização do resultado com as técnicas atuais
            this.updateResultPreview().catch(() => { /* ignore */ });

            // Mostra modal
            this.modal.style.display = 'block';
        },

        close() {
            if (!this.modal) return;
            this.modal.style.display = 'none';
        },

        loadSelectedFromCheckboxes() {
            // Carrega seleção existente dos checkboxes ocultos apenas SE AINDA NÃO HOUVER PIPELINE
            if (this.selectedTechniques.length > 0) return;
            const checkboxes = document.querySelectorAll('#tipo-checkboxes-preprocessing input[type="checkbox"]:checked');
            this.selectedTechniques = Array.from(checkboxes).map(cb => cb.value);
            // Inicializa parâmetros padrão para cada técnica carregada
            this.selectedTechniqueParams = this.selectedTechniques.map(tech => {
                let defaultParams = {};
                if (tech === 'Rotation') {
                    defaultParams = { angle: 30 };
                } else if (tech === 'Histogram Matching') {
                    defaultParams = { reference_path: '' };
                }
                return defaultParams;
            });
        },

        addTechnique() {
            const selected = this.availableSelect.value;
            if (!selected) {
                alert('Selecione uma técnica primeiro');
                return;
            }

            this.selectedTechniques.push(selected);
            // Inicializa parâmetros padrão conforme técnica
            let defaultParams = {};
            if (selected === 'Rotation') {
                defaultParams = { angle: 30 };
            } else if (selected === 'Histogram Matching') {
                defaultParams = { reference_path: '' };
            }
            this.selectedTechniqueParams.push(defaultParams);
            this.renderPipeline();
            this.updateResultPreview().catch(() => { /* ignore */ });
        },

        removeTechnique(index) {
            this.selectedTechniques.splice(index, 1);
            this.selectedTechniqueParams.splice(index, 1);
            this.renderPipeline();
            this.updateResultPreview().catch(() => { /* ignore */ });
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
            this.updateResultPreview().catch(() => { /* ignore */ });
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
            this.updateResultPreview().catch(() => { /* ignore */ });
        },

        renderPipeline() {
            if (!this.pipelineList) return;

            if (this.selectedTechniques.length === 0) {
                this.pipelineList.innerHTML = `
                    <li style="
                        padding: 20px;
                        text-align: center;
                        color: #777;
                        font-size: 0.8rem;
                    ">
                        Nenhuma técnica adicionada. Use o botão abaixo para adicionar.
                    </li>
                `;
                return;
            }

            this.pipelineList.innerHTML = '';
            this.selectedTechniques.forEach((tech, index) => {
                const li = document.createElement('li');
                li.style.cssText = `
                    background: #2d2d2d;
                    padding: 10px;
                    border-radius: 6px;
                    display: flex;
                    flex-direction: column;
                    align-items: stretch;
                    margin-bottom: 8px;
                    gap: 8px;
                `;

                // Linha de cabeçalho (ordem, nome, controles)
                const headerRow = document.createElement('div');
                headerRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

                // Número da ordem
                const orderSpan = document.createElement('span');
                orderSpan.textContent = `${index + 1}.`;
                orderSpan.style.cssText = 'color: #777; font-size: 0.75rem; min-width: 20px; flex-shrink: 0;';
                headerRow.appendChild(orderSpan);

                // Nome da técnica (clicável para visualizar isolado)
                const nameSpan = document.createElement('span');
                nameSpan.textContent = tech;
                nameSpan.style.cssText = 'flex: 1; font-size: 0.8rem; min-width: 0; overflow-wrap: anywhere;';
                nameSpan.title = 'Clique para ver o resultado desta técnica isolada';
                nameSpan.addEventListener('click', () => this.showIsolated(index));
                headerRow.appendChild(nameSpan);

                // Botões de controle
                const controls = document.createElement('div');
                controls.style.cssText = 'display: flex; gap: 4px; flex-shrink: 0;';

                // Mover para cima
                if (index > 0) {
                    const upBtn = document.createElement('button');
                    upBtn.textContent = '▲';
                    upBtn.title = 'Mover para cima';
                    upBtn.style.cssText = `
                        background: transparent;
                        border: none;
                        color: #888;
                        cursor: pointer;
                        font-size: 0.7rem;
                        padding: 2px 6px;
                    `;
                    upBtn.addEventListener('click', () => this.moveTechniqueUp(index));
                    controls.appendChild(upBtn);
                }

                // Mover para baixo
                if (index < this.selectedTechniques.length - 1) {
                    const downBtn = document.createElement('button');
                    downBtn.textContent = '▼';
                    downBtn.title = 'Mover para baixo';
                    downBtn.style.cssText = `
                        background: transparent;
                        border: none;
                        color: #888;
                        cursor: pointer;
                        font-size: 0.7rem;
                        padding: 2px 6px;
                    `;
                    downBtn.addEventListener('click', () => this.moveTechniqueDown(index));
                    controls.appendChild(downBtn);
                }

                // Remover
                const removeBtn = document.createElement('button');
                removeBtn.textContent = '✕';
                removeBtn.title = 'Remover técnica';
                removeBtn.style.cssText = `
                    background: transparent;
                    border: none;
                    color: #ff6b6b;
                    cursor: pointer;
                    font-size: 1rem;
                    padding: 2px 6px;
                `;
                removeBtn.addEventListener('click', () => this.removeTechnique(index));
                controls.appendChild(removeBtn);

                headerRow.appendChild(controls);
                li.appendChild(headerRow);

                // Editor de parâmetros para técnicas suportadas
                const paramsBox = document.createElement('div');
                paramsBox.style.cssText = 'margin-top: 4px; padding: 8px; background:#272727; border-radius:6px; width:100%; box-sizing:border-box; display:flex; align-items:center; gap:8px; flex-wrap: wrap;';
                const params = this.selectedTechniqueParams[index] || {};
                if (tech === 'Rotation') {
                    const label = document.createElement('label');
                    label.textContent = 'Ângulo (°):';
                    label.style.cssText = 'color:#bbb; font-size:0.75rem;';
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.min = '-180';
                    input.max = '180';
                    input.step = '1';
                    input.value = typeof params.angle === 'number' ? params.angle : 30;
                    input.style.cssText = 'width:100px; background:#1f1f1f; color:#eee; border:1px solid #444; border-radius:4px; padding:4px;';
                    input.addEventListener('change', () => {
                        const v = parseFloat(input.value);
                        this.selectedTechniqueParams[index] = Object.assign({}, params, { angle: Number.isFinite(v) ? v : 30 });
                        this.updateResultPreview().catch(() => { });
                    });
                    paramsBox.appendChild(label);
                    paramsBox.appendChild(input);
                    li.appendChild(paramsBox);
                } else if (tech === 'Histogram Matching') {
                    const label = document.createElement('div');
                    label.textContent = 'Imagem de referência:';
                    label.style.cssText = 'color:#bbb; font-size:0.75rem; margin-bottom:6px;';
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.style.cssText = 'background:#1f1f1f; color:#eee; border:1px solid #444; border-radius:4px; padding:4px; width:100%; box-sizing:border-box;';
                    const status = document.createElement('div');
                    status.style.cssText = 'color:#888; font-size:0.7rem;';
                    if (params.reference_path) status.textContent = 'Arquivo enviado';
                    fileInput.addEventListener('change', async () => {
                        if (!fileInput.files || fileInput.files.length === 0) return;
                        const fd = new FormData();
                        fd.append('file', fileInput.files[0]);
                        const resp = await (global.API && global.API.uploadPreprocessingReference ? global.API.uploadPreprocessingReference(fd) : Promise.resolve(null));
                        if (resp && resp.reference_path) {
                            this.selectedTechniqueParams[index] = Object.assign({}, params, { reference_path: resp.reference_path });
                            status.textContent = 'Arquivo enviado';
                            this.updateResultPreview().catch(() => { });
                        } else {
                            status.textContent = 'Falha no upload';
                        }
                    });
                    const leftCol = document.createElement('div');
                    leftCol.style.cssText = 'display:flex; flex-direction:column; gap:6px; flex: 1 1 auto; min-width:0;';
                    leftCol.appendChild(label);
                    leftCol.appendChild(fileInput);

                    const rightCol = document.createElement('div');
                    rightCol.style.cssText = 'flex: 0 0 auto; min-width: 120px;';
                    rightCol.appendChild(status);

                    paramsBox.appendChild(leftCol);
                    paramsBox.appendChild(rightCol);
                    li.appendChild(paramsBox);
                }
                this.pipelineList.appendChild(li);
            });
        },

        apply() {
            // Atualiza checkboxes ocultos
            const checkboxes = document.querySelectorAll('#tipo-checkboxes-preprocessing input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = this.selectedTechniques.includes(cb.value);
            });

            // Atualiza summary
            this.updateSummary();

            // Salva pipeline no localStorage para que a predição possa usar como referência
            const pipeline = this.getPipeline();
            localStorage.setItem('preprocessing_training_pipeline', JSON.stringify(pipeline));
            console.log('[PreprocessingModal] Pipeline salvo no localStorage:', pipeline);

            // Fecha modal
            this.close();

            // Notifica usuário
            if (global.UI && typeof global.UI.showLog === 'function') {
                global.UI.showLog(`✓ ${this.selectedTechniques.length} técnica(s) de pré-processamento configurada(s)`);
            }
        },

        // Retorna o pipeline completo com parâmetros para ser usado no treinamento
        getPipeline() {
            return this.selectedTechniques.map((name, idx) => ({
                name: name,
                params: this.selectedTechniqueParams[idx] || {}
            }));
        },

        updateSummary() {
            const summaryEl = document.getElementById('preprocessing-count');
            if (!summaryEl) return;

            if (this.selectedTechniques.length === 0) {
                summaryEl.textContent = 'Nenhuma';
                summaryEl.style.color = '#999';
            } else {
                summaryEl.textContent = this.selectedTechniques.join(', ');
                summaryEl.style.color = '#2ecc71';
            }
        },

        async loadSampleImage(datasetName) {
            if (!this.previewOriginal || !this.previewResult) return;
            this.previewOriginal.src = '';
            this.previewResult.src = '';

            const placeholder = 'data:image/svg+xml;utf8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250">' +
                '<rect width="100%" height="100%" fill="#1f1f1f" />' +
                '<text x="50%" y="50%" fill="#b0b0b0" font-size="16" text-anchor="middle" dy=".3em">Pré-visualização indisponível</text>' +
                '</svg>'
            );

            try {
                if (global.API && typeof global.API.getDatasetInfo === 'function') {
                    const info = await global.API.getDatasetInfo(datasetName).catch(() => null);
                    const sample = info?.sample_image || info?.sample || (Array.isArray(info?.images) ? info.images[0] : null);
                    if (sample) {
                        this.previewOriginal.src = sample;
                        this.previewResult.src = sample;
                        return;
                    }
                }
            } catch (e) {
                console.warn('[PreprocessingModal] Falha ao carregar amostra do dataset:', e);
            }

            this.previewOriginal.src = placeholder;
            this.previewResult.src = placeholder;
        },

        async updateResultPreview() {
            // Atualiza imagens com dados vindos do backend (original, final, steps, isolated)
            if (!this.currentDataset) return;
            const pipeline = (Array.isArray(this.selectedTechniques) ? this.selectedTechniques.map((name, idx) => ({ name, params: this.selectedTechniqueParams[idx] || {} })) : []);
            try {
                if (global.API && typeof global.API.postPreprocessingPreview === 'function') {
                    const data = await global.API.postPreprocessingPreview(this.currentDataset, pipeline);
                    if (data) {
                        this._lastPreviewData = data;
                        // Original
                        if (this.previewOriginal && data.original) this.previewOriginal.src = data.original;
                        // Final
                        if (this.previewResult && (data.final || data.preview)) this.previewResult.src = data.final || data.preview;
                        // Pipeline steps: renderiza galeria horizontal
                        this.renderPipelineSteps(data);
                        // Isolated: preenche o selector e mostra a primeira técnica, se houver
                        this.populateIsolatedSelector(data.isolated);
                        if (this.previewIsolated && Array.isArray(data.isolated) && data.isolated.length > 0) {
                            this.previewIsolated.src = data.isolated[0].url;
                            const label = document.querySelector('.preview-label-isolated');
                            if (label) label.textContent = `TÉCNICA ISOLADA — ${data.isolated[0].technique}`;
                            if (this.isolatedSelect) this.isolatedSelect.value = String(data.isolated[0].index);
                        }
                        return;
                    }
                }
            } catch (e) {
                console.warn('[PreprocessingModal] Falha ao obter preview processado:', e);
            }
            // Fallback: usa original quando não houver suporte
            if (this.previewOriginal && this.previewOriginal.src) {
                this.previewResult.src = this.previewOriginal.src;
                if (this.previewIsolated) this.previewIsolated.src = this.previewOriginal.src;
            }
        },

        populateIsolatedSelector(isolatedList) {
            if (!this.isolatedSelect) return;
            this.isolatedSelect.innerHTML = '<option value="">Selecione a técnica isolada...</option>';
            if (Array.isArray(isolatedList) && isolatedList.length > 0) {
                isolatedList.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = String(item.index);
                    opt.textContent = `${item.index} — ${item.technique}`;
                    this.isolatedSelect.appendChild(opt);
                });
                this.isolatedSelect.disabled = false;
            } else {
                this.isolatedSelect.disabled = true;
            }
        },

        showIsolated(index) {
            // Atualiza a imagem isolada para a técnica clicada na lista
            if (!this._lastPreviewData || !Array.isArray(this._lastPreviewData.isolated)) return;
            const item = this._lastPreviewData.isolated[index];
            if (item && this.previewIsolated) {
                this.previewIsolated.src = item.url;
                const label = document.querySelector('.preview-label-isolated');
                if (label) label.textContent = `TÉCNICA ISOLADA — ${item.technique}`;
                if (this.isolatedSelect) this.isolatedSelect.value = String(item.index);
            }
        },

        renderPipelineSteps(data) {
            if (!this.stepsGallery) return;
            this.stepsGallery.innerHTML = '';

            // Se não há técnicas, mostra mensagem
            if (!data.steps || data.steps.length === 0) {
                this.stepsGallery.innerHTML = '<div style="color: #777; padding: 20px; text-align: center; width: 100%;">Adicione técnicas para visualizar a evolução do pipeline</div>';
                return;
            }

            // Card da imagem original
            const originalCard = document.createElement('div');
            originalCard.className = 'pipeline-step-card first-step';
            originalCard.innerHTML = `
                <div class="pipeline-step-label">ORIGINAL</div>
                <div class="pipeline-step-tech">Imagem de entrada</div>
                <img src="${data.original}" alt="Original">
            `;
            this.stepsGallery.appendChild(originalCard);

            // Seta após original
            const arrow1 = document.createElement('div');
            arrow1.className = 'pipeline-arrow';
            arrow1.textContent = '→';
            this.stepsGallery.appendChild(arrow1);

            // Cards das etapas intermediárias
            data.steps.forEach((step, idx) => {
                const stepCard = document.createElement('div');
                stepCard.className = 'pipeline-step-card';
                stepCard.innerHTML = `
                    <div class="pipeline-step-label">ETAPA ${step.index}</div>
                    <div class="pipeline-step-tech">${step.technique}</div>
                    <img src="${step.url}" alt="${step.technique}">
                `;
                // Clique no card mostra essa etapa no preview principal
                stepCard.addEventListener('click', () => {
                    if (this.previewResult) this.previewResult.src = step.url;
                });
                this.stepsGallery.appendChild(stepCard);

                // Seta entre etapas (não adiciona após a última)
                if (idx < data.steps.length - 1) {
                    const arrow = document.createElement('div');
                    arrow.className = 'pipeline-arrow';
                    arrow.textContent = '→';
                    this.stepsGallery.appendChild(arrow);
                }
            });

            // Seta antes do final
            if (data.steps.length > 0) {
                const arrowFinal = document.createElement('div');
                arrowFinal.className = 'pipeline-arrow';
                arrowFinal.textContent = '→';
                this.stepsGallery.appendChild(arrowFinal);
            }

            // Card do resultado final
            const finalCard = document.createElement('div');
            finalCard.className = 'pipeline-step-card final-step';
            finalCard.innerHTML = `
                <div class="pipeline-step-label">FINAL</div>
                <div class="pipeline-step-tech">Pipeline completo</div>
                <img src="${data.final}" alt="Resultado Final">
            `;
            finalCard.addEventListener('click', () => {
                if (this.previewResult) this.previewResult.src = data.final;
            });
            this.stepsGallery.appendChild(finalCard);
        }
    };

    // Expõe globalmente
    global.PreprocessingModal = PreprocessingModal;

    // A inicialização será chamada por UI.js após a página carregar

})(window);
