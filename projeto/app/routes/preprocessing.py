"""
Blueprint para operações de pré-processamento.
"""
from flask import Blueprint, jsonify, request
from pathlib import Path
import json
import time

from projeto.app.services.preprocessing_service import PREPROCESSING_REGISTRY, apply_custom_preprocessing

from projeto.app.paths import (
    get_dataset_split_dir,
    predictions_datasets_yolo_dir,
    upload_folder_uploads_dir,
    datasets_custom_dir,
)
import cv2
import os

bp = Blueprint("preprocessing", __name__)

@bp.route("/techniques", methods=["GET"])
def get_preprocessing_techniques():
    """Retorna lista de técnicas de pré-processamento disponíveis."""
    techniques = list(PREPROCESSING_REGISTRY.keys())
    return jsonify({"techniques": techniques})


@bp.route("/preview", methods=["GET"])
def get_preprocessing_preview():
    """
    Gera uma pré-visualização aplicando técnicas sobre uma imagem de amostra do dataset.

    Query params:
      - dataset: nome do dataset (ex: 'SIN-STRONG')
      - techniques: JSON array de nomes (preserva ordem/duplicatas), ou string única

    Resposta: { preview: "/predictions/previews/<arquivo>.jpg" }
    """
    dataset = request.args.get('dataset', '').strip()
    techniques_param = request.args.get('techniques', '').strip()

    # Parse techniques preservando ordem e duplicatas
    techniques = []
    if techniques_param:
        try:
            parsed = json.loads(techniques_param)
            if isinstance(parsed, list):
                techniques = [str(x) for x in parsed]
            else:
                techniques = [str(parsed)]
        except Exception:
            # trata como string simples
            techniques = [techniques_param]

    if not dataset:
        return jsonify({"detail": "Parâmetro 'dataset' é obrigatório."}), 400

    # Função auxiliar: busca primeira imagem recursivamente em um diretório
    def find_first_image(base: Path):
        try:
            if not base.exists():
                return None
            exts = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'}
            for root, dirs, files in os.walk(str(base)):
                for f in sorted(files):
                    p = Path(root) / f
                    if p.is_file() and p.suffix.lower() in exts:
                        return p
        except Exception:
            return None
        return None

    # Tenta em múltiplas localizações conhecidas
    sample_image_path = None
    # 1) custom/datasets_custom/<dataset>/val/images
    sample_image_path = sample_image_path or find_first_image(get_dataset_split_dir(dataset, 'val') / 'images')
    # 2) custom/datasets_custom/<dataset>/test/images
    sample_image_path = sample_image_path or find_first_image(get_dataset_split_dir(dataset, 'test') / 'images')
    # 3) uploads/<dataset>
    sample_image_path = sample_image_path or find_first_image(upload_folder_uploads_dir() / dataset)
    # 4) diretório direto do dataset dentro de custom/datasets_custom (qualquer split)
    sample_image_path = sample_image_path or find_first_image(datasets_custom_dir() / dataset)

    if not sample_image_path:
        return jsonify({"detail": "Imagem de amostra não encontrada para o dataset.", "dataset": dataset}), 404

    # Carrega a imagem e aplica técnicas
    try:
        img = cv2.imread(str(sample_image_path))
        if img is None:
            return jsonify({"detail": "Falha ao carregar a imagem de amostra."}), 500
        # Pasta de saída
        previews_dir = predictions_datasets_yolo_dir() / 'previews'
        previews_dir.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())

        def to_uint8_rgb(arr):
            if arr is None:
                return img
            res = arr
            try:
                if isinstance(res, (list, tuple)):
                    res = res[0]
                if res.dtype != 'uint8':
                    r2 = res.astype('float32')
                    r2 = r2 - r2.min()
                    maxv = r2.max() or 1.0
                    r2 = (r2 / maxv) * 255.0
                    res = r2.astype('uint8')
                if len(res.shape) == 2:
                    res = cv2.cvtColor(res, cv2.COLOR_GRAY2BGR)
            except Exception:
                res = img
            return res

        # Salva original
        orig_name = f"{dataset}_original_{ts}.jpg"
        orig_path = previews_dir / orig_name
        cv2.imwrite(str(orig_path), to_uint8_rgb(img))

        # Pipeline cumulativo (steps)
        steps = []
        cur = img.copy()
        for idx, name in enumerate(techniques):
            if name in PREPROCESSING_REGISTRY:
                try:
                    cur = PREPROCESSING_REGISTRY[name](cur)
                except Exception:
                    # se falhar, mantem imagem corrente
                    pass
            step_img = to_uint8_rgb(cur)
            step_name = f"{dataset}_step{idx+1}_{ts}.jpg"
            step_path = previews_dir / step_name
            cv2.imwrite(str(step_path), step_img)
            steps.append({
                "index": idx+1,
                "technique": name,
                "url": f"/predictions/previews/{step_name}"
            })

        # Resultado final (último step ou original se vazio)
        final_img = to_uint8_rgb(cur if len(techniques) > 0 else img)
        final_name = f"{dataset}_final_{ts}.jpg"
        final_path = previews_dir / final_name
        cv2.imwrite(str(final_path), final_img)

        # Técnicas isoladas (cada técnica aplicada sobre o original)
        isolated = []
        for idx, name in enumerate(techniques):
            iso = img.copy()
            if name in PREPROCESSING_REGISTRY:
                try:
                    iso = PREPROCESSING_REGISTRY[name](iso)
                except Exception:
                    iso = img.copy()
            iso_img = to_uint8_rgb(iso)
            iso_name = f"{dataset}_isolated{idx+1}_{ts}.jpg"
            iso_path = previews_dir / iso_name
            cv2.imwrite(str(iso_path), iso_img)
            isolated.append({
                "index": idx+1,
                "technique": name,
                "url": f"/predictions/previews/{iso_name}"
            })

        return jsonify({
            "dataset": dataset,
            "techniques": techniques,
            "original": f"/predictions/previews/{orig_name}",
            "final": f"/predictions/previews/{final_name}",
            "steps": steps,
            "isolated": isolated
        })
    except Exception as e:
        return jsonify({"detail": f"Erro ao processar pré-visualização: {e}"}), 500


