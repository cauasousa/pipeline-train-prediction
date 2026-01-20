/**
 * 📊 Análise Científica de Treino - Versão Profissional
 * Separação completa: Exploração (interativo) vs Publicação (clean/acadêmico)
 */
(function (global) {
    'use strict';

    const TrainingAnalysis = {
        charts: {},
        currentData: null,
        mode: 'exploration', // 'exploration' | 'publication'
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

        // Plugin simples para rótulos em cima dos pontos
        pointValuePlugin: {
            id: 'pointValuePlugin',
            afterDatasetsDraw(chart, args, options) {
                if (!options?.enabled) return;
                const { ctx } = chart;
                ctx.save();
                ctx.font = options.font || '10px Inter, sans-serif';
                ctx.fillStyle = options.color || '#475569';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    if (!meta || !meta.data) return;
                    meta.data.forEach((element, index) => {
                        const value = dataset.data?.[index];
                        if (value === null || value === undefined) return;
                        const text = options.formatter ? options.formatter(value) : value;
                        const { x, y } = element.tooltipPosition();
                        ctx.fillText(text, x, y - 6);
                    });
                });

                ctx.restore();
            }
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
            // Configuração removida - modo fixo em 'publication'
        },

        setVisualizationMode(newMode) {
            this.mode = newMode;
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

        // Dentro do objeto TrainingAnalysis...

        renderAnalysis() {
            const resultsDiv = document.getElementById('analysis-results');
            if (!resultsDiv || !this.currentData) return;

            resultsDiv.style.display = 'block';
            this.renderTrainingInfo(); // Renderiza os badges de topo

            // Destruir antigos e renderizar novos
            const chartConfigs = [
                { id: 'loss', func: 'renderLossChart' },
                { id: 'gap', func: 'renderGapChart' },
                { id: 'acc_top1', func: 'renderAccTop1Chart' },
                { id: 'acc_top5', func: 'renderAccTop5Chart' },
                { id: 'delta_acc', func: 'renderDeltaAccChart' },
                { id: 'stability', func: 'renderStabilityChart' },
                { id: 'lr', func: 'renderLRChart' },
                { id: 'mini_area', func: 'renderMiniAreaChart' },
                { id: 'time', func: 'renderTimeChart' },
                { id: 'correlation', func: 'renderCorrelationChart' }
            ];

            chartConfigs.forEach(cfg => {
                if (this.charts[cfg.id]) this.charts[cfg.id].destroy();
                this[cfg.func]();
            });

            resultsDiv.scrollIntoView({ behavior: 'smooth' });
        },

        // Exemplo de configuração para o Gráfico 9 (Correlação) com visual moderno
        renderCorrelationChart() {
            const ctx = document.getElementById('chart-correlation')?.getContext('2d');
            if (!ctx) return;

            const datasets = this.currentData.map((data, idx) => ({
                label: data.training_name,
                data: data.val_loss.map((loss, i) => ({ x: loss, y: data.acc_top1[i] })),
                backgroundColor: 'rgba(37, 99, 235, 0.5)',
                borderColor: '#2563eb',
                pointRadius: 3,
                pointHoverRadius: 6
            }));

            this.charts['correlation'] = new Chart(ctx, {
                type: 'scatter',
                data: { datasets },
                options: this.getChartOptions('Accuracy', this.mode, {
                    scales: {
                        x: { title: { display: true, text: 'Loss' } },
                        y: { title: { display: true, text: 'Accuracy' }, min: 0, max: 1 }
                    }
                })
            });
        },

        renderTrainingInfo() {
            const infoDiv = document.getElementById('training-info');
            if (!infoDiv || !this.currentData || this.currentData.length === 0) return;

            const numTrainings = this.currentData.length;
            const avgEpochs = Math.round(
                this.currentData.reduce((sum, d) => sum + (d.epochs?.length || 0), 0) / numTrainings
            );
            const primary = this.currentData[this.getPrimaryRunIndex()] || this.currentData[0];

            infoDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; padding: 16px 0;">
                    <div style="font-size: 0.95rem;">
                        <span style="color: #666;">Nome do Treino:</span>
                        <span style="font-weight: 700; font-size: 1rem; color: #333; display: block;">🏷️ ${primary?.training_name || 'Treino'}</span>
                    </div>
                    <div style="font-size: 0.95rem;">
                        <span style="color: #666;">Treinos carregados:</span>
                        <span style="font-weight: 700; font-size: 1rem; color: #333; display: block;">${numTrainings}</span>
                    </div>
                    <div style="font-size: 0.95rem;">
                        <span style="color: #666;">Média de epochs:</span>
                        <span style="font-weight: 700; font-size: 1rem; color: #333; display: block;">${avgEpochs}</span>
                    </div>
                </div>
            `;
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

        // Insets removidos para evitar sobreposição
        renderInset() {
            // Funcionalidade desabilitada
        },

        // ===== GRÁFICOS =====

        renderLossChart() {
            const ctx = document.getElementById('chart-loss')?.getContext('2d');
            if (!ctx) return;

            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];
            if (!run) return;

            const labels = Array.isArray(run.epochs) && run.epochs.length ? run.epochs : this.getUnifiedLabels();
            const targetLen = this.getMaxEpochs();
            const datasets = [
                {
                    label: 'Train Loss',
                    data: this.padSeries(run.train_loss, targetLen),
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    fill: true
                },
                {
                    label: 'Val Loss',
                    data: this.padSeries(run.val_loss, targetLen),
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    fill: true,
                    borderDash: [5, 5]
                }
            ];

            const options = this.getChartOptions('Loss', this.mode);
            options.plugins.pointValue = {
                enabled: true,
                formatter: (v) => typeof v === 'number' ? v.toFixed(2) : ''
            };

            this.charts['loss'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets
                },
                options
            });
        },

        getExplorationDatasets_Loss() {
            // Modo exploração: todas as curvas, cores diferentes
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const datasets = [];
            const targetLen = this.getMaxEpochs();

            this.currentData.forEach((data, idx) => {
                const color = colors[idx % colors.length];
                const isSelected = this.selectedRuns.has(idx);
                const opacity = isSelected ? 1 : 0.3;
                const width = isSelected ? 2.5 : 1.5;

                datasets.push({
                    label: `${data.training_name} - Train`,
                    data: this.padSeries(data.train_loss, targetLen),
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
                    data: this.padSeries(data.val_loss, targetLen),
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

        // Simples: duas linhas (azul: train_loss, laranja: val_loss) do treino selecionado
        getSimpleDatasets_Loss(runIdx) {
            const data = this.currentData?.[runIdx];
            if (!data) return [];
            const targetLen = this.getMaxEpochs();
            const train = this.padSeries(data.train_loss, targetLen);
            const val = this.padSeries(data.val_loss, targetLen);
            return [
                {
                    label: 'Train Loss',
                    data: train,
                    borderColor: '#3b82f6',
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4
                },
                {
                    label: 'Val Loss',
                    data: val,
                    borderColor: '#f59e0b',
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderDash: [5, 5]
                }
            ];
        },

        renderGapChart() {
            const ctx = document.getElementById('chart-gap')?.getContext('2d');
            if (!ctx) return;

            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];
            if (!run) return;

            const labels = Array.isArray(run.epochs) && run.epochs.length ? run.epochs : this.getUnifiedLabels();
            const targetLen = this.getMaxEpochs();
            const gap = this.safeSubtractArrays(run.val_loss, run.train_loss);
            const datasets = [
                {
                    label: 'Gap (val_loss − train_loss)',
                    data: this.padSeries(gap, targetLen),
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    backgroundColor: 'rgba(245, 158, 11, 0.18)',
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    fill: true
                }
            ];

            this.charts['gap'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: (() => {
                    const options = this.getChartOptions('Gap', 'exploration');
                    options.plugins.pointValue = {
                        enabled: true,
                        formatter: (v) => typeof v === 'number' ? v.toFixed(3) : ''
                    };
                    return options;
                })()
            });
        },

        getPublicationDatasets_Gap() {
            const targetLen = this.getMaxEpochs();
            const gaps = this.currentData.map(d => {
                const raw = this.safeSubtractArrays(d.train_loss, d.val_loss);
                return this.padSeries(raw, targetLen);
            });
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
            const targetLen = this.getMaxEpochs();

            this.currentData.forEach((data, idx) => {
                const gapRaw = this.safeSubtractArrays(data.train_loss, data.val_loss);
                const gap = this.padSeries(gapRaw, targetLen);
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

            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];
            if (!run) return;

            const labels = Array.isArray(run.epochs) && run.epochs.length ? run.epochs : this.getUnifiedLabels();
            const targetLen = this.getMaxEpochs();
            const datasets = [
                {
                    label: 'Accuracy Top-1',
                    data: this.padSeries(run.acc_top1, targetLen),
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    backgroundColor: 'rgba(59, 130, 246, 0.16)',
                    tension: 0.35,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    fill: true
                }
            ];

            this.charts['acc_top1'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: (() => {
                    const options = this.getChartOptions('Accuracy Top-1', 'exploration', { min: 0, max: 1 });
                    options.plugins.pointValue = {
                        enabled: true,
                        formatter: (v) => typeof v === 'number' ? v.toFixed(3) : ''
                    };
                    return options;
                })()
            });
        },

        getPublicationDatasets_AccTop1() {
            const targetLen = this.getMaxEpochs();
            const accs = this.currentData.map(d => this.padSeries(d.acc_top1, targetLen));
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
            const targetLen = this.getMaxEpochs();

            this.currentData.forEach((data, idx) => {
                const color = colors[idx % colors.length];
                const isSelected = this.selectedRuns.has(idx);

                datasets.push({
                    label: data.training_name,
                    data: this.padSeries(data.acc_top1, targetLen),
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
            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];
            if (!run) return;
            const labels = Array.isArray(run.epochs) && run.epochs.length ? run.epochs : this.getUnifiedLabels();
            const datasets = [{
                label: 'Accuracy Top-5',
                data: this.padSeries(run.acc_top5, this.getMaxEpochs()),
                borderColor: '#10b981',
                borderWidth: 2.5,
                backgroundColor: 'transparent',
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 4
            }];

            this.charts['acc_top5'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: this.getChartOptions('Accuracy Top-5', this.mode, { min: 0, max: 1 })
            });
        },

        getPublicationDatasets_AccTop5() {
            const targetLen = this.getMaxEpochs();
            const accs = this.currentData.map(d => this.padSeries(d.acc_top5, targetLen));
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
            const targetLen = this.getMaxEpochs();

            this.currentData.forEach((data, idx) => {
                const color = colors[idx % colors.length];
                const isSelected = this.selectedRuns.has(idx);

                datasets.push({
                    label: data.training_name,
                    data: this.padSeries(data.acc_top5, targetLen),
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
            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];
            if (!run) return;
            const labels = Array.isArray(run.epochs) && run.epochs.length ? run.epochs : this.getUnifiedLabels();
            const raw = this.safeSubtractArrays(run.acc_top1, run.acc_top5);
            const delta = this.padSeries(raw.map(v => typeof v === 'number' ? -v : v), this.getMaxEpochs());
            const datasets = [{
                label: 'Δ Top-5 − Top-1',
                data: delta,
                borderColor: '#8b5cf6',
                borderWidth: 2,
                backgroundColor: 'rgba(139, 92, 246, 0.16)',
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 5,
                fill: true
            }];

            this.charts['delta_acc'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: (() => {
                    const options = this.getChartOptions('Diferença (Top-5 − Top-1)', this.mode);
                    options.plugins.pointValue = {
                        enabled: true,
                        formatter: (v) => typeof v === 'number' ? v.toFixed(3) : ''
                    };
                    return options;
                })()
            });
        },

        getPublicationDatasets_DeltaAcc() {
            const targetLen = this.getMaxEpochs();
            const deltas = this.currentData.map(d => {
                const raw = this.safeSubtractArrays(d.acc_top1, d.acc_top5);
                return this.padSeries(raw.map(v => typeof v === 'number' ? -v : v), targetLen);
            });
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
            const targetLen = this.getMaxEpochs();

            this.currentData.forEach((data, idx) => {
                const raw = this.safeSubtractArrays(data.acc_top1, data.acc_top5);
                const delta = this.padSeries(raw.map(v => typeof v === 'number' ? -v : v), targetLen);
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

        renderStabilityChart(customWindowSize = null) {
            const ctx = document.getElementById('chart-stability')?.getContext('2d');
            if (!ctx) return;

            const windowSizeInput = document.getElementById('window-size-input');
            const windowSize = customWindowSize || (windowSizeInput ? parseInt(windowSizeInput.value) : 5);

            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];

            if (!run || !run.val_loss || run.val_loss.length === 0) return;

            const labels = Array.isArray(run.epochs) && run.epochs.length ? run.epochs : this.getUnifiedLabels();

            // Calcula variância para Loss e Accuracy Top-1
            const varianceLoss = this.calculateRollingVariance(run.val_loss, windowSize);
            const varianceAcc = run.acc_top1 ? this.calculateRollingVariance(run.acc_top1, windowSize) : [];

            // Ajusta labels para o tamanho da variância (começa a partir do índice windowSize-1)
            const varianceLabels = labels.slice(windowSize - 1);

            const datasets = [
                {
                    label: 'Variância: Erro (val/Loss)',
                    data: varianceLoss,
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointStyle: 'dash',
                    fill: true
                },
                {
                    label: 'Variância: Acerto (Top-1)',
                    data: varianceAcc,
                    borderColor: '#22c55e',
                    borderWidth: 2,
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointStyle: 'dash',
                    fill: true
                }
            ];

            // Destroy anterior se existir
            if (this.charts['stability']) {
                this.charts['stability'].destroy();
            }

            this.charts['stability'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: varianceLabels,
                    datasets: datasets
                },
                options: (() => {
                    const options = this.getChartOptions('Estabilidade', 'exploration');
                    options.plugins.pointValue = {
                        enabled: true,
                        formatter: (v) => typeof v === 'number' ? v.toFixed(4) : ''
                    };
                    return options;
                })()
            });

            // Adiciona listener apenas uma vez
            if (windowSizeInput && !windowSizeInput.dataset.listenerAttached) {
                windowSizeInput.addEventListener('change', () => {
                    this.renderStabilityChart();
                });
                windowSizeInput.dataset.listenerAttached = 'true';
            }
        },

        getPublicationDatasets_Stability(windowSize) {
            const targetLen = this.getMaxEpochs();
            const variances = this.currentData.map(d =>
                this.calculateRollingVariance(this.padSeries(d.val_loss, targetLen), windowSize)
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
            const targetLen = this.getMaxEpochs();

            this.currentData.forEach((data, idx) => {
                const variance = this.calculateRollingVariance(this.padSeries(data.val_loss, targetLen), windowSize);
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
                // Se houver null/NaN na janela, retorna null para manter integridade
                if (window.some(v => typeof v !== 'number' || Number.isNaN(v))) {
                    result.push(null);
                    continue;
                }
                const mean = window.reduce((a, b) => a + b, 0) / windowSize;
                const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowSize;
                result.push(variance);
            }
            return result;
        },

        renderLRChart() {
            const ctx = document.getElementById('chart-lr')?.getContext('2d');
            if (!ctx) return;

            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];
            if (!run) return;

            const datasets = [
                {
                    label: 'lr/pg0(Bias)',
                    data: this.padSeries(run.lr_pg0, this.getMaxEpochs()),
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    backgroundColor: 'rgba(59, 130, 246, 0.14)',
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointStyle: 'line',
                    fill: true
                },
                {
                    label: 'lr/pg1(Weights)',
                    data: this.padSeries(run.lr_pg1, this.getMaxEpochs()),
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    backgroundColor: 'rgba(239, 68, 68, 0.14)',
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointStyle: 'line',
                    fill: true
                },
                {
                    label: 'lr/pg2(Normalização)',
                    data: this.padSeries(run.lr_pg2, this.getMaxEpochs()),
                    borderColor: '#10b981',
                    borderWidth: 2,
                    backgroundColor: 'rgba(16, 185, 129, 0.14)',
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointStyle: 'line',
                    fill: true
                }
            ];

            const options = this.getChartOptions('Learning Rate', this.mode, {
                type: 'logarithmic',
                min: 0.00001
            });

            // Configurar legenda com pointStyle line
            options.plugins.legend.labels.usePointStyle = true;
            options.plugins.legend.labels.pointStyle = 'line';

            // Customizar tooltip para mostrar 5 casas decimais
            options.plugins.tooltip.callbacks = {
                ...options.plugins.tooltip.callbacks,
                label: function (context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += context.parsed.y.toFixed(5);
                    }
                    return label;
                }
            };

            this.charts['lr'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: run.epochs || this.getUnifiedLabels(),
                    datasets: datasets
                },
                options: (() => {
                    const options = this.getChartOptions('Loss', this.mode);
                    options.plugins.pointValue = {
                        enabled: true,
                        formatter: (v) => typeof v === 'number' ? v.toFixed(5) : ''
                    };
                    return options;
                })()
            });
        },

        getPublicationDatasets_LR() {
            const targetLen = this.getMaxEpochs();
            const lrArrays = this.currentData.map(d => this.padSeries(d.lr_pg0, targetLen));
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
                    data: this.padSeries(data.lr_pg0, this.getMaxEpochs()),
                    borderColor: colors[0],
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 1,
                    pointHoverRadius: 5,

                });
                datasets.push({
                    label: 'lr/pg1',
                    data: this.padSeries(data.lr_pg1, this.getMaxEpochs()),
                    borderColor: colors[1],
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 1,
                    pointHoverRadius: 5
                });
                datasets.push({
                    label: 'lr/pg2',
                    data: this.padSeries(data.lr_pg2, this.getMaxEpochs()),
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
                        data: this.padSeries(data.lr_pg0, this.getMaxEpochs()),
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

        renderMiniAreaChart() {
            const ctx = document.getElementById('chart-mini-area')?.getContext('2d');
            if (!ctx) return;

            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];
            if (!run || !Array.isArray(run.val_loss)) return;

            const slice = Math.min(run.val_loss.length, 20);
            const data = run.val_loss.slice(-slice);
            const labels = Array.isArray(run.epochs) && run.epochs.length
                ? run.epochs.slice(-slice)
                : Array.from({ length: slice }, (_, i) => run.val_loss.length - slice + i + 1);

            if (this.charts['mini_area']) this.charts['mini_area'].destroy();

            this.charts['mini_area'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Val Loss',
                        data,
                        borderColor: '#f59e0b',
                        borderWidth: 1.5,
                        backgroundColor: 'rgba(245, 158, 11, 0.18)',
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#ffffff',
                            titleColor: '#0f172a',
                            bodyColor: '#475569',
                            borderColor: '#e2e8f0',
                            borderWidth: 1,
                            padding: 8,
                            callbacks: {
                                label: (ctx) => `Val Loss: ${typeof ctx.parsed.y === 'number' ? ctx.parsed.y.toFixed(3) : ''}`
                            }
                        }
                    },
                    scales: {
                        x: { display: false },
                        y: { display: false }
                    },
                    elements: {
                        line: { borderCapStyle: 'round' },
                        point: { radius: 0, hoverRadius: 0 }
                    }
                }
            });
        },

        renderTimeChart() {
            const ctx = document.getElementById('chart-time')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '⏱️ Tempo por Epoch', this.interpretations.time);
            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];
            if (!run) return;
            const datasets = [{
                label: run.training_name || 'Tempo/Epoch',
                data: run.time,
                borderColor: '#3b82f6',
                backgroundColor: '#3b82f680',
                borderWidth: 1,
                borderRadius: 3
            }];

            const options = this.getChartOptions('Tempo (s)', this.mode);
            options.plugins.legend.labels.usePointStyle = true;
            options.plugins.legend.labels.pointStyle = 'line';

            this.charts['time'] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: run.epochs || this.getUnifiedLabels(),
                    datasets: datasets
                },
                options: options
            });
        },

        renderCorrelationChart() {
            const ctx = document.getElementById('chart-correlation')?.getContext('2d');
            if (!ctx) return;

            this.insertChartHeader(ctx, '🔗 Correlação: Loss × Accuracy', this.interpretations.correlation);
            const runIdx = this.getPrimaryRunIndex();
            const run = this.currentData?.[runIdx];
            if (!run) return;
            const scatterData = run.val_loss.map((loss, i) => ({ x: loss, y: run.acc_top1[i] }));

            // Calcula regressão linear simples (y = a x + b) sobre os pontos válidos
            const validPoints = scatterData.filter(p => typeof p.x === 'number' && typeof p.y === 'number');
            let regressionLine = null;
            if (validPoints.length >= 2) {
                const n = validPoints.length;
                let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                validPoints.forEach(p => {
                    sumX += p.x;
                    sumY += p.y;
                    sumXY += p.x * p.y;
                    sumX2 += p.x * p.x;
                });
                const denominator = (n * sumX2 - sumX * sumX);
                if (denominator !== 0) {
                    const slope = (n * sumXY - sumX * sumY) / denominator;
                    const intercept = (sumY - slope * sumX) / n;
                    // desenha reta do xmin ao xmax dos dados
                    const xs = validPoints.map(p => p.x);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    regressionLine = [
                        { x: minX, y: slope * minX + intercept },
                        { x: maxX, y: slope * maxX + intercept }
                    ];
                }
            }

            const datasets = [{
                label: run.training_name || 'Correlação',
                data: scatterData,
                backgroundColor: '#2563eb80',
                borderColor: '#2563eb',
                pointRadius: 4.5,
                pointHoverRadius: 6.5,
                pointStyle: 'circle',
                borderWidth: 1.25,
                showLine: false
            }];

            if (regressionLine) {
                datasets.push({
                    label: 'Tendência (regressão linear)',
                    data: regressionLine,
                    type: 'line',
                    borderColor: '#1d4ed8',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    pointStyle: 'line',
                    tension: 0,
                    fill: false
                });
            }

            const options = this.getChartOptions('Correlação', this.mode, { min: 0, max: 1 });
            options.plugins.legend.labels.usePointStyle = true;
            // mantém ponto circular para o scatter e traço para a regressão
            options.plugins.legend.labels.pointStyle = 'circle';

            this.charts['correlation'] = new Chart(ctx, {
                type: 'scatter',
                data: { datasets: datasets },
                options: options
            });
        },

        // ===== HELPERS =====
        // Número máximo de epochs entre os treinos carregados
        getMaxEpochs() {
            if (!Array.isArray(this.currentData) || this.currentData.length === 0) return 0;
            return this.currentData.reduce((max, d) => Math.max(max, (d.epochs?.length || 0)), 0);
        },

        // Labels unificados (usa o treino com mais epochs ou fallback 1..N)
        getUnifiedLabels() {
            const maxLen = this.getMaxEpochs();
            if (maxLen === 0) return [];
            const ref = this.currentData.reduce((best, d) => (d.epochs?.length || 0) > (best?.epochs?.length || 0) ? d : best, null);
            if (ref && Array.isArray(ref.epochs) && ref.epochs.length === maxLen) return ref.epochs;
            return Array.from({ length: maxLen }, (_, i) => i + 1);
        },

        // Pad de séries com null para alinhar tamanhos
        padSeries(arr, targetLen) {
            const out = Array.isArray(arr) ? arr.slice(0, targetLen) : [];
            while (out.length < targetLen) out.push(null);
            return out;
        },

        // Subtração segura elemento a elemento (val - train)
        safeSubtractArrays(train, val) {
            const len = Math.max(train?.length || 0, val?.length || 0);
            const res = [];
            for (let i = 0; i < len; i++) {
                const tv = train?.[i];
                const vv = val?.[i];
                res.push((typeof tv === 'number' && typeof vv === 'number') ? (vv - tv) : null);
            }
            return res;
        },

        // Índice principal: primeiro selecionado, senão 0
        getPrimaryRunIndex() {
            if (this.selectedRuns && this.selectedRuns.size > 0) {
                return Math.min(...Array.from(this.selectedRuns));
            }
            return 0;
        },

        // Estatísticas por índice ignorando null/NaN
        calculateStats(dataArrays) {
            if (!Array.isArray(dataArrays) || dataArrays.length === 0) return { mean: [], std: [] };
            const len = dataArrays.reduce((m, d) => Math.max(m, d?.length || 0), 0);
            const mean = [];
            const std = [];
            for (let i = 0; i < len; i++) {
                const vals = dataArrays.map(d => d?.[i]).filter(v => typeof v === 'number' && !Number.isNaN(v));
                if (vals.length === 0) {
                    mean.push(null);
                    std.push(null);
                    continue;
                }
                const m = vals.reduce((a, b) => a + b, 0) / vals.length;
                const variance = vals.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / vals.length;
                mean.push(m);
                std.push(Math.sqrt(variance));
            }
            return { mean, std };
        },

        getChartOptions(yAxisLabel, mode, yAxisConfig = {}) {
            return {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            boxWidth: 8,
                            usePointStyle: true,
                            font: { size: 12, family: 'Inter' }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#ffffff',
                        titleColor: '#0f172a',
                        bodyColor: '#64748b',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            labelColor: function (context) {
                                return {
                                    borderColor: context.dataset.borderColor,
                                    backgroundColor: context.dataset.borderColor,
                                };
                            }
                        }
                    },
                    pointValue: {
                        enabled: false
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 11 } }
                    },
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: { color: '#94a3b8', font: { size: 11 } },
                        border: { display: false },
                        ...yAxisConfig
                    }
                },
                elements: {
                    line: { tension: 0.4, borderWidth: 2 },
                    point: { radius: 0, hoverRadius: 4, pointStyle: 'line' }
                }
            };
        }
    };

    // Registrar plugin de rótulos de ponto
    if (window.Chart) {
        window.Chart.register(TrainingAnalysis.pointValuePlugin);
    }

    global.TrainingAnalysis = TrainingAnalysis;

})(window);
