import os
import shutil
import logging
import random
from pathlib import Path
from projeto.app.paths import custom_models_dir, storage_models_yolo_dir, storage_datasets_yolo_dir
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask import current_app as app

log = logging.getLogger(__name__)
bp = Blueprint("predict", __name__)

@bp.route("/run", methods=["POST"])
def run_predict():
    payload = request.get_json() or {}
    models = payload.get("models", [])
    if not models or not isinstance(models, list):
        return jsonify({"detail": "Payload inválido: 'models' é obrigatório e deve ser lista."}), 400

    # Prefer the central custom models dir (workspace-level); fall back to storage/models_yolo
    custom_dir = custom_models_dir()
    legacy_storage = storage_models_yolo_dir()
    base = custom_dir if custom_dir.exists() else legacy_storage
    print(f"Model base path: {base}")
    model_paths = []
    missing = []

    for m in models:
        if not isinstance(m, str) or not m.strip():
            missing.append(str(m))
            continue
        m_str = m.strip()
        p = Path(m_str)
        if p.is_absolute() and p.is_file():
            model_paths.append(str(p))
            continue
        candidate = base / m_str
        if candidate.is_file():
            model_paths.append(str(candidate))
            continue
        found = None
        if base.exists() and base.is_dir():
            for f in os.listdir(base):
                try:
                    fp = base / f
                    if fp.is_file() and f.lower().startswith(m_str.lower()):
                        found = fp
                        break
                except Exception:
                    pass
        if found:
            model_paths.append(str(found))
        else:
            missing.append(m_str)

    if not model_paths:
        return jsonify({"detail": "Nenhum modelo válido encontrado.", "missing": missing}), 400

    dataset_path = None
    options = payload.get("options") or {}
    if isinstance(options, dict):
        dataset_path = options.get("path")

    # fallback para path de dataset padrão caso frontend não envie (evita dataset None)
    if not dataset_path:
        dataset_path = str((storage_datasets_yolo_dir() / "CM" / "01").resolve())

    try:
        # prefer local implementation (projeto/app/routes/train_models.py)
        try:
            from .train_models import function_test_yolo
        except Exception:
            print("Failed to import function_test_yolo from local train_models, trying fallback import.")
            # fallback to older path if present in repo layout
            from backend.app.routes.train_models import function_test_yolo

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        predictions_base = Path.cwd() / "predictions"
        predictions_base.mkdir(parents=True, exist_ok=True)
        output_path = predictions_base / f"predicao_{timestamp}"
        if output_path.exists():
            # limpa conteúdo imediato se já existir
            for item in output_path.iterdir():
                try:
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        for sub in item.iterdir():
                            if sub.is_file():
                                sub.unlink()
                except Exception:
                    pass
        else:
            output_path.mkdir(parents=True, exist_ok=True)
        # log compacto
        log.info("Predicao iniciada: dataset=%s, modelos=%s, out=%s", dataset_path, model_paths, str(output_path))

        results = function_test_yolo(
            model_paths=model_paths,
            dataset_path=dataset_path,
            split="test",
            project_name="predicao",
            output_dir=str(output_path)
        )

        evaluated = [os.path.basename(p) for p in model_paths]
        results_summary = {}
        for k, v in (results or {}).items():
            if isinstance(v, dict):
                results_summary[k] = v
            else:
                results_summary[k] = str(v)
        return jsonify({
            "status": "completed",
            "evaluated": evaluated,
            "missing": missing,
            "results_summary": results_summary
        })

    except ModuleNotFoundError as me:
        log.warning("ultralytics não disponível - retornando MOCK. Detalhe: %s", me)
        print(f"ultralytics not available: {me}")
        evaluated = [os.path.basename(p) for p in model_paths]
        mock_results = {}
        for name in evaluated:
            mock_results[name] = {
                "mock": True,
                "accuracy": round(random.uniform(0.75, 0.95), 4),
                "notes": "Resultado simulado. Instale 'ultralytics' no backend para avaliação real."
            }
        return jsonify({
            "status": "mocked",
            "evaluated": evaluated,
            "missing": missing,
            "results_summary": mock_results
        })

    except Exception as e:
        print(f"Unexpected error: {e}")
        log.exception("Erro inesperado ao processar /predict/run")
        return jsonify({"detail": f"Erro interno inesperado: {e}"}), 500

