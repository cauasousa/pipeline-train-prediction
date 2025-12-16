import os
import shutil
import random
import json
import time
import subprocess
import shlex 
import threading
from pathlib import Path
from typing import Optional, List
from math import ceil

from pydantic import BaseModel
# Nota: YOLO deve estar instalado globalmente ou no ambiente virtual do Flask
try:
    from ultralytics import YOLO 
except ImportError:
    class YOLO:
        def __init__(self, *args, **kwargs): pass
        def train(self, *args, **kwargs): raise RuntimeError("Ultralytics não está instalado.")

from flask import Response, jsonify, request, Blueprint
from projeto.app.paths import (
    workspace_root,
    datasets_custom_dir,
    storage_imagens_implates_dir,
    upload_folder_uploads_dir,
    upload_folder_root,
)

# --- CONFIGURAÇÃO DE ESTADO GLOBAL E LOGS ---
bp = Blueprint("training", __name__, url_prefix='/train')

TRAINING_STATE = {
    "is_active": False,
    "job_id": None,
    "process": None, 
    "log_path": None, 
    "status": "idle"
}

LOGS_DIR = Path("./runs/logs").resolve()
LOGS_DIR.mkdir(parents=True, exist_ok=True)

class TrainPayload(BaseModel):
    dataset: str
    modelo_base: Optional[str] = None
    preprocess_list: Optional[List[str]] = []
    save_checkpoints: Optional[bool] = False
    exp_name: Optional[str] = None
    full_config: Optional[dict] = {}


