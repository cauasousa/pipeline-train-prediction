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

        init: function () {
            // Garante que só inicializa se estiver na página de treinamento (os elementos existem)
            if (!document.getElementById('training-page')) return;

            this.startBtn = document.getElementById('start-training-btn');
            this.cancelBtn = document.getElementById('cancel-training-btn');
            this.logsElement = document.getElementById('logs');

            // Remove listeners antigos antes de adicionar novos
            this.startBtn.removeEventListener('click', this._startHandler);
            this.cancelBtn.removeEventListener('click', this._cancelHandler);

            this._startHandler = () => this.startTraining();
            this._cancelHandler = () => this.cancelTraining();

            this.startBtn.addEventListener('click', this._startHandler);
            this.cancelBtn.addEventListener('click', this._cancelHandler);

            // 1. Verificar o estado inicial (caso o usuário atualize a página)
            this.checkInitialStatus();
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
            this.setUIState(true, jobID);

            try {
                const response = await fetch(`${this.API_BASE}/train/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok && data.status === 'training_started_async') {
                    this.setUIState(true, data.job_id);
                    // Force placeholders immediately for the new run (even if we were
                    // already following the same job prefix). This ensures the UI
                    // blanks out old images while new ones are being produced.
                    try { this.startImagePolling(data.job_id, true); } catch (e) { /* ignore */ }
                    // O log inicial foi limpado acima, a mensagem de start já será enviada pelo SSE
                } else {
                    this.logsElement.value += `[ERRO] ${data.message || 'Falha ao iniciar treino'}\n`;
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
                    this.logsElement.value += `[ERRO] Falha ao cancelar: ${data.message || 'Erro desconhecido'}\n`;
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
                }
            };

            this.eventSource.onerror = (err) => {
                console.error("EventSource failed:", err);
                this.logsElement.value += '\n[ERROR] Conexão de log interrompida.\n';
                this.stopLogStream();
            };
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
            if (!force && this._currentJobFollowed === jobId && this._imagePollHandle) return;

            this.stopImagePolling();
            this._shownImages = new Set();
            this._imageElements = {};
            this._currentJobFollowed = jobId || null;
            this._setJobHeader(jobId);
            this._clearImages(); // Limpa as imagens antigas

            // If a training run is active (we just started it) or we're forcing,
            // set the placeholder window so we ignore images older than this time.
            // Otherwise (viewing last completed), don't set placeholder filter.
            if (this.isTrainingActive || force) {
                this._placeholderUntil = Date.now();
            } else {
                this._placeholderUntil = null;
            }

            // create placeholder rows so UI shows empty slots until new images arrive
            try { this._createPlaceholders(); } catch (e) { /* ignore */ }

            // try immediate then schedule
            this._pollImagesOnce(jobId);
            this._imagePollHandle = setInterval(() => this._pollImagesOnce(jobId), 3000);
        },

        _clearImages: function () {
            const container = document.getElementById('training-images');
            if (!container) return;
            const header = document.getElementById('training-images-header');
            // Remove todos os filhos, exceto o cabeçalho (se existir)
            let child = container.firstChild;
            while (child) {
                let nextChild = child.nextSibling;
                if (child.id !== 'training-images-header') {
                    container.removeChild(child);
                }
                child = nextChild;
            }
            this._imageElements = {};
            this._shownImages = new Set();
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

            // A lógica de limpar imagens se o job mudar foi movida para startImagePolling, 
            // mas mantemos o ajuste do texto do cabeçalho.
            header.textContent = `Job: ${jobId || '—'}`;
            this._currentJobFollowed = jobId;
        },

        stopImagePolling: function () {
            if (this._imagePollHandle) {
                clearInterval(this._imagePollHandle);
                this._imagePollHandle = null;
            }
        },

        _appendImageRow: function (labelText, imgs) {
            const container = document.getElementById('training-images');
            if (!container) return;

            // use labelText as key to keep one row per logical group
            const key = String(labelText || 'row');

            // If row already exists, update images
            if (this._imageElements && this._imageElements[key]) {
                const rowObj = this._imageElements[key];
                const grid = rowObj.grid;
                // update existing img elements or append new ones
                for (let i = 0; i < imgs.length; i++) {
                    const src = imgs[i];
                    if (rowObj.imgs[i]) {
                        rowObj.imgs[i].src = src;
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
                return;
            }

            // Create the group using the same structure as prediction view
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
            // Se o sistema estiver ativo, o status ativo sobrescreve a leitura do job ID.
            let currentJobToFollow = jobId;
            try {
                const status = await window.API.safeFetch(`${this.API_BASE}/train/status`);
                if (status && status.is_active && status.job_id) {
                    currentJobToFollow = status.job_id;
                    this.jobID = currentJobToFollow;
                    try { this._setJobHeader(currentJobToFollow); } catch (e) { /* ignore */ }
                }
            } catch (e) {
                // ignore
            }

            if (!currentJobToFollow) return;

            jobId = currentJobToFollow; // Usamos o job ID definitivo para a busca

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
                const thresholdSec = this._placeholderUntil ? Math.floor(this._placeholderUntil / 1000) : 0;
                const trainImgs = [];
                const valMap = {}; // idx -> {label, pred, label_mtime, pred_mtime}
                const confusion = { norm: null, raw: null };
                const results = [];

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
                        this._appendImageRow(it.name, [serveUrl]);
                    }
                }

                if (trainImgs.length) this._appendImageRow('Train batches', trainImgs);
                Object.keys(valMap).sort((a, b) => Number(a) - Number(b)).forEach(idx => {
                    const pair = valMap[idx];
                    // require both label and pred to be present and newer than threshold
                    if (pair.label && pair.pred) {
                        try {
                            const lm = Number(pair.label_mtime || 0);
                            const pm = Number(pair.pred_mtime || 0);
                            if (thresholdSec && (lm < thresholdSec || pm < thresholdSec)) return;
                        } catch (e) { /* ignore */ }
                        this._appendImageRow(`Val batch ${idx}`, [pair.label, pair.pred]);
                    }
                });
                if (confusion.norm && confusion.raw) this._appendImageRow('Confusion matrices', [confusion.norm, confusion.raw]);
                if (results.length) this._appendImageRow('Results', [results[0]]);

                return;
            } catch (e) {
                console.warn('Erro polling imagens de treino (diagnóstico):', e);
            }
        }
    };

    // Expõe no escopo global (window)
    global.TrainingControl = TrainingControl;
})(window);