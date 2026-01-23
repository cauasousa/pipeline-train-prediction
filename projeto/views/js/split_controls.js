(function () {
    'use strict';

    // Aguarda DOM estar pronto ou executa imediatamente se já estiver
    function init() {
        // Classe Positiva
        const trainSlider = document.getElementById('train-slider');
        const valSlider = document.getElementById('val-slider');
        const testSlider = document.getElementById('test-slider');

        // Se os elementos não foram encontrados, tenta novamente em 100ms
        if (!trainSlider || !valSlider || !testSlider) {
            console.log('[split_controls] Elementos não encontrados ainda, tentando novamente...');
            setTimeout(init, 100);
            return;
        }

        const trainNumberInput = document.getElementById('train-input');
        const valNumberInput = document.getElementById('val-input');
        const testNumberInput = document.getElementById('test-input');

        const trainInput = document.getElementById('train-percent');
        const valInput = document.getElementById('val-percent');
        const testInput = document.getElementById('test-percent');

        const totalDisplay = document.getElementById('split-total');
        const posCountBadge = document.getElementById('pos-count-badge');

        // Classe Negativa (Random Split)
        const randTrainSlider = document.getElementById('rand-train-slider');
        const randValSlider = document.getElementById('rand-val-slider');
        const randTestSlider = document.getElementById('rand-test-slider');

        const randTrainNumberInput = document.getElementById('rand-train-input');
        const randValNumberInput = document.getElementById('rand-val-input');
        const randTestNumberInput = document.getElementById('rand-test-input');

        const randTrainInput = document.getElementById('rand-train-percent');
        const randValInput = document.getElementById('rand-val-percent');
        const randTestInput = document.getElementById('rand-test-percent');

        const randTotalDisplay = document.getElementById('rand-split-total');
        const randCountBadge = document.getElementById('rand-count-badge');

        console.log('[split_controls] ✅ Todos os elementos encontrados!');
        console.log('  trainSlider:', trainSlider);
        console.log('  valSlider:', valSlider);
        console.log('  testSlider:', testSlider);

        // Função para disparar atualização dos gráficos
        function triggerGraphicsUpdate(evt) {
            // Preferir atualização apenas da distribuição
            if (window.UI?.updateSplitDistribution) {
                try {
                    window.UI.updateSplitDistribution();
                    console.log('[split_controls] updateSplitDistribution chamada com sucesso');
                } catch (e) {
                    console.warn('[split_controls] Erro ao chamar updateSplitDistribution:', e);
                }
                return;
            }
            // Fallback: atualiza resumo completo
            if (window.UI?.updateNegativeSummary) {
                try {
                    window.UI.updateNegativeSummary();
                    console.log('[split_controls] updateNegativeSummary chamada (fallback)');
                } catch (e) {
                    console.warn('[split_controls] Erro ao chamar updateNegativeSummary:', e);
                }
            } else {
                console.warn('[split_controls] UI.updateSplitDistribution/updateNegativeSummary não disponíveis');
            }
        }

        // Função para atualizar valores e validar soma - Classe Negativa
        function updateRandSplit(evt) {
            console.log('[split_controls] updateRandSplit chamada');
            let train = parseInt(randTrainSlider.value);
            let val = parseInt(randValSlider.value);
            let test = parseInt(randTestSlider.value);
            let total = train + val + test;

            // Se passar de 100%, reduz o valor que está sendo alterado
            if (total > 100) {
                const overflow = total - 100;
                const targetId = evt?.target?.id;
                if (targetId === 'rand-train-slider' || targetId === 'rand-train-input') {
                    train = Math.max(0, train - overflow);
                    randTrainSlider.value = train;
                } else if (targetId === 'rand-val-slider' || targetId === 'rand-val-input') {
                    val = Math.max(0, val - overflow);
                    randValSlider.value = val;
                } else if (targetId === 'rand-test-slider' || targetId === 'rand-test-input') {
                    test = Math.max(0, test - overflow);
                    randTestSlider.value = test;
                } else {
                    // fallback: ajusta test
                    test = Math.max(0, test - overflow);
                    randTestSlider.value = test;
                }
                total = train + val + test;
            }

            console.log(`  Rand - Train=${train}%, Val=${val}%, Test=${test}%, Total=${total}%`);

            // Atualiza inputs numéricos
            if (randTrainNumberInput) randTrainNumberInput.value = train;
            if (randValNumberInput) randValNumberInput.value = val;
            if (randTestNumberInput) randTestNumberInput.value = test;

            randTrainInput.value = train;
            randValInput.value = val;
            randTestInput.value = test;

            // Atualiza CSS custom property para o gradiente
            randTrainSlider.style.setProperty('--value', train + '%');
            randValSlider.style.setProperty('--value', val + '%');
            randTestSlider.style.setProperty('--value', test + '%');

            randTotalDisplay.textContent = `Total: ${total}%`;

            if (total === 100) {
                randTotalDisplay.classList.remove('invalid');
                randTotalDisplay.classList.add('valid');
            } else {
                randTotalDisplay.classList.remove('valid');
                randTotalDisplay.classList.add('invalid');
            }

            // Trigger gráficos atualização (apenas distribuição)
            triggerGraphicsUpdate(evt);
        }

        // Função para atualizar valores e validar soma - Classe Positiva
        function updatePositiveSplit(evt) {
            console.log('[split_controls] updatePositiveSplit chamada');
            let train = parseInt(trainSlider.value);
            let val = parseInt(valSlider.value);
            let test = parseInt(testSlider.value);
            let total = train + val + test;

            // Se passar de 100%, reduz o valor que está sendo alterado
            if (total > 100) {
                const overflow = total - 100;
                const targetId = evt?.target?.id;
                if (targetId === 'train-slider' || targetId === 'train-input') {
                    train = Math.max(0, train - overflow);
                    trainSlider.value = train;
                } else if (targetId === 'val-slider' || targetId === 'val-input') {
                    val = Math.max(0, val - overflow);
                    valSlider.value = val;
                } else if (targetId === 'test-slider' || targetId === 'test-input') {
                    test = Math.max(0, test - overflow);
                    testSlider.value = test;
                } else {
                    // fallback: ajusta test
                    test = Math.max(0, test - overflow);
                    testSlider.value = test;
                }
                total = train + val + test;
            }

            console.log(`  Train=${train}%, Val=${val}%, Test=${test}%, Total=${total}%`);

            // Atualiza inputs numéricos
            if (trainNumberInput) trainNumberInput.value = train;
            if (valNumberInput) valNumberInput.value = val;
            if (testNumberInput) testNumberInput.value = test;

            trainInput.value = train;
            valInput.value = val;
            testInput.value = test;

            // Atualiza CSS custom property para o gradiente
            trainSlider.style.setProperty('--value', train + '%');
            valSlider.style.setProperty('--value', val + '%');
            testSlider.style.setProperty('--value', test + '%');

            totalDisplay.textContent = `Total: ${total}%`;

            if (total === 100) {
                totalDisplay.classList.remove('invalid');
                totalDisplay.classList.add('valid');
            } else {
                totalDisplay.classList.remove('valid');
                totalDisplay.classList.add('invalid');
            }

            // Trigger gráficos atualização (apenas distribuição)
            triggerGraphicsUpdate(evt);
        }

        // Event listeners - Classe Negativa
        if (randTrainSlider && randValSlider && randTestSlider) {
            console.log('[split_controls] Conectando listeners para Classe Negativa');
            randTrainSlider.addEventListener('input', updateRandSplit);
            randValSlider.addEventListener('input', updateRandSplit);
            randTestSlider.addEventListener('input', updateRandSplit);

            // Sincronizar inputs numéricos com sliders
            if (randTrainNumberInput) {
                randTrainNumberInput.addEventListener('input', function (e) {
                    let value = parseInt(e.target.value) || 0;
                    value = Math.max(0, Math.min(100, value));
                    randTrainSlider.value = value;
                    // Criar evento com id correto para identificação na função updateRandSplit
                    const customEvent = { target: { id: 'rand-train-input' } };
                    updateRandSplit(customEvent);
                });
            }
            if (randValNumberInput) {
                randValNumberInput.addEventListener('input', function (e) {
                    let value = parseInt(e.target.value) || 0;
                    value = Math.max(0, Math.min(100, value));
                    randValSlider.value = value;
                    // Criar evento com id correto para identificação na função updateRandSplit
                    const customEvent = { target: { id: 'rand-val-input' } };
                    updateRandSplit(customEvent);
                });
            }
            if (randTestNumberInput) {
                randTestNumberInput.addEventListener('input', function (e) {
                    let value = parseInt(e.target.value) || 0;
                    value = Math.max(0, Math.min(100, value));
                    randTestSlider.value = value;
                    // Criar evento com id correto para identificação na função updateRandSplit
                    const customEvent = { target: { id: 'rand-test-input' } };
                    updateRandSplit(customEvent);
                });
            }

            // Inicializar
            updateRandSplit();
        } else {
            console.warn('[split_controls] Elementos da Classe Negativa não encontrados!');
        }

        // Event listeners - Classe Positiva
        if (trainSlider && valSlider && testSlider) {
            console.log('[split_controls] Conectando listeners para Classe Positiva');
            trainSlider.addEventListener('input', updatePositiveSplit);
            valSlider.addEventListener('input', updatePositiveSplit);
            testSlider.addEventListener('input', updatePositiveSplit);

            // Sincronizar inputs numéricos com sliders
            if (trainNumberInput) {
                trainNumberInput.addEventListener('input', function (e) {
                    let value = parseInt(e.target.value) || 0;
                    value = Math.max(0, Math.min(100, value));
                    trainSlider.value = value;
                    // Criar evento com id correto para identificação na função updatePositiveSplit
                    const customEvent = { target: { id: 'train-input' } };
                    updatePositiveSplit(customEvent);
                });
            }
            if (valNumberInput) {
                valNumberInput.addEventListener('input', function (e) {
                    let value = parseInt(e.target.value) || 0;
                    value = Math.max(0, Math.min(100, value));
                    valSlider.value = value;
                    // Criar evento com id correto para identificação na função updatePositiveSplit
                    const customEvent = { target: { id: 'val-input' } };
                    updatePositiveSplit(customEvent);
                });
            }
            if (testNumberInput) {
                testNumberInput.addEventListener('input', function (e) {
                    let value = parseInt(e.target.value) || 0;
                    value = Math.max(0, Math.min(100, value));
                    testSlider.value = value;
                    // Criar evento com id correto para identificação na função updatePositiveSplit
                    const customEvent = { target: { id: 'test-input' } };
                    updatePositiveSplit(customEvent);
                });
            }

            // Inicializar
            updatePositiveSplit();
        } else {
            console.warn('[split_controls] Elementos da Classe Positiva não encontrados!');
        }
    } // Fim da função init

    // Aguarda DOM estar pronto ou executa imediatamente se já estiver
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();

        // Exponha a função para reinicialização quando página é navegada
        window.SplitControls = {
            reinit: init
        };
    }

})();