# --- FUNÇÃO DE PREPARAÇÃO DE DADOS (CONF_DATASET) ---
def conf_dataset(dataset_config: dict, dataset_path: str):
    """
    Prepara o dataset localmente: divide o upload do usuário em T/V/T e
    adiciona classes negativas aleatórias (se configurado).
    Retorna o caminho POSIX para o diretório de saída.
    """
    
    if not dataset_path or dataset_path.strip() == "":
        raise ValueError("dataset_path está vazio ou null")

    dataset_path = Path(dataset_path)

    if not dataset_path.exists():
        # Lembre-se: dataset_path vem do frontend, e precisa existir.
        raise FileNotFoundError(f"Pasta do dataset de upload não encontrada: {dataset_path}")

    upload_folder_name = dataset_path.name
    
    # Define o caminho de saída do dataset customizado (onde as imagens serão copiadas)
    base_output = datasets_custom_dir()
    output_root = base_output / f"dataset_{upload_folder_name}_{time.strftime('%Y%m%d_%H%M%S')}"
    
    # Limpa a pasta de destino (importante para evitar mix de runs)
    if output_root.exists():
         try:
             shutil.rmtree(output_root)
         except Exception as e:
              print(f"ATENÇÃO: Não foi possível limpar o diretório {output_root}. Ignorando. Erro: {e}")

    # Cria o diretório raiz do dataset customizado
    output_root.mkdir(parents=True, exist_ok=True)

    folders = {
        "train": output_root / "train",
        "val": output_root / "val",
        "test": output_root / "test"
    }
    
    # 1. Cria as pastas TRAIN, VAL, TEST
    for part in folders.values():
        part.mkdir(parents=True, exist_ok=True)

    # Variáveis de configuração
    types_to_include = dataset_config.get("types_to_include", [])
    IMG_EXT = [".jpg", ".png", ".jpeg", ".bmp", ".tiff"]
    class_name_positive = upload_folder_name

    # ---------------------------------------
    # 2. PROCESSO DE CLASSE POSITIVA (UPLOAD DO USUÁRIO)
    # ---------------------------------------
    
    train_pct = dataset_config["train_percent"]
    val_pct = dataset_config["val_percent"]
    test_pct = dataset_config["test_percent"]
    
    # 2a. Cria e preenche a pasta da CLASSE POSITIVA
    for part in folders.values():
        (part / class_name_positive).mkdir(parents=True, exist_ok=True)

    images = [
        f for f in dataset_path.iterdir()
        if f.suffix.lower() in IMG_EXT
    ]
    random.shuffle(images)

    total = len(images)
    train_n = int(ceil(total * train_pct / 100))
    val_n = int(ceil(total * val_pct / 100))
    test_n = total - train_n - val_n

    # Copia imagens da classe positiva
    for img in images[:train_n]:
        shutil.copy(img, folders["train"] / class_name_positive / img.name)
    for img in images[train_n:train_n + val_n]:
        shutil.copy(img, folders["val"] / class_name_positive / img.name)
    for img in images[train_n + val_n:]:
        shutil.copy(img, folders["test"] / class_name_positive / img.name)

    # ---------------------------------------
    # 3. PROCESSO DE CLASSE NEGATIVA (DADOS FIXOS CM/HE/HI)
    #    - types_to_include esperado como objeto/dict no formato:
    #        { "Cone": {"LINE_A": 10, "LINE_B": 5}, "Hex Externo": {"default_line": 50} }
    #      ou compatível com a forma antiga (lista de tipos) -> nesse caso usa-se random_count/global
    #    - A divisão Train/Val/Test é feita POR LINHA (não por tipo)
    # ---------------------------------------
    if types_to_include:
        print("[INFO] Adicionando imagens negativas para tipos:", dataset_config)
        # compatibilidade: valores auxiliares
        random_count = dataset_config.get("random_count", 0)
        random_split = dataset_config.get("random_split", {"train": 70, "val": 20, "test": 10})

        # Cria a pasta de negativos
        class_name_negative = "negativo"
        for part in folders.values():
            (part / class_name_negative).mkdir(parents=True, exist_ok=True)

        # Pontos base fixos para cada tipo (usar a pasta `storage/imagens_implates` na raiz do workspace)
        IMPLANTES_BASE = storage_imagens_implates_dir()
        TYPE_BASE_PATHS = {
            "Cone": IMPLANTES_BASE / 'CM',
            "Hex Externo": IMPLANTES_BASE / 'HE',
            "Hex Interno": IMPLANTES_BASE / 'HI'
        }

        # Normalize types_to_include: pode ser lista (compat) ou dict (novo formato)
        if isinstance(types_to_include, dict):
            types_map = types_to_include
        else:
            # lista -> transforma em dict com default_line baseado em random_count
            types_map = {t: {"default_line": random_count} for t in types_to_include}

        # Para cada tipo, iterar pelas linhas solicitadas (ou por todas as linhas se default)
        # Mantém um conjunto global de fontes já usadas para evitar duplicatas entre linhas/tipos
        used_sources = set()
        for tipo, line_spec in types_map.items():
            tipo_path = TYPE_BASE_PATHS.get(tipo)
            if not tipo_path or not tipo_path.exists():
                print(f"[WARNING] Tipo negativo '{tipo}' não encontrado no disco: {tipo_path}")
                continue

            # Descobre as linhas disponíveis (subpastas) e conta imagens por linha
            available_lines = {}
            for sub in tipo_path.iterdir():
                if sub.is_dir():
                    imgs = [f for f in sub.rglob('*') if f.suffix.lower() in IMG_EXT and f.is_file()]
                    available_lines[sub.name] = imgs
            # também considera arquivos soltos na raiz do tipo como linha 'root'
            root_imgs = [f for f in tipo_path.iterdir() if f.is_file() and f.suffix.lower() in IMG_EXT]
            if root_imgs:
                available_lines['root'] = root_imgs

            if not available_lines:
                continue

            # Determina se o usuário especificou linhas explicitamente (exclui 'default_line')
            explicit_lines = []
            default_for_type = None
            if isinstance(line_spec, dict):
                explicit_lines = [k for k in line_spec.keys() if k != 'default_line']
                if 'default_line' in line_spec and isinstance(line_spec['default_line'], int):
                    default_for_type = int(line_spec['default_line'])
            else:
                # formato legado: line_spec pode ser um int (random_count compat)
                if isinstance(line_spec, int):
                    default_for_type = int(line_spec)

            # mapa para comparação case-insensitive entre linhas disponíveis e as solicitadas
            avail_map = {k.upper(): (k, v) for k, v in available_lines.items()}

            # Se o usuário solicitou linhas explícitas, processe somente elas (quando existirem)
            if explicit_lines:
                lines_to_process = []
                for req in explicit_lines:
                    key = req.upper()
                    if key in avail_map:
                        lines_to_process.append(avail_map[key][0])
                    else:
                        print(f"[WARNING] Linha solicitada '{req}' para tipo '{tipo}' não encontrada entre as linhas disponíveis: {list(available_lines.keys())}")
                if not lines_to_process:
                    # nenhuma das linhas explícitas foi encontrada; pule este tipo
                    continue
            else:
                # sem linhas explícitas -> processa todas as linhas disponíveis
                lines_to_process = list(available_lines.keys())

            # Para cada linha selecionada, determine quantas imagens copiar
            for line_name in lines_to_process:
                imgs_list = available_lines.get(line_name, [])

                # Filtra imagens já usadas por linhas/tipos anteriores para evitar duplicações
                filtered_imgs = []
                skipped = 0
                for img in imgs_list:
                    try:
                        key = str(img.resolve())
                    except Exception:
                        key = str(img)
                    if key in used_sources:
                        skipped += 1
                        continue
                    filtered_imgs.append(img)

                if skipped:
                    print(f"[INFO] Pulando {skipped} imagens já usadas na linha '{line_name}' do tipo '{tipo}'.")

                imgs_list = filtered_imgs

                requested = None
                # Se houver uma entrada explícita para esta linha (case-insensitive), use-a
                if isinstance(line_spec, dict):
                    for k, v in line_spec.items():
                        if k == 'default_line':
                            continue
                        if k.upper() == line_name.upper() and isinstance(v, int):
                            requested = int(v)
                            break

                # Se não foi definido explicitamente, use default_for_type quando houver
                if requested is None and default_for_type is not None:
                    requested = default_for_type

                # Fallback: se ainda não definido, use random_count global ou todos disponíveis
                if requested is None:
                    requested = int(random_count) if random_count and random_count > 0 else len(imgs_list)

                available_count = len(imgs_list)
                if available_count == 0:
                    continue

                # Escolhe imagens a copiar: aleatório se mais imagens que o solicitado
                if requested >= available_count:
                    chosen = list(imgs_list)
                else:
                    chosen = random.sample(imgs_list, requested)

                # Registra as fontes escolhidas para evitar duplicatas futuras
                for img in chosen:
                    try:
                        used_sources.add(str(img.resolve()))
                    except Exception:
                        used_sources.add(str(img))

                # Agora SPLIT por linha: aplica random_split aos itens escolhidos
                total_line = len(chosen)
                # Embaralha para garantir distribuição aleatória entre partes
                random.shuffle(chosen)
                t_n = int(total_line * random_split.get('train', 70) / 100)
                v_n = int(total_line * random_split.get('val', 20) / 100)
                te_n = total_line - t_n - v_n

                # Copia com nomes únicos para evitar colisões (tipo_linha_nome.ext)
                prefix = tipo.replace(' ', '_')[:10]
                # treino
                for img in chosen[0:t_n]:
                    unique_name = f"{prefix}_{line_name}_{img.name}"
                    try:
                        shutil.copy(img, folders['train'] / class_name_negative / unique_name)
                    except Exception as e:
                        print(f"[ERROR] copying negative image {img} -> {e}")
                # validação
                for img in chosen[t_n:t_n + v_n]:
                    unique_name = f"{prefix}_{line_name}_{img.name}"
                    try:
                        shutil.copy(img, folders['val'] / class_name_negative / unique_name)
                    except Exception as e:
                        print(f"[ERROR] copying negative image {img} -> {e}")
                # teste
                for img in chosen[t_n + v_n:]:
                    unique_name = f"{prefix}_{line_name}_{img.name}"
                    try:
                        shutil.copy(img, folders['test'] / class_name_negative / unique_name)
                    except Exception as e:
                        print(f"[ERROR] copying negative image {img} -> {e}")

    # RETORNA O CAMINHO NORMALIZADO (POSIX)
    return str(output_root).replace('\\', '/')