@bp.route("/preview", methods=["POST"])
def post_preprocessing_preview():
    """
    Gera pré-visualização aceitando pipeline parametrizado.

    Body JSON:
      - dataset: nome do dataset
      - pipeline: array de { name: str, params: dict }
    """
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        data = {}

    dataset = (data.get('dataset') or '').strip()
    pipeline = data.get('pipeline') or []
    
    print(f"[DEBUG PREVIEW] Dataset: {dataset}")
    print(f"[DEBUG PREVIEW] Pipeline recebido: {pipeline}")

    if not dataset:
        return jsonify({"detail": "Parâmetro 'dataset' é obrigatório."}), 400

    # Função auxiliar: busca primeira imagem recursiva
    def find_first_image(base: Path):
        try:
            if not base.exists():
                return None
            exts = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'}
            for root, dirs, files in os.walk(str(base)):
                for f in sorted(files):
                    p = Path(root) / f
                    if p.is_file() and p.suffix.lower() in exts:
                        return p
        except Exception:
            return None
        return None

    sample_image_path = None
    sample_image_path = sample_image_path or find_first_image(get_dataset_split_dir(dataset, 'val') / 'images')
    sample_image_path = sample_image_path or find_first_image(get_dataset_split_dir(dataset, 'test') / 'images')
    sample_image_path = sample_image_path or find_first_image(upload_folder_uploads_dir() / dataset)
    sample_image_path = sample_image_path or find_first_image(datasets_custom_dir() / dataset)

    if not sample_image_path:
        return jsonify({"detail": "Imagem de amostra não encontrada para o dataset.", "dataset": dataset}), 404

    try:
        img = cv2.imread(str(sample_image_path))
        if img is None:
            return jsonify({"detail": "Falha ao carregar a imagem de amostra."}), 500

        previews_dir = predictions_datasets_yolo_dir() / 'previews'
        previews_dir.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())

        def to_uint8_rgb(arr):
            if arr is None:
                return img
            res = arr
            try:
                if isinstance(res, (list, tuple)):
                    res = res[0]
                if res.dtype != 'uint8':
                    r2 = res.astype('float32')
                    r2 = r2 - r2.min()
                    maxv = r2.max() or 1.0
                    r2 = (r2 / maxv) * 255.0
                    res = r2.astype('uint8')
                if len(res.shape) == 2:
                    res = cv2.cvtColor(res, cv2.COLOR_GRAY2BGR)
            except Exception:
                res = img
            return res

        # Salva original
        orig_name = f"{dataset}_original_{ts}.jpg"
        orig_path = previews_dir / orig_name
        cv2.imwrite(str(orig_path), to_uint8_rgb(img))

        # Pipeline cumulativo com parâmetros
        steps = []
        cur = img.copy()
        for idx, step in enumerate(pipeline):
            name = (step.get('name') if isinstance(step, dict) else str(step)).strip()
            params = step.get('params', {}) if isinstance(step, dict) else {}
            if name in PREPROCESSING_REGISTRY:
                func = PREPROCESSING_REGISTRY[name]
                try:
                    cur = func(cur, **params)
                except TypeError:
                    cur = func(cur)
                except Exception:
                    pass
            step_img = to_uint8_rgb(cur)
            step_name = f"{dataset}_step{idx+1}_{ts}.jpg"
            step_path = previews_dir / step_name
            cv2.imwrite(str(step_path), step_img)
            steps.append({
                "index": idx+1,
                "technique": name,
                "url": f"/predictions/previews/{step_name}"
            })

        final_img = to_uint8_rgb(cur if len(pipeline) > 0 else img)
        final_name = f"{dataset}_final_{ts}.jpg"
        final_path = previews_dir / final_name
        cv2.imwrite(str(final_path), final_img)

        # Técnicas isoladas respeitando parâmetros de cada step
        isolated = []
        for idx, step in enumerate(pipeline):
            name = (step.get('name') if isinstance(step, dict) else str(step)).strip()
            params = step.get('params', {}) if isinstance(step, dict) else {}
            iso = img.copy()
            if name in PREPROCESSING_REGISTRY:
                func = PREPROCESSING_REGISTRY[name]
                try:
                    iso = func(iso, **params)
                except TypeError:
                    iso = func(iso)
                except Exception:
                    iso = img.copy()
            iso_img = to_uint8_rgb(iso)
            iso_name = f"{dataset}_isolated{idx+1}_{ts}.jpg"
            iso_path = previews_dir / iso_name
            cv2.imwrite(str(iso_path), iso_img)
            isolated.append({
                "index": idx+1,
                "technique": name,
                "url": f"/predictions/previews/{iso_name}"
            })

        return jsonify({
            "dataset": dataset,
            "pipeline": pipeline,
            "original": f"/predictions/previews/{orig_name}",
            "final": f"/predictions/previews/{final_name}",
            "steps": steps,
            "isolated": isolated
        })
    except Exception as e:
        return jsonify({"detail": f"Erro ao processar pré-visualização: {e}"}), 500


@bp.route("/upload-reference", methods=["POST"])
def upload_reference_image():
    """Recebe um arquivo de imagem para ser usado como referência em técnicas (ex: Histogram Matching)."""
    try:
        if 'file' not in request.files:
            return jsonify({"detail": "Arquivo não enviado (campo 'file')."}), 400
        f = request.files['file']
        if not f or f.filename == '':
            return jsonify({"detail": "Nome de arquivo inválido."}), 400
        # Diretório de uploads
        base = upload_folder_uploads_dir() / 'preprocessing_refs'
        base.mkdir(parents=True, exist_ok=True)
        # Nome com timestamp para evitar conflitos
        ts = int(time.time())
        safe_name = Path(f.filename).name
        out_path = base / f"ref_{ts}_{safe_name}"
        f.save(str(out_path))
        return jsonify({
            "reference_path": str(out_path)
        })
    except Exception as e:
        return jsonify({"detail": f"Falha no upload: {e}"}), 500
