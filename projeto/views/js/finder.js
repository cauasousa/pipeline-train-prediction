(function (global) {
    async function findImagesForModel(model) {
        if (!model) return [];

        const modelName = String(model).replace(/\.(pt|pth|onnx|bin)$/i, '');
        const found = [];

        // obtém o último diretório via API
        const lastDirObj = await window.API.getLastDir();
        const lastDir = lastDirObj?.last_dir;
        if (!lastDir) {
            console.warn("Nenhum diretório de predição encontrado.");
            return [];
        }

        // monta a base do caminho — sem subpasta "predicao/"
        const baseUrl = `${window.API.API_BASE}/predictions/${encodeURIComponent(lastDir)}/${encodeURIComponent(modelName)}/predicao/`;

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

        // testa quais imagens realmente existem
        for (const name of commonNames) {
            const url = `${baseUrl}${name}`;
            if (await window.API.testIsImage(url)) {
                found.push(url);
            }
        }

        if (found.length === 0) {
            console.warn(`Nenhuma imagem encontrada para modelo ${modelName}`);
        }

        return found;
    }

    global.Finder = { findImagesForModel };
})(window);
