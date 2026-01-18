(function (global) {
    // minimal network helpers and endpoints
    // Resolve base da API com tolerância para ambientes file:// ou porta diferente
    // Ordem de precedência:
    // 1) global.API_BASE_OVERRIDE (permite configurar manualmente)
    // 2) se origin for vazio/null/file:// -> usa http://localhost:5000 (default Flask)
    // 3) caso contrário usa window.location.origin
    const API_BASE = (function resolveApiBase() {
        if (global.API_BASE_OVERRIDE) return global.API_BASE_OVERRIDE;
        const origin = window.location.origin || '';
        if (!origin || origin === 'null' || origin.startsWith('file:')) {
            return 'http://localhost:8000';
        }
        return origin;
    })();

    async function safeFetch(url, opts) {
        try {
            const res = await fetch(url, opts);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            // keep minimal logging
            console.error('[API] fetch error', url, e);
            return null;
        }
    }

    async function testIsImage(url) {
        try {
            const r = await fetch(url, { method: 'HEAD' });
            if (!r.ok) return false;
            const ct = r.headers.get('content-type') || '';
            return ct.startsWith('image/');
        } catch (e) {
            try {
                const r2 = await fetch(url, { method: 'GET' });
                if (!r2.ok) return false;
                const ct2 = r2.headers.get('content-type') || '';
                return ct2.startsWith('image/');
            } catch (e2) {
                return false;
            }
        }
    }

    async function getLastDir() {
        return await safeFetch(`${API_BASE}/predictions/last_dir`);
    }
    async function getModels() {
        const r = await safeFetch(`${API_BASE}/models`);
        return r?.models ?? [];
    }
    async function postPredict(payload) {
        try {
            const res = await fetch(`${API_BASE}/predict/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error('[API] postPredict error:', res.status, errorData);
                return null;
            }
            return await res.json();
        } catch (e) {
            console.error('[API] postPredict error', e);
            return null;
        }
    }

    // parse HTML directory listing and return hrefs (relative/absolute)
    function parseDirListingHtml(html, baseUrl) {
        const links = [];
        const re = /href=["']?([^"'>\s]+?)["']?/ig;
        let m;
        while ((m = re.exec(html)) !== null) {
            let href = m[1];
            // normalize relative hrefs into full URL
            if (!/^https?:\/\//i.test(href) && !href.startsWith('/')) {
                href = baseUrl.replace(/\/$/, '') + '/' + href.replace(/^\.\//, '');
            } else if (href.startsWith('/')) {
                href = window.location.origin + href;
            }
            links.push(href);
        }
        return links;
    }

    // returns list of timestamped runs e.g. ["predicao_20251110_153145", ...]
    async function getPredictionsList() {
        try {
            const res = await fetch(`${API_BASE}/predictions/`);
            if (!res.ok) return [];
            const txt = await res.text();
            const links = parseDirListingHtml(txt, `${API_BASE}/predictions/`);
            // extract folder names that start with predicao_
            const runs = [];
            for (const l of links) {
                try {
                    const u = new URL(l);
                    const seg = u.pathname.replace(/\/+$/, '').split('/').pop();
                    if (seg && seg.startsWith('predicao_')) runs.push(seg);
                } catch (e) { /* ignore */ }
            }
            // unique, preserve order found
            return Array.from(new Set(runs));
        } catch (e) {
            return [];
        }
    }

    // list model subfolders inside a specific run: returns array of folder names (e.g. ["01_best","fabricante-1"])
    async function listModelsInRun(runName) {
        if (!runName) return [];
        const baseUrl = `${API_BASE}/predictions/${encodeURIComponent(runName)}/`;
        try {
            const res = await fetch(baseUrl);
            if (!res.ok) return [];
            const txt = await res.text();
            const links = parseDirListingHtml(txt, baseUrl);
            const models = [];
            for (const l of links) {
                try {
                    const u = new URL(l);
                    const seg = u.pathname.replace(/\/+$/, '').split('/').pop();
                    if (seg && !seg.startsWith('.')) models.push(seg);
                } catch (e) { /* ignore */ }
            }
            return Array.from(new Set(models));
        } catch (e) {
            return [];
        }
    }

    async function getDatasets() {
        // tenta no API_BASE atual; se vier vazio, tenta portas comuns
        let datasets = [];
        const first = await safeFetch(`${API_BASE}/train/datasets`);
        if (first && Array.isArray(first.datasets)) datasets = first.datasets;

        if (!datasets || datasets.length === 0) {
            const tries = [
                `${API_BASE}/train/datasets`,
                'http://localhost:8000/train/datasets',
                'http://localhost:5000/train/datasets'
            ];
            for (const url of tries) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (Array.isArray(data.datasets) && data.datasets.length) {
                        datasets = data.datasets;
                        break;
                    }
                } catch (e) {
                    /* ignore and try next */
                }
            }
        }
        return datasets ?? [];
    }

    async function getDatasetInfo(name) {
        if (!name) return null;
        try {
            const enc = encodeURIComponent(name);
            const r = await safeFetch(`${API_BASE}/train/dataset-info/${enc}`);
            return r || null;
        } catch (e) {
            console.error('[API] getDatasetInfo error', e);
            return null;
        }
    }

    async function uploadDataset(formData) {
        try {
            const res = await fetch(`${API_BASE}/train/upload-folder`, { method: 'POST', body: formData });
            if (!res.ok) {
                console.error('[API] uploadDataset failed', res.status, res.statusText);
                return null;
            }
            return await res.json();
        } catch (e) {
            console.error('[API] uploadDataset error', e);
            return null;
        }
    }

    async function getNegativeLines() {
        const r = await safeFetch(`${API_BASE}/train/negative-lines`);
        // espera um objeto { "Cone": {"CM-A": 123, ...}, ... }
        return r || {};
    }

    async function getPreprocessingTechniques() {
        const r = await safeFetch(`${API_BASE}/api/preprocessing/techniques`);
        return r?.techniques || [];
    }

    // Solicita uma imagem de pré-visualização com técnicas aplicadas
    async function getPreprocessingPreview(dataset, techniques) {
        try {
            const params = new URLSearchParams();
            if (dataset) params.set('dataset', dataset);
            if (Array.isArray(techniques)) {
                params.set('techniques', JSON.stringify(techniques));
            }
            const url = `${API_BASE}/api/preprocessing/preview?${params.toString()}`;
            const r = await safeFetch(url);
            return r || null;
        } catch (e) {
            console.warn('[API] getPreprocessingPreview falhou', e);
            return null;
        }
    }

    // Pré-visualização com pipeline parametrizado (POST)
    async function postPreprocessingPreview(dataset, pipeline) {
        try {
            const res = await fetch(`${API_BASE}/api/preprocessing/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataset, pipeline })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('[API] postPreprocessingPreview error:', res.status, err);
                return null;
            }
            return await res.json();
        } catch (e) {
            console.warn('[API] postPreprocessingPreview falhou', e);
            return null;
        }
    }

    // Upload de imagem de referência para técnicas (ex: Histogram Matching)
    async function uploadPreprocessingReference(formData) {
        try {
            const res = await fetch(`${API_BASE}/api/preprocessing/upload-reference`, { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('[API] uploadPreprocessingReference error:', res.status, err);
                return null;
            }
            return await res.json();
        } catch (e) {
            console.warn('[API] uploadPreprocessingReference falhou', e);
            return null;
        }
    }

    global.API = Object.assign(global.API || {}, { API_BASE, safeFetch, testIsImage, getLastDir, getModels, postPredict, getPredictionsList, listModelsInRun, getDatasets, getDatasetInfo, getNegativeLines, uploadDataset, getPreprocessingTechniques, getPreprocessingPreview, postPreprocessingPreview, uploadPreprocessingReference });
})(window);
