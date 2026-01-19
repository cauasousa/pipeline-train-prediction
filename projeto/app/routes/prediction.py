import logging
import shutil
from datetime import datetime
from flask import Blueprint, request, jsonify
from pathlib import Path

from projeto.app.services.prediction_service import (
    run_prediction,
    prepare_output_directory,
    serialize_results
)
from projeto.app.paths import workspace_root, predictions_images_upload_dir

log = logging.getLogger(__name__)
bp = Blueprint("predict", __name__)

def _is_image_folder(folder_path: str) -> bool:
    """Verifica se a pasta contém apenas imagens (sem estrutura YOLO)."""
    image_ext = {'.png', '.jpg', '.jpeg', '.bmp', '.gif'}
    folder = Path(folder_path)
    if not folder.is_dir():
        return False
    for item in folder.iterdir():
        if item.is_file() and item.suffix.lower() in image_ext:
            return True
    return False

def _create_temp_test_split(images_folder: str, dataset_name: str = "temp_prediction") -> Path:
    """
    Cria estrutura YOLO com split 'test' a partir de uma pasta de imagens.
    Copia as imagens para dataset_root/dataset_name/test/images/
    Retorna o caminho do dataset_root.
    """
    images_path = Path(images_folder)
    dataset_root = workspace_root() / "split_test_temp" / dataset_name
    test_images_dir = dataset_root / "test" / "images"
    
    # Remove se já existir
    if dataset_root.exists():
        shutil.rmtree(dataset_root)
    
    # Cria estrutura
    test_images_dir.mkdir(parents=True, exist_ok=True)
    
    # Copia imagens
    image_ext = {'.png', '.jpg', '.jpeg', '.bmp', '.gif'}
    count = 0
    for file in images_path.iterdir():
        if file.is_file() and file.suffix.lower() in image_ext:
            shutil.copy2(file, test_images_dir / file.name)
            count += 1
    
    log.info(f"Estrutura temporária criada: {dataset_root} com {count} imagens")
    return dataset_root

