/**
 * Módulo de Análise de Treino - Versão Profissional
 * Com modo Exploração (interativo) e Publicação (clean)
 */
(function (global) {
    'use strict';

    const TrainingAnalysis = {
        charts: {},
        currentData: null,
        visualizationMode: 'publication', // 'exploration' ou 'publication'
        selectedRun: null,

        init() {
            this.loadTrainings();
            this.attachEventListeners();
            this.initVisualizationToggle();
        },

        attachEventListeners() {
            const analysisMode = document.getElementById('analysis-mode');
            const runBtn = document.getElementById('run-analysis-btn');

            if (analysisMode) {
                analysisMode.addEventListener('change', () => this.onModeChange());
            }

            if (runBtn) {
                runBtn.addEventListener('click', () => this.runAnalysis());
            }
        },

        initVisualizationToggle() {
            const resultsDiv = document.getElementById('analysis-results');
            if (!resultsDiv) return;

            // Adiciona toggle de modo no header dos resultados
            const header = document.getElementById('training-info');
            if (header) {
                const toggle = document.createElement('div');
                toggle.style.cssText = `
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    background: #f8f9fa;
                    padding: 8px 12px;
                    border-radius: 6px;
                `;
                toggle.innerHTML = `
                    <label style="font-size: 0.85rem; display: flex; gap: 6px; align-items: center; cursor: pointer;">
                        <input type="radio" name="viz-mode" value="publication" checked style="cursor: pointer;"> 
                        📄 Publicação
                    </label>
                    <label style="font-size: 0.85rem; display: flex; gap: 6px; align-items: center; cursor: pointer;">
                        <input type="radio" name="viz-mode" value="exploration" style="cursor: pointer;"> 
                        🔍 Exploração
                    </label>
                `;
                
                toggle.querySelectorAll('input').forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        this.visualizationMode = e.target.value;
                        this.renderAnalysis();
                    });
                });

                header.style.position = 'relative';
                header.appendChild(toggle);
            }
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
            this.renderAnalysis();
        },

        renderAnalysis() {
            const resultsDiv = document.getElementById('analysis-results');
            if (!resultsDiv) return;

            resultsDiv.style.display = 'block';
            this.renderTrainingInfo();

            Object.values(this.charts).forEach(chart => chart.destroy());
            this.charts = {};

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
            const avgEpochs = Math.round(this.currentData.reduce((sum, d) => sum + d.epochs.length, 0) / numTrainings);

            let html = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">`;
            html += `<div><strong>📊 Treinos:</strong> ${numTrainings}</div>`;
            html += `<div><strong>⏱️ Epochs Médios:</strong> ${avgEpochs}</div>`;

            if (numTrainings === 1) {
                html += `<div><strong>🏷️ Nome:</strong> ${this.currentData[0].training_name}</div>`;
            }

            html += `</div>`;
            infoDiv.innerHTML = html;
        },

        // Tooltip helper
        addTooltip(titleEl, text) {
            const tooltipIcon = document.createElement('span');
            tooltipIcon.innerHTML = ' <i class="fas fa-question-circle" style="cursor: help; color: #666; font-size: 0.85em;"></i>';
            tooltipIcon.style.position = 'relative';
            
            const tooltip = document.createElement('div');
            tooltip.style.cssText = `
                position: absolute;
                bottom: 125%;
                left: 50%;
                transform: translateX(-50%);
                background: #333;
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 0.8rem;
                white-space: normal;
                max-width: 250px;
                z-index: 1000;
                display: none;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                pointer-events: none;
                text-align: left;
                line-height: 1.4;
            `;
            tooltip.textContent = text;
            
            tooltipIcon.style.position = 'relative';
            tooltipIcon.appendChild(tooltip);
            tooltipIcon.addEventListener('mouseenter', () => tooltip.style.display = 'block');
            tooltipIcon.addEventListener('mouseleave', () => tooltip.style.display = 'none');
            
            titleEl.appendChild(tooltipIcon);
        },

        // Calcula média e std para visualização
        calculateStats(dataArrays) {
            if (dataArrays.length === 0) return { mean: [], std: [] };
            const len = dataArrays[0].length;
            const mean = [];
            const std = [];

            for (let i = 0; i < len; i++) {
                const values = dataArrays.map(d => d[i]);
                const m = values.reduce((a, b) => a + b, 0) / values.length;
                const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
                const s = Math.sqrt(variance);
                mean.push(m);
                std.push(s);
            }

            return { mean, std };
        },

        renderLossChart() {
            const ctx = document.getElementById('chart-loss')?.getContext('2d');
            if (!ctx) return;

            const canvasContainer = ctx.canvas.parentElement;
            const titleEl = canvasContainer.querySelector('h3') || document.createElement('h3');
            
            if (!canvasContainer.querySelector('h3')) {
                titleEl.textContent = 'Curva de Loss (Treino × Validação)';
                titleEl.style.marginBottom = '12px';
                canvasContainer.insertBefore(titleEl, ctx.canvas);
                this.addTooltip(titleEl, 
                    'Linhas próximas → boa generalização\n' +
                    'Val subindo enquanto train cai → overfitting'
                );
            }

            const datasets = [];
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

            if (this.visualizationMode === 'publication' && this.currentData.length > 1) {
                const trainLosses = this.currentData.map(d => d.train_loss);
                const valLosses = this.currentData.map(d => d.val_loss);
                
                const trainStats = this.calculateStats(trainLosses);
                const valStats = this.calculateStats(valLosses);

                // Faixa de variação (transparente)
                datasets.push({
                    label: 'Train Loss (±1σ)',
                    data: trainStats.mean.map((m, i) => m + trainStats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#3b82f620',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                });

                // Linha média (sólida, espessa)
                datasets.push({
                    label: 'Train Loss (Média)',
                    data: trainStats.mean,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                });

                datasets.push({
                    label: 'Val Loss (±1σ)',
                    data: valStats.mean.map((m, i) => m + valStats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#ef444420',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                });

                datasets.push({
                    label: 'Val Loss (Média)',
                    data: valStats.mean,
                    borderColor: '#ef4444',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                });
            } else {
                this.currentData.forEach((data, idx) => {
                    const color = colors[idx % colors.length];
                    
                    datasets.push({
                        label: `${data.training_name} - Train`,
                        data: data.train_loss,
                        borderColor: color,
                        borderWidth: 2,
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 4,
                        fill: false
                    });

                    datasets.push({
                        label: `${data.training_name} - Val`,
                        data: data.val_loss,
                        borderColor: color,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 4,
                        fill: false
                    });
                });
            }

            this.charts['loss'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    interaction: { mode: this.visualizationMode === 'exploration' ? 'index' : 'nearest' },
                    plugins: {
                        legend: {
                            display: this.visualizationMode === 'exploration',
                            position: 'bottom',
                            maxHeight: 80,
                            labels: { font: { size: 11 } }
                        },
                        tooltip: {
                            enabled: this.visualizationMode === 'exploration'
                        }
                    },
                    scales: {
                        x: { 
                            title: { display: true, text: 'Epoch', font: { size: 12, weight: 'bold' } }
                        },
                        y: { 
                            title: { display: true, text: 'Loss', font: { size: 12, weight: 'bold' } },
                            beginAtZero: false
                        }
                    }
                }
            });
        },

        renderGapChart() {
            const ctx = document.getElementById('chart-gap')?.getContext('2d');
            if (!ctx) return;

            const canvasContainer = ctx.canvas.parentElement;
            const titleEl = canvasContainer.querySelector('h3') || document.createElement('h3');
            
            if (!canvasContainer.querySelector('h3')) {
                titleEl.textContent = 'Gap de Generalização (val − train)';
                titleEl.style.marginBottom = '12px';
                canvasContainer.insertBefore(titleEl, ctx.canvas);
                this.addTooltip(titleEl,
                    'Gap pequeno e estável → modelo robusto\n' +
                    'Gap crescente → memoriza treino'
                );
            }

            const datasets = [];
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

            if (this.visualizationMode === 'publication' && this.currentData.length > 1) {
                const gaps = this.currentData.map(d => d.val_loss.map((v, i) => v - d.train_loss[i]));
                const stats = this.calculateStats(gaps);

                datasets.push({
                    label: 'Gap (±1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#f59e0b30',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                });

                datasets.push({
                    label: 'Gap (Médio)',
                    data: stats.mean,
                    borderColor: '#f59e0b',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                });
            } else {
                this.currentData.forEach((data, idx) => {
                    const gap = data.val_loss.map((v, i) => v - data.train_loss[i]);
                    datasets.push({
                        label: data.training_name,
                        data: gap,
                        borderColor: colors[idx % colors.length],
                        borderWidth: 2,
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 4,
                        fill: false
                    });
                });
            }

            this.charts['gap'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: this.visualizationMode === 'exploration',
                            position: 'bottom',
                            maxHeight: 80,
                            labels: { font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Epoch' } },
                        y: { title: { display: true, text: 'Gap (val − train)' } }
                    }
                }
            });
        },

        renderAccTop1Chart() {
            const ctx = document.getElementById('chart-acc-top1')?.getContext('2d');
            if (!ctx) return;

            const canvasContainer = ctx.canvas.parentElement;
            const titleEl = canvasContainer.querySelector('h3') || document.createElement('h3');
            
            if (!canvasContainer.querySelector('h3')) {
                titleEl.textContent = 'Accuracy Top-1 × Epoch';
                titleEl.style.marginBottom = '12px';
                canvasContainer.insertBefore(titleEl, ctx.canvas);
                this.addTooltip(titleEl,
                    'Crescimento rápido → classes fáceis\n' +
                    'Platô precoce → limitação do modelo/dados'
                );
            }

            const datasets = [];
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

            if (this.visualizationMode === 'publication' && this.currentData.length > 1) {
                const accs = this.currentData.map(d => d.acc_top1);
                const stats = this.calculateStats(accs);

                datasets.push({
                    label: 'Top-1 (±1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#3b82f630',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                });

                datasets.push({
                    label: 'Top-1 (Médio)',
                    data: stats.mean,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                });
            } else {
                this.currentData.forEach((data, idx) => {
                    datasets.push({
                        label: data.training_name,
                        data: data.acc_top1,
                        borderColor: colors[idx % colors.length],
                        borderWidth: 2,
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 4,
                        fill: false
                    });
                });
            }

            this.charts['acc_top1'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: this.visualizationMode === 'exploration',
                            position: 'bottom',
                            maxHeight: 80,
                            labels: { font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Epoch' } },
                        y: { 
                            title: { display: true, text: 'Accuracy Top-1' },
                            min: 0,
                            max: 1
                        }
                    }
                }
            });
        },

        renderAccTop5Chart() {
            const ctx = document.getElementById('chart-acc-top5')?.getContext('2d');
            if (!ctx) return;

            const canvasContainer = ctx.canvas.parentElement;
            const titleEl = canvasContainer.querySelector('h3') || document.createElement('h3');
            
            if (!canvasContainer.querySelector('h3')) {
                titleEl.textContent = 'Accuracy Top-5 × Epoch';
                titleEl.style.marginBottom = '12px';
                canvasContainer.insertBefore(titleEl, ctx.canvas);
                this.addTooltip(titleEl,
                    'Top-5 alto e Top-1 baixo → classes semelhantes\n' +
                    'Diferença pequena → separação clara'
                );
            }

            const datasets = [];
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

            if (this.visualizationMode === 'publication' && this.currentData.length > 1) {
                const accs = this.currentData.map(d => d.acc_top5);
                const stats = this.calculateStats(accs);

                datasets.push({
                    label: 'Top-5 (±1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#10b98130',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                });

                datasets.push({
                    label: 'Top-5 (Médio)',
                    data: stats.mean,
                    borderColor: '#10b981',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                });
            } else {
                this.currentData.forEach((data, idx) => {
                    datasets.push({
                        label: data.training_name,
                        data: data.acc_top5,
                        borderColor: colors[idx % colors.length],
                        borderWidth: 2,
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 4,
                        fill: false
                    });
                });
            }

            this.charts['acc_top5'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: this.visualizationMode === 'exploration',
                            position: 'bottom',
                            maxHeight: 80,
                            labels: { font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Epoch' } },
                        y: { 
                            title: { display: true, text: 'Accuracy Top-5' },
                            min: 0,
                            max: 1
                        }
                    }
                }
            });
        },

        renderDeltaAccChart() {
            const ctx = document.getElementById('chart-delta-acc')?.getContext('2d');
            if (!ctx) return;

            const canvasContainer = ctx.canvas.parentElement;
            const titleEl = canvasContainer.querySelector('h3') || document.createElement('h3');
            
            if (!canvasContainer.querySelector('h3')) {
                titleEl.textContent = 'Diferença Top-5 − Top-1 (Ambiguidade)';
                titleEl.style.marginBottom = '12px';
                canvasContainer.insertBefore(titleEl, ctx.canvas);
                this.addTooltip(titleEl,
                    'Δ grande → classes visualmente parecidas\n' +
                    'Δ pequeno → separação clara'
                );
            }

            const datasets = [];
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

            if (this.visualizationMode === 'publication' && this.currentData.length > 1) {
                const deltas = this.currentData.map(d => d.acc_top5.map((v, i) => v - d.acc_top1[i]));
                const stats = this.calculateStats(deltas);

                datasets.push({
                    label: 'Δ (±1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#8b5cf630',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                });

                datasets.push({
                    label: 'Δ (Médio)',
                    data: stats.mean,
                    borderColor: '#8b5cf6',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                });
            } else {
                this.currentData.forEach((data, idx) => {
                    const delta = data.acc_top5.map((v, i) => v - data.acc_top1[i]);
                    datasets.push({
                        label: data.training_name,
                        data: delta,
                        borderColor: colors[idx % colors.length],
                        borderWidth: 2,
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 4,
                        fill: false
                    });
                });
            }

            this.charts['delta_acc'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: this.visualizationMode === 'exploration',
                            position: 'bottom',
                            maxHeight: 80,
                            labels: { font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Epoch' } },
                        y: { title: { display: true, text: 'Δ (Top-5 − Top-1)' } }
                    }
                }
            });
        },

        renderStabilityChart() {
            const ctx = document.getElementById('chart-stability')?.getContext('2d');
            if (!ctx) return;

            const canvasContainer = ctx.canvas.parentElement;
            const titleEl = canvasContainer.querySelector('h3') || document.createElement('h3');
            
            if (!canvasContainer.querySelector('h3')) {
                titleEl.textContent = 'Estabilidade do Treino (Variância)';
                titleEl.style.marginBottom = '12px';
                canvasContainer.insertBefore(titleEl, ctx.canvas);
                this.addTooltip(titleEl,
                    'Alta variância → treino instável\n' +
                    'Variância baixa → convergência sólida'
                );
            }

            const datasets = [];
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
            const windowSize = 10;

            if (this.visualizationMode === 'publication' && this.currentData.length > 1) {
                const variances = this.currentData.map(d => this.calculateRollingVariance(d.val_loss, windowSize));
                const stats = this.calculateStats(variances);

                datasets.push({
                    label: 'Variância (±1σ)',
                    data: stats.mean.map((m, i) => m + stats.std[i]),
                    borderColor: 'transparent',
                    backgroundColor: '#ef444430',
                    borderWidth: 0,
                    fill: '-1',
                    pointRadius: 0
                });

                datasets.push({
                    label: 'Variância (Média)',
                    data: stats.mean,
                    borderColor: '#ef4444',
                    borderWidth: 3,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                });
            } else {
                this.currentData.forEach((data, idx) => {
                    const variance = this.calculateRollingVariance(data.val_loss, windowSize);
                    datasets.push({
                        label: data.training_name,
                        data: variance,
                        borderColor: colors[idx % colors.length],
                        borderWidth: 2,
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 4,
                        fill: false
                    });
                });
            }

            this.charts['stability'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs.slice(windowSize - 1),
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: this.visualizationMode === 'exploration',
                            position: 'bottom',
                            maxHeight: 80,
                            labels: { font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Epoch' } },
                        y: { title: { display: true, text: 'Variância (janela=10)' } }
                    }
                }
            });
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

            const canvasContainer = ctx.canvas.parentElement;
            const titleEl = canvasContainer.querySelector('h3') || document.createElement('h3');
            
            if (!canvasContainer.querySelector('h3')) {
                titleEl.textContent = 'Learning Rate Schedule';
                titleEl.style.marginBottom = '12px';
                canvasContainer.insertBefore(titleEl, ctx.canvas);
                this.addTooltip(titleEl,
                    'Queda brusca de LR → refinamento fino\n' +
                    'LR alto com loss alto → possível instabilidade'
                );
            }

            const datasets = [];
            const colors = ['#3b82f6', '#ef4444', '#10b981'];

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
                    pointHoverRadius: 4,
                    fill: false
                });
                datasets.push({
                    label: 'lr/pg1',
                    data: data.lr_pg1,
                    borderColor: colors[1],
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 1,
                    pointHoverRadius: 4,
                    fill: false
                });
                datasets.push({
                    label: 'lr/pg2',
                    data: data.lr_pg2,
                    borderColor: colors[2],
                    borderWidth: 2.5,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 1,
                    pointHoverRadius: 4,
                    fill: false
                });
            } else {
                this.currentData.forEach((data, idx) => {
                    datasets.push({
                        label: `${data.training_name} - lr/pg0`,
                        data: data.lr_pg0,
                        borderColor: colors[idx % colors.length],
                        borderWidth: 2,
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 4,
                        fill: false
                    });
                });
            }

            this.charts['lr'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.currentData[0].epochs,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: this.visualizationMode === 'exploration',
                            position: 'bottom',
                            maxHeight: 80,
                            labels: { font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Epoch' } },
                        y: { 
                            title: { display: true, text: 'Learning Rate' },
                            type: 'logarithmic'
                        }
                    }
                }
            });
        },

        renderTimeChart() {
            const ctx = document.getElementById('chart-time')?.getContext('2d');
            if (!ctx) return;

            const canvasContainer = ctx.canvas.parentElement;
            const titleEl = canvasContainer.querySelector('h3') || document.createElement('h3');
            
            if (!canvasContainer.querySelector('h3')) {
                titleEl.textContent = 'Tempo por Epoch (Eficiência)';
                titleEl.style.marginBottom = '12px';
                canvasContainer.insertBefore(titleEl, ctx.canvas);
                this.addTooltip(titleEl,
                    'Treino estável → tempo quase constante\n' +
                    'Picos → gargalo de I/O ou GPU'
                );
            }

            const datasets = [];
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

            this.currentData.forEach((data, idx) => {
                datasets.push({
                    label: data.training_name,
                    data: data.time,
                    borderColor: colors[idx % colors.length],
                    backgroundColor: colors[idx % colors.length] + '60',
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
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: this.visualizationMode === 'exploration',
                            position: 'bottom',
                            maxHeight: 80,
                            labels: { font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Epoch' } },
                        y: { 
                            title: { display: true, text: 'Tempo (s)' },
                            beginAtZero: true
                        }
                    }
                }
            });
        },

        renderCorrelationChart() {
            const ctx = document.getElementById('chart-correlation')?.getContext('2d');
            if (!ctx) return;

            const canvasContainer = ctx.canvas.parentElement;
            const titleEl = canvasContainer.querySelector('h3') || document.createElement('h3');
            
            if (!canvasContainer.querySelector('h3')) {
                titleEl.textContent = 'Correlação: Accuracy × Loss';
                titleEl.style.marginBottom = '12px';
                canvasContainer.insertBefore(titleEl, ctx.canvas);
                this.addTooltip(titleEl,
                    'Correlação negativa forte → modelo saudável\n' +
                    'Pontos dispersos → aprendizado inconsistente'
                );
            }

            const datasets = [];
            const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

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
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: this.visualizationMode === 'exploration',
                            position: 'bottom',
                            maxHeight: 80,
                            labels: { font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Val Loss' } },
                        y: { 
                            title: { display: true, text: 'Accuracy Top-1' },
                            min: 0,
                            max: 1
                        }
                    }
                }
            });
        }
    };

    global.TrainingAnalysis = TrainingAnalysis;

})(window);
