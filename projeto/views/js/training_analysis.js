/**
 * 📊 Análise Científica de Treino - Versão Profissional
 * Separação completa: Exploração (interativo) vs Publicação (clean/acadêmico)
 */
(function (global) {
    'use strict';

    const TrainingAnalysis = {
        charts: {},
        currentData: null,
        mode: 'publication', // 'exploration' | 'publication'
        selectedRuns: new Set(), // para exploração: trackear runs selecionados

        // Interpretações científicas para cada métrica
        interpretations: {
            loss: 'Linhas próximas → boa generalização\nVal subindo, train caindo → overfitting',
            gap: 'Gap pequeno e estável → robusto\nGap crescente → memoriza treino',
            acc_top1: 'Crescimento rápido → classes fáceis\nPlatô precoce → limitação do modelo',
            acc_top5: 'Top-5 alto + Top-1 baixo → classes semelhantes\nDiferença pequena → separação clara',
            delta_acc: 'Δ grande → classes visualmente parecidas\nΔ pequeno → separação clara das classes',
            stability: 'Alta variância → treino instável\nVariância baixa → convergência sólida',
            lr: 'Queda brusca → refinamento fino\nLR alto + loss alto → possível instabilidade',
            time: 'Tempo constante → treino estável\nPicos → gargalo I/O ou GPU',
            correlation: 'Correlação negativa → modelo saudável\nPontos dispersos → aprendizado inconsistente'
        },

        init() {
            this.loadTrainings();
            this.attachEventListeners();
            this.setupVisualizationMode();
            this.ensureZoomPluginLoaded();
        },

        attachEventListeners() {
            const analysisMode = document.getElementById('analysis-mode');
            const runBtn = document.getElementById('run-analysis-btn');

            if (analysisMode) analysisMode.addEventListener('change', () => this.onModeChange());
            if (runBtn) runBtn.addEventListener('click', () => this.runAnalysis());
        },

        setupVisualizationMode() {
            const resultsDiv = document.getElementById('analysis-results');
            if (!resultsDiv) return;

            const infoDiv = document.getElementById('training-info');
            if (!infoDiv) return;

            // Criar container de controles
            const controls = document.createElement('div');
            controls.style.cssText = `
                display: flex;
                gap: 24px;
                align-items: center;
                justify-content: space-between;
                padding: 16px 0;
                border-bottom: 2px solid #f0f0f0;
                margin-bottom: 20px;
            `;

            // Toggle de modo
            const modeToggle = document.createElement('div');
            modeToggle.style.cssText = `
                display: flex;
                gap: 12px;
                align-items: center;
            `;
            modeToggle.innerHTML = `
                <span style="font-size: 0.9rem; font-weight: 600; color: #333;">Visualização:</span>
                <button id="mode-publication" class="mode-btn" style="padding: 8px 16px; border: 2px solid #3b82f6; background: #3b82f6; color: white; border-radius: 6px; cursor: pointer; font-weight: 600;">📄 Publicação</button>
                <button id="mode-exploration" class="mode-btn" style="padding: 8px 16px; border: 2px solid #ccc; background: white; color: #333; border-radius: 6px; cursor: pointer; font-weight: 600;">🔍 Exploração</button>
            `;

            controls.appendChild(modeToggle);
            infoDiv.parentElement.insertBefore(controls, infoDiv);

            // Event listeners para toggle
            document.getElementById('mode-publication')?.addEventListener('click', () => this.setVisualizationMode('publication'));
            document.getElementById('mode-exploration')?.addEventListener('click', () => this.setVisualizationMode('exploration'));
        },

        setVisualizationMode(newMode) {
            this.mode = newMode;

            // Atualizar botões
            const pubBtn = document.getElementById('mode-publication');
            const expBtn = document.getElementById('mode-exploration');

            if (newMode === 'publication') {
                pubBtn.style.cssText = 'padding: 8px 16px; border: 2px solid #3b82f6; background: #3b82f6; color: white; border-radius: 6px; cursor: pointer; font-weight: 600;';
                expBtn.style.cssText = 'padding: 8px 16px; border: 2px solid #ccc; background: white; color: #333; border-radius: 6px; cursor: pointer; font-weight: 600;';
            } else {
                pubBtn.style.cssText = 'padding: 8px 16px; border: 2px solid #ccc; background: white; color: #333; border-radius: 6px; cursor: pointer; font-weight: 600;';
                expBtn.style.cssText = 'padding: 8px 16px; border: 2px solid #3b82f6; background: #3b82f6; color: white; border-radius: 6px; cursor: pointer; font-weight: 600;';
            }

            // Re-renderizar
            if (this.currentData) this.renderAnalysis();
        },

        onModeChange() {
            const mode = document.getElementById('analysis-mode')?.value;
            const singleContainer = document.getElementById('training-selection-container');
            const groupContainer = document.getElementById('group-selection-container');

            if (mode === 'single') {
                singleContainer?.classList.remove('hidden');
                groupContainer?.classList.add('hidden');
            } else if (mode === 'group') {
                singleContainer?.classList.add('hidden');
                groupContainer?.classList.remove('hidden');
                this.loadGroups();
            } else if (mode === 'all') {
                singleContainer?.classList.add('hidden');
                groupContainer?.classList.add('hidden');
            }
        },

        async loadTrainings() {
            try {
                const response = await fetch('/api/analysis/list-trainings');
                const data = await response.json();

                const trainingSelect = document.getElementById('training-select');
                if (trainingSelect && data.trainings) {
                    trainingSelect.innerHTML = '<option value="">-- Selecione um treino --</option>';
                    data.trainings.forEach(name => {
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        trainingSelect.appendChild(option);
                    });
                }

                this.groups = data.groups || {};
            } catch (e) {
                console.error('Erro ao carregar treinos:', e);
            }
        },

        loadGroups() {
            const groupSelect = document.getElementById('group-select');
            if (!groupSelect || !this.groups) return;

            groupSelect.innerHTML = '<option value="">-- Selecione um grupo --</option>';
            Object.keys(this.groups).forEach(groupName => {
                const option = document.createElement('option');
                option.value = groupName;
                option.textContent = `${groupName} (${this.groups[groupName].length} treinos)`;
                groupSelect.appendChild(option);
            });
        },

        async runAnalysis() {
            const mode = document.getElementById('analysis-mode')?.value;
            const runBtn = document.getElementById('run-analysis-btn');

            if (runBtn) {
                runBtn.disabled = true;
                runBtn.textContent = '⏳ Processando...';
            }

            try {
                if (mode === 'single') {
                    await this.analyzeSingleTraining();
                } else if (mode === 'group') {
                    await this.analyzeGroup();
                } else if (mode === 'all') {
                    await this.analyzeAll();
                }
            } catch (e) {
                console.error('Erro na análise:', e);
                alert('Erro ao processar análise. Veja console para detalhes.');
            } finally {
                if (runBtn) {
                    runBtn.disabled = false;
                    runBtn.textContent = '📊 Gerar Análise';
                }
            }
        },

        async analyzeSingleTraining() {
            const trainingName = document.getElementById('training-select')?.value;
            if (!trainingName) {
                alert('Selecione um treino');
                return;
            }

            const response = await fetch(`/api/analysis/get-training-data/${trainingName}`);
            const data = await response.json();

            if (!response.ok) {
                alert(`Erro: ${data.detail}`);
                return;
            }

            this.currentData = [data];
            this.selectedRuns.clear();
            this.selectedRuns.add(0);
            this.renderAnalysis();
        },

        async analyzeGroup() {
            const groupName = document.getElementById('group-select')?.value;
            if (!groupName) {
                alert('Selecione um grupo');
                return;
            }

            const response = await fetch(`/api/analysis/get-group-data/${groupName}`);
            const data = await response.json();

            if (!response.ok) {
                alert(`Erro: ${data.detail}`);
                return;
            }

            this.currentData = data.trainings;
            this.selectedRuns.clear();
            this.renderAnalysis();
        },

        async analyzeAll() {
            const response = await fetch('/api/analysis/list-trainings');
            const listData = await response.json();

            if (!listData.trainings || listData.trainings.length === 0) {
                alert('Nenhum treino encontrado');
                return;
            }

            const allData = [];
            for (const trainingName of listData.trainings) {
                const resp = await fetch(`/api/analysis/get-training-data/${trainingName}`);
                const data = await resp.json();
                if (resp.ok) {
                    allData.push(data);
                }
            }

            this.currentData = allData;
            this.selectedRuns.clear();
            this.renderAnalysis();
        },

        renderAnalysis() {
            const resultsDiv = document.getElementById('analysis-results');
            if (!resultsDiv || !this.currentData) return;

            resultsDiv.style.display = 'block';
            this.renderTrainingInfo();

            // Destruir gráficos antigos
            Object.values(this.charts).forEach(chart => {
                if (chart && typeof chart.destroy === 'function') {
                    chart.destroy();
                }
            });
            this.charts = {};

            // Renderizar gráficos
            this.renderLossChart();
            this.renderGapChart();
            this.renderAccTop1Chart();
            this.renderAccTop5Chart();
            this.renderDeltaAccChart();
            this.renderStabilityChart();
            this.renderLRChart();
            this.renderTimeChart();
            this.renderCorrelationChart();

            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        renderTrainingInfo() {
            const infoDiv = document.getElementById('training-info');
            if (!infoDiv || !this.currentData) return;

            const numTrainings = this.currentData.length;
            const avgEpochs = Math.round(
                this.currentData.reduce((sum, d) => sum + d.epochs.length, 0) / numTrainings
            );

            let html = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; padding: 16px 0;">
                    <div style="font-size: 0.95rem;">
                        <span style="color: #666;">Treinos Analisados:</span>
                        <span style="font-weight: 700; font-size: 1.2rem; color: #3b82f6; display: block;">📊 ${numTrainings}</span>
                    </div>
                    <div style="font-size: 0.95rem;">
                        <span style="color: #666;">Epochs Médios:</span>
                        <span style="font-weight: 700; font-size: 1.2rem; color: #10b981; display: block;">⏱️ ${avgEpochs}</span>
                    </div>
            `;

            if (numTrainings === 1 && this.currentData[0].training_name) {
                html += `
                    <div style="font-size: 0.95rem;">
                        <span style="color: #666;">Nome do Treino:</span>
                        <span style="font-weight: 700; font-size: 1rem; color: #333; display: block;">🏷️ ${this.currentData[0].training_name}</span>
                    </div>
                `;
            }

            html += '</div>';
            infoDiv.innerHTML = html;
        },

        // Helper: Criar título com tooltip
        createChartHeader(title, interpretation) {
            const container = document.createElement('div');
            container.className = 'chart-header';
            container.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 16px;
            `;

            const titleEl = document.createElement('h3');
            titleEl.textContent = title;
            titleEl.style.cssText = `
                margin: 0;
                font-size: 1.1rem;
                font-weight: 700;
                color: #333;
            `;
            container.appendChild(titleEl);

            // Ícone de tooltip
            const tooltip = document.createElement('div');
            tooltip.style.cssText = `
                position: relative;
                display: inline-flex;
                cursor: help;
            `;

            const icon = document.createElement('span');
            icon.innerHTML = '❓';
            icon.style.cssText = `
                font-size: 0.9rem;
                opacity: 0.6;
                transition: opacity 0.2s;
            `;

            const popup = document.createElement('div');
            popup.textContent = interpretation;
            popup.style.cssText = `
                position: absolute;
                bottom: 110%;
                left: 50%;
                transform: translateX(-50%);
                background: #333;
                color: white;
                padding: 12px;
                border-radius: 6px;
                font-size: 0.85rem;
                white-space: pre-wrap;
                max-width: 280px;
                z-index: 1000;
                display: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                line-height: 1.5;
                pointer-events: none;
            `;

            tooltip.appendChild(icon);
            tooltip.appendChild(popup);

            tooltip.addEventListener('mouseenter', () => {
                popup.style.display = 'block';
                icon.style.opacity = '1';
            });
            tooltip.addEventListener('mouseleave', () => {
                popup.style.display = 'none';
                icon.style.opacity = '0.6';
            });

            container.appendChild(tooltip);
            return container;
        },

        // Cabeçalhos já estão no HTML; evitar duplicação via JS
        insertChartHeader() { /* no-op */ },

        // Carregar plugin de zoom dinamicamente (Chart.js)
        ensureZoomPluginLoaded() {
            if (window._zoomPluginLoading || window._zoomPluginReady) return;
            window._zoomPluginLoading = true;
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@1.3.1/dist/chartjs-plugin-zoom.min.js';
            script.async = true;
            script.onload = () => {
                window._zoomPluginReady = true;
                try {
                    const plugin = window.ChartZoom || window.zoomPlugin || window.Zoom || window.chartJsZoomPlugin;
                    if (window.Chart && typeof window.Chart.register === 'function' && plugin) {
                        window.Chart.register(plugin);
                    }
                } catch (e) {
                    console.warn('Falha ao registrar plugin de zoom:', e);
                }
                if (global.TrainingAnalysis && typeof global.TrainingAnalysis.onZoomPluginReady === 'function') {
                    global.TrainingAnalysis.onZoomPluginReady();
                }
            };
            document.head.appendChild(script);
        },

        onZoomPluginReady() {
            // Atualiza gráficos existentes para habilitar zoom/pan em exploração
            if (this.mode !== 'exploration') return;
            Object.values(this.charts).forEach(chart => {
                if (!chart) return;
                chart.options.plugins = chart.options.plugins || {};
                chart.options.plugins.zoom = {
                    pan: { enabled: true },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'xy'
                    }
                };
                try { chart.update('none'); } catch (_) { }
            });
        },

        // Renderiza um mini gráfico de inset (últimos N epochs) no modo publicação
        renderInset(ctx, chartKey, labels, datasets) {
            const container = ctx.canvas.parentElement;
            if (!container) return;
            container.style.position = 'relative';
            const insetId = `inset-${chartKey}`;
            const existing = container.querySelector(`#${insetId}`);
            if (existing) existing.remove();
            const insetCanvas = document.createElement('canvas');
            insetCanvas.id = insetId;
            insetCanvas.style.cssText = 'position:absolute; right:12px; bottom:12px; width:280px; height:180px; background: rgba(255,255,255,0.92); border: 1px solid #eee; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);';
            container.appendChild(insetCanvas);
            const insetCtx = insetCanvas.getContext('2d');
            if (!insetCtx) return;
            new Chart(insetCtx, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: { x: { grid: { display: false } }, y: { grid: { display: false } } }
                }
            });
        },

        // ===== GRÁFICOS =====

        renderLossChart() {
            const ctx = document.getElementById('chart-loss')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '📉 Loss: Treino × Validação', this.interpretations.loss);

            const datasets = this.mode === 'publication'
                ? this.getPublicationDatasets_Loss()
                : this.getExplorationDatasets_Loss();

            this.charts['loss'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: this.getChartOptions('Loss', this.mode)
            });

            // Inset (últimos 30 epochs) em modo publicação
            if (this.mode === 'publication') {
                const lastN = 30;
                const labels = this.currentData[0].epochs.slice(-lastN);
                const pubSets = this.getPublicationDatasets_Loss();
                const insetSets = pubSets.map(ds => ({
                    ...ds,
                    data: Array.isArray(ds.data) ? ds.data.slice(-lastN) : ds.data
                }));
                this.renderInset(ctx, 'chart-loss', labels, insetSets);
            }
        },

        getPublicationDatasets_Loss() {
            // Modo publicação: apenas média + intervalo, sem ruído
            const trainLosses = this.currentData.map(d => d.train_loss);
            const valLosses = this.currentData.map(d => d.val_loss);

            const trainStats = this.calculateStats(trainLosses);
            const valStats = this.calculateStats(valLosses);

            return [
                // Intervalo: linha inferior (m-σ) + superior (m+σ) com preenchimento entre elas
                {
                    label: 'Train Loss (−1σ)',
                    data: trainStats.mean.map((m, i) => m - trainStats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    pointRadius: 0,
                    tension: 0
                },
                {
                    label: 'Train Loss (+1σ)',
                    data: trainStats.mean.map((m, i) => m + trainStats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#3b82f620',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0,
                    tension: 0
                },
                {
                    label: 'Train Loss (Média)',
                    data: trainStats.mean,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0,
                    borderDash: []
                },
                {
                    label: 'Val Loss (−1σ)',
                    data: valStats.mean.map((m, i) => m - valStats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    pointRadius: 0,
                    tension: 0
                },
                {
                    label: 'Val Loss (+1σ)',
                    data: valStats.mean.map((m, i) => m + valStats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#ef444420',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0,
                    tension: 0
                },
                {
                    label: 'Val Loss (Média)',
                    data: valStats.mean,
                    borderColor: '#ef4444',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0,
                    borderDash: [5, 5]
                }
            ];
        },

        getExplorationDatasets_Loss() {
            // Modo exploração: todas as curvas, cores diferentes
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const datasets = [];

            this.currentData.forEach((data, idx) => {
                const color = colors[idx % colors.length];
                const isSelected = this.selectedRuns.has(idx);
                const opacity = isSelected ? 1 : 0.3;
                const width = isSelected ? 2.5 : 1.5;

                datasets.push({
                    label: `${data.training_name} - Train`,
                    data: data.train_loss,
                    borderColor: color,
                    borderWidth: width,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: isSelected ? 2 : 0,
                    pointHoverRadius: 5,
                    opacity: opacity,
                    hidden: !isSelected && this.selectedRuns.size > 0
                });

                datasets.push({
                    label: `${data.training_name} - Val`,
                    data: data.val_loss,
                    borderColor: color,
                    borderWidth: width,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: isSelected ? 2 : 0,
                    pointHoverRadius: 5,
                    borderDash: [5, 5],
                    opacity: opacity,
                    hidden: !isSelected && this.selectedRuns.size > 0
                });
            });

            return datasets;
        },

        renderGapChart() {
            const ctx = document.getElementById('chart-gap')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '📊 Gap de Generalização (Val − Train)', this.interpretations.gap);

            const datasets = this.mode === 'publication'
                ? this.getPublicationDatasets_Gap()
                : this.getExplorationDatasets_Gap();

            this.charts['gap'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: this.getChartOptions('Gap', this.mode)
            });
        },

        getPublicationDatasets_Gap() {
            const gaps = this.currentData.map(d =>
                d.val_loss.map((v, i) => v - d.train_loss[i])
            );
            const stats = this.calculateStats(gaps);

            return [
                {
                    label: 'Gap (−1σ)',
                    data: stats.mean.map((m, i) => m - stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    pointRadius: 0
                },
                {
                    label: 'Gap (+1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#f59e0b25',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                },
                {
                    label: 'Gap (Médio)',
                    data: stats.mean,
                    borderColor: '#f59e0b',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0
                }
            ];
        },

        getExplorationDatasets_Gap() {
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const datasets = [];

            this.currentData.forEach((data, idx) => {
                const gap = data.val_loss.map((v, i) => v - data.train_loss[i]);
                const color = colors[idx % colors.length];
                const isSelected = this.selectedRuns.has(idx);

                datasets.push({
                    label: data.training_name,
                    data: gap,
                    borderColor: color,
                    borderWidth: isSelected ? 2.5 : 1.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: isSelected ? 2 : 0,
                    pointHoverRadius: 5,
                    hidden: !isSelected && this.selectedRuns.size > 0
                });
            });

            return datasets;
        },

        renderAccTop1Chart() {
            const ctx = document.getElementById('chart-acc-top1')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '🎯 Accuracy Top-1', this.interpretations.acc_top1);

            const datasets = this.mode === 'publication'
                ? this.getPublicationDatasets_AccTop1()
                : this.getExplorationDatasets_AccTop1();

            this.charts['acc_top1'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: this.getChartOptions('Accuracy Top-1', this.mode, { min: 0, max: 1 })
            });

            if (this.mode === 'publication') {
                const lastN = 30;
                const labels = this.currentData[0].epochs.slice(-lastN);
                const pubSets = this.getPublicationDatasets_AccTop1();
                const insetSets = pubSets.map(ds => ({
                    ...ds,
                    data: Array.isArray(ds.data) ? ds.data.slice(-lastN) : ds.data
                }));
                this.renderInset(ctx, 'chart-acc-top1', labels, insetSets);
            }
        },

        getPublicationDatasets_AccTop1() {
            const accs = this.currentData.map(d => d.acc_top1);
            const stats = this.calculateStats(accs);

            return [
                {
                    label: 'Top-1 (−1σ)',
                    data: stats.mean.map((m, i) => m - stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    pointRadius: 0
                },
                {
                    label: 'Top-1 (+1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#3b82f625',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                },
                {
                    label: 'Top-1 (Médio)',
                    data: stats.mean,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0
                }
            ];
        },

        getExplorationDatasets_AccTop1() {
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const datasets = [];

            this.currentData.forEach((data, idx) => {
                const color = colors[idx % colors.length];
                const isSelected = this.selectedRuns.has(idx);

                datasets.push({
                    label: data.training_name,
                    data: data.acc_top1,
                    borderColor: color,
                    borderWidth: isSelected ? 2.5 : 1.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: isSelected ? 2 : 0,
                    pointHoverRadius: 5,
                    hidden: !isSelected && this.selectedRuns.size > 0
                });
            });

            return datasets;
        },

        renderAccTop5Chart() {
            const ctx = document.getElementById('chart-acc-top5')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '🎯 Accuracy Top-5', this.interpretations.acc_top5);

            const datasets = this.mode === 'publication'
                ? this.getPublicationDatasets_AccTop5()
                : this.getExplorationDatasets_AccTop5();

            this.charts['acc_top5'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: this.getChartOptions('Accuracy Top-5', this.mode, { min: 0, max: 1 })
            });
        },

        getPublicationDatasets_AccTop5() {
            const accs = this.currentData.map(d => d.acc_top5);
            const stats = this.calculateStats(accs);

            return [
                {
                    label: 'Top-5 (−1σ)',
                    data: stats.mean.map((m, i) => m - stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    pointRadius: 0
                },
                {
                    label: 'Top-5 (+1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#10b98125',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                },
                {
                    label: 'Top-5 (Médio)',
                    data: stats.mean,
                    borderColor: '#10b981',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0
                }
            ];
        },

        getExplorationDatasets_AccTop5() {
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const datasets = [];

            this.currentData.forEach((data, idx) => {
                const color = colors[idx % colors.length];
                const isSelected = this.selectedRuns.has(idx);

                datasets.push({
                    label: data.training_name,
                    data: data.acc_top5,
                    borderColor: color,
                    borderWidth: isSelected ? 2.5 : 1.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: isSelected ? 2 : 0,
                    pointHoverRadius: 5,
                    hidden: !isSelected && this.selectedRuns.size > 0
                });
            });

            return datasets;
        },

        renderDeltaAccChart() {
            const ctx = document.getElementById('chart-delta-acc')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '📈 Diferença Top-5 − Top-1', this.interpretations.delta_acc);

            const datasets = this.mode === 'publication'
                ? this.getPublicationDatasets_DeltaAcc()
                : this.getExplorationDatasets_DeltaAcc();

            this.charts['delta_acc'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: this.getChartOptions('Diferença (Top-5 − Top-1)', this.mode)
            });
        },

        getPublicationDatasets_DeltaAcc() {
            const deltas = this.currentData.map(d =>
                d.acc_top5.map((v, i) => v - d.acc_top1[i])
            );
            const stats = this.calculateStats(deltas);

            return [
                {
                    label: 'Δ (−1σ)',
                    data: stats.mean.map((m, i) => m - stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    pointRadius: 0
                },
                {
                    label: 'Δ (+1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#8b5cf625',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                },
                {
                    label: 'Δ (Médio)',
                    data: stats.mean,
                    borderColor: '#8b5cf6',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0
                }
            ];
        },

        getExplorationDatasets_DeltaAcc() {
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const datasets = [];

            this.currentData.forEach((data, idx) => {
                const delta = data.acc_top5.map((v, i) => v - data.acc_top1[i]);
                const color = colors[idx % colors.length];
                const isSelected = this.selectedRuns.has(idx);

                datasets.push({
                    label: data.training_name,
                    data: delta,
                    borderColor: color,
                    borderWidth: isSelected ? 2.5 : 1.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: isSelected ? 2 : 0,
                    pointHoverRadius: 5,
                    hidden: !isSelected && this.selectedRuns.size > 0
                });
            });

            return datasets;
        },

        renderStabilityChart() {
            const ctx = document.getElementById('chart-stability')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '📊 Estabilidade (Variância)', this.interpretations.stability);

            const windowSize = 10;
            const datasets = this.mode === 'publication'
                ? this.getPublicationDatasets_Stability(windowSize)
                : this.getExplorationDatasets_Stability(windowSize);

            this.charts['stability'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs.slice(windowSize - 1),
                    datasets: datasets
                },
                options: this.getChartOptions('Variância', this.mode)
            });
        },

        getPublicationDatasets_Stability(windowSize) {
            const variances = this.currentData.map(d =>
                this.calculateRollingVariance(d.val_loss, windowSize)
            );
            const stats = this.calculateStats(variances);

            return [
                {
                    label: 'Variância (−1σ)',
                    data: stats.mean.map((m, i) => m - stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    pointRadius: 0
                },
                {
                    label: 'Variância (+1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#ef444425',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                },
                {
                    label: 'Variância (Média)',
                    data: stats.mean,
                    borderColor: '#ef4444',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0
                }
            ];
        },

        getExplorationDatasets_Stability(windowSize) {
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const datasets = [];

            this.currentData.forEach((data, idx) => {
                const variance = this.calculateRollingVariance(data.val_loss, windowSize);
                const color = colors[idx % colors.length];
                const isSelected = this.selectedRuns.has(idx);

                datasets.push({
                    label: data.training_name,
                    data: variance,
                    borderColor: color,
                    borderWidth: isSelected ? 2.5 : 1.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: isSelected ? 2 : 0,
                    pointHoverRadius: 5,
                    hidden: !isSelected && this.selectedRuns.size > 0
                });
            });

            return datasets;
        },

        calculateRollingVariance(data, windowSize) {
            const result = [];
            for (let i = windowSize - 1; i < data.length; i++) {
                const window = data.slice(i - windowSize + 1, i + 1);
                const mean = window.reduce((a, b) => a + b, 0) / windowSize;
                const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowSize;
                result.push(variance);
            }
            return result;
        },

        renderLRChart() {
            const ctx = document.getElementById('chart-lr')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '📉 Learning Rate Schedule', this.interpretations.lr);

            const datasets = this.currentData.length === 1
                ? this.getExplorationDatasets_LR() // Single sempre exploração
                : (this.mode === 'publication'
                    ? this.getPublicationDatasets_LR()
                    : this.getExplorationDatasets_LR());

            this.charts['lr'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: this.getChartOptions('Learning Rate', this.mode, { type: 'logarithmic' })
            });
        },

        getPublicationDatasets_LR() {
            const lrArrays = this.currentData.map(d => d.lr_pg0);
            const stats = this.calculateStats(lrArrays);
            return [
                {
                    label: 'LR (−1σ)',
                    data: stats.mean.map((m, i) => m - stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    pointRadius: 0,
                    tension: 0
                },
                {
                    label: 'LR (+1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#3b82f620',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0,
                    tension: 0
                },
                {
                    label: 'LR (Médio)',
                    data: stats.mean,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 0
                }
            ];
        },

        getExplorationDatasets_LR() {
            const colors = ['#3b82f6', '#ef4444', '#10b981'];
            const datasets = [];

            if (this.currentData.length === 1) {
                const data = this.currentData[0];
                datasets.push({
                    label: 'lr/pg0',
                    data: data.lr_pg0,
                    borderColor: colors[0],
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 1,
                    pointHoverRadius: 5
                });
                datasets.push({
                    label: 'lr/pg1',
                    data: data.lr_pg1,
                    borderColor: colors[1],
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 1,
                    pointHoverRadius: 5
                });
                datasets.push({
                    label: 'lr/pg2',
                    data: data.lr_pg2,
                    borderColor: colors[2],
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 1,
                    pointHoverRadius: 5
                });
            } else {
                this.currentData.forEach((data, idx) => {
                    const color = colors[idx % colors.length];
                    const isSelected = this.selectedRuns.has(idx);

                    datasets.push({
                        label: `${data.training_name} - lr/pg0`,
                        data: data.lr_pg0,
                        borderColor: color,
                        borderWidth: isSelected ? 2.5 : 1.5,
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: isSelected ? 1 : 0,
                        pointHoverRadius: 5,
                        hidden: !isSelected && this.selectedRuns.size > 0
                    });
                });
            }

            return datasets;
        },

        renderTimeChart() {
            const ctx = document.getElementById('chart-time')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '⏱️ Tempo por Epoch', this.interpretations.time);

            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const datasets = [];

            this.currentData.forEach((data, idx) => {
                datasets.push({
                    label: data.training_name,
                    data: data.time,
                    borderColor: colors[idx % colors.length],
                    backgroundColor: colors[idx % colors.length] + '70',
                    borderWidth: 1,
                    borderRadius: 3
                });
            });

            this.charts['time'] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: this.getChartOptions('Tempo (s)', this.mode)
            });
        },

        renderCorrelationChart() {
            const ctx = document.getElementById('chart-correlation')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '🔗 Correlação: Loss × Accuracy', this.interpretations.correlation);

            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const datasets = [];

            this.currentData.forEach((data, idx) => {
                const scatterData = data.val_loss.map((loss, i) => ({
                    x: loss,
                    y: data.acc_top1[i]
                }));

                datasets.push({
                    label: data.training_name,
                    data: scatterData,
                    backgroundColor: colors[idx % colors.length] + '80',
                    borderColor: colors[idx % colors.length],
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderWidth: 1
                });
            });

            this.charts['correlation'] = new Chart(ctx, {
                type: 'scatter',
                data: { datasets: datasets },
                options: this.getChartOptions('Correlação', this.mode, { min: 0, max: 1 })
            });
        },

        // ===== HELPERS =====

        calculateStats(dataArrays) {
            if (dataArrays.length === 0) return { mean: [], std: [] };

            const len = dataArrays[0].length;
            const mean = [];
            const std = [];

            for (let i = 0; i < len; i++) {
                const values = dataArrays.map(d => d[i]);
                const m = values.reduce((a, b) => a + b, 0) / values.length;
                const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
                mean.push(m);
                std.push(Math.sqrt(variance));
            }

            return { mean, std };
        },

        getChartOptions(yAxisLabel, mode, yAxisConfig = {}) {
            const showLegend = mode === 'exploration';

            return {
                responsive: true,
                maintainAspectRatio: true,
                interaction: {
                    mode: mode === 'exploration' ? 'index' : 'nearest',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: showLegend,
                        position: 'bottom',
                        maxHeight: 90,
                        labels: {
                            font: { size: 11 },
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        enabled: showLegend,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 11 },
                        cornerRadius: 6
                    },
                    zoom: mode === 'exploration' ? {
                        pan: { enabled: true },
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'xy'
                        }
                    } : undefined
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Epoch',
                            font: { size: 12, weight: 'bold' }
                        },
                        grid: { display: true, color: '#f0f0f0' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: yAxisLabel,
                            font: { size: 12, weight: 'bold' }
                        },
                        grid: { display: true, color: '#f0f0f0' },
                        ...yAxisConfig
                    }
                }
            };
        }
    };

    global.TrainingAnalysis = TrainingAnalysis;

})(window);