@bp.route("/run", methods=["POST"])
def run_predict():
    """
    Executa predição de modelos.
    
    Lógica:
    - Se source='test': usa split 'test' do dataset
    - Se source='folder' ou 'upload': cria estrutura temporária test, prediz e apaga
    """
    import json as json_lib  # Import local para evitar conflito
    
    # Detecta se é FormData (upload) ou JSON
    if request.content_type and 'multipart/form-data' in request.content_type:
        # Upload: extrai dados do FormData
        models_json = request.form.get('models')
        models = json_lib.loads(models_json) if models_json else []
        source = request.form.get('source', 'upload').strip().lower()
        options_json = request.form.get('options')
        preprocessing_json = request.form.get('preprocessing')
        options = json_lib.loads(options_json) if options_json else {}
        preprocessing = json_lib.loads(preprocessing_json) if preprocessing_json else []
        payload = {"models": models, "source": source, "options": options, "preprocessing": preprocessing}
        print(f"[DEBUG] FormData recebido - models: {models}, source: {source}, files: {len(request.files.getlist('files'))}, preprocessing: {preprocessing}")
    else:
        # JSON normal
        payload = request.get_json() or {}
        print(f"[DEBUG] JSON recebido: {payload}")
    
    models = payload.get("models", [])
    source = (payload.get("source") or "test").strip().lower()
    options = payload.get("options") or {}
    preprocessing = payload.get("preprocessing", []) or payload.get("options", {}).get("preprocessing", [])
    
    log.info("POST /predict/run - source=%s, models=%s, preprocessing=%s", source, models, preprocessing)
    
    if not models or not isinstance(models, list):
        detail = f"Payload inválido: 'models' é obrigatório e deve ser lista."
        log.warning(detail)
        return jsonify({"detail": detail}), 400

    temp_dir_to_cleanup = None
    
    try:
        # Prepara diretório de saída
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = prepare_output_directory(timestamp)
        
        # Define dataset_path e split baseado na fonte
        if source == "test":
            # Fonte: dataset com split test
            dataset_path = options.get("path") if isinstance(options, dict) else None
            if dataset_path:
                path_obj = Path(dataset_path)
                if isinstance(dataset_path, str) and dataset_path.startswith('./'):
                    dataset_path = dataset_path[2:]
                if not path_obj.is_absolute():
                    dataset_path = str(workspace_root() / dataset_path)
                if not Path(dataset_path).exists():
                    return jsonify({"detail": f"Dataset não encontrado: {dataset_path}"}), 400
            split = "test"
            
        elif source == "upload":
            # Fonte: upload de imagens
            upload_dir = predictions_images_upload_dir()
            upload_dir.mkdir(parents=True, exist_ok=True)
            
            # Limpa arquivos antigos
            for old_file in upload_dir.glob('*'):
                if old_file.is_file():
                    old_file.unlink()
            
            # Processa novos uploads
            if 'files' not in request.files or not request.files.getlist('files'):
                return jsonify({"detail": "Nenhuma imagem foi enviada."}), 400
            
            for file in request.files.getlist('files'):
                if file and file.filename:
                    file.save(str(upload_dir / file.filename))
            
            # Cria estrutura test temporária
            temp_dataset_root = _create_temp_test_split(str(upload_dir), "upload_temp")
            temp_dir_to_cleanup = temp_dataset_root
            dataset_path = str(temp_dataset_root)
            split = "test"
            
        elif source == "folder":
            # Fonte: pasta de imagens
            folder_path = options.get("path") if isinstance(options, dict) else None
            if not folder_path:
                return jsonify({"detail": "Para fonte 'folder', 'options.path' é obrigatório."}), 400
            
            path_obj = Path(folder_path)
            if isinstance(folder_path, str) and folder_path.startswith('./'):
                folder_path = folder_path[2:]
            if not path_obj.is_absolute():
                folder_path = str(workspace_root() / folder_path)
            if not Path(folder_path).exists():
                return jsonify({"detail": f"Pasta não encontrada: {folder_path}"}), 400
            
            # Se é pasta de imagens, cria estrutura test
            if _is_image_folder(folder_path):
                temp_dataset_root = _create_temp_test_split(folder_path, "folder_temp")
                temp_dir_to_cleanup = temp_dataset_root
                dataset_path = str(temp_dataset_root)
            else:
                # Assume que já tem estrutura YOLO
                dataset_path = folder_path
            
            split = "test"
        else:
            return jsonify({"detail": f"Source inválido: {source}"}), 400
        
        # Executa predição
        results, evaluated, missing = run_prediction(
            models=models,
            dataset_path=dataset_path,
            split=split,
            project_name="predicao",
            output_dir=output_path,
            preprocessing=preprocessing
        )
        
        if results is None:
            return jsonify({
                "detail": "Nenhum modelo válido encontrado.",
                "missing": missing
            }), 400
        
        log.info("Predicao concluída: %d modelos", len(evaluated))
        
        # Serializa e converte para URLs
        results_summary = serialize_results(results)
        
        print(f"\n========== [URL CONVERSION DEBUG] ==========")
        print(f"results_summary antes da conversão:")
        import json
        print(json.dumps(results_summary, indent=2, default=str)[:2000])  # Primeiros 2000 chars
        
        try:
            base = (workspace_root() / "predictions").resolve()
            print(f"\nBase path: {base}")
            
            def _to_url(p: str):
                try:
                    rel = Path(p).resolve().relative_to(base)
                    url = f"{request.url_root.rstrip('/')}/predictions/{rel.as_posix()}"
                    print(f"  {p} -> {url}")
                    return url
                except Exception as e:
                    print(f"  ✗ Erro em {p}: {e}")
                    return None
            
            for model, data in list(results_summary.items()):
                # print(f"\nProcessando modelo: {model}")
                if isinstance(data, dict):
                    # Nova estrutura com subfolders
                    if "subfolders" in data and isinstance(data["subfolders"], dict):
                        # print(f"  Tem subfolders: {list(data['subfolders'].keys())}")
                        for subfolder_name, subfolder_data in data["subfolders"].items():
                            # print(f"    Subfolder: {subfolder_name}")
                            if isinstance(subfolder_data, dict) and "images" in subfolder_data and isinstance(subfolder_data["images"], list):
                                # print(f"      Images antes: {len(subfolder_data['images'])}")
                                urls = [_to_url(str(fp)) for fp in subfolder_data["images"]]
                                subfolder_data["images"] = [u for u in urls if u]
                                # print(f"      Images depois: {len(subfolder_data['images'])}")
                    # Estrutura antiga com images diretas
                    elif "images" in data and isinstance(data["images"], list):
                        # print(f"  Estrutura antiga - images diretas: {len(data['images'])}")
                        urls = [_to_url(str(fp)) for fp in data["images"]]
                        data["images"] = [u for u in urls if u]
        except Exception as e:
            print(f"✗ ERRO na conversão: {e}")
            import traceback
            traceback.print_exc()
            log.warning(f"Erro ao converter imagens para URLs: {e}")
        
        print(f"\nresults_summary DEPOIS da conversão:")
        # print(json.dumps(results_summary, indent=2, default=str)[:2000])
        
        # Print específico das images arrays
        # print(f"\n>>> VERIFICAÇÃO FINAL DAS IMAGES:")
        for model, data in results_summary.items():
            if isinstance(data, dict) and "subfolders" in data:
                for subfolder, subdata in data["subfolders"].items():
                    img_count = len(subdata.get("images", []))
                    # print(f"  {model}/{subfolder}: {img_count} images")
                    # if img_count > 0:
                        # print(f"    Primeira: {subdata['images'][0]}")
        
        # print(f"========== [FIM URL CONVERSION] ==========\n")
        
        return jsonify({
            "status": "completed",
            "evaluated": evaluated,
            "missing": missing,
            "results_summary": results_summary,
            "output_dir": str(output_path.name)
        })

    except Exception as e:
        log.exception("Erro ao processar /predict/run")
        return jsonify({"detail": f"Erro: {str(e)}"}), 500
    
    finally:
        # Limpa estrutura temporária se foi criada
        if temp_dir_to_cleanup and temp_dir_to_cleanup.exists():
            try:
                shutil.rmtree(temp_dir_to_cleanup)
                log.info(f"Estrutura temporária removida: {temp_dir_to_cleanup}")
            except Exception as e:
                log.warning(f"Falha ao remover temp dir: {e}")

