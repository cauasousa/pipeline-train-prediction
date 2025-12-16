(function (global) {
    async function findImagesForModel(model) {
        if (!model) return [];

        // Usa o nome completo do modelo (com extensão)
        // pois o YOLO cria a pasta com o nome completo: yolo11n-cls.pt
        const modelName = String(model);
        const found = [];

        // obtém o último diretório via API
        const lastDirObj = await window.API.getLastDir();
        const lastDir = lastDirObj?.last_dir;
        if (!lastDir) {
            console.warn("Nenhum diretório de predição encontrado.");
            return [];
        }

        // YOLO pode criar a estrutura de dois jeitos:
        // 1. predictions/<run>/<model>/ (se output_dir foi usado)
        // 2. predictions/<run>/runs/classify/<model>/ (estrutura padrão do YOLO)
        const basePaths = [
            `${window.API.API_BASE}/predictions/${encodeURIComponent(lastDir)}/${encodeURIComponent(modelName)}/`,
            `${window.API.API_BASE}/predictions/${encodeURIComponent(lastDir)}/runs/classify/${encodeURIComponent(modelName)}/`
        ];

        // nomes das imagens esperadas
        const commonNames = [
            'confusion_matrix.png',
            'confusion_matrix_normalized.png',
            'predictions.jpg',
            'pred.png',
            'result.png'
        ];

        // adiciona imagens de batches
        for (let i = 0; i < 3; i++) {
            commonNames.push(`val_batch${i}_pred.jpg`);
            commonNames.push(`val_batch${i}_labels.jpg`);
        }

        // testa cada caminho base
        for (const baseUrl of basePaths) {
            for (const name of commonNames) {
                const url = `${baseUrl}${name}`;
                if (await window.API.testIsImage(url)) {
                    found.push(url);
                }
            }
            // Se encontrou imagens neste caminho, não precisa testar outros
            if (found.length > 0) {
                console.log(`[DEBUG] Imagens encontradas em: ${baseUrl}`);
                break;
            }
        }

        if (found.length === 0) {
            console.warn(`Nenhuma imagem encontrada para modelo ${modelName} nos caminhos testados`);
        }

        return found;
    }

    global.Finder = { findImagesForModel };
})(window);
