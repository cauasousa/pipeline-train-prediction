(function (global) {
    // Usa módulos existentes ao invés de duplicar
    const ConfigManager = global.ConfigManager;
    const Navigation = global.Navigation;

    // Mapeamento de Linhas por Tipo de Implante (vindo do backend)
    // valor inicial (será substituído por `loadNegativeLineCounts()` durante a inicialização)
    let currentLineCounts = {};

    // --- FUNÇÕES DE UTILIDADE GERAL ---
    /**
     * Busca a estrutura real de linhas e contagens de imagens para a classe negativa
     * no caminho definido no servidor.
     * @returns {Promise<Object>} Um objeto no formato: {"Cone": {"CM-A": 500, ...}, ...}
     */
    async function loadNegativeLineCounts() {
        if (!window.API || typeof window.API.getNegativeLines !== 'function') {
            console.warn('[UI] API de linhas negativas não definida. Usando mock fallback.');
            // Fallback (seu mock original, para desenvolvimento local)
            return {
                "Cone": { "CONEXAO-FLASH": 500, "CONEXAO-A": 450, "CONEXAO-B": 300, "CONEXAO-C": 600 },
                "Hex Externo": { "INTRAOSS-EXTRACT": 800, "EXTRACT-HE-B": 750, "EXTRACT-HE-C": 600 },
                "Hex Interno": { "MEDENS_COLOSSO": 400 }
            };
        }
        try {
            // Chamada à API real
            const data = await window.API.getNegativeLines();
            return data || {};
        } catch (e) {
            console.error("Falha ao carregar contagem de linhas negativas.", e);
            showLog("[ERRO] Falha ao carregar linhas negativas do servidor.");
            return {};
        }
    }

    // Retorna o valor default por linha para um dado `type`.
    // Prioriza o input específico `data-type-count` dentro do painel do tipo,
    // depois um input global `#default-rand-count` (se existir), e por fim 0.
    function getPerLineDefault(type) {
        try {
            if (type) {
                const per = document.querySelector(`input[data-type-count="${type}"]`);
                if (per && per.value !== undefined) return Number(per.value || 0);
            }
        } catch (e) { /* ignore selector errors */ }
        const globalDefault = document.getElementById('default-rand-count');
        return Number(globalDefault?.value || 0);
    }

    function showLog(msg) {
        const area = document.getElementById('logs');
        const t = new Date().toLocaleTimeString();
        // Adiciona ao topo
        if (area) area.value = `[${t}] ${msg}\n` + area.value;
    }

    function updateSelectedSummary() {
        const summaryEl = document.getElementById('selected-summary');
        if (!summaryEl) return;
        // Prefer current DOM state (checked checkboxes) so the summary updates immediately
        let selectedModels = Array.from(document.querySelectorAll('.model-checkbox')).filter(cb => cb.checked).map(cb => cb.value);
        // Fallback to persisted selection if no checkboxes present/checked
        if ((!selectedModels || selectedModels.length === 0)) {
            try { selectedModels = JSON.parse(localStorage.getItem('selected_models') || '[]') || []; } catch (e) { selectedModels = []; }
        }
        const source = document.getElementById('prediction-source')?.value ?? null;
        const folderPath = document.getElementById('prediction-folder-path')?.value ?? null;
        let parts = [];
        parts.push(`<strong>Modelos:</strong> ${selectedModels.length ? selectedModels.join(', ') : 'nenhum'}`);
        if (source) {
            parts.push(`<strong>Fonte:</strong> ${source}`);
            if (['random', 'folder'].includes(source)) parts.push(`<strong>Path:</strong> ${folderPath || '<em>não informado</em>'}`);
        }
        summaryEl.innerHTML = parts.map(p => `<div style="margin-bottom:6px">${p}</div>`).join('');
        if ((selectedModels && selectedModels.length > 0) || source) summaryEl.classList.remove('hidden'); else summaryEl.classList.add('hidden');
    }

    // --- FUNÇÕES DE DADOS NEGATIVOS/RESUMO (TREINAMENTO) ---

    // Função global para alternar a visibilidade das linhas (chamada pelo HTML)
    global.toggleLineSelection = function (button, type) {
        const detailRow = document.querySelector(`.line-detail-row[data-parent="${type}"]`);
        if (!detailRow) return;

        const shouldShow = detailRow.classList.contains('hidden');
        if (shouldShow) {
            const container = detailRow.querySelector('.line-select-panel');
            const randomPanel = detailRow.querySelector('.line-random-panel');

            // Respeita o modo selecionado no painel (random/select). Se for 'select', preenchemos a grid;
            // se for 'random', mantemos a grid oculta e mostramos apenas o painel de quantidade automática.
            const selectedModeEl = detailRow.querySelector('.mode-options-group input[type="radio"]:checked');
            const selectedMode = selectedModeEl ? selectedModeEl.value : 'random';

            if (selectedMode === 'select') {
                if (container) {
                    // Limpa e reconstrói a grid com as linhas disponíveis
                    container.innerHTML = '';
                    const linesForType = currentLineCounts[type] || {};
                    const keys = Object.keys(linesForType);
                    const defaultCount = getPerLineDefault(type);

                    // Verifica se o tipo está marcado para refletir o estado inicial das linhas
                    const typeChecked = document.querySelector(`tr[data-type] input[type="checkbox"][value="${type}"]`)?.checked;
                    for (const lineName of keys) {
                        const maxAvailable = linesForType[lineName];
                        const item = document.createElement('div');
                        item.className = 'line-item';
                        const lineEnabledChecked = typeChecked ? 'checked' : '';
                        const lineValue = typeChecked ? defaultCount : 0;
                        item.innerHTML = `
                            <label style="display:block; font-weight:600">${lineName} <span style='font-weight:400; color:var(--text-muted); font-size:12px'>(até ${maxAvailable})</span></label>
                            <div style="display:flex;gap:8px;align-items:center">
                                <input type="checkbox" class="line-enabled" data-line="${lineName}" data-type="${type}" ${lineEnabledChecked} />
                                <input type="number" data-line="${lineName}" data-type="${type}" class="input input-small line-count" value="${lineValue}" min="0" max="${maxAvailable}">
                            </div>
                        `;
                        container.appendChild(item);
                    }

                    // Reconecta eventos para os novos inputs
                    container.querySelectorAll('.line-count').forEach(inp => inp.addEventListener('input', updateNegativeSummary));
                    container.querySelectorAll('.line-enabled').forEach(cb => cb.addEventListener('change', updateNegativeSummary));

                    // mostra a grid e esconde o painel random
                    try { container.style.display = ''; } catch (e) { /* ignore */ }
                    if (randomPanel) randomPanel.style.display = 'none';

                    // Atualiza o contador disponível no painel, se houver
                    const availableSpan = detailRow.querySelector('.available-lines-count');
                    if (availableSpan) availableSpan.textContent = keys.length;
                }
            } else {
                // modo random: garante que a grid esteja oculta e o painel random visível
                if (container) container.style.display = 'none';
                if (randomPanel) randomPanel.style.display = '';
            }
        } else {
            // Ao ocultar, mantenha o painel com display:none para respeitar o template
            const container = detailRow.querySelector('.line-detail-grid');
            if (container) container.style.display = 'none';
        }

        detailRow.classList.toggle('hidden');
        button.textContent = detailRow.classList.contains('hidden') ? '⚙️ Detalhes' : 'Ocultar';
        updateNegativeSummary();
    };

    function updateNegativeSummary() {
        const table = document.getElementById('negative-selection-table');
        if (!table) return;

        let totalNegatives = 0;
        const defaultCount = getPerLineDefault(null);

        // 1. Itera sobre os tipos de implante (linhas tr principais)
        table.querySelectorAll('tr[data-type]').forEach(typeRow => {
            const type = typeRow.dataset.type;
            const typeCheckbox = typeRow.querySelector(`input[type="checkbox"][value="${type}"]`);
            const detailRow = document.querySelector(`.line-detail-row[data-parent="${type}"]`);

            let linesCount = 0;
            let typeTotal = 0;
            const availableLines = Object.keys(currentLineCounts[type] || {}).length;

            // Determine selected mode for this type: 'random' or 'select'
            const selectedMode = detailRow ? (detailRow.querySelector('.mode-options-group input[type="radio"]:checked')?.value || 'random') : 'random';
            if (typeCheckbox && typeCheckbox.checked) {
                if (selectedMode === 'select' && detailRow && detailRow.querySelector('.line-item')) {
                    // 1) Se há seleção granular (itens .line-item), soma os valores explicitamente
                    detailRow.querySelectorAll('.line-item').forEach(item => {
                        const input = item.querySelector('.line-count');
                        const enabled = item.querySelector('.line-enabled');
                        const lineCount = Number(input?.value || 0);
                        const isEnabled = enabled ? enabled.checked : (lineCount > 0);
                        if (isEnabled && lineCount > 0) {
                            linesCount++;
                            typeTotal += lineCount;
                        }
                    });
                } else {
                    // 2) Random mode OR no granular items: compute using backend counts per line
                    const perLine = getPerLineDefault(type);
                    const countsForType = currentLineCounts[type] || {};
                    const lineNames = Object.keys(countsForType);

                    if (lineNames.length === 0) {
                        // sem linhas conhecidas -> assume 1 linha implícita
                        linesCount = 1;
                        typeTotal = perLine;
                    } else {
                        linesCount = lineNames.length;
                        // soma os valores disponíveis por linha, respeitando o teto `perLine` quando > 0
                        typeTotal = lineNames.reduce((acc, ln) => {
                            const available = Number(countsForType[ln] || 0);
                            if (perLine > 0) return acc + Math.min(perLine, available);
                            return acc + available;
                        }, 0);
                    }
                }
            }

            // 2. Atualiza a linha da tabela
            const totalCountCell = typeRow.querySelector('.total-selected-count');
            const linesCountCell = typeRow.querySelector('.selected-lines-count');

            // Se não está marcado, mostramos quantas linhas existem disponíveis
            if (!typeCheckbox || !typeCheckbox.checked) {
                if (linesCountCell) linesCountCell.textContent = `${availableLines} Linhas`;
                if (totalCountCell) totalCountCell.textContent = `0`;
            } else {
                const modeLabel = selectedMode === 'select' ? 'Selecionar Linhas' : 'Implantes Aleatórios';
                if (linesCountCell) linesCountCell.textContent = `${linesCount} Linhas (${modeLabel})`;
                if (totalCountCell) totalCountCell.textContent = `${typeTotal}`;
            }

            totalNegatives += typeTotal;
        });

        // 3. Atualiza o Resumo Geral
        const totalPositives = Number(document.getElementById('total-positive-count')?.textContent || 0); // Exemplo mock: 1000
        const totalAll = totalPositives + totalNegatives;

        if (document.getElementById('total-negative-count')) document.getElementById('total-negative-count').textContent = totalNegatives;
        if (document.getElementById('total-all')) document.getElementById('total-all').textContent = totalAll;

        // Recalcula os splits separadamente para positivos e negativos e depois soma para o split total
        const posTrainPct = Number(document.getElementById('train-percent')?.value || 0);
        const posValPct = Number(document.getElementById('val-percent')?.value || 0);
        const posTestPct = Number(document.getElementById('test-percent')?.value || 0);

        const negTrainPct = Number(document.getElementById('rand-train-percent')?.value || 0);
        const negValPct = Number(document.getElementById('rand-val-percent')?.value || 0);
        const negTestPct = Number(document.getElementById('rand-test-percent')?.value || 0);

        // Totais separados
        const posTotal = Number(document.getElementById('total-positive-count')?.textContent || 0);
        const negTotal = totalNegatives;

        // Calcula splits para positivos (usa subtração no último para preservar soma)
        const posTrain = Math.round((posTotal * posTrainPct) / 100);
        const posVal = Math.round((posTotal * posValPct) / 100);
        const posTest = posTotal - posTrain - posVal;

        // Atualiza a divisão específica dos POSITIVOS no resumo (novo elemento)
        if (document.getElementById('positive-split')) document.getElementById('positive-split').textContent = `${posTrain} / ${posVal} / ${posTest}`;



        // Atualiza a divisão específica dos POSITIVOS no resumo (novo elemento)
        if (document.getElementById('positive-split')) document.getElementById('positive-split').textContent = `${posTrain} / ${posVal} / ${posTest}`;
        // Calcula splits para negativos
        const negTrain = Math.round((negTotal * negTrainPct) / 100);
        const negVal = Math.round((negTotal * negValPct) / 100);
        const negTest = negTotal - negTrain - negVal;

        // Soma para obter o split total final
        const totalTrain = posTrain + negTrain;
        const totalVal = posVal + negVal;
        const totalTest = posTest + negTest;

        if (document.getElementById('total-split')) document.getElementById('total-split').textContent = `${totalTrain} / ${totalVal} / ${totalTest}`;

        // Atualiza a divisão específica dos NEGATIVOS no resumo
        if (document.getElementById('negative-split')) document.getElementById('negative-split').textContent = `${negTrain} / ${negVal} / ${negTest}`;
    }

    /**
     * Garante que o somatório dos três percentuais informados por um grupo
     * (ids) não ultrapasse 100%. Se ultrapassar, reduz o valor do elemento
     * que disparou o evento (`changedEl`) pelo excesso.
     * ids: array de ids de elementos (strings)
     * changedEl: o elemento HTML que foi alterado (event.target)
     */
    function enforceSplitSum(ids, changedEl) {
        try {
            const els = ids.map(id => document.getElementById(id)).filter(Boolean);
            if (els.length === 0 || !changedEl) return;
            const vals = els.map(e => {
                const v = Number(e.value);
                return Number.isFinite(v) ? v : 0;
            });
            const total = vals.reduce((a, b) => a + b, 0);
            if (total <= 100) return;
            const excess = total - 100;
            const cur = Number(changedEl.value) || 0;
            const newVal = Math.max(0, Math.round(cur - excess));
            // Aplica o novo valor e registra um log curto para ajudar debug
            changedEl.value = newVal;
            showLog(`[UI] Ajuste automático: soma de ${ids.join(', ')} excedeu 100%. Ajustado ${changedEl.id} → ${newVal}%`);
        } catch (e) {
            console.warn('enforceSplitSum falhou', e);
        }
    }

    function handleTypeCheckboxChange(cb) {
        if (!cb) return;
        const tr = cb.closest('tr[data-type]');
        if (!tr) return;
        const type = tr.dataset.type;
        const detailRow = document.querySelector(`.line-detail-row[data-parent="${type}"]`);
        const defaultCount = getPerLineDefault(type);

        // Se houver área de detalhes, garanta que as linhas estão presentes e atualiza seus estados
        if (detailRow) {
            const container = detailRow.querySelector('.line-detail-grid');
            // NÃO abrir automaticamente o painel de detalhes ao marcar o tipo.
            // Apenas atualiza os itens já presentes (se houver) para refletir o estado do tipo.
            // Agora as linhas estão lá (ou o detailRow não existe), então atualiza os valores
            detailRow.querySelectorAll('.line-item').forEach(item => {
                const ip = item.querySelector('.line-count');
                const cbx = item.querySelector('.line-enabled');
                if (cbx) cbx.checked = cb.checked;
                // Só restaura para defaultCount se o tipo for marcado E o valor atual for 0
                if (ip && Number(ip.value) === 0 && cb.checked) ip.value = defaultCount;
                if (ip && !cb.checked) ip.value = 0; // Se desmarcado, zera a contagem
            });
        }
        // Atualiza o estilo do botão de detalhes para indicar seleção
        const btn = tr.querySelector('button');
        if (btn) {
            if (cb.checked) btn.classList.add('btn-primary'); else btn.classList.remove('btn-primary');
        }

        // Se o usuário marcar o tipo, abra automaticamente o painel de detalhes.
        // Se desmarcar, feche o painel de detalhes caso esteja aberto.
        if (detailRow) {
            const isHidden = detailRow.classList.contains('hidden');
            const opener = (global.UI && typeof global.UI.toggleLineSelection === 'function') ? global.UI.toggleLineSelection : global.toggleLineSelection;
            if (cb.checked && isHidden) {
                // abre
                if (btn) opener(btn, type);
            } else if (!cb.checked && !isHidden) {
                // fecha
                if (btn) opener(btn, type);
            }
        }
        // Atualiza o resumo após a mudança
        updateNegativeSummary();
    }

    /**
     * Alterna o modo de seleção de negativos para um tipo.
     * 'random' => mostra o painel de quantidade por linha (automático)
     * 'select' => mostra a grid de linhas para seleção individual (apenas neste modo)
     */
    function setNegativeSelectionMode(type, mode) {
        if (!type) return;
        const detailRow = document.querySelector(`.line-detail-row[data-parent="${type}"]`);
        if (!detailRow) return;
        const randomPanel = detailRow.querySelector('.line-random-panel');
        const selectGrid = detailRow.querySelector('.line-detail-grid');

        // ensure we know whether the type is checked
        const typeCheckbox = document.querySelector(`tr[data-type] input[type="checkbox"][value="${type}"]`);
        const checkedByType = Boolean(typeCheckbox?.checked);

        if (mode === 'select') {
            // mark the type as selected so it contributes to the summary
            if (typeCheckbox && !typeCheckbox.checked) {
                try { typeCheckbox.checked = true; } catch (e) { /* ignore */ }
            }
            // update button visual
            const tr = document.querySelector(`tr[data-type="${type}"]`);
            const btn = tr?.querySelector('button');
            if (btn) btn.classList.add('btn-primary');

            if (randomPanel) randomPanel.style.display = 'none';
            if (selectGrid) {
                // populate the grid using the classes expected by updateNegativeSummary
                selectGrid.style.display = '';
                selectGrid.innerHTML = '';
                const counts = currentLineCounts[type] || {};
                const defaultCount = getPerLineDefault(type);
                Object.keys(counts).forEach(lineName => {
                    const available = counts[lineName] || 0;
                    const item = document.createElement('div');
                    item.className = 'line-item';
                    item.innerHTML = `
                        <label style="display:block; font-weight:600">${lineName} <span style='font-weight:400; color:var(--text-muted); font-size:12px'>(até ${available})</span></label>
                        <div style="display:flex;gap:8px;align-items:center">
                            <input type="checkbox" class="line-enabled" data-line="${lineName}" data-type="${type}" ${checkedByType ? 'checked' : ''} />
                            <input type="number" data-line="${lineName}" data-type="${type}" class="input input-small line-count" value="${checkedByType ? Math.min(available, defaultCount) : 0}" min="0" max="${available}">
                        </div>
                    `;
                    selectGrid.appendChild(item);
                });
                // listeners
                selectGrid.querySelectorAll('.line-count').forEach(inp => inp.addEventListener('input', updateNegativeSummary));
                selectGrid.querySelectorAll('.line-enabled').forEach(cb => cb.addEventListener('change', updateNegativeSummary));

                // make sure detail row visible and hide random panel
                if (detailRow.classList.contains('hidden')) detailRow.classList.remove('hidden');
                // update the opener button text so the UI reflects the visible state
                const tr = document.querySelector(`tr[data-type="${type}"]`);
                const btn = tr?.querySelector('button');
                if (btn) btn.textContent = 'Ocultar';
                // ensure the radio in the DOM is checked for this mode
                const radio = detailRow.querySelector(`.mode-options-group input[type=radio][value="select"]`);
                if (radio) try { radio.checked = true; } catch (e) { /* ignore */ }
                if (randomPanel) randomPanel.style.display = 'none';
            }
        } else {
            // random mode -> hide grid, show random panel
            if (selectGrid) {
                selectGrid.style.display = 'none';
                // update opener button text to reflect panel visible state if detailRow is visible
                const tr = document.querySelector(`tr[data-type="${type}"]`);
                const btn = tr?.querySelector('button');
                if (btn && !detailRow.classList.contains('hidden')) btn.textContent = 'Ocultar';
            }
            if (randomPanel) randomPanel.style.display = '';
            // ensure radio state
            const radioR = detailRow.querySelector(`.mode-options-group input[type=radio][value="random"]`);
            if (radioR) try { radioR.checked = true; } catch (e) { /* ignore */ }
        }
        updateNegativeSummary();
    }


    // --- COLEÇÃO DO PAYLOAD DE TREINAMENTO (CORRIGIDA) ---

    function collectTrainingPayload() {
        const dataset = document.getElementById('dataset-select')?.value ?? '';
        const trainPercent = Number(document.getElementById('train-percent')?.value ?? 70);
        const valPercent = Number(document.getElementById('val-percent')?.value ?? 20);
        const testPercent = Number(document.getElementById('test-percent')?.value ?? 10);

        // NOVO: Quantidades de Negativos por LINHA (Formato aninhado {type: {line: count}})
        const negativeLinesSelection = {};
        const table = document.getElementById('negative-selection-table');

        if (table) {
            table.querySelectorAll('tr[data-type]').forEach(typeRow => {
                const type = typeRow.dataset.type;
                const typeCheckbox = typeRow.querySelector(`input[type="checkbox"][value="${type}"]`);
                const detailRow = document.querySelector(`.line-detail-row[data-parent="${type}"]`);

                if (typeCheckbox && typeCheckbox.checked) {
                    negativeLinesSelection[type] = {};
                    let hasLines = false;

                    if (detailRow && detailRow.querySelector('.line-item')) {
                        detailRow.querySelectorAll('.line-item').forEach(item => {
                            const input = item.querySelector('.line-count');
                            const cb = item.querySelector('.line-enabled');
                            const line = input?.dataset.line || cb?.dataset.line;
                            const count = Number(input?.value || 0);
                            const enabled = cb ? cb.checked : (count > 0);
                            if (enabled && count > 0 && line) {
                                negativeLinesSelection[type][line] = count;
                                hasLines = true;
                            }
                        });
                    }

                    if (!hasLines) {
                        negativeLinesSelection[type]["default_line"] = getPerLineDefault(type);
                    }
                }
            });
        }

        // Variáveis de split negativo (Mantidas)
        const randTrain = Number(document.getElementById('rand-train-percent')?.value ?? 70);
        const randVal = Number(document.getElementById('rand-val-percent')?.value ?? 20);
        const randTest = Number(document.getElementById('rand-test-percent')?.value ?? 10);
        const preprocessingTypes = Array.from(document.querySelectorAll('#tipo-checkboxes-preprocessing input[type="checkbox"]:checked')).map(i => i.value);

        // 2. Leitura da Configuração de Treino (Full Config)
        let fullConfig = ConfigManager.loadConfig(); // Começa com o valor salvo
        const inlineTa = document.getElementById('config-json-inline');
        // Se o editor inline estiver aberto, prioriza o seu valor (mesmo que não salvo)
        if (inlineTa && inlineTa.parentNode) {
            try {
                fullConfig = JSON.parse(inlineTa.value);
            } catch (e) { /* ignore */ }
        }

        // 3. Montagem do Payload
        const payload = {
            dataset: dataset,
            exp_name: fullConfig.name || `exp-${Date.now()}`,
            dataset_config: {
                train_percent: trainPercent,
                val_percent: valPercent,
                test_percent: testPercent,
                types_to_include: negativeLinesSelection, // <<< ENVIAMOS O MAPA ESTRUTURADO AQUI
                random_split: { train: randTrain, val: randVal, test: randTest },
                preprocessing: preprocessingTypes
            },
            full_config: fullConfig
        };

        return payload;
    }


    // --- RUN PREDICTION (OMITIDO, MAS CORRIGIDO ONDE NECESSÁRIO) ---

    async function runPrediction() {
        // ... (seu código runPrediction, com a lógica de renderização por comparação) ...
        let selected = [];
        try {
            const checked = Array.from(document.querySelectorAll('.model-checkbox')).filter(cb => cb.checked).map(cb => cb.value);
            console.log('[DEBUG] Checkboxes encontrados:', checked);
            if (checked && checked.length > 0) {
                selected = checked;
            } else {
                selected = JSON.parse(localStorage.getItem('selected_models') || '[]') || [];
                console.log('[DEBUG] Usando localStorage:', selected);
            }
        } catch (e) {
            console.error('[DEBUG] Erro ao ler checkboxes:', e);
            try { selected = JSON.parse(localStorage.getItem('selected_models') || '[]') || []; } catch (e2) { selected = []; }
        }

        console.log('[DEBUG] Modelos selecionados finais:', selected, 'tipo:', typeof selected, 'length:', selected?.length);

        if (!selected || selected.length === 0) {
            alert('Nenhum modelo selecionado. Selecione pelo menos um modelo antes de executar a predição.');
            const container = document.getElementById('models-container');
            if (container) container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showLog('Nenhum modelo selecionado');
            return;
        }

        const source = document.getElementById('prediction-source')?.value ?? 'val';
        let folderPath = null;
        if (['random', 'folder'].includes(source)) {
            folderPath = document.getElementById('prediction-folder-path')?.value?.trim() || null;
            if (source === 'random' && !folderPath) {
                showLog('Informe o caminho da pasta');
                document.getElementById('prediction-folder-path')?.focus();
                return;
            }
        }

        showLog(`Enviando predição para: ${selected.join(', ')}`);
        const payload = { models: selected, options: {} };
        if (folderPath) payload.options.path = folderPath;

        console.log('[DEBUG] Payload enviado:', JSON.stringify(payload, null, 2));

        const runBtn = document.getElementById('run-prediction-btn');
        if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳ Executando...'; }

        // Supondo que window.API.postPredict existe e retorna { results_summary: { modelName: { images: [...] } } }
        // Se a API não estiver disponível (mock), o código de fallback window.Finder.findImagesForModel(model) será executado
        let res = await window.API.postPredict(payload).catch(e => {
            console.error('API de predição falhou', e);
            showLog('Erro: API de predição não respondeu ou retornou erro. Veja console/network para detalhes.');
            return null;
        });

        if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶️ Executar Predição'; }
        if (!res) return;

        const container = document.getElementById('prediction-results');
        if (!container) return;
        container.innerHTML = '';

        const imagesToCompare = {}; // Declarar FORA do try-catch para evitar erro de escopo
        try {
            // Chave: nome_do_arquivo.ext

            for (const model of selected) {
                let modelImages = [];
                if (res?.results_summary?.[model]?.images) {
                    modelImages = res.results_summary[model].images;
                } else {
                    // Fallback para o Finder se a API falhar ou não retornar a estrutura esperada
                    modelImages = await window.Finder.findImagesForModel(model).catch(() => []);
                }

                modelImages.forEach(imageUrl => {
                    const imageKey = imageUrl.split('/').pop();
                    if (!imagesToCompare[imageKey]) {
                        imagesToCompare[imageKey] = { models: [] };
                    }
                    imagesToCompare[imageKey].models.push({
                        name: model,
                        url: imageUrl,
                    });
                });
            }

            const imageKeys = Object.keys(imagesToCompare);

            if (imageKeys.length === 0) {
                container.innerHTML = `<div class="card">Nenhuma imagem de confusão encontrada para os modelos selecionados.</div>`;
                return;
            }

            for (const imageKey of imageKeys) {
                const imageGroup = imagesToCompare[imageKey];
                const groupDiv = document.createElement('div');
                groupDiv.className = 'model-result image-comparison-group card';

                groupDiv.innerHTML = `<h4 style="margin-bottom:10px;font-weight:700">🖼️ Comparação da Imagem: ${imageKey}</h4>`;

                const comparisonGrid = document.createElement('div');
                comparisonGrid.className = 'comparison-grid' + (imageGroup.models.length > 2 ? ' comparison-grid-cols-3' : ' comparison-grid-cols-2');

                for (const prediction of imageGroup.models) {
                    const modelCard = document.createElement('div');
                    modelCard.className = 'comparison-card';

                    modelCard.innerHTML = `
                        <div class="model-name-label">Modelo: <strong>${prediction.name}</strong></div>
                        <div class="card image-card">
                            <img src="${prediction.url}" alt="Predição de ${prediction.name} para ${imageKey}" 
                                onclick="UI.openImageModal(this.src, this.alt)"/>
                        </div>
                    `;
                    comparisonGrid.appendChild(modelCard);
                }

                groupDiv.appendChild(comparisonGrid);
                container.appendChild(groupDiv);
            }

        } catch (e) {
            console.error('Error rendering prediction results', e);
            showLog('Erro ao renderizar resultados. Veja console/debug output.');
        }

        showLog(`Predição concluída. Imagens comparadas: ${Object.keys(imagesToCompare).length}.`);
    }

    // --- FUNÇÕES DE STREAMING/LOG ---

    function streamTrainingLogs(jobId) {
        const area = document.getElementById('logs');
        if (!area) return;

        area.value = `[INFO] Conectando ao log de job ${jobId}...\n`;
        area.scrollTop = area.scrollHeight;

        const source = new EventSource(`${window.API.API_BASE}/train/logs/${jobId}`);

        source.onmessage = function (event) {
            const data = event.data;
            area.value = `[${new Date().toLocaleTimeString()}] ${data}\n` + area.value;

            if (data.includes("TREINAMENTO_COMPLETO") || data.includes("ERRO_TREINAMENTO")) {
                showLog(`Treinamento concluído/erro para Job ID: ${jobId}`);
                source.close();
            }
        };

        source.onerror = function (e) {
            if (source.readyState === 0) {
                showLog(`[ERROR] Conexão de log falhou ou foi fechada pelo servidor. Job ID: ${jobId}`);
            } else {
                showLog(`[ERROR] Erro de stream de log. Fechando conexão. Job ID: ${jobId}`);
            }
            source.close();
        };
    }

    // --- FUNÇÕES DE MODAL DE IMAGEM ---

    // Modal image navigation state
    let _modalImages = [];
    let _modalIndex = -1;

    function _normalizeSrc(s) {
        try { return (s || '').split('?')[0]; } catch (e) { return s; }
    }

    function _collectModalImages() {
        // collect all visible images inside image-card containers (prediction + training)
        const els = Array.from(document.querySelectorAll('.image-card img'));
        return els.map(el => ({ src: el.src, alt: el.alt || el.getAttribute('data-caption') || '' }));
    }

    function _showModalAt(index) {
        const modal = document.getElementById('img-modal');
        const img = document.getElementById('img-modal-img');
        const caption = document.getElementById('img-modal-caption');
        if (!modal || !img) return;
        if (!_modalImages || !_modalImages.length) return;
        _modalIndex = (index + _modalImages.length) % _modalImages.length;
        const item = _modalImages[_modalIndex];
        img.src = item.src;
        img.alt = item.alt || '';
        if (caption) caption.textContent = item.alt || '';
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        // focus close so keyboard users can hit ESC easily
        document.getElementById('img-modal-close')?.focus();
    }

    function openImageModal(src, alt) {
        // build list of images and find index of the clicked one
        _modalImages = _collectModalImages();
        let idx = _modalImages.findIndex(i => _normalizeSrc(i.src) === _normalizeSrc(src));
        if (idx === -1) {
            // fallback: append the clicked image at the end
            _modalImages.push({ src: src, alt: alt || '' });
            idx = _modalImages.length - 1;
        }
        _showModalAt(idx);
    }

    function closeImageModal() {
        const modal = document.getElementById('img-modal');
        const img = document.getElementById('img-modal-img');
        if (!modal || !img) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        img.src = '';
        img.alt = '';
        _modalImages = [];
        _modalIndex = -1;
    }

    function modalNext() { if (_modalImages && _modalImages.length) _showModalAt(_modalIndex + 1); }
    function modalPrev() { if (_modalImages && _modalImages.length) _showModalAt(_modalIndex - 1); }

    // Event Listeners Globais para o Modal
    document.addEventListener('click', (e) => {
        const imgEl = e.target.closest && e.target.closest('.comparison-card img');
        if (imgEl) {
            e.preventDefault();
            // A chamada correta é via o objeto exposto UI (ou direto no elemento HTML)
            openImageModal(imgEl.src || imgEl.getAttribute('data-src'), imgEl.alt || imgEl.getAttribute('data-caption') || '');
        }
    });

    document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest && e.target.closest('#img-modal-close');
        const backdrop = e.target.closest && e.target.closest('#img-modal-backdrop');
        const prevBtn = e.target.closest && e.target.closest('#img-modal-prev');
        const nextBtn = e.target.closest && e.target.closest('#img-modal-next');
        if (closeBtn || backdrop) {
            closeImageModal();
        } else if (prevBtn) {
            modalPrev();
        } else if (nextBtn) {
            modalNext();
        }
    });

    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('img-modal');
        const isVisible = modal && !modal.classList.contains('hidden');
        if (!isVisible) return;
        if (e.key === 'Escape') closeImageModal();
        if (e.key === 'ArrowLeft') modalPrev();
        if (e.key === 'ArrowRight') modalNext();
    });


    // --- BINDING DE HANDLERS ESPECÍFICOS POR PÁGINA (CORRIGIDO) ---

    function bindPageHandlers(page) {
        if (page === 'treinamento') {
            // --- Configuração YOLO ---
            const currentCfg = ConfigManager.loadConfig();
            ConfigManager.renderConfigPreview(currentCfg);

            // ... (Lógica do editBtn/saveInline/cancelInline omitida para brevidade, mas deve ser mantida) ...
            const editBtn = document.getElementById('edit-config-btn');
            const saveBtn = document.getElementById('save-config-btn');
            const cancelBtn = document.getElementById('cancel-config-btn');
            const resetBtn = document.getElementById('reset-config-btn');
            const configPreview = document.getElementById('config-preview');
            const configEditorWrap = document.getElementById('config-editor');
            const configTextarea = document.getElementById('config-json');
            const configError = document.getElementById('config-error');

            // Simplificação da lógica de edição/salvamento do JSON:
            function cleanupInlineEditor() {
                const ta = document.getElementById('config-json-inline');
                if (ta) ta.remove();
                const wrap = document.getElementById('config-inline-buttons');
                if (wrap) wrap.remove();
                const dl = document.getElementById('config-inline-download');
                if (dl) dl.remove();
                if (configPreview) configPreview.style.display = '';
            }

            const saveInline = async () => {
                const inlineTa = document.getElementById('config-json-inline');
                if (!inlineTa) return;
                const txt = inlineTa.value;
                try {
                    const parsed = JSON.parse(txt);
                    if (typeof parsed !== 'object' || parsed === null) throw new Error('Config must be a JSON object');
                    // Salva (com fallback para sessionStorage)
                    const ok = ConfigManager.saveConfig(parsed);
                    if (!ok) throw new Error('Falha ao salvar a configuração no armazenamento persistente.');

                    // persist in-memory and update preview
                    Object.assign(currentCfg, parsed);
                    ConfigManager.renderConfigPreview(currentCfg);
                    showLog('Configuração atualizada e salva localmente.');
                    cleanupInlineEditor();
                } catch (e) {
                    configError.textContent = `Erro: ${e.message || e}`;
                    configError.classList.remove('hidden');
                }
            };
            const cancelInline = () => {
                cleanupInlineEditor();
                if (configError) configError.classList.add('hidden');
            };

            editBtn?.addEventListener('click', () => {
                if (!configPreview) return;
                if (configError) configError.classList.add('hidden');
                let inlineTa = document.getElementById('config-json-inline');
                if (inlineTa) { inlineTa.focus(); return; }

                const orig = JSON.stringify(currentCfg, null, 2);
                configPreview.style.display = 'none';
                inlineTa = document.createElement('textarea');
                inlineTa.id = 'config-json-inline';
                inlineTa.className = 'config-textarea';
                // Styles inline para o editor
                inlineTa.style.cssText = 'width:100%;min-height:220px;background:#1e1e2a;color:#e6eef8;border:1px solid #333;padding:12px;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,"Roboto Mono","Courier New",monospace;font-size:13px;';
                inlineTa.value = orig;
                configPreview.parentNode.insertBefore(inlineTa, configPreview.nextSibling);

                // Botões inline
                let btnWrap = document.getElementById('config-inline-buttons');
                if (!btnWrap) {
                    btnWrap = document.createElement('div');
                    btnWrap.id = 'config-inline-buttons';
                    btnWrap.style.cssText = 'margin-top:8px;display:flex;align-items:center';
                    btnWrap.innerHTML = '<button id="config-save-inline" class="btn btn-success" style="margin-right:8px">Salvar</button> <button id="config-cancel-inline" class="btn">Cancelar</button> <span id="config-inline-download" style="margin-left:8px"></span>';
                    configPreview.parentNode.insertBefore(btnWrap, inlineTa.nextSibling);
                }

                document.getElementById('config-save-inline')?.addEventListener('click', saveInline);
                document.getElementById('config-cancel-inline')?.addEventListener('click', cancelInline);
                inlineTa.focus();
            });

            // Lógica para o botão 'Restaurar'
            resetBtn?.addEventListener('click', () => {
                const base = ConfigManager.getDefaults();
                ConfigManager.saveConfig(base);
                Object.assign(currentCfg, base); // Atualiza a referência in-memory
                ConfigManager.renderConfigPreview(base);
                showLog('Configuração restaurada para o padrão.');
                cleanupInlineEditor(); // Limpa se o editor inline estiver aberto
            });

            // --- Dataset/Upload ---
            async function loadDatasetsIntoSelect() {
                const sel = document.getElementById('dataset-select');
                if (!sel) return;
                sel.innerHTML = '<option>Carregando...</option>';
                try {
                    // Carrega via API e loga base/resultado para depuração
                    console.debug('[UI] API_BASE =', window.API?.API_BASE);
                    let datasets = window.API?.getDatasets ? await window.API.getDatasets() : [];
                    // Fallback: tenta portas comuns se nada veio
                    if (!datasets || datasets.length === 0) {
                        const tries = [
                            `${window.location.origin}/train/datasets`,
                            'http://localhost:8000/train/datasets',
                            'http://localhost:5000/train/datasets'
                        ];
                        for (const url of tries) {
                            try {
                                const resp = await fetch(url);
                                if (!resp.ok) continue;
                                const data = await resp.json();
                                if (Array.isArray(data.datasets) && data.datasets.length) {
                                    datasets = data.datasets;
                                    break;
                                }
                            } catch (e) { /* ignore and try next */ }
                        }
                    }
                    console.debug('[UI] datasets carregados =', datasets);
                    if (!datasets || datasets.length === 0) {
                        sel.innerHTML = '<option value="">Nenhum dataset encontrado</option>';
                        return;
                    }
                    const prev = sel.value;
                    sel.innerHTML = datasets.map(d => `<option value="${d}">${d}</option>`).join('');
                    if (prev) { try { sel.value = prev; } catch (e) { /* ignore */ } }
                    // Atualiza a contagem após recarregar opções
                    try { await updatePositiveCountForSelected(); } catch (e) { /* ignore */ }
                } catch (e) {
                    sel.innerHTML = '<option value="">Erro ao carregar datasets</option>';
                }
            }

            // Atualiza o contador de imagens positivas quando o dataset selecionado muda
            async function updatePositiveCountForSelected() {
                try {
                    const sel = document.getElementById('dataset-select');
                    if (!sel) return;
                    const selected = sel.value;
                    const el = document.getElementById('total-positive-count');
                    if (!selected) {
                        if (el) el.textContent = '0';
                        return;
                    }

                    // visual feedback enquanto busca
                    if (el) el.textContent = '...';
                    showLog(`[UI] Solicitando contagem para dataset '${selected}'`);

                    // Tenta API específica, se disponível
                    if (window.API && typeof window.API.getDatasetInfo === 'function') {
                        const info = await window.API.getDatasetInfo(selected).catch(() => null);
                        if (info && (typeof info.count === 'number' || info.images)) {
                            const count = info.count ?? (Array.isArray(info.images) ? info.images.length : 0);
                            if (el) el.textContent = String(count);
                            showLog(`[UI] Contagem obtida via API: ${count}`);
                            try { updateNegativeSummary(); } catch (e) { /* ignore */ }
                            return;
                        }
                        // Se info for null ou inesperado, registrar para debug
                        showLog(`[UI] API.getDatasetInfo retornou vazio/indefinido para '${selected}'`);
                    }

                    // Fallback direto: fetch na rota /train/dataset-info/.. para inspecionar resposta
                    try {
                        const directUrl = (window.API && window.API.API_BASE ? window.API.API_BASE : window.location.origin) + '/train/dataset-info/' + encodeURIComponent(selected);
                        showLog(`[UI] Tentando fetch direto em: ${directUrl}`);
                        const resp = await fetch(directUrl, { method: 'GET' });
                        const text = await resp.text().catch(() => null);
                        showLog(`[UI] Resposta direta status=${resp.status}` + (text ? ` body=${text.substring(0, 800)}` : ''));
                        if (resp.ok) {
                            try {
                                const parsed = JSON.parse(text || '{}');
                                if (parsed && typeof parsed.count === 'number') {
                                    if (el) el.textContent = String(parsed.count);
                                    try { updateNegativeSummary(); } catch (e) { /* ignore */ }
                                    return;
                                }
                            } catch (e) {
                                // continuar para fallback
                            }
                        }
                    } catch (e) {
                        console.warn('fetch direto dataset-info falhou', e);
                    }

                    // Tentativa alternativa: reconsultar getDatasets e procurar um objeto com contagem
                    if (window.API && typeof window.API.getDatasets === 'function') {
                        const all = await window.API.getDatasets().catch(() => null);
                        if (Array.isArray(all)) {
                            // Pode ser array de strings ou array de objetos
                            const asObj = all.find(a => (typeof a === 'object' && (a.name === selected || a.dataset === selected)));
                            if (asObj && (asObj.count || asObj.images)) {
                                const count = asObj.count ?? (Array.isArray(asObj.images) ? asObj.images.length : 0);
                                if (el) el.textContent = String(count);
                                try { updateNegativeSummary(); } catch (e) { /* ignore */ }
                                return;
                            }
                        }
                    }

                    // Fallback: mantém o mock existente (1000) para que o resumo reflita algo
                    if (el) {
                        el.textContent = '1000';
                        showLog(`[UI] Dataset selecionado: '${selected}'. Contagem real não disponível via API; usando fallback mock 1000.`);
                        try { updateNegativeSummary(); } catch (e) { /* ignore */ }
                    }
                } catch (e) {
                    console.warn('updatePositiveCountForSelected falhou', e);
                    try { updateNegativeSummary(); } catch (e2) { /* ignore */ }
                }
            }

            // Folder upload: (mantido original, depende de window.API.API_BASE)
            document.getElementById('upload-dataset-btn')?.addEventListener('click', async () => {
                // Implementação: abre um seletor de pasta local (webkitdirectory) e conta imagens
                try {
                    let fileInput = document.getElementById('upload-dataset-input');
                    if (!fileInput) {
                        fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.id = 'upload-dataset-input';
                        // Chrome/Edge suportam webkitdirectory; Firefox ignora e abre seletor de arquivo
                        fileInput.setAttribute('webkitdirectory', '');
                        fileInput.setAttribute('directory', '');
                        fileInput.multiple = true;
                        fileInput.accept = 'image/*';
                        fileInput.style.display = 'none';

                        fileInput.addEventListener('change', async (ev) => {
                            const files = Array.from(ev.target.files || []);
                            if (files.length === 0) {
                                showLog('[UI] Nenhum arquivo selecionado no upload de pasta.');
                                return;
                            }

                            // Filtra imagens por MIME-type (quando disponível) ou extensão
                            const imageFiles = files.filter(f => {
                                if (f.type && f.type.startsWith('image/')) return true;
                                return /\.(jpe?g|png|bmp|gif|tiff|webp)$/i.test(f.name || '');
                            });

                            const count = imageFiles.length;

                            // Tenta detectar automaticamente o nome da pasta a partir de webkitRelativePath
                            let dsName = '';
                            for (const f of imageFiles) {
                                if (f.webkitRelativePath) {
                                    const top = f.webkitRelativePath.split('/')[0];
                                    if (top) { dsName = top; break; }
                                }
                            }
                            // Se não foi possível detectar, usa um fallback gerado (sem prompt)
                            if (!dsName) dsName = `upload_${Date.now()}`;
                            // sanitiza (remove ../, barras, e espaços)
                            dsName = String(dsName).trim().replace(/\\/g, '_').replace(/\//g, '_').replace(/\s+/g, '_');

                            // Insere opção temporária no select
                            const sel = document.getElementById('dataset-select');
                            if (sel) {
                                const opt = document.createElement('option');
                                opt.value = dsName;
                                opt.textContent = `${dsName} (local)`;
                                sel.appendChild(opt);
                                try { sel.value = opt.value; } catch (e) { /* ignore */ }
                            }

                            // Atualiza contagem positiva na UI
                            const el = document.getElementById('total-positive-count');
                            if (el) el.textContent = String(count);

                            showLog(`[UI] Upload local: ${files.length} arquivos selecionados, ${count} imagens detectadas. Dataset temporário: ${dsName}`);

                            // Se houver API de upload, envie os arquivos (opcional)
                            if (window.API && typeof window.API.uploadDataset === 'function') {
                                try {
                                    const fd = new FormData();
                                    // Use webkitRelativePath when available to preserve folder structure inside the selected folder
                                    imageFiles.forEach(f => {
                                        const rel = f.webkitRelativePath || f.name;
                                        fd.append('files', f, rel);
                                    });
                                    fd.append('dataset_name', dsName);
                                    showLog('[UI] Enviando upload para servidor...');
                                    const res = await window.API.uploadDataset(fd).catch(() => null);
                                    // backend returns JSON {status: 'ok', saved: N, errors: []}
                                    if (res && (res.status === 'ok' || (typeof res.saved === 'number' && res.saved >= 0))) {
                                        showLog('[API] Upload concluído com sucesso.');
                                        // tenta recarregar a lista de datasets do servidor
                                        try { await loadDatasetsIntoSelect(); } catch (e) { /* ignore */ }
                                        try { await updatePositiveCountForSelected(); } catch (e) { /* ignore */ }
                                    } else {
                                        showLog('[API] Upload não disponível ou falhou; mantendo dataset local temporário.');
                                    }
                                } catch (e) {
                                    console.error('Erro durante upload via API', e);
                                    showLog('[API] Erro no upload do dataset para o servidor.');
                                }
                            }

                            // Recalcula summary/negativos
                            try { updateNegativeSummary(); } catch (e) { /* ignore */ }
                        });
                        document.body.appendChild(fileInput);
                    }

                    // Dispara o seletor de pasta
                    fileInput.click();

                } catch (e) {
                    console.error('Erro ao abrir seletor de pasta', e);
                    alert('Erro ao iniciar upload de pasta. Veja console para detalhes.');
                }
            });

            // Chamada inicial de carregamento de datasets
            loadDatasetsIntoSelect();
            // Conecta listener para atualizar contagem ao mudar seleção
            document.getElementById('dataset-select')?.addEventListener('change', () => updatePositiveCountForSelected());

            // --- Seleção de Dados Negativos (Novos Listeners) ---
            const table = document.getElementById('negative-selection-table');
            if (table) {
                // 2. Listener para a quantidade padrão (fallback)
                document.getElementById('default-rand-count')?.addEventListener('input', updateNegativeSummary);

                // 3. Listeners para o split (se houver) — aplicando enforcement para que a soma seja no máximo 100%
            }
            // Positivos
            ['train-percent', 'val-percent', 'test-percent'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('input', (e) => {
                    enforceSplitSum(['train-percent', 'val-percent', 'test-percent'], e.target);
                    updateNegativeSummary();
                });
            });

            // Negativos (random split)
            ['rand-train-percent', 'rand-val-percent', 'rand-test-percent'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('input', (e) => {
                    enforceSplitSum(['rand-train-percent', 'rand-val-percent', 'rand-test-percent'], e.target);
                    updateNegativeSummary();
                });
            });

            // 4. MOCK DATA: Simula o total de positivos
            const positiveCountEl = document.getElementById('total-positive-count');
            if (positiveCountEl && positiveCountEl.textContent === '0') positiveCountEl.textContent = '1000';

            // 5. Listeners para a divisão de treino/val/teste positiva
            // (Já conectados acima com enforcement de soma <= 100%)


            // --- ATIVAÇÃO DINÂMICA CRÍTICA ---
            async function initializeNegativeLines() {
                if (!table) return; // Garante que a tabela existe

                // 1. Carrega a estrutura de pastas do backend (pode ser o mock/fallback)
                showLog('Iniciando carregamento da estrutura de linhas negativas...');
                currentLineCounts = await loadNegativeLineCounts();
                showLog('Estrutura de linhas negativas carregada.');

                // 2. Mapeia os checkboxes de tipo e associa o listener
                // ESTE É O LISTENER QUE ACIONA handleTypeCheckboxChange e é CRÍTICO
                table.querySelectorAll('tr[data-type] input[type="checkbox"]').forEach(cb => {
                    // Remove listeners anteriores (para evitar duplicidade em navegação de página)
                    cb.removeEventListener('change', cb._typeChangeListener);
                    cb._typeChangeListener = (e) => handleTypeCheckboxChange(e.target);
                    cb.addEventListener('change', cb._typeChangeListener);
                    // Por padrão, não pre-seleciona tipos (garante comportamento consistente)
                    try { cb.checked = false; } catch (e) { /* ignore */ }
                    // Atualiza o estilo do botão de detalhes conforme o estado
                    const tr = cb.closest('tr[data-type]');
                    const btn = tr?.querySelector('button');
                    if (btn) {
                        if (cb.checked) btn.classList.add('btn-primary'); else btn.classList.remove('btn-primary');
                    }
                });

                // 3. Atualiza os contadores visuais de linhas disponíveis (badges/spans)
                Object.keys(currentLineCounts).forEach(typeKey => {
                    const tr = table.querySelector(`tr[data-type="${typeKey}"]`);
                    if (!tr) return;
                    const available = Object.keys(currentLineCounts[typeKey] || {}).length;
                    // Atualiza o célula de linhas (se existir)
                    const linesCell = tr.querySelector('.selected-lines-count');
                    if (linesCell && (!tr.querySelector('input[type="checkbox"]') || !tr.querySelector('input[type="checkbox"]').checked)) {
                        linesCell.textContent = `${available} Linhas`;
                    }
                    // Atualiza spans/avisos dentro do painel de detalhe, se presentes
                    const detailRow = document.querySelector(`.line-detail-row[data-parent="${typeKey}"]`);
                    if (detailRow) {
                        const span = detailRow.querySelector('.available-lines-count');
                        if (span) span.textContent = available;
                        const typeCountInput = detailRow.querySelector(`input[data-type-count="${typeKey}"]`);
                        if (typeCountInput) {
                            typeCountInput.max = 999999; // não sabemos limite, mantém padrão
                            // atualiza o resumo ao alterar o valor automático
                            typeCountInput.removeEventListener('input', typeCountInput._listener);
                            typeCountInput._listener = () => updateNegativeSummary();
                            typeCountInput.addEventListener('input', typeCountInput._listener);
                        }
                    }
                });

                // 4. Garante listeners nos botões de Detalhes / Fechar para abrir/fechar o painel corretamente
                table.querySelectorAll('tr[data-type]').forEach(tr => {
                    const typeKey = tr.dataset.type;
                    const btn = tr.querySelector('button');
                    // remove listener anterior
                    if (btn) {
                        btn.removeEventListener('click', btn._detailListener);
                        btn._detailListener = (e) => {
                            e.preventDefault();
                            // usa a função global definida
                            const opener = (global.UI && typeof global.UI.toggleLineSelection === 'function') ? global.UI.toggleLineSelection : global.toggleLineSelection;
                            opener(btn, typeKey);
                        };
                        btn.addEventListener('click', btn._detailListener);
                    }

                    // close button inside detailRow (se existir)
                    const detailRow = document.querySelector(`.line-detail-row[data-parent="${typeKey}"]`);
                    if (detailRow) {
                        const closeBtn = detailRow.querySelector('.line-detail-actions button');
                        if (closeBtn) {
                            closeBtn.removeEventListener('click', closeBtn._closeListener);
                            closeBtn._closeListener = (e) => {
                                e.preventDefault();
                                const opener = (global.UI && typeof global.UI.toggleLineSelection === 'function') ? global.UI.toggleLineSelection : global.toggleLineSelection;
                                // pass the main table button so toggleLineSelection updates text correctly
                                if (btn) opener(btn, typeKey);
                            };
                            closeBtn.addEventListener('click', closeBtn._closeListener);
                        }
                        // também garante que os radios dentro do painel atualizem a UI ao trocar de modo
                        const radios = detailRow.querySelectorAll('.mode-options-group input[type="radio"]');
                        radios.forEach(r => {
                            r.removeEventListener('change', r._modeListener);
                            r._modeListener = (ev) => {
                                const chosen = ev.target.value;
                                if (global.UI && typeof global.UI.setNegativeSelectionMode === 'function') {
                                    global.UI.setNegativeSelectionMode(typeKey, chosen);
                                } else {
                                    setNegativeSelectionMode(typeKey, chosen);
                                }
                            };
                            r.addEventListener('change', r._modeListener);
                        });
                    }
                });

                // 3. Chamada inicial para preencher o resumo
                updateNegativeSummary();
            }

            // INICIALIZAÇÃO: Esta chamada garante que o JS entre em ação ao carregar a página.
            initializeNegativeLines();

            // --- Controle de Treinamento ---
            if (global.TrainingControl && typeof global.TrainingControl.init === 'function') {
                global.TrainingControl.init();
            } else {
                showLog('[ERRO] O módulo TrainingControl não foi carregado. Verifique a tag <script>.');
            }
        }

        if (page === 'predicao') {
            initPredictionPage();
        }
    }

    // --- PREDICAO ---
    function initPredictionPage() {
        document.getElementById('run-prediction-btn')?.addEventListener('click', runPrediction);

        // Carrega e renderiza a lista de modelos disponíveis
        async function loadModelsIntoContainer() {
            const cont = document.getElementById('models-container');
            if (!cont) return;
            cont.innerHTML = '<div class="card">Carregando modelos...</div>';
            let models = [];
            if (window.API && typeof window.API.getModels === 'function') {
                try { models = await window.API.getModels(); } catch (e) { models = []; }
            }
            cont.innerHTML = '';
            if (!models || models.length === 0) {
                cont.innerHTML = '<div class="card">Nenhum modelo encontrado</div>';
                return;
            }
            // render grid
            models.forEach((m, i) => {
                const item = document.createElement('div');
                item.className = 'model-item card model-item-compact';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'model-checkbox';
                cb.id = `model-${i}`;
                cb.value = m;
                const lbl = document.createElement('label');
                lbl.htmlFor = cb.id;
                lbl.style.marginLeft = '8px';
                lbl.textContent = m;

                // when checkbox changes, persist and update UI highlight and summary
                cb.addEventListener('change', (ev) => {
                    try {
                        const sel = Array.from(document.querySelectorAll('.model-checkbox')).filter(x => x.checked).map(x => x.value);
                        localStorage.setItem('selected_models', JSON.stringify(sel));
                    } catch (e) { /* ignore storage errors */ }
                    // toggle selected visual state on the parent item
                    try { item.classList.toggle('selected', cb.checked); } catch (e) { /* ignore */ }
                    updateSelectedSummary();
                });

                // clicking the label should toggle checkbox (ensure accessibility)
                lbl.addEventListener('click', (e) => {
                    // native label click will toggle, but ensure update runs in all browsers
                    setTimeout(() => { cb.dispatchEvent(new Event('change')); }, 10);
                });

                // assemble
                const leftWrap = document.createElement('div');
                leftWrap.style.display = 'flex';
                leftWrap.style.alignItems = 'center';
                leftWrap.appendChild(cb);
                leftWrap.appendChild(lbl);
                item.appendChild(leftWrap);
                cont.appendChild(item);
            });

            // restore persisted selection
            try {
                const stored = JSON.parse(localStorage.getItem('selected_models') || '[]');
                if (Array.isArray(stored) && stored.length > 0) {
                    document.querySelectorAll('.model-checkbox').forEach(cb => cb.checked = stored.includes(cb.value));
                }
            } catch (e) { /* ignore malformed storage */ }

            // wire select-all checkbox
            const selAll = document.getElementById('select-all-models');
            if (selAll) {
                selAll.checked = false;
                selAll.removeEventListener('change', selAll._listener);
                selAll._listener = (ev) => {
                    const checked = ev.target.checked;
                    document.querySelectorAll('.model-checkbox').forEach(cb => { cb.checked = checked; cb.dispatchEvent(new Event('change')); });
                    updateSelectedSummary();
                };
                selAll.addEventListener('change', selAll._listener);
            }

            updateSelectedSummary();
        }

        // controla a visibilidade do input de pasta conforme a opção escolhida
        function updateFolderInputVisibility() {
            const src = document.getElementById('prediction-source');
            const folderInput = document.getElementById('prediction-folder-input');
            if (!src || !folderInput) return;
            const v = src.value;
            if (v === 'random' || v === 'folder') folderInput.classList.remove('hidden'); else folderInput.classList.add('hidden');
        }

        // inicialização da tela de predição
        loadModelsIntoContainer().catch(e => console.warn('Falha ao carregar modelos:', e));
        document.getElementById('prediction-source')?.addEventListener('change', updateFolderInputVisibility);
        updateFolderInputVisibility();
    }

    // --- EXPOSIÇÃO GLOBAL ---
    global.UI = {
        init: () => {
            document.querySelectorAll('.menu-item').forEach(mi => {
                mi.removeEventListener('click', mi._uiClickListener);
                mi._uiClickListener = (e) => {
                    const page = mi.dataset.page;
                    if (page) Navigation.navigate(page);
                };
                mi.addEventListener('click', mi._uiClickListener);
            });
            // Exponha funções globais usadas no HTML
            global.navigate = (p) => Navigation.navigate(p);
            global.toggleSidebar = () => (Navigation.toggleSidebar ? Navigation.toggleSidebar() : null);
            // Carrega Treinamento por padrão logo ao iniciar
            Navigation.navigate('treinamento');
            // Fallback: se a view ainda estiver vazia após breve atraso, tenta novamente
            setTimeout(() => {
                const view = document.getElementById('view');
                if (view && view.children.length === 0) {
                    Navigation.navigate('treinamento');
                }
            }, 250);
            // Segundo fallback: tenta novamente após 1s caso algo ainda não tenha carregado
            setTimeout(() => {
                const view = document.getElementById('view');
                if (view && view.children.length === 0) {
                    Navigation.navigate('treinamento');
                }
            }, 1000);

            // ensure modal close button/backdrop listeners exist
            document.getElementById('img-modal-close')?.addEventListener('click', closeImageModal);
            document.getElementById('img-modal-backdrop')?.addEventListener('click', closeImageModal);
        },
        bindPageHandlers,
        toggleLineSelection: global.toggleLineSelection,
        setNegativeSelectionMode,
        collectTrainingPayload,
        openImageModal,
        updateNegativeSummary,
    };

})(window);