// Expõe TrainingControl globalmente para ser acessível pelo UI.js
(function (global) {
    const TrainingControl = {
        jobID: null,
        isTrainingActive: false,
        eventSource: null,
        API_BASE: global.API ? global.API.API_BASE : '',
        PLACEHOLDER_SRC: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        // image polling state
        _imagePollHandle: null,
        _shownImages: null,
        _imageElements: null,
        _placeholderUntil: null, // ms timestamp — when set, ignore images older than this
        _currentJobFollowed: null,
        _manualViewActive: false,

        init: function () {
            // Garante que só inicializa se estiver na página de treinamento (os elementos existem)
            if (!document.getElementById('training-page')) return;

            this.startBtn = document.getElementById('start-training-btn');
            this.cancelBtn = document.getElementById('cancel-training-btn');
            this.logsElement = document.getElementById('logs');
            this.jobSelect = document.getElementById('job-select');
            this.jobSelectBtn = document.getElementById('job-select-apply');
            this.jobRefreshBtn = document.getElementById('job-refresh-btn');

            // Remove listeners antigos antes de adicionar novos
            this.startBtn.removeEventListener('click', this._startHandler);
            this.cancelBtn.removeEventListener('click', this._cancelHandler);
            if (this.jobSelect) this.jobSelect.removeEventListener('change', this._jobSelectHandler);
            if (this.jobSelectBtn) this.jobSelectBtn.removeEventListener('click', this._jobSelectClickHandler);
            if (this.jobRefreshBtn) this.jobRefreshBtn.removeEventListener('click', this._jobRefreshClickHandler);

            this._startHandler = () => this.startTraining();
            this._cancelHandler = () => this.cancelTraining();
            this._jobSelectClickHandler = () => this.handleJobSelection(this.jobSelect?.value);
            this._jobRefreshClickHandler = () => this.refreshJobList();

            this.startBtn.addEventListener('click', this._startHandler);
            this.cancelBtn.addEventListener('click', this._cancelHandler);
            // Apenas o botão dispara seleção - não o change do select para evitar duplicatas
            if (this.jobSelectBtn) this.jobSelectBtn.addEventListener('click', this._jobSelectClickHandler);
            if (this.jobRefreshBtn) this.jobRefreshBtn.addEventListener('click', this._jobRefreshClickHandler);

            // 1. Verificar o estado inicial (caso o usuário atualize a página)
            this.checkInitialStatus();
            // 2. Atualiza lista de jobs para seleção manual
            this.refreshJobList();
        },

        handleJobSelection: function (jobId) {
            // vazio => segue auto (último concluído ou ativo)
            if (!jobId) {
                this._manualViewActive = false;
                this.checkInitialStatus();
                return;
            }
            this._manualViewActive = true;
            this.logsElement.value += `[INFO] Exibindo imagens do job: ${jobId}\n`;
            this.setUIState(false, jobId);
        },

        setUIState: function (active, jobId = null) {
            this.isTrainingActive = active;
            this.jobID = jobId;

            const inputsAndButtons = document.querySelectorAll(
                '#training-page input:not(.config-textarea), #training-page select, #training-page button:not(#cancel-training-btn):not(#edit-config-btn):not(#save-config-btn):not(#cancel-config-btn):not(#reset-config-btn)'
            );

            inputsAndButtons.forEach(el => {
                el.disabled = active;
            });

            // Controles de Edição da Configuração (devem permanecer ativos se não estiver no modo de edição)
            const configBtns = document.querySelectorAll('#edit-config-btn, #reset-config-btn');
            configBtns.forEach(el => { el.disabled = active; });

            // Controles de Treino
            this.startBtn.classList.toggle('hidden', active);
            this.cancelBtn.classList.toggle('hidden', !active);
            this.cancelBtn.disabled = !active;

            // Se estiver ativo, inicia o log stream e o polling de imagens
            if (active && jobId) {
                this.startLogStream(jobId);
                this.startImagePolling(jobId);
            } else {
                this.stopLogStream();
                // O checkInitialStatus já garante que o polling do último job concluído seja iniciado 
                // se o job ativo for 'null' e a UI estiver inativa.
                if (jobId && this._currentJobFollowed !== jobId) {
                    // Visualizar um job específico sem ativar estado de treino
                    // Só inicia se for um job diferente do atual
                    this.startImagePolling(jobId, true);
                }
            }
        },

        checkInitialStatus: async function () {
            try {
                const response = await fetch(`${this.API_BASE}/train/status`);
                const data = await response.json();

                if (data.is_active) {
                    this.logsElement.value += `[INFO] Treinamento ativo detectado: ${data.job_id} (${data.status}). Reconectando ao log...\n`;
                    this.setUIState(true, data.job_id);
                } else {
                    // SE NENHUM JOB ESTIVER ATIVO, BUSCAR O ÚLTIMO CONCLUÍDO
                    await this.checkLatestCompletedJob();
                    this.setUIState(false);
                }
            } catch (error) {
                console.error('Erro ao verificar status:', error);
                this.logsElement.value += `[ERRO] Falha ao verificar status: ${error.message}\n`;
                this.setUIState(false);
            }
        },

        // --- FUNÇÃO ADICIONADA: BUSCA O ÚLTIMO JOB CONCLUÍDO E ATUALIZA IMAGENS ---
        checkLatestCompletedJob: async function () {
            try {
                // Requisição ao novo endpoint do Flask
                const response = await window.API.safeFetch(`${this.API_BASE}/train/latest_job`);

                if (response && response.latest_job) {
                    const latestJobId = response.latest_job;

                    // Se já estivermos seguindo este job, não faz nada
                    if (this._currentJobFollowed === latestJobId) return;

                    this.logsElement.value += `[INFO] Nenhum treino ativo. Exibindo resultados do último treino concluído: ${latestJobId}.\n`;

                    // Inicia o polling de imagens para o job ID mais recente
                    this.startImagePolling(latestJobId);
                    this._setJobSelectValue(latestJobId);

                } else if (!this._currentJobFollowed) {
                    this.logsElement.value += `[INFO] Nenhuma execução de treinamento anterior encontrada.\n`;
                    this._clearImages();
                }
            } catch (error) {
                console.error('Erro ao buscar último job concluído:', error);
            }
        },
        // -----------------------------------------------------------------


        startTraining: async function () {
            // Verifica se a função de coleta existe no módulo UI
            if (typeof global.UI.collectTrainingPayload !== 'function') {
                this.logsElement.value += "[ERRO] Função de coleta de payload não encontrada.\n";
                return;
            }
            const payload = global.UI.collectTrainingPayload();
            const jobID = payload.exp_name;

            this.logsElement.value = `[INFO] Preparando treinamento... Job ID: ${jobID}\n`;
            // Validação mínima: dataset obrigatório
            if (!payload.dataset) {
                this.logsElement.value += `[ERRO] Selecione um dataset antes de iniciar o treinamento.\n`;
                this.setUIState(false);
                return;
            }
            // NÃO iniciar stream ainda - apenas desabilitar UI
            this.isTrainingActive = true;
            this.jobID = jobID;
            const inputsAndButtons = document.querySelectorAll(
                '#training-page input:not(.config-textarea), #training-page select, #training-page button:not(#cancel-training-btn):not(#edit-config-btn):not(#save-config-btn):not(#cancel-config-btn):not(#reset-config-btn)'
            );
            inputsAndButtons.forEach(el => { el.disabled = true; });
            this.startBtn.classList.toggle('hidden', true);
            this.cancelBtn.classList.toggle('hidden', false);
            this.cancelBtn.disabled = false;

            try {
                const response = await fetch(`${this.API_BASE}/train/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                // Aceita respostas antigas ("started") e novas ("training_started_async")
                if (response.ok && (data.status === 'training_started_async' || data.status === 'started')) {
                    // IMPORTANTE: YOLO pode adicionar número sequencial ao nome (ex: treinamento_classificacao -> treinamento_classificacao4)
                    // O backend cria arquivo de log com o nome ORIGINAL (data.job_id)
                    // Mas o YOLO cria o diretório com número sequencial

                    // Aguardar um pouco e buscar o job REAL que foi criado
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Aguarda 1 segundo
                    await this.refreshJobList();

                    // Busca o job mais recente que começa com o jobID
                    const realJobId = await this._findRealJobId(data.job_id);
                    const finalJobId = realJobId || data.job_id;

                    this.logsElement.value += `[INFO] Job real criado: ${finalJobId}\n`;

                    // CRÍTICO: 
                    // - Log stream usa data.job_id (nome do arquivo .log no backend)
                    // - Image polling usa finalJobId (nome real do diretório criado pelo YOLO)
                    // - Job select mostra finalJobId (nome real)
                    this.jobID = finalJobId; // Para exibição e cancelamento
                    // Seguir automaticamente o job ativo -> selector em branco
                    this._manualViewActive = false;
                    this._setJobSelectValue('');

                    // Inicia log stream com o nome ORIGINAL (arquivo .log)
                    this.startLogStream(data.job_id);

                    // Inicia image polling com o nome REAL (diretório)
                    try { this.startImagePolling(finalJobId, true); } catch (e) { /* ignore */ }
                    // O log inicial foi limpado acima, a mensagem de start já será enviada pelo SSE
                } else {
                    this.logsElement.value += `[ERRO] ${data.message || data.detail || 'Falha ao iniciar treino'}\n`;
                    this.setUIState(false);
                }
            } catch (error) {
                this.logsElement.value += `[ERRO] Erro de rede/API: ${error.message}\n`;
                this.setUIState(false);
            }
        },

        cancelTraining: async function () {
            if (!this.isTrainingActive || !this.jobID) return;

            this.cancelBtn.disabled = true;
            this.logsElement.value += `[INFO] Enviando pedido de cancelamento para ${this.jobID}...\n`;

            try {
                const response = await fetch(`${this.API_BASE}/train/cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });

                const data = await response.json();

                if (response.ok && data.status === 'cancelled') {
                    this.logsElement.value += `[INFO] ${data.message}. Aguardando o encerramento do stream...\n`;
                    // O setUIState(false) será chamado pelo SSE quando o log de cancelamento chegar.
                } else {
                    this.logsElement.value += `[ERRO] Falha ao cancelar: ${data.message || data.detail || 'Erro desconhecido'}\n`;
                    this.cancelBtn.disabled = false;
                }
            } catch (error) {
                this.logsElement.value += `[ERRO] Erro de rede ao tentar cancelar: ${error.message}\n`;
                this.cancelBtn.disabled = false;
            }
        },

        startLogStream: function (jobId) {
            this.stopLogStream();
            this.eventSource = new EventSource(`${this.API_BASE}/train/logs/${jobId}`);

            this.eventSource.onmessage = (event) => {
                let newLogChunk = event.data || '';
                // normalize: ensure newline at end for textarea readability
                if (newLogChunk && !newLogChunk.endsWith('\n')) newLogChunk = newLogChunk + '\n';
                // Adiciona o novo chunk de log ao final
                this.logsElement.value += newLogChunk;
                // keep view scrolled to bottom
                this.logsElement.scrollTop = this.logsElement.scrollHeight;

                // Verificação de Encerramento (inclui mensagens de sucesso, erro e cancelamento)
                if (newLogChunk.includes("TREINAMENTO_COMPLETO") ||
                    newLogChunk.includes("ERRO_TREINAMENTO") ||
                    newLogChunk.includes("CANCELADO PELO USUÁRIO") ||
                    newLogChunk.includes("Fim da conexão de log")
                ) {
                    this.stopLogStream();
                    this.setUIState(false);
                    // Atualiza lista de jobs após conclusão
                    this.refreshJobList().catch(e => console.warn('Erro ao atualizar jobs:', e));
                }
            };

            this.eventSource.onerror = async (err) => {
                console.error("EventSource failed:", err);
                this.logsElement.value += '\n[ERROR] Conexão de log interrompida.\n';
                this.stopLogStream();
                // Verifica estado atual; se não houver treino ativo, ajusta UI
                try {
                    const st = await window.API.safeFetch(`${this.API_BASE}/train/status`);
                    if (!st || !st.is_active || ["completed", "error", "cancelled"].includes(st.status)) {
                        this.setUIState(false);
                    }
                } catch (_) { /* ignore */ }
            };
        },

        refreshJobList: async function () {
            try {
                const resp = await window.API.safeFetch(`${this.API_BASE}/train/jobs?prefix=treinamento_classificacao`);
                const select = document.getElementById('job-select');
                if (!select || !resp || !Array.isArray(resp.jobs)) return;
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

                // Mantém seleção se existir
                if (currentValue && resp.jobs.includes(currentValue)) {
                    select.value = currentValue;
                }
            } catch (e) {
                console.warn('Não foi possível carregar lista de jobs:', e);
            }
        },

        _findRealJobId: async function (jobPrefix) {
            /**
             * Busca o job REAL criado pelo YOLO que pode ter número sequencial.
             * Ex: jobPrefix="treinamento_classificacao" pode resultar em "treinamento_classificacao8"
             * Tenta múltiplas vezes em caso do job ainda estar sendo criado.
             */
            const maxAttempts = 5;
            let lastSeenJob = null;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    const resp = await window.API.safeFetch(`${this.API_BASE}/train/jobs?prefix=${jobPrefix}`);
                    if (!resp || !Array.isArray(resp.jobs) || resp.jobs.length === 0) {
                        console.log(`[_findRealJobId] Tentativa ${attempt + 1}: nenhum job encontrado`);
                        await new Promise(resolve => setTimeout(resolve, 500)); // Aguarda 500ms
                        continue;
                    }

                    // O primeiro job na lista é o mais recente (a lista vem ordenada por mtime desc)
                    const mostRecentJob = resp.jobs[0];

                    // Se encontramos um job novo (diferente do anterior), retorna
                    if (mostRecentJob !== lastSeenJob) {
                        console.log(`[_findRealJobId] Tentativa ${attempt + 1}: encontrado job mais recente: ${mostRecentJob}`);
                        return mostRecentJob;
                    }

                    lastSeenJob = mostRecentJob;
                    console.log(`[_findRealJobId] Tentativa ${attempt + 1}: job igual ao anterior, aguardando...`);

                    if (attempt < maxAttempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500)); // Aguarda 500ms antes de tentar novamente
                    }
                } catch (e) {
                    console.warn(`[_findRealJobId] Erro na tentativa ${attempt + 1}:`, e);
                    if (attempt < maxAttempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }

            console.warn('[_findRealJobId] Não conseguiu encontrar um novo job após várias tentativas');
            return null;
        },

        _setJobSelectValue: function (jobId) {
            const select = document.getElementById('job-select');
            if (!select) return;
            if (!jobId) {
                select.value = '';
                return;
            }
            const exists = Array.from(select.options).some(o => o.value === jobId);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = jobId;
                opt.textContent = jobId;
                select.appendChild(opt);
            }
            select.value = jobId;
        },

        stopLogStream: function () {
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
        }
        ,

        // ---------------- Image polling & UI helpers ----------------
        startImagePolling: function (jobId, force = false) {
            // Se já estamos seguindo este job e não for força, apenas mantém o intervalo
            if (!force && this._currentJobFollowed === jobId && this._imagePollHandle) {
                console.log(`[DEBUG] Já seguindo job ${jobId}, mantendo intervalo`);
                return;
            }

            console.log(`[DEBUG] Iniciando polling para job: ${jobId}, force=${force}`);

            // GARANTIR que intervalos anteriores sejam limpos
            this.stopImagePolling();

            // Limpar imagens antigas ANTES de resetar as estruturas de dados
            this._clearImages(); // Isso já limpa _imageElements e _shownImages internamente

            this._currentJobFollowed = jobId || null;
            this._setJobHeader(jobId);

            // Não ajustar janela de placeholders aqui.
            // Em reentradas na página durante um treino ativo, devemos exibir TODAS as imagens já geradas.
            // Mantemos ou limpamos este valor explicitamente em transições de estado.
            this._placeholderUntil = null;

            // NÃO criar placeholders - apenas mostrar imagens reais
            // Isso evita confusão quando trocar entre jobs

            // try immediate then schedule
            this._pollImagesOnce(jobId);
            // IMPORTANTE: Não capturar jobId no closure - usar this._currentJobFollowed
            this._imagePollHandle = setInterval(() => this._pollImagesOnce(this._currentJobFollowed), 3000);
            console.log(`[DEBUG] Intervalo criado para job: ${jobId}, handle: ${this._imagePollHandle}`);
        },

        _clearImages: function () {
            const container = document.getElementById('training-images');
            if (!container) return;

            console.log('[DEBUG] Limpando todas as imagens do container');

            // Abordagem mais simples e confiável: usar Array.from para evitar problemas com live collections
            const children = Array.from(container.children);
            children.forEach(child => {
                // Mantém apenas o header
                if (child.id !== 'training-images-header') {
                    container.removeChild(child);
                }
            });

            this._imageElements = {};
            this._shownImages = new Set();
            console.log('[DEBUG] Container limpo, _imageElements e _shownImages resetados');
        },

        _setJobHeader: function (jobId) {
            const container = document.getElementById('training-images');
            if (!container) return;
            let header = document.getElementById('training-images-header');
            if (!header) {
                header = document.createElement('div');
                header.id = 'training-images-header';
                header.style.fontWeight = '600';
                header.style.marginBottom = '6px';
                header.style.color = 'var(--text-primary)';
                container.insertBefore(header, container.firstChild);
            }

            // Apenas atualiza o texto do cabeçalho - NÃO redefine this._currentJobFollowed
            // (isso já foi feito em startImagePolling antes de chamar essa função)
            header.textContent = `Job: ${jobId || '—'}`;
        },

        stopImagePolling: function () {
            if (this._imagePollHandle) {
                console.log(`[DEBUG] Parando intervalo: ${this._imagePollHandle}`);
                clearInterval(this._imagePollHandle);
                this._imagePollHandle = null;
            }
        },

        destroy: function () {
            // Limpa todos os recursos do TrainingControl quando sai da página
            console.log('[DEBUG] TrainingControl.destroy() - limpando recursos');
            this.stopImagePolling();
            this.stopLogStream();
            this._currentJobFollowed = null;
            this._placeholderUntil = null;
            this._manualViewActive = false;
        },

        _appendImageRow: function (labelText, imgs) {
            const container = document.getElementById('training-images');
            if (!container) return;

            // Filtra placeholders vazios - não renderizar se todas as imagens forem placeholders
            const hasRealImages = imgs.some(src => src !== this.PLACEHOLDER_SRC);
            if (!hasRealImages) return;

            // use labelText as key to keep one row per logical group
            const key = String(labelText || 'row');

            console.log(`[DEBUG] _appendImageRow: ${key}, existe=${!!this._imageElements[key]}, URLs:`, imgs.slice(0, 2).map(u => u.split('?')[0]));

            // If row already exists, update images
            if (this._imageElements && this._imageElements[key]) {
                console.log(`[DEBUG] Atualizando row existente: ${key}`);
                const rowObj = this._imageElements[key];
                const grid = rowObj.grid;
                // Atualiza classe de colunas conforme quantidade
                const desiredColsClass = 'comparison-grid' + (imgs.length > 2 ? ' comparison-grid-cols-3' : ' comparison-grid-cols-2');
                if (grid.className !== desiredColsClass) {
                    grid.className = desiredColsClass;
                }
                // update existing img elements or append new ones
                for (let i = 0; i < imgs.length; i++) {
                    const src = imgs[i];
                    if (rowObj.imgs[i]) {
                        console.log(`[DEBUG] Atualizando img[${i}] para: ${src.substring(0, 80)}`);
                        // Force reload: clear src first, then set new one
                        rowObj.imgs[i].src = '';
                        setTimeout(() => {
                            rowObj.imgs[i].src = src;
                        }, 0);
                    } else {
                        const card = document.createElement('div');
                        card.className = 'comparison-card';
                        card.innerHTML = `<div class="card image-card"><img src="${src}" alt="${labelText}"/></div>`;
                        // bind click to open modal if UI available
                        const imgEl = card.querySelector('img');
                        if (imgEl && global.UI && typeof global.UI.openImageModal === 'function') {
                            imgEl.addEventListener('click', () => global.UI.openImageModal(src, labelText));
                        }
                        grid.appendChild(card);
                        rowObj.imgs.push(imgEl || card.querySelector('img'));
                    }
                }
                // Remove imagens excedentes se o novo conjunto for menor
                while (rowObj.imgs.length > imgs.length) {
                    const lastImg = rowObj.imgs.pop();
                    try {
                        const cardToRemove = lastImg.closest('.comparison-card') || lastImg.parentElement?.parentElement;
                        if (cardToRemove && cardToRemove.parentNode === grid) {
                            grid.removeChild(cardToRemove);
                        }
                    } catch (e) { /* ignore */ }
                }
                // Se não restou nenhuma imagem, remover a linha inteira
                if (imgs.length === 0) {
                    if (rowObj.group && rowObj.group.parentNode) {
                        rowObj.group.parentNode.removeChild(rowObj.group);
                    }
                    delete this._imageElements[key];
                }
                return;
            }

            // Create the group using the same structure as prediction view
            console.log(`[DEBUG] Criando nova row: ${key}`);
            const groupDiv = document.createElement('div');
            groupDiv.className = 'image-comparison-group card';

            const header = document.createElement('h4');
            header.style.marginBottom = '10px';
            header.style.fontWeight = '700';
            header.textContent = `🖼️ ${labelText}`;
            groupDiv.appendChild(header);

            const comparisonGrid = document.createElement('div');
            comparisonGrid.className = 'comparison-grid' + (imgs.length > 2 ? ' comparison-grid-cols-3' : ' comparison-grid-cols-2');

            const imgsEl = [];
            for (const src of imgs) {
                const modelCard = document.createElement('div');
                modelCard.className = 'comparison-card';
                const cardInner = document.createElement('div');
                cardInner.className = 'card image-card';
                const img = document.createElement('img');
                img.src = src;
                if (src === this.PLACEHOLDER_SRC) img.classList.add('training-placeholder');
                img.alt = labelText || '';
                img.style.cursor = 'pointer';
                if (global.UI && typeof global.UI.openImageModal === 'function') {
                    img.addEventListener('click', () => global.UI.openImageModal(src, img.alt || ''));
                }
                cardInner.appendChild(img);
                modelCard.appendChild(cardInner);
                comparisonGrid.appendChild(modelCard);
                imgsEl.push(img);
            }

            groupDiv.appendChild(comparisonGrid);
            // remove placeholder if present
            const placeholder = document.getElementById('training-images-placeholder');
            if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);

            container.appendChild(groupDiv);
            container.scrollTop = container.scrollHeight;

            if (!this._imageElements) this._imageElements = {};
            this._imageElements[key] = { group: groupDiv, grid: comparisonGrid, imgs: imgsEl, label: labelText };
        },

        _pruneMissingRows: function (seenKeys) {
            if (!this._imageElements) return;
            try {
                const existingKeys = Object.keys(this._imageElements);
                for (const key of existingKeys) {
                    if (!seenKeys.has(key)) {
                        const rowObj = this._imageElements[key];
                        if (rowObj && rowObj.group && rowObj.group.parentNode) {
                            rowObj.group.parentNode.removeChild(rowObj.group);
                        }
                        delete this._imageElements[key];
                    }
                }
            } catch (e) { /* ignore */ }
        },

        _createPlaceholders: function () {
            // create a predictable set of placeholder rows so UI shows empty slots immediately
            const ph = this.PLACEHOLDER_SRC;
            // Train batches: show 6 placeholders
            this._appendImageRow('Train batches', Array.from({ length: 3 }).map(() => ph));
            // Val pairs: create at least 2 rows (val batch 0 and 1)
            this._appendImageRow('Val batch 0', [ph, ph]);
            // this._appendImageRow('Val batch 1', [ph, ph]);
            // Confusion matrices: normalized + raw
            this._appendImageRow('Confusion matrices', [ph, ph]);
            // Results (single)
            this._appendImageRow('Results', [ph]);
        },

        _pollImagesOnce: async function (jobId) {
            // IMPORTANTE: jobId passado como parâmetro pode estar desatualizado se o intervalo
            // foi criado para um job antigo. Sempre verificar o status atual primeiro.
            console.log(`[DEBUG] _pollImagesOnce chamado com jobId: ${jobId}`);

            // Se o sistema estiver ativo, o status ativo sobrescreve a leitura do job ID.
            let currentJobToFollow = jobId;
            try {
                const status = await window.API.safeFetch(`${this.API_BASE}/train/status`);
                if (status && status.is_active && status.job_id) {
                    // Apenas segue automaticamente o job ativo quando não estamos em visualização manual
                    if (this.isTrainingActive && !this._manualViewActive) {
                        currentJobToFollow = status.job_id;
                        this.jobID = currentJobToFollow;
                        // Se o job mudou, limpar imagens e atualizar cabeçalho
                        if (this._currentJobFollowed && this._currentJobFollowed !== currentJobToFollow) {
                            console.log(`[DEBUG] Job mudou de ${this._currentJobFollowed} para ${currentJobToFollow} - limpando imagens e atualizando header`);
                            this._clearImages();
                            this._shownImages = new Set();
                            this._imageElements = {};
                        }
                        this._currentJobFollowed = currentJobToFollow;
                        this._setJobHeader(currentJobToFollow);
                        // Mantém seletor em branco quando seguindo automaticamente o job ativo
                        const select = document.getElementById('job-select');
                        if (select) select.value = '';
                    }
                }
            } catch (e) {
                // ignore
            }

            if (!currentJobToFollow) return;

            jobId = currentJobToFollow; // Usamos o job ID definitivo para a busca
            console.log(`[DEBUG] Buscando imagens para job: ${jobId}`);

            try {
                // Apenas usa o endpoint diagnóstico `/train/images/<job>` como fonte única de verdade.
                const diagUrl = `${this.API_BASE}/train/images/${encodeURIComponent(jobId)}`;
                const cacheBusterUrl = diagUrl + `?t=${Date.now()}`;
                const diag = await window.API.safeFetch(cacheBusterUrl);

                if (!(diag && Array.isArray(diag.images) && diag.images.length > 0)) {
                    // Sem imagens listadas ainda — manter placeholders e aguardar próxima rodada.
                    return;
                }

                // Agrupa as imagens retornadas pelo diagnóstico
                const seenKeys = new Set();
                const thresholdSec = this._placeholderUntil ? Math.floor(this._placeholderUntil / 1000) : 0;
                const trainImgs = [];
                const valMap = {}; // idx -> {label, pred, label_mtime, pred_mtime}
                const confusion = { norm: null, raw: null };
                const results = [];

                console.log(`[DEBUG] Processando ${diag.images.length} imagens do job ${jobId}`);

                for (const it of diag.images) {
                    // ignore images older than placeholder threshold when placeholders are active
                    try {
                        if (thresholdSec && it.mtime && Number(it.mtime) < thresholdSec) continue;
                    } catch (e) { /* ignore parsing errors */ }

                    let serveUrl = it.url || (it.name ? `${this.API_BASE}/train/image/${encodeURIComponent(jobId)}/${encodeURIComponent(it.name.replace(/\.[^/.]+$/, ''))}` : null);
                    if (serveUrl && !serveUrl.includes('?t=')) {
                        try { serveUrl = serveUrl.replace(/\?.*$/, '') + `?t=${it.mtime}`; } catch (e) { serveUrl = serveUrl + `?t=${Date.now()}`; }
                    }
                    if (!serveUrl) continue;

                    const lname = (it.name || '').toLowerCase();
                    const mTrain = lname.match(/train_batch(\d+)/);
                    const mVal = lname.match(/val_batch(\d+)_(labels|pred)/);
                    if (mTrain) {
                        trainImgs.push(serveUrl);
                    } else if (mVal) {
                        const idx = mVal[1];
                        const which = mVal[2];
                        valMap[idx] = valMap[idx] || { label: null, pred: null, label_mtime: 0, pred_mtime: 0 };
                        if (which === 'labels') { valMap[idx].label = serveUrl; valMap[idx].label_mtime = it.mtime; } else { valMap[idx].pred = serveUrl; valMap[idx].pred_mtime = it.mtime; }
                    } else if (lname.includes('confusion_matrix_normalized')) {
                        confusion.norm = serveUrl;
                    } else if (lname.includes('confusion_matrix')) {
                        confusion.raw = serveUrl;
                    } else if (lname.includes('results')) {
                        results.push(serveUrl);
                    } else {
                        // generic: append as single
                        seenKeys.add(it.name);
                        this._appendImageRow(it.name, [serveUrl]);
                    }
                }

                if (trainImgs.length) { seenKeys.add('Train batches'); this._appendImageRow('Train batches', trainImgs); }
                Object.keys(valMap).sort((a, b) => Number(a) - Number(b)).forEach(idx => {
                    const pair = valMap[idx];
                    // require both label and pred to be present and newer than threshold
                    if (pair.label && pair.pred) {
                        try {
                            const lm = Number(pair.label_mtime || 0);
                            const pm = Number(pair.pred_mtime || 0);
                            if (thresholdSec && (lm < thresholdSec || pm < thresholdSec)) return;
                        } catch (e) { /* ignore */ }
                        const key = `Val batch ${idx}`;
                        seenKeys.add(key);
                        this._appendImageRow(key, [pair.label, pair.pred]);
                    }
                });
                if (confusion.norm && confusion.raw) { seenKeys.add('Confusion matrices'); this._appendImageRow('Confusion matrices', [confusion.norm, confusion.raw]); }
                if (results.length) { seenKeys.add('Results'); this._appendImageRow('Results', [results[0]]); }

                // Remove quaisquer linhas antigas que não apareceram neste ciclo
                this._pruneMissingRows(seenKeys);

                return;
            } catch (e) {
                console.warn('Erro polling imagens de treino (diagnóstico):', e);
            }
        }
    };

    // Expõe no escopo global (window)
    global.TrainingControl = TrainingControl;
})(window);