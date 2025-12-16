/**
 * Módulo de configuração - gerencia carregamento e salvamento de configurações de treinamento.
 */
(function (global) {
    const DEFAULT_CONFIG_KEY = 'yolo_default_config';
    const DEFAULT_CONFIG_VERSION = 1;

    const defaultConfig = {
        // --- Configurações Principais de Treinamento ---
        model: "yolo11n-cls.pt",
        task: "classify",
        mode: "train",
        epochs: 50,
        patience: 100,
        batch: 16,
        imgsz: 224,
        save: true,
        save_period: -1,
        cache: false,
        device: 0,
        workers: 8,
        project: "/content/drive/MyDrive/pipeline/yolo_classificacao_resultados",
        name: "treinamento_classificacao",
        exist_ok: false,
        pretrained: true,
        optimizer: "auto",
        seed: 0,
        deterministic: true,
        single_cls: false,
        classes: null,
        rect: false,
        multi_scale: false,
        cos_lr: false,
        close_mosaic: 10,
        resume: false,
        amp: true,
        fraction: 1.0,
        profile: false,
        freeze: null,
        val: true,
        plots: true,
        compile: false,
        verbose: true,

        // --- Hiperparâmetros ---
        lr0: 0.01,
        lrf: 0.01,
        momentum: 0.937,
        weight_decay: 0.0005,
        warmup_epochs: 3.0,
        warmup_momentum: 0.8,
        warmup_bias_lr: 0.1,
        box: 7.5,
        cls: 0.5,
        dfl: 1.5,
        pose: 12.0,
        kobj: 1.0,
        nbs: 64,
        overlap_mask: true,
        mask_ratio: 4,
        dropout: 0.0,

        // --- Aumento de Dados ---
        hsv_h: 0.015,
        hsv_s: 0.7,
        hsv_v: 0.4,
        degrees: 0.0,
        translate: 0.1,
        scale: 0.5,
        shear: 0.0,
        perspective: 0.0,
        flipud: 0.0,
        fliplr: 0.5,
        bgr: 0.0,
        mosaic: 1.0,
        mixup: 0.0,
        cutmix: 0.0,
        copy_paste: 0.0,
        copy_paste_mode: "flip",
        auto_augment: "randaugment",
        erasing: 0.4,
        augment: false,

        // --- Outros ---
        cfg: null,
        iou: 0.7,
        conf: null,
        agnostic_nms: false,
        max_det: 300,
        retina_masks: false,
        keras: false,
        int8: false,
        half: false,
        dnn: false,
        dynamic: false,
        line_width: null,
        embed: null,
        show_boxes: true,
        show_conf: true,
        show_labels: true,
        vid_stride: 1,
        visualize: false,
        save_conf: false,
        save_crop: false,
        save_frames: false,
        save_json: false,
        save_txt: false,
        time: null,
        workspace: null,
        config_version: DEFAULT_CONFIG_VERSION
    };

    function loadConfig() {
        try {
            const stored = localStorage.getItem(DEFAULT_CONFIG_KEY);
            if (!stored) return JSON.parse(JSON.stringify(defaultConfig));

            const parsed = JSON.parse(stored);
            if (!parsed || typeof parsed !== 'object') {
                return JSON.parse(JSON.stringify(defaultConfig));
            }

            const version = parsed.config_version || 0;
            if (version !== DEFAULT_CONFIG_VERSION) {
                console.warn('Config version mismatch, using defaults');
                return JSON.parse(JSON.stringify(defaultConfig));
            }

            return { ...JSON.parse(JSON.stringify(defaultConfig)), ...parsed };
        } catch (e) {
            console.error('Failed to load config:', e);
            return JSON.parse(JSON.stringify(defaultConfig));
        }
    }

    function saveConfig(obj) {
        try {
            if (!obj || typeof obj !== 'object') {
                console.error('Invalid config object');
                return false;
            }
            obj.config_version = DEFAULT_CONFIG_VERSION;
            localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(obj));
            return true;
        } catch (e) {
            console.error('Failed to save config:', e);
            return false;
        }
    }

    function resetConfig() {
        try {
            localStorage.removeItem(DEFAULT_CONFIG_KEY);
            return JSON.parse(JSON.stringify(defaultConfig));
        } catch (e) {
            console.error('Failed to reset config:', e);
            return defaultConfig;
        }
    }

    function renderConfigPreview(cfg) {
        const pre = document.getElementById('config-preview');
        if (!pre) return;
        pre.textContent = JSON.stringify(cfg, null, 2);
    }

    // Expõe no escopo global
    global.ConfigManager = {
        loadConfig,
        saveConfig,
        resetConfig,
        renderConfigPreview,
        getDefaults: () => JSON.parse(JSON.stringify(defaultConfig))
    };

})(window);
