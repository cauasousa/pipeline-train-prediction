"""
Blueprint para operações de pré-processamento.
"""
from flask import Blueprint, jsonify
from projeto.app.services.preprocessing_service import PREPROCESSING_REGISTRY

bp = Blueprint("preprocessing", __name__)

@bp.route("/techniques", methods=["GET"])
def get_preprocessing_techniques():
    """Retorna lista de técnicas de pré-processamento disponíveis."""
    techniques = list(PREPROCESSING_REGISTRY.keys())
    return jsonify({"techniques": techniques})
