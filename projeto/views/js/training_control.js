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

            console.log('[TrainingControl] Inicializando na página de treinamento...');

            // Inicializa TrainingResultsManager se necessário
            if (typeof window.initializeTrainingResults === 'function') {
                console.log('[TrainingControl] Chamando factory function initializeTrainingResults()...');
                window.initializeTrainingResults();
            } else {
                console.warn('[TrainingControl] Factory function initializeTrainingResults não disponível');
            }

            // Valida disponibilidade
            if (window.TrainingResultsManager) {
                console.log('[TrainingControl] ✓ TrainingResultsManager está disponível');
            } else {
                console.warn('[TrainingControl] ⚠ TrainingResultsManager ainda não disponível');
            }

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

            // Carrega jobs imediatamente (não depende do manager)
            console.log('[TrainingControl] Carregando lista de jobs...');
            this.refreshJobList();

            // Aguarda disponibilidade do TrainingResultsManager antes de iniciar polling
            this.waitForManager().then(() => {
                console.log('[TrainingControl] Manager disponível, iniciando verificação de status...');
                // 1. Verificar o estado inicial (caso o usuário atualize a página)
                this.checkInitialStatus();
            }).catch((error) => {
                console.error('[TrainingControl] Erro ao aguardar manager:', error);
                // Mesmo com erro, continua (o queue vai tentar sincronizar depois)
                this.checkInitialStatus();
            });
        },

        /**
         * Aguarda TrainingResultsManager ficar disponível
         */
        waitForManager: async function () {
            return new Promise((resolve) => {
                let attempts = 0;
                const maxAttempts = 30; // 30 segundos máximo

                const checkManager = () => {
                    attempts++;

                    if (window.TrainingResultsManager && typeof window.TrainingResultsManager.addImage === 'function') {
                        console.log(`[TrainingControl] ✓ Manager disponível após ${attempts} tentativa(s)`);
                        resolve(true);
                        return;
                    }

                    if (attempts >= maxAttempts) {
                        console.warn(`[TrainingControl] ⚠ Manager não disponível após ${maxAttempts} tentativas, continuando com renderização direta...`);
                        resolve(false); // Resolve com false para indicar que continuamos sem o manager
                        return;
                    }

                    // Tenta novamente em 1 segundo
                    setTimeout(checkManager, 1000);
                };

                // Inicia verificação imediatamente
                checkManager();
            });
        },

        /**
         * Adiciona linha de log no elemento visual e console (quando existir)
         */
        appendLog: function (message) {
            if (!message) return;
            const line = message.endsWith('\n') ? message : `${message}\n`;

            // ✨ EXTRAIR JOB ID DO LOG - busca por "Logging results to ... jobname"
            // Padrão: "Logging results to C:\path\...\treinamento_classificacao9"
            const loggingMatch = line.match(/Logging results to\s+.*[\\\/]([a-zA-Z0-9_-]+)\s*$/);
            if (loggingMatch && loggingMatch[1]) {
                const extractedJobId = loggingMatch[1];
                console.log(`[JOB_EXTRACT] ✓ Job ID extraído do log: ${extractedJobId}`);

                if (this._extractedRealJobId !== extractedJobId) {
                    this._extractedRealJobId = extractedJobId;
                    console.log(`[JOB_EXTRACT] ═══════════════════════════════════════════════`);
                    console.log(`[JOB_EXTRACT] ✓ JOB REAL DETECTADO NO LOG: ${extractedJobId}`);
                    console.log(`[JOB_EXTRACT] Anterior: ${this._currentJobFollowed}`);
                    console.log(`[JOB_EXTRACT] Novo: ${extractedJobId}`);
                    console.log(`[JOB_EXTRACT] ═══════════════════════════════════════════════`);

                    // Se estava usando um job antigo, atualiza agora
                    if (this._currentJobFollowed && this._currentJobFollowed !== extractedJobId) {
                        console.log(`[JOB_EXTRACT] ⚠ MUDANÇA DETECTADA: ${this._currentJobFollowed} → ${extractedJobId}`);
                        console.log(`[JOB_EXTRACT] ✓ Reiniciando polling com job correto...`);
                        // Aguarda um pouco antes de reiniciar para dar tempo do diretório ser criado
                        setTimeout(() => {
                            this.startImagePolling(extractedJobId, true);
                        }, 1500);
                    } else if (!this._currentJobFollowed) {
                        console.log(`[JOB_EXTRACT] ✓ Iniciando polling com job extraído do log...`);
                        this.startImagePolling(extractedJobId, true);
                    }
                }
            }

            // Agora #logs é um DIV (não textarea), então usamos appendChild
            if (this.logsElement) {
                const logDiv = document.createElement('div');
                logDiv.style.marginBottom = '2px';
                logDiv.textContent = line.trimEnd();
                this.logsElement.appendChild(logDiv);
                this.logsElement.scrollTop = this.logsElement.scrollHeight;
            }

            if (window.consoleManager) {
                const clean = line.trim();
                const upper = clean.toUpperCase();
                const level = upper.includes('[ERRO') || upper.includes('[ERROR')
                    ? 'ERROR'
                    : (upper.includes('[WARN') || upper.includes('[AVISO') || upper.includes('⚠'))
                        ? 'WARNING'
                        : (upper.includes('SUCESS') || upper.includes('✓') ? 'SUCCESS' : 'INFO');

                const messageOnly = clean.replace(/^\[[^\]]+\]\s*/, '');

                // Usa log() direto para preservar timestamps/cores
                if (typeof window.consoleManager.log === 'function') {
                    window.consoleManager.log(level, messageOnly);
                } else if (window.consoleManager[level.toLowerCase()]) {
                    window.consoleManager[level.toLowerCase()](messageOnly);
                }
            }
        },

        /**
         * Define o conteúdo completo do log (substitui) e espelha no console visual
         */
        setLog: function (message) {
            const line = message && message.length ? (message.endsWith('\n') ? message : `${message}\n`) : '';
            if (this.logsElement) {
                this.logsElement.innerHTML = ''; // Limpa conteúdo anterior
                if (line) {
                    const logDiv = document.createElement('div');
                    logDiv.textContent = line.trimEnd();
                    this.logsElement.appendChild(logDiv);
                    this.logsElement.scrollTop = this.logsElement.scrollHeight;
                }
            }

            if (window.consoleManager && line) {
                const clean = line.trim();
                const upper = clean.toUpperCase();
                const level = upper.includes('[ERRO') || upper.includes('[ERROR')
                    ? 'ERROR'
                    : (upper.includes('[WARN') || upper.includes('[AVISO') || upper.includes('⚠'))
                        ? 'WARNING'
                        : (upper.includes('SUCESS') || upper.includes('✓') ? 'SUCCESS' : 'INFO');

                const messageOnly = clean.replace(/^\[[^\]]+\]\s*/, '');

                if (typeof window.consoleManager.log === 'function') {
                    window.consoleManager.log(level, messageOnly);
                } else if (window.consoleManager[level.toLowerCase()]) {
                    window.consoleManager[level.toLowerCase()](messageOnly);
                }
            }
        },

        handleJobSelection: function (jobId) {
            // vazio => segue auto (último concluído ou ativo)
            if (!jobId) {
                console.log('[DEBUG] handleJobSelection: modo auto-seguimento ativado');
                this._manualViewActive = false;
                this.checkInitialStatus();
                return;
            }
            console.log('[DEBUG] handleJobSelection: modo visualização manual ativado para job:', jobId);
            this._manualViewActive = true;
            this.appendLog(`[INFO] Exibindo imagens do job: ${jobId}`);
            this.setUIState(false, jobId);
            // IMPORTANTE: Para o polling atual e reinicia com o job selecionado
            this.stopImagePolling();
            this.startImagePolling(jobId);
        },

        setUIState: function (active, jobId = null) {
            this.isTrainingActive = active;
            this.jobID = jobId;

            // Atualiza o indicador de status do terminal
            this.updateTerminalStatusIndicator(active);

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

        /**
         * Atualiza o indicador de status do terminal
         */
        updateTerminalStatusIndicator: function (isRunning) {
            const statusIndicator = document.getElementById('terminal-status');
            if (!statusIndicator) return;

            const statusDot = statusIndicator.querySelector('.status-dot');
            if (!statusDot) return;

            if (isRunning) {
                statusIndicator.classList.remove('waiting');
                statusIndicator.classList.add('running');
                statusDot.classList.remove('waiting');
                statusDot.classList.add('running');
                statusIndicator.innerHTML = '<span class="status-dot running"></span><span>Treinando</span>';
            } else {
                statusIndicator.classList.remove('running');
                statusIndicator.classList.add('waiting');
                statusDot.classList.remove('running');
                statusDot.classList.add('waiting');
                statusIndicator.innerHTML = '<span class="status-dot waiting"></span><span>Aguardando</span>';
            }
        },

        checkInitialStatus: async function () {            // Se está em modo de visualização manual, não altera o job selecionado
            if (this._manualViewActive) {
                console.log('[DEBUG] Em modo de visualização manual, ignorando checkInitialStatus');
                return;
            }
            try {
                const response = await fetch(`${this.API_BASE}/train/status`);
                const data = await response.json();

                if (data.is_active) {
                    this.appendLog(`[INFO] Treinamento ativo detectado: ${data.job_id} (${data.status}). Reconectando ao log...`);
                    this.setUIState(true, data.job_id);
                } else {
                    // SE NENHUM JOB ESTIVER ATIVO, BUSCAR O ÚLTIMO CONCLUÍDO
                    await this.checkLatestCompletedJob();
                    this.setUIState(false);
                }
            } catch (error) {
                console.error('Erro ao verificar status:', error);
                this.appendLog(`[ERRO] Falha ao verificar status: ${error.message}`);
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

                    this.appendLog(`[INFO] Nenhum treino ativo. Exibindo resultados do último treino concluído: ${latestJobId}.`);

                    // Inicia o polling de imagens para o job ID mais recente
                    this.startImagePolling(latestJobId);
                    this._setJobSelectValue(latestJobId);

                } else if (!this._currentJobFollowed) {
                    this.appendLog(`[INFO] Nenhuma execução de treinamento anterior encontrada.`);
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
                this.appendLog(`[ERRO] Função de coleta de payload não encontrada.`);
                return;
            }
            const payload = global.UI.collectTrainingPayload();
            const jobID = payload.exp_name;

            this.setLog(`[INFO] Preparando treinamento... Job ID: ${jobID}`);
            // Validação mínima: dataset obrigatório
            if (!payload.dataset) {
                this.appendLog(`[ERRO] Selecione um dataset antes de iniciar o treinamento.`);
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

                    this.appendLog(`[INFO] Job real criado: ${finalJobId}`);

                    // CRÍTICO: 
                    // - Log stream usa data.job_id (nome do arquivo .log no backend)
                    // - Image polling usa finalJobId (nome real do diretório criado pelo YOLO)
                    // - Job select mostra finalJobId (nome real)
                    this.jobID = finalJobId; // Para exibição e cancelamento
                    // Seguir automaticamente o job ativo -> selector em branco
                    this._manualViewActive = false; // Reset modo manual
                    this._currentJobFollowed = null; // Reset job anterior para forcar limpeza
                    this._setJobSelectValue('');

                    console.log(`[TRAINING] ═════════════════════════════════════════════════`);
                    console.log(`[TRAINING] ✓ NOVO TREINAMENTO INICIADO`);
                    console.log(`[TRAINING] Job ID (para log): ${data.job_id}`);
                    console.log(`[TRAINING] Job ID (para polling): ${finalJobId}`);
                    console.log(`[TRAINING] Modo manual: ${this._manualViewActive}`);
                    console.log(`[TRAINING] ═════════════════════════════════════════════════`);

                    // Inicia log stream com o nome ORIGINAL (arquivo .log)
                    this.startLogStream(data.job_id);

                    // Inicia image polling com o nome REAL (diretório) - force=true para limpeza completa
                    try {
                        this.startImagePolling(finalJobId, true);
                        console.log(`[TRAINING] ✓ Image polling iniciado para: ${finalJobId}`);
                    } catch (e) {
                        console.error('[TRAINING] ✗ Erro ao iniciar polling:', e);
                    }
                    // O log inicial foi limpado acima, a mensagem de start já será enviada pelo SSE
                } else {
                    this.appendLog(`[ERRO] ${data.message || data.detail || 'Falha ao iniciar treino'}`);
                    this.setUIState(false);
                }
            } catch (error) {
                this.appendLog(`[ERRO] Erro de rede/API: ${error.message}`);
                this.setUIState(false);
            }
        },

        cancelTraining: async function () {
            if (!this.isTrainingActive || !this.jobID) return;

            this.cancelBtn.disabled = true;
            this.appendLog(`[INFO] Enviando pedido de cancelamento para ${this.jobID}...`);

            try {
                const response = await fetch(`${this.API_BASE}/train/cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });

                const data = await response.json();

                if (response.ok && data.status === 'cancelled') {
                    this.appendLog(`[INFO] ${data.message}. Aguardando o encerramento do stream...`);
                    // O setUIState(false) será chamado pelo SSE quando o log de cancelamento chegar.
                } else {
                    this.appendLog(`[ERRO] Falha ao cancelar: ${data.message || data.detail || 'Erro desconhecido'}`);
                    this.cancelBtn.disabled = false;
                }
            } catch (error) {
                this.appendLog(`[ERRO] Erro de rede ao tentar cancelar: ${error.message}`);
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
                this.appendLog(newLogChunk.trimEnd());

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
                this.appendLog('[ERROR] Conexão de log interrompida.\n');
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
            const maxAttempts = 10; // Aumentado de 5 para 10
            let lastSeenJob = null;
            let consecutiveMatches = 0;

            console.log(`[FIND_JOB] Buscando job real para prefix: ${jobPrefix}`);

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    const resp = await window.API.safeFetch(`${this.API_BASE}/train/jobs?prefix=${jobPrefix}`);
                    if (!resp || !Array.isArray(resp.jobs) || resp.jobs.length === 0) {
                        console.log(`[FIND_JOB] Tentativa ${attempt + 1}/${maxAttempts}: nenhum job encontrado`);
                        await new Promise(resolve => setTimeout(resolve, 800)); // Aumentado para 800ms
                        continue;
                    }

                    // O primeiro job na lista é o mais recente (a lista vem ordenada por mtime desc)
                    const mostRecentJob = resp.jobs[0];
                    console.log(`[FIND_JOB] Tentativa ${attempt + 1}/${maxAttempts}: jobs encontrados: [${resp.jobs.slice(0, 3).join(', ')}${resp.jobs.length > 3 ? '...' : ''}]`);
                    console.log(`[FIND_JOB] Mais recente: ${mostRecentJob}`);

                    // Se encontramos um job novo (diferente do anterior), marcamos como potencial
                    if (mostRecentJob !== lastSeenJob) {
                        lastSeenJob = mostRecentJob;
                        consecutiveMatches = 1;
                        console.log(`[FIND_JOB] ✓ Novo job detectado: ${mostRecentJob}, aguardando confirmação...`);

                        // Aguarda mais um ciclo para garantir que é realmente o job mais recente
                        if (attempt < maxAttempts - 1) {
                            await new Promise(resolve => setTimeout(resolve, 800));
                        } else {
                            return mostRecentJob; // Último ciclo, retorna
                        }
                    } else {
                        // Mesmo job visto antes - confirma que é estável
                        consecutiveMatches++;
                        console.log(`[FIND_JOB] ✓ Confirmação ${consecutiveMatches}: job ${mostRecentJob} permanece como mais recente`);

                        if (consecutiveMatches >= 2) {
                            console.log(`[FIND_JOB] ✓✓ JOB CONFIRMADO: ${mostRecentJob} (apareceu ${consecutiveMatches}x)`);
                            return mostRecentJob;
                        }
                    }

                    if (attempt < maxAttempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, 800));
                    }
                } catch (e) {
                    console.warn(`[FIND_JOB] ✗ Erro na tentativa ${attempt + 1}:`, e);
                    if (attempt < maxAttempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, 800));
                    }
                }
            }

            console.warn(`[FIND_JOB] ✗ Não conseguiu encontrar um novo job após ${maxAttempts} tentativas`);
            console.warn(`[FIND_JOB] Retornando último job visto: ${lastSeenJob}`);
            return lastSeenJob; // Retorna o último job visto ao invés de null
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
            console.log(`[POLLING] ═══════════════════════════════════════════════`);
            console.log(`[POLLING] startImagePolling(jobId: ${jobId}, force: ${force})`);

            // Se já estamos seguindo este job e não for força, apenas mantém o intervalo
            if (!force && this._currentJobFollowed === jobId && this._imagePollHandle) {
                console.log(`[POLLING] ✓ Já seguindo job ${jobId}, mantendo intervalo`);
                console.log(`[POLLING] ═══════════════════════════════════════════════`);
                return;
            }

            console.log(`[POLLING] ✓ Iniciando polling para job: ${jobId}, force=${force}`);

            // GARANTIR que intervalos anteriores sejam limpos
            this.stopImagePolling();
            console.log(`[POLLING] ✓ Intervalo anterior parado`);

            // LIMPAR CACHE DE IMAGENS PARA FORCAR NOVA RENDERIZAÇÃO
            this._shownImages = new Set();
            this._imageElements = {};
            console.log(`[POLLING] ✓ Cache de imagens limpo (_shownImages, _imageElements)`);

            // Limpar imagens antigas das abas
            console.log(`[POLLING] ✓ Limpando containers das abas...`);
            ['training-images-batches', 'training-images-metrics', 'training-images-evolution'].forEach(id => {
                const container = document.getElementById(id);
                if (container) {
                    console.log(`[POLLING]   - Limpando #${id} (tinha ${container.querySelectorAll('img').length} imagens)`);
                    container.innerHTML = '';
                } else {
                    console.warn(`[POLLING]   ✗ Container #${id} não encontrado!`);
                }
            });

            // Mostrar empty states
            console.log(`[POLLING] ✓ Mostrando empty states...`);
            ['batches-empty', 'metrics-empty', 'evolution-empty'].forEach(id => {
                const emptyState = document.getElementById(id);
                if (emptyState) {
                    emptyState.style.display = 'block';
                    console.log(`[POLLING]   - Mostrado #${id}`);
                } else {
                    console.warn(`[POLLING]   ✗ Empty state #${id} não encontrado!`);
                }
            });

            // Limpar imagens antigas ANTES de resetar as estruturas de dados
            this._clearImages();
            console.log(`[POLLING] ✓ _clearImages() executado`);

            this._currentJobFollowed = jobId || null;
            console.log(`[POLLING] ✓ _currentJobFollowed = ${this._currentJobFollowed}`);

            this._setJobHeader(jobId);

            // Não ajustar janela de placeholders aqui.
            // Em reentradas na página durante um treino ativo, devemos exibir TODAS as imagens já geradas.
            // Mantemos ou limpamos este valor explicitamente em transições de estado.
            this._placeholderUntil = null;

            // try immediate then schedule
            this._pollImagesOnce(jobId);
            console.log(`[POLLING] ✓ Primeira chamada _pollImagesOnce() executada`);

            // IMPORTANTE: Não capturar jobId no closure - usar this._currentJobFollowed
            this._imagePollHandle = setInterval(() => this._pollImagesOnce(this._currentJobFollowed), 3000);
            console.log(`[POLLING] ✓ Intervalo agendado a cada 3s`);
            console.log(`[POLLING] ═══════════════════════════════════════════════`);
        },

        _clearImages: function () {
            // Não precisa mais fazer nada aqui - as abas são gerenciadas pelo TrainingResultsManager
            // Este método mantém compatibilidade com o resto do código
            this._imageElements = {};
            this._shownImages = new Set();
            console.log('[DEBUG] _imageElements e _shownImages resetados (imagens gerenciadas pelo manager)');
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

        async _pollImagesOnce(jobId) {
            // Polling function that fetches images from the backend and appends them to containers
            if (!jobId) {
                console.log('[POLL] _pollImagesOnce chamado sem jobId, ignorando');
                return;
            }

            // Se está em modo de visualização manual, respeita o job selecionado
            if (this._manualViewActive && this._currentJobFollowed && this._currentJobFollowed !== jobId) {
                console.log(`[POLL] Modo manual ativo - ignorando mudança de ${this._currentJobFollowed} para ${jobId}`);
                jobId = this._currentJobFollowed;
            }

            // ✨ VERIFICAÇÃO: Detectar automaticamente se há um novo job criado durante o treinamento
            // (Útil quando YOLO cria novos diretórios com sufixo numérico incremental)
            if (!this._manualViewActive && !this._newJobCheckTimeout) {
                this._newJobCheckTimeout = true;
                try {
                    const resp = await window.API.safeFetch(`${this.API_BASE}/train/jobs?prefix=treinamento_classificacao`);
                    if (resp && Array.isArray(resp.jobs) && resp.jobs.length > 0) {
                        const latestJob = resp.jobs[0]; // Primeiro é o mais recente
                        if (latestJob && latestJob !== jobId) {
                            console.log(`[POLL] ⚠ NOVO JOB DETECTADO: ${jobId} → ${latestJob}`);
                            console.log(`[POLL] 🔄 Alternando para job mais recente...`);
                            this.startImagePolling(latestJob, true);
                            this._newJobCheckTimeout = false;
                            return; // Sai para não processar imagens do job antigo
                        }
                    }
                } catch (e) {
                    console.warn('[POLL] Erro ao verificar novo job:', e);
                } finally {
                    // Reseta timeout após 5 segundos para não sobrecarregar
                    setTimeout(() => { this._newJobCheckTimeout = false; }, 5000);
                }
            }

            console.log(`[POLL] Buscando imagens do job: ${jobId}`);

            try {
                // Busca imagens do endpoint de diagnóstico
                const diagUrl = `${this.API_BASE}/train/images/${encodeURIComponent(jobId)}`;
                const cacheBusterUrl = diagUrl + `?t=${Date.now()}`;
                console.log(`[POLL] URL: ${diagUrl}`);
                const diag = await window.API.safeFetch(cacheBusterUrl);

                if (!(diag && Array.isArray(diag.images) && diag.images.length > 0)) {
                    console.log(`[POLL] ✗ Nenhuma imagem retornada para job: ${jobId}`);
                    return;
                }

                console.log(`[POLL] ✓ Processando ${diag.images.length} imagens do job ${jobId}`);

                // Agrupa as imagens retornadas pelo diagnóstico
                const seenKeys = new Set();
                const trainImgs = [];
                const valMap = {}; // idx -> {label, pred, label_mtime, pred_mtime}
                const confusion = { norm: null, raw: null };
                const results = [];

                for (const it of diag.images) {
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
                    if (pair.label && pair.pred) {
                        const key = `Val batch ${idx}`;
                        seenKeys.add(key);
                        this._appendImageRow(key, [pair.label, pair.pred]);
                    }
                });
                if (confusion.norm && confusion.raw) { seenKeys.add('Confusion matrices'); this._appendImageRow('Confusion matrices', [confusion.norm, confusion.raw]); }
                if (results.length) { seenKeys.add('Results'); this._appendImageRow('Results', [results[0]]); }

            } catch (e) {
                console.warn('Erro polling imagens de treino:', e);
            }
        },

        _appendImageRow: function (labelText, imgs) {
            // Filtra placeholders vazios - não renderizar se todas as imagens forem placeholders
            const hasRealImages = imgs.some(src => src !== this.PLACEHOLDER_SRC);
            if (!hasRealImages) return;

            // Renderiza imagens diretamente nos containers apropriados
            // Determina o tipo de aba baseado no rótulo da imagem
            const label = (labelText || '').toLowerCase();
            let tabType = 'batches'; // padrão

            // 📊 Métricas: Confusion matrices E Val batches (validação)
            if (label.includes('confusion') || label.includes('val')) {
                tabType = 'metrics';
            }
            // 📈 Evolução: Results (gráficos de evolução)
            else if (label.includes('results')) {
                tabType = 'evolution';
            }
            // 🖼️ Batches: Train batches (padrão)
            else {
                tabType = 'batches';
            }

            const containerId = tabType === 'metrics' ? 'training-images-metrics' :
                tabType === 'evolution' ? 'training-images-evolution' :
                    'training-images-batches';
            const emptyStateId = tabType === 'metrics' ? 'metrics-empty' :
                tabType === 'evolution' ? 'evolution-empty' :
                    'batches-empty';

            const container = document.getElementById(containerId);
            const emptyState = document.getElementById(emptyStateId);

            if (!container) {
                console.warn(`[APPEND] ✗ Container ${containerId} não encontrado no DOM`);
                return;
            }

            console.log(`[APPEND] Renderizando "${labelText}" em ${containerId} (${imgs.length} imagens)`);

            // Oculta empty state
            if (emptyState) {
                emptyState.style.display = 'none';
            }

            // Renderiza cada imagem - MAS APENAS SE NÃO JÁ EXISTIR
            let newImagesAdded = 0;
            imgs.forEach((url, idx) => {
                // Verifica se esta URL já existe no container (compara sem query string)
                const urlWithoutQuery = url.split('?')[0];
                const alreadyExists = Array.from(container.querySelectorAll('img')).some(img => {
                    const existingUrlWithoutQuery = img.src.split('?')[0];
                    return existingUrlWithoutQuery === urlWithoutQuery;
                });

                if (alreadyExists) {
                    console.log(`[APPEND]   ✓ URL já existe: ${urlWithoutQuery.substring(urlWithoutQuery.length - 30)}`);
                    return; // Pula para próxima imagem
                }

                const cardId = `img-${Math.random().toString(36).substr(2, 9)}`;
                const timestamp = new Date().toLocaleString('pt-BR');

                const cardHtml = `
                    <div class="image-result-card">
                        <div class="image-result-header">
                            <h4>${labelText}</h4>
                        </div>
                        <div class="image-result-body" id="${cardId}-body">
                            <img src="${url}" alt="${labelText}" loading="lazy" style="max-width: 100%; max-height: 400px; border-radius: 6px; cursor: pointer;" />
                        </div>
                        <div class="image-result-footer">
                            <div><strong>Arquivo:</strong> ${labelText}_${idx}.jpg</div>
                            <div style="font-size: 0.75em; margin-top: 4px;">📅 ${timestamp}</div>
                        </div>
                    </div>
                `;

                container.insertAdjacentHTML('beforeend', cardHtml);
                newImagesAdded++;

                // Adiciona evento de clique para expandir imagem
                const imgEl = container.querySelector(`#${cardId}-body img:last-of-type`);
                if (imgEl && global.UI && typeof global.UI.openImageModal === 'function') {
                    imgEl.addEventListener('click', () => global.UI.openImageModal(url, labelText));
                }
            });

            if (newImagesAdded > 0) {
                console.log(`[DEBUG] ✓ Renderizadas ${newImagesAdded} imagem(ns) em ${containerId}: ${labelText}`);
            }
        },
    };

    // Expõe no escopo global (window)
    global.TrainingControl = TrainingControl;
})(window);