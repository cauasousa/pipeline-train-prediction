import logging
import random
from datetime import datetime
from flask import Blueprint, request, jsonify

from projeto.app.services.prediction_service import (
    run_prediction,
    prepare_output_directory,
    serialize_results
)

log = logging.getLogger(__name__)
bp = Blueprint("predict", __name__)

@bp.route("/run", methods=["POST"])
def run_predict():
    """Executa predição/avaliação de modelos."""
    payload = request.get_json() or {}
    models = payload.get("models", [])
    
    log.info("POST /predict/run - payload recebido: %s", payload)
    
    if not models or not isinstance(models, list):
        detail = f"Payload inválido: 'models' é obrigatório e deve ser lista. Recebido: {models} (tipo: {type(models).__name__})"
        log.warning(detail)
        return jsonify({"detail": detail}), 400

    # Extrai opções
    options = payload.get("options") or {}
    dataset_path = options.get("path") if isinstance(options, dict) else None
    
    try:
        # Prepara diretório de saída
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = prepare_output_directory(timestamp)
        
        # Executa predição via serviço
        results, evaluated, missing = run_prediction(
            models=models,
            dataset_path=dataset_path,
            split="test",
            project_name="predicao",
            output_dir=output_path
        )
        
        if results is None:
            return jsonify({
                "detail": "Nenhum modelo válido encontrado.",
                "missing": missing
            }), 400
        
        # Log compacto
        log.info("Predicao concluída: %d modelos, saída=%s", len(evaluated), str(output_path))
        
        # Serializa e retorna
        results_summary = serialize_results(results)
        return jsonify({
            "status": "completed",
            "evaluated": evaluated,
            "missing": missing,
            "results_summary": results_summary,
            "output_dir": str(output_path.name)
        })

    except ModuleNotFoundError as me:
        log.warning("ultralytics não disponível - retornando MOCK. Detalhe: %s", me)
        # Mock quando Ultralytics não está instalado
        from projeto.app.services.prediction_service import resolve_model_paths
        _, evaluated_mock, missing_mock = run_prediction(models, dataset_path)
        
        mock_results = {
            name: {
                "mock": True,
                "accuracy": round(random.uniform(0.75, 0.95), 4),
                "notes": "Resultado simulado. Instale 'ultralytics' para avaliação real."
            }
            for name in (evaluated_mock or [])
        }
        
        return jsonify({
            "status": "mocked",
            "evaluated": evaluated_mock or [],
            "missing": missing_mock or [],
            "results_summary": mock_results
        })

    except Exception as e:
        log.exception("Erro inesperado ao processar /predict/run")
        return jsonify({"detail": f"Erro interno inesperado: {e}"}), 500

