(function () {
    'use strict';

    const PredictionHistory = {
        currentRun: null,
        currentModel: null,

        async init() {
            const jobSelect = document.getElementById('job-select');
            const jobApplyBtn = document.getElementById('job-select-apply');

            if (!jobSelect || !jobApplyBtn) {
                console.warn('[PredictionHistory] job-select ou job-select-apply não encontrado');
                return;
            }

            // Carrega lista de histórico ao inicializar
            await this.refreshHistoryList();

            jobApplyBtn.addEventListener('click', () => this.loadRunImages());
            jobSelect.addEventListener('change', () => this.onJobSelected());

            // Auto-load do histórico a cada 5 segundos (para novas predições)
            setInterval(() => this.refreshHistoryList(), 5000);
        },

        async refreshHistoryList() {
            const jobSelect = document.getElementById('job-select');
            if (!jobSelect) return;

            try {
                // Usa endpoint /predictions/runs que já existe no backend
                const response = await window.API.safeFetch(`${window.API.API_BASE}/predictions/runs`);
                if (!response || !response.runs) return;

                const runs = response.runs;
                const previousSelected = jobSelect.value;

                // Limpa e popula select
                jobSelect.innerHTML = '';
                if (runs.length === 0) {
                    jobSelect.innerHTML = '<option disabled>Nenhuma predição disponível</option>';
                    return;
                }

                runs.forEach(run => {
                    const option = document.createElement('option');
                    option.value = run;
                    // Formata nome com data/hora legível
                    option.textContent = this._formatRunName(run);
                    jobSelect.appendChild(option);
                });

                // Mantém seleção anterior se ainda existe
                if (previousSelected && runs.includes(previousSelected)) {
                    jobSelect.value = previousSelected;
                } else if (runs.length > 0) {
                    jobSelect.value = runs[0];
                }
            } catch (err) {
                console.error('[PredictionHistory] Erro ao carregar histórico:', err);
            }
        },

        async onJobSelected() {
            const jobSelect = document.getElementById('job-select');
            this.currentRun = jobSelect.value;
            // Opcionalmente carrega modelos do run selecionado
        },

        async loadRunImages() {
            const jobSelect = document.getElementById('job-select');
            if (!jobSelect.value) {
                alert('Selecione um histórico de predição primeiro');
                return;
            }

            this.currentRun = jobSelect.value;

            try {
                // Carrega lista de modelos no run selecionado
                const response = await window.API.safeFetch(
                    `${window.API.API_BASE}/predictions/${encodeURIComponent(this.currentRun)}/models`
                );

                if (!response || !response.models || response.models.length === 0) {
                    this._displayImageArea('Nenhum resultado de predição encontrado neste histórico.');
                    return;
                }

                // Exibe primeiro modelo, ou permite seleção
                if (response.models.length === 1) {
                    this.currentModel = response.models[0];
                    await this._loadModelImages(this.currentRun, this.currentModel);
                } else {
                    // Múltiplos modelos - permite seleção
                    await this._showModelSelector(this.currentRun, response.models);
                }
            } catch (err) {
                console.error('[PredictionHistory] Erro ao carregar imagens do run:', err);
                this._displayImageArea(`Erro ao carregar histórico: ${err.message}`);
            }
        },

        async _showModelSelector(runName, models) {
            const html = `
                <div style="padding:10px; background:#f5f5f5; border-radius:4px;">
                    <p style="margin:0 0 10px 0; font-weight:600;">Selecione o modelo para ver as predições:</p>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        ${models.map(m => `
                            <button class="btn" style="background:#0066cc; color:white; padding:6px 12px; border:none; border-radius:4px; cursor:pointer;"
                                onclick="window.PredictionHistory && window.PredictionHistory._loadModelImages('${runName}', '${m}')">
                                ${m}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
            this._displayImageArea(html);
        },

        async _loadModelImages(runName, modelName) {
            try {
                const baseUrl = `${window.API.API_BASE}/predictions/${encodeURIComponent(runName)}/${encodeURIComponent(modelName)}/predicao/`;

                // Tenta carregar imagens comuns de predição
                const imageNames = [
                    'confusion_matrix.png',
                    'confusion_matrix_normalized.png',
                    'predictions.jpg',
                    'val_batch0_pred.jpg',
                    'val_batch1_pred.jpg',
                    'val_batch2_pred.jpg',
                ];

                const foundImages = [];
                for (const imgName of imageNames) {
                    const imgUrl = baseUrl + encodeURIComponent(imgName);
                    if (await window.API.testIsImage(imgUrl)) {
                        foundImages.push(imgName);
                    }
                }

                if (foundImages.length === 0) {
                    // Tenta fallback: listar diretório
                    await this._loadModelImagesFromDir(runName, modelName);
                } else {
                    // Exibe imagens encontradas
                    const html = foundImages.map(imgName => `
                        <div style="margin:12px 0; border:1px solid #ddd; border-radius:4px; padding:8px; background:#fafafa;">
                            <p style="margin:0 0 8px 0; font-size:12px; color:#666; font-weight:600;">${imgName}</p>
                            <img src="${baseUrl}${encodeURIComponent(imgName)}"
                                style="max-width:100%; height:auto; border-radius:4px;"
                                alt="${imgName}"
                                onerror="this.parentElement.style.display='none';" />
                        </div>
                    `).join('');

                    const container = document.getElementById('training-images');
                    if (container) {
                        const placeholder = container.querySelector('#training-images-placeholder');
                        if (placeholder) placeholder.remove();
                        container.innerHTML = html;
                    }
                }
            } catch (err) {
                console.error('[PredictionHistory] Erro ao carregar imagens:', err);
                this._displayImageArea(`Erro ao carregar imagens: ${err.message}`);
            }
        },

        async _loadModelImagesFromDir(runName, modelName) {
            try {
                const baseUrl = `${window.API.API_BASE}/predictions/${encodeURIComponent(runName)}/${encodeURIComponent(modelName)}/predicao/`;
                const res = await fetch(baseUrl);

                if (!res.ok) {
                    this._displayImageArea('Diretório de predições não encontrado.');
                    return;
                }

                const html = await res.text();
                const links = this._parseDirListingHtml(html, baseUrl);

                // Filtra apenas imagens
                const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
                const imageLinks = links.filter(link => {
                    const lower = link.toLowerCase();
                    return imageExts.some(ext => lower.endsWith(ext));
                });

                if (imageLinks.length === 0) {
                    this._displayImageArea('Nenhuma imagem encontrada neste resultado.');
                    return;
                }

                const imagesToShow = imageLinks.slice(0, 20); // Limita a 20 imagens
                const imageHtml = imagesToShow.map(imgUrl => `
                    <div style="margin:12px 0; border:1px solid #ddd; border-radius:4px; padding:8px; background:#fafafa;">
                        <img src="${imgUrl}"
                            style="max-width:100%; height:auto; border-radius:4px;"
                            alt="predição"
                            onerror="this.parentElement.style.display='none';" />
                    </div>
                `).join('');

                const container = document.getElementById('training-images');
                if (container) {
                    const placeholder = container.querySelector('#training-images-placeholder');
                    if (placeholder) placeholder.remove();
                    container.innerHTML = imageHtml;
                }
            } catch (err) {
                console.error('[PredictionHistory] Erro ao listar imagens:', err);
                this._displayImageArea(`Erro ao listar imagens: ${err.message}`);
            }
        },

        _parseDirListingHtml(html, baseUrl) {
            const links = [];
            const parser = new DOMParser();
            try {
                const doc = parser.parseFromString(html, 'text/html');
                const anchors = doc.querySelectorAll('a[href]');
                anchors.forEach(a => {
                    let href = a.getAttribute('href');
                    if (href && !href.startsWith('.') && !href.startsWith('/')) {
                        if (!href.startsWith('http')) {
                            href = baseUrl + encodeURIComponent(decodeURIComponent(href));
                        }
                        links.push(href);
                    }
                });
            } catch (e) {
                console.error('[PredictionHistory] Erro ao fazer parse HTML:', e);
            }
            return links;
        },

        _displayImageArea(content) {
            const container = document.getElementById('training-images');
            if (container) {
                const placeholder = container.querySelector('#training-images-placeholder');
                if (placeholder) placeholder.remove();
                if (typeof content === 'string') {
                    container.innerHTML = content;
                } else {
                    container.innerHTML = '';
                    container.appendChild(content);
                }
            }
        },

        _formatRunName(runName) {
            // Converte "predicao_20251110_153145" para formato legível
            // Formato esperado: predicao_YYYYMMDD_HHMMSS
            const match = runName.match(/predicao_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
            if (match) {
                const [, year, month, day, hour, min, sec] = match;
                return `${day}/${month}/${year} ${hour}:${min}:${sec}`;
            }
            return runName;
        }
    };

    // Expõe globalmente
    window.PredictionHistory = PredictionHistory;

    // Inicializa quando o DOM está pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => PredictionHistory.init());
    } else {
        PredictionHistory.init();
    }
})();
