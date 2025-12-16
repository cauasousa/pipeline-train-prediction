(function (global) {
    // minimal network helpers and endpoints
    // Use same origin by default so frontend works when served by the Flask app.
    // Falls back to location origin which works in dev (http://localhost:PORT) and production.
    const API_BASE = window.location.origin;
    // const API_BASE = "https://efficacious-fanciful-vera.ngrok-free.dev";

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
            if (!res.ok) return null;
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
        const r = await safeFetch(`${API_BASE}/train/datasets`);
        return r?.datasets ?? [];
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

    global.API = Object.assign(global.API || {}, { API_BASE, safeFetch, testIsImage, getLastDir, getModels, postPredict, getPredictionsList, listModelsInRun, getDatasets, getNegativeLines, uploadDataset });
})(window);
