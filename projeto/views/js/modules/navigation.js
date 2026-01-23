/**
 * Módulo de navegação - gerencia carregamento de páginas e cache.
 */
(function (global) {
    const PAGES = {
        treinamento: 'treinamento.html',
        predicao: 'predicao.html',
        analise: 'analise.html',
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

        // Cleanup: Se estava na página de treinamento, limpa TrainingControl e gráficos
        if (global.TrainingControl && typeof global.TrainingControl.destroy === 'function') {
            global.TrainingControl.destroy();
        }
        // Destrói todos os gráficos Chart.js quando sai da página de treinamento
        if (global.UI && typeof global.UI.destroyAllCharts === 'function') {
            global.UI.destroyAllCharts();
        }

        if (!tpl) {
            view.innerHTML = '<p>Página não encontrada.</p>';
            return;
        }

        if (cache[tpl]) {
            view.innerHTML = cache[tpl];
            if (global.UI && typeof global.UI.bindPageHandlers === 'function') {
                global.UI.bindPageHandlers(page);
                // Reinicialize split controls after page is loaded
                if (page === 'treinamento' && window.SplitControls?.reinit) {
                    window.SplitControls.reinit();
                }
            }
            return;
        }

        try {
            const res = await fetch(tpl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            cache[tpl] = html;
            view.innerHTML = html;
            // Reinicialize split controls after page is loaded
            if (page === 'treinamento' && window.SplitControls?.reinit) {
                window.SplitControls.reinit();
            }
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

        // Reinicia o timer de auto-ocultar quando o usuário interage
        resetAutoHideTimer();
    }

    // Timer para auto-ocultar sidebar
    let autoHideTimer = null;

    function resetAutoHideTimer() {
        // Limpa o timer anterior se existir
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
        }

        // Só inicia o timer se a sidebar estiver visível (não collapsed)
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('collapsed')) {
            autoHideTimer = setTimeout(() => {
                sidebar.classList.add('collapsed');
                document.getElementById('main-content')?.classList.add('collapsed');
            }, 5000); // 5 segundos
        }
    }

    // Inicia o timer quando a página carrega
    window.addEventListener('DOMContentLoaded', () => {
        resetAutoHideTimer();

        // Reinicia o timer quando o mouse passa sobre a sidebar
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.addEventListener('mouseenter', () => {
                if (autoHideTimer) {
                    clearTimeout(autoHideTimer);
                }
            });

            sidebar.addEventListener('mouseleave', () => {
                resetAutoHideTimer();
            });
        }
    });

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