# --- FUNÇÃO DE TREINAMENTO EM PROCESSO SEPARADO (CLEAN) ---
def run_training_job_process(job_id, config):
    # ... (Seu código run_training_job_process, inalterado) ...
    global TRAINING_STATE

    log_file_path = TRAINING_STATE["log_path"]
    
    # 1. Constrói o comando YOLO CLI
    # Argumentos passados diretamente para a CLI do YOLO (Ex: yolo classify train project=... epochs=...)
    yolo_args = [
        f"{k}={shlex.quote(str(v))}" 
        for k, v in config.items() 
        if k not in ['mode', 'task']
    ]
    
    command = ["yolo", config.get('task', 'classify'), config.get('mode', 'train')] + yolo_args
    command_str = " ".join(command)

    log_file_handle = None

    try:
        log_file_handle = open(log_file_path, 'w', encoding='utf-8') # FORÇA UTF-8 para escrita
            
        log_file_handle.write(f"--- COMANDO INICIADO ---\n{command_str}\n------------------------\n")
        log_file_handle.flush()
            
        process = subprocess.Popen(
            command_str, 
            shell=True,
            stdout=log_file_handle, 
            stderr=subprocess.STDOUT,
            cwd=Path.cwd()
        )
            
        TRAINING_STATE["process"] = process
        TRAINING_STATE["status"] = "running"

        return_code = process.wait() 

        if TRAINING_STATE["status"] == "running": 
            if return_code == 0:
                TRAINING_STATE["status"] = "complete"
                log_file_handle.write("\n\n--- TREINAMENTO_COMPLETO ---\n")
            else:
                TRAINING_STATE["status"] = "error"
                log_file_handle.write(f"\n\n--- ERRO_TREINAMENTO: Processo encerrado com código {return_code} ---\n")
            log_file_handle.flush()
                
    except Exception as e:
        TRAINING_STATE["status"] = "error"
        if log_file_handle:
            log_file_handle.write(f"\nERRO FATAL: Exceção na Thread Flask: {str(e)}\n")
        
    finally:
        TRAINING_STATE["is_active"] = False
        TRAINING_STATE["job_id"] = None
        TRAINING_STATE["process"] = None
        TRAINING_STATE["log_path"] = None
        if log_file_handle:
             log_file_handle.close()

