/**
 * Módulo de navegação - gerencia carregamento de páginas e cache.
 */
(function (global) {
    const PAGES = {
        treinamento: 'treinamento.html',
        predicao: 'predicao.html',
    };

    const cache = {};

    function navigate(page) {
        document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
        const active = document.querySelector(`.menu-item[data-page="${page}"]`);
        if (active) active.classList.add('active');
        loadPage(page);
    }

    async function loadPage(page) {
        const view = document.getElementById('view');
        const tpl = PAGES[page];

        // Cleanup: Se estava na página de treinamento, limpa TrainingControl
        if (global.TrainingControl && typeof global.TrainingControl.destroy === 'function') {
            global.TrainingControl.destroy();
        }

        if (!tpl) {
            view.innerHTML = '<p>Página não encontrada.</p>';
            return;
        }

        if (cache[tpl]) {
            view.innerHTML = cache[tpl];
            if (global.UI && typeof global.UI.bindPageHandlers === 'function') {
                global.UI.bindPageHandlers(page);
            }
            return;
        }

        try {
            const res = await fetch(tpl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            cache[tpl] = html;
            view.innerHTML = html;
            if (global.UI && typeof global.UI.bindPageHandlers === 'function') {
                global.UI.bindPageHandlers(page);
            }
        } catch (e) {
            console.error('Failed to load page:', e);
            // Fallbacks: tenta caminhos absolutos comuns
            const fallbacks = [
                `/${tpl}`,
                `/projeto/views/${tpl}`
            ];
            for (const fb of fallbacks) {
                try {
                    const res2 = await fetch(fb);
                    if (!res2.ok) continue;
                    const html2 = await res2.text();
                    cache[tpl] = html2;
                    view.innerHTML = html2;
                    if (global.UI && typeof global.UI.bindPageHandlers === 'function') {
                        global.UI.bindPageHandlers(page);
                    }
                    return;
                } catch (e2) {
                    /* try next */
                }
            }
            view.innerHTML = `<p>Erro ao carregar página: ${e.message}</p>`;
        }
    }

    function toggleSidebar() {
        document.getElementById('sidebar')?.classList.toggle('collapsed');
        document.getElementById('main-content')?.classList.toggle('collapsed');
    }

    // Expõe no escopo global
    global.Navigation = {
        navigate,
        loadPage,
        toggleSidebar,
        PAGES
    };

    // Compatibilidade com código legado
    global.navigate = navigate;
    global.toggleSidebar = toggleSidebar;

})(window);