@bp.route("/status", methods=["GET"])
def get_training_status():
    global TRAINING_STATE
    if TRAINING_STATE["is_active"] and TRAINING_STATE["process"] and TRAINING_STATE["process"].poll() is not None:
         TRAINING_STATE["is_active"] = False
    return jsonify({
        "is_active": TRAINING_STATE["is_active"],
        "job_id": TRAINING_STATE["job_id"],
        "status": TRAINING_STATE["status"]
    })

@bp.route("/cancel", methods=["POST"])
def cancel_train():
    global TRAINING_STATE
    if not TRAINING_STATE["is_active"] or not TRAINING_STATE["process"]:
        return jsonify({"status": "not_running", "message": "Nenhum treinamento ativo para cancelar."}), 409
    
    process = TRAINING_STATE["process"]
    job_id = TRAINING_STATE["job_id"]
    log_file_path = TRAINING_STATE["log_path"]
    TRAINING_STATE["status"] = "cancelled" 
    
    try:
        process.terminate()
        process.wait(timeout=10)
        
        if process.poll() is None:
            process.kill()
            process.wait()
            
        with open(log_file_path, 'a') as f:
            f.write("\n\n--- TREINAMENTO CANCELADO PELO USUÁRIO ---\n")
            f.flush()
        
        return jsonify({"status": "cancelled", "job_id": job_id, "message": "Treinamento cancelado com sucesso."}), 200

    except Exception as e:
        TRAINING_STATE["is_active"] = False
        return jsonify({"status": "error", "message": f"Erro ao tentar cancelar: {str(e)}"}), 500

@bp.route("/start", methods=["POST"])
def start_train():  
    global TRAINING_STATE
    
    if TRAINING_STATE["is_active"]:
        return jsonify({"status": "error", "message": f"Um treinamento ({TRAINING_STATE['job_id']}) já está em andamento. Cancele-o primeiro."}), 409
        
    payload = request.get_json() or {}
    
    try:
        # Resolve dataset path under the workspace upload folder (custom/upload_folder_image/<dataset>)
        dataset_name = payload.get("dataset", "")
        dataset_path = str((upload_folder_root() / dataset_name).resolve())
        dataset_config = payload.get("dataset_config", {})
        
        dataset_customizations = conf_dataset(dataset_config, dataset_path)
        
        # Garante que o caminho seja POSIX antes de passar para a config
        if isinstance(dataset_customizations, str):
             dataset_customizations = dataset_customizations.replace('\\', '/')
            
        config = payload.get("full_config", {})
        config["data"] = dataset_customizations
        
        invalid_args = [
            'config_version', 'save_dir', 'format', 'source', 'split', 
            'tracker', 'simplify', 'opset', 'device' 
        ]
        for arg in invalid_args:
             if arg in config:
                del config[arg]
        
        if 'task' not in config: config['task'] = 'classify'
        if 'mode' not in config: config['mode'] = 'train'
        
        job_id = payload.get("exp_name", f"exp-{int(time.time() * 1000)}")
        config['name'] = job_id
        
        log_file = LOGS_DIR / f"{job_id}.log"
        TRAINING_STATE["is_active"] = True
        TRAINING_STATE["job_id"] = job_id
        TRAINING_STATE["log_path"] = log_file
        TRAINING_STATE["status"] = "starting"
        
        thread = threading.Thread(target=run_training_job_process, args=(job_id, config))
        thread.daemon = True
        thread.start()

        return jsonify({
            "status": "training_started_async",
            "job_id": job_id,
            "message": "Treinamento iniciado em segundo plano."
        }), 200

    except Exception as e:
        TRAINING_STATE["is_active"] = False
        TRAINING_STATE["job_id"] = None
        TRAINING_STATE["status"] = "idle"
        
        print(f"[ERROR] Erro ao iniciar treinamento: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@bp.route("/logs/<job_id>", methods=["GET"])
def get_log_file(job_id):
    log_file = LOGS_DIR / f"{job_id}.log"
    if not log_file.exists():
        return Response(f"data: [ERRO] Arquivo de log não encontrado: {log_file}\n\n", mimetype="text/event-stream")

    def generate():
        try:
            # Tenta usar latin-1 para máxima compatibilidade com saída de console
            with open(log_file, 'r', encoding='latin-1') as f:
                # posiciona no final do arquivo para seguir por novas linhas
                f.seek(0, 2)

                while True:
                    line = f.readline()

                    if not line:
                        time.sleep(0.1)
                        # quando o job não está mais ativo e não é o mesmo job_id, finalize
                        if not TRAINING_STATE["is_active"] and TRAINING_STATE["job_id"] != job_id:
                            # leia qualquer linha residual antes de encerrar
                            final_line = f.readline()
                            if final_line:
                                # garante que termine com dupla quebra de linha para completar o evento SSE
                                yield f"data: {final_line.rstrip()}\n\n"
                            yield "data: [INFO] Fim da conexão de log.\n\n"
                            break
                        continue

                    # Para cada linha nova, envie um evento SSE corretamente terminado por uma linha em branco
                    try:
                        yield f"data: {line.rstrip()}\n\n"
                    except Exception:
                        # fallback simples caso haja caracteres estranhos
                        yield f"data: {line.encode('utf-8', errors='replace')}\n\n"
        except Exception as e:
            yield f"data: [ERRO NO STREAM] {str(e)}\n\n"

        # caso o servidor ainda refira este job_id, notifique encerramento do stream
        if TRAINING_STATE["job_id"] == job_id:
            yield "data: [INFO] Stream encerrado pelo servidor.\n\n"

    # Add no-cache and disable proxy buffering where possible to improve real-time delivery
    headers = {
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
    }
    return Response(generate(), mimetype="text/event-stream", headers=headers)

@bp.route('/negative-lines', methods=['GET'])
def list_negative_lines():
    """Retorna um mapeamento do formato { "Cone": {"CM-A": 123, ...}, ... }
    baseado nas subpastas encontradas em projeto/app/storage/imagens_implates.
    """
    # Use workspace storage path for imagens_implates
    BASE = storage_imagens_implates_dir()
    IMG_EXT = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff'}
    result = {}

    # Mapeamento opcional de pastas para nomes legíveis
    TYPE_MAP = {
        'CM': 'Cone',
        'HE': 'Hex Externo',
        'HI': 'Hex Interno'
    }

    if not BASE.exists() or not BASE.is_dir():
        return jsonify(result)

    try:
        for type_dir in BASE.iterdir():
            if not type_dir.is_dir():
                continue
            short = type_dir.name
            type_name = TYPE_MAP.get(short, short)
            lines = {}

            # Cada subpasta representa uma 'linha' — contamos arquivos de imagem dentro dela
            for sub in type_dir.iterdir():
                if sub.is_dir():
                    count = 0
                    try:
                        for f in sub.rglob('*'):
                            if f.suffix.lower() in IMG_EXT and f.is_file():
                                count += 1
                    except Exception:
                        count = 0
                    lines[sub.name] = count

            # Além disso, contemple arquivos soltos diretamente na pasta do tipo
            root_count = 0
            try:
                for f in type_dir.iterdir():
                    if f.is_file() and f.suffix.lower() in IMG_EXT:
                        root_count += 1
            except Exception:
                root_count = 0

            if root_count > 0:
                lines['root'] = root_count

            result[type_name] = lines
    except Exception as e:
        print('[ERROR] list_negative_lines failed:', e)

    return jsonify(result)

@bp.route("/jobs/<job_id>", methods=["GET"])
def get_job(job_id):
    pass
    return {"job_id": job_id, "status": "placeholder", "logs": []}

@bp.route('/upload-folder', methods=['POST'])
def upload_folder():
    import os
    from werkzeug.utils import secure_filename
    # Root uploads folder
    base_root = str(upload_folder_uploads_dir())
    os.makedirs(base_root, exist_ok=True)
    # dataset_name can be provided by frontend; used to ensure files go under that folder
    dataset_name = request.form.get('dataset_name') or request.args.get('dataset_name') or ''
    safe_dataset = secure_filename(dataset_name) if dataset_name else ''

    files = request.files.getlist('files')
    saved = 0
    errors = []
    print("STARTING UPLOAD...")
    for f in files:
        filename = getattr(f, 'filename', None) or ''
        rel = filename.replace('\\', '/').lstrip('/')
        parts = [p for p in rel.split('/') if p and p != '..']

        if not parts:
            # fallback simple filename
            fname = secure_filename(filename) or 'file'
            target = os.path.join(base_root, fname) if not safe_dataset else os.path.join(base_root, safe_dataset, fname)
        else:
            # If frontend provided dataset_name and the uploaded relative path already includes it as top folder,
            # do not duplicate the folder name. Otherwise, prefix with dataset_name so files land under uploads/<dataset_name>/...
            if safe_dataset:
                if parts[0] == safe_dataset:
                    target_parts = parts
                else:
                    target_parts = [safe_dataset] + parts
            else:
                target_parts = parts
            safe_parts = [secure_filename(p) for p in target_parts]
            target = os.path.join(base_root, *safe_parts)
        try:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            f.save(target)
            saved += 1
        except Exception as e:
            print(f"[ERROR] Could not save uploaded file to {target}: {e}")
            errors.append({'file': filename, 'error': str(e)})
    print("FINASHED")
    return jsonify({'status': 'ok', 'saved': saved, 'errors': errors}), (200 if not errors else 207)

@bp.route('/datasets', methods=['GET'])
def list_uploaded_datasets():
    import os
    base_root = str(upload_folder_root())
    alt_root = os.path.join(base_root, 'AQUI')
    dirs_found = set()

    def scan_root(root):
        if not os.path.isdir(root):
            return
        for dirpath, dirnames, filenames in os.walk(root):
            if filenames:
                rel = os.path.relpath(dirpath, base_root)
                rel = rel.replace('\\', '/')
                if rel == '.':
                    continue
                dirs_found.add(rel)

    scan_root(base_root)
    scan_root(alt_root)

    results = sorted(dirs_found)
    return jsonify({'datasets': results})

@bp.route('/dataset-info/<path:ds>', methods=['GET'])
def dataset_info(ds):
    """Return basic info about an uploaded dataset: count of image files.
    ds is the relative path under custom/upload_folder_image/uploads
    """
    import os
    IMG_EXT = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.gif', '.webp'}
    base_root = str(upload_folder_uploads_dir())
    # sanitize ds to avoid escaping base
    safe = ds.replace('..', '').lstrip('/\\')
    # If frontend sent values like 'uploads/NAME', strip the leading 'uploads/' so
    # we resolve paths relative to the uploads root only once.
    if safe.startswith('uploads/') or safe.startswith('uploads\\'):
        safe = safe.split('/', 1)[1] if '/' in safe else safe.split('\\', 1)[1]
    target = os.path.abspath(os.path.join(base_root, safe))
    # Ensure target is inside base_root
    if not target.startswith(base_root):
        return jsonify({'error': 'invalid dataset path'}), 400

    total = 0
    if not os.path.exists(target):
        return jsonify({'dataset': ds, 'count': 0})

    for root, dirs, files in os.walk(target):
        for f in files:
            if os.path.splitext(f)[1].lower() in IMG_EXT:
                total += 1

    return jsonify({'dataset': ds, 'count': total})