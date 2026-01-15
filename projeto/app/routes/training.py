import os
import threading
from pathlib import Path
from typing import Optional, List
from werkzeug.utils import secure_filename
import subprocess

from pydantic import BaseModel
from flask import Response, jsonify, request, Blueprint
import signal
import os

from projeto.app.paths import upload_folder_uploads_dir, upload_folder_root, datasets_custom_dir
from projeto.app.services.training_service import (
    prepare_dataset,
    execute_training_subprocess,
    get_negative_lines_info
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

# Cleanup de processos antigos quando o módulo é carregado
def cleanup_zombie_processes():
    """Mata qualquer processo YOLO que estava rodando antes do Flask reiniciar."""
    import subprocess
    try:
        if os.name == 'nt':  # Windows
            # Mata todos os processos yolo que possam estar rodando
            os.system('taskkill /F /IM python.exe /FI "COMMANDLINE eq *yolo*" 2>nul')
        else:  # Linux/Mac
            os.system('pkill -f "yolo.*train" 2>/dev/null')
    except Exception as e:
        print(f"[AVISO] Erro ao fazer cleanup de processos: {e}")

# Executa cleanup ao carregar o blueprint
cleanup_zombie_processes()

class TrainPayload(BaseModel):
    dataset: str
    modelo_base: Optional[str] = None
    preprocess_list: Optional[List[str]] = []
    save_checkpoints: Optional[bool] = False
    exp_name: Optional[str] = None
    full_config: Optional[dict] = {}


def run_training_job_process(job_id, config):
    """Wrapper para executar treinamento via serviço."""
    global TRAINING_STATE
    log_file_path = TRAINING_STATE["log_path"]
    
    def update_state(status, process):
        """Callback para atualizar estado global."""
        TRAINING_STATE["status"] = status
        TRAINING_STATE["process"] = process
        if status in ["completed", "error"]:
            TRAINING_STATE["is_active"] = False
            TRAINING_STATE["job_id"] = None
            TRAINING_STATE["log_path"] = None
    
    execute_training_subprocess(job_id, config, log_file_path, update_state)


@bp.route("/status", methods=["GET"])
def get_training_status():
    global TRAINING_STATE
    # Se há um processo e ele terminou, atualiza o estado
    if TRAINING_STATE["is_active"] and TRAINING_STATE["process"] and TRAINING_STATE["process"].poll() is not None:
        TRAINING_STATE["is_active"] = False
        TRAINING_STATE["process"] = None
        TRAINING_STATE["status"] = "completed"
    
    return jsonify({
        "is_active": TRAINING_STATE["is_active"],
        "job_id": TRAINING_STATE["job_id"],
        "status": TRAINING_STATE["status"]
    })


@bp.route("/cancel", methods=["POST"])
def cancel_train():
    global TRAINING_STATE
    if not TRAINING_STATE["is_active"] or not TRAINING_STATE["process"]:
        return jsonify({"detail": "Nenhum treinamento ativo"}), 400
    
    process = TRAINING_STATE["process"]
    job_id = TRAINING_STATE["job_id"]
    log_file_path = TRAINING_STATE["log_path"]
    TRAINING_STATE["status"] = "cancelled"
    TRAINING_STATE["is_active"] = False  # IMPORTANTE: marcar como inativo IMEDIATAMENTE
    
    try:
        # Mata o processo e toda sua árvore de filhos
        if os.name == 'nt':  # Windows
            # Mata o processo e todos seus filhos
            try:
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], 
                             timeout=5, capture_output=True)
            except Exception:
                process.kill()
        else:  # Linux/Mac
            # Mata o grupo de processos
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            except Exception:
                try:
                    process.terminate()
                    process.wait(timeout=2)
                except Exception:
                    process.kill()

        # Garante que o processo foi morto
        try:
            process.wait(timeout=2)
        except Exception:
            pass

        with open(log_file_path, 'a', encoding='utf-8') as f:
            f.write("\n--- TREINAMENTO CANCELADO PELO USUÁRIO ---\n")
        
        TRAINING_STATE["process"] = None
        TRAINING_STATE["job_id"] = None
        TRAINING_STATE["log_path"] = None
        
        return jsonify({
            "status": "cancelled", 
            "job_id": job_id,
            "message": "Treinamento cancelado com sucesso"
        })

    except Exception as e:
        TRAINING_STATE["is_active"] = False
        TRAINING_STATE["process"] = None
        return jsonify({"detail": f"Erro ao cancelar: {e}"}), 500


@bp.route("/start", methods=["POST"])
def start_train():  
    global TRAINING_STATE
    
    if TRAINING_STATE["is_active"]:
        return jsonify({"detail": "Treinamento já em andamento"}), 400
        
    payload = request.get_json() or {}
    
    try:
        # Prepara dataset via serviço
        dataset_name = payload.get("dataset", "")
        # Aponta explicitamente para a pasta de uploads (onde os datasets residem)
        dataset_path = str((upload_folder_uploads_dir() / dataset_name).resolve())
        dataset_config = payload.get("dataset_config", {})
        
        dataset_customizations = prepare_dataset(
            dataset_config,
            dataset_path,
            upload_folder_name=dataset_name
        )
            
        config = payload.get("full_config", {})
        config["data"] = dataset_customizations
        
        # Remove argumentos inválidos
        invalid_args = [
            'config_version', 'save_dir', 'format', 'source', 'split', 
            'tracker', 'simplify', 'opset', 'device' 
        ]
        for arg in invalid_args:
            config.pop(arg, None)
        
        if 'task' not in config:
            config['task'] = 'classify'
        if 'mode' not in config:
            config['mode'] = 'train'
        
        import time
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

        return jsonify({"status": "started", "job_id": job_id})

    except Exception as e:
        TRAINING_STATE["is_active"] = False
        TRAINING_STATE["job_id"] = None
        TRAINING_STATE["status"] = "idle"
        
        print(f"[ERROR] Erro ao iniciar treinamento: {e}")
        return jsonify({"detail": f"Erro ao iniciar treinamento: {e}"}), 500


@bp.route("/logs/<job_id>", methods=["GET"])
def get_log_file(job_id):
    """Stream de logs via SSE. Aguarda a criação do arquivo para evitar encerramento precoce."""
    log_file = LOGS_DIR / f"{job_id}.log"

    def generate():
        try:
            import time
            # Aguarda o arquivo existir mantendo a conexão
            while not log_file.exists():
                if TRAINING_STATE.get("job_id") != job_id or TRAINING_STATE.get("status") in ["completed", "error", "cancelled"]:
                    yield "data: [STREAM ENCERRADO]\n\n"
                    return
                yield "data: [AGUARDANDO LOG...]\n\n"
                time.sleep(0.5)

            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                f.seek(0, 2)
                yield "data: [STREAM INICIADO]\n\n"
                while True:
                    # Verifica se foi cancelado ou se o treino não está mais ativo
                    if not TRAINING_STATE.get("is_active") or TRAINING_STATE.get("status") in ["completed", "error", "cancelled"]:
                        yield "data: [STREAM ENCERRADO]\n\n"
                        break
                    
                    line = f.readline()
                    if line:
                        yield f"data: {line.rstrip()}\n\n"
                    else:
                        time.sleep(0.5)
        except Exception as e:
            yield f"data: [ERRO] {str(e)}\n\n"

    headers = {
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
    }
    return Response(generate(), mimetype="text/event-stream", headers=headers)


@bp.route('/negative-lines', methods=['GET'])
def list_negative_lines():
    """Retorna linhas de implantes negativos disponíveis."""
    result = get_negative_lines_info()
    return jsonify(result)


@bp.route("/jobs/<job_id>", methods=["GET"])
def get_job(job_id):
    """Retorna informações sobre um job específico."""
    return jsonify({"job_id": job_id, "status": "placeholder", "logs": []})


@bp.route('/upload-folder', methods=['POST'])
def upload_folder():
    """Upload de arquivos para dataset."""
    base_root = str(upload_folder_uploads_dir())
    os.makedirs(base_root, exist_ok=True)
    
    dataset_name = request.form.get('dataset_name') or request.args.get('dataset_name') or ''
    safe_dataset = secure_filename(dataset_name) if dataset_name else ''

    files = request.files.getlist('files')
    saved = 0
    errors = []
    
    print("[INFO] Iniciando upload...")
    for f in files:
        filename = getattr(f, 'filename', None) or ''
        rel = filename.replace('\\', '/').lstrip('/')
        parts = [p for p in rel.split('/') if p and p != '..']

        if not parts:
            errors.append(f"Nome inválido: {filename}")
            continue
        else:
            if safe_dataset:
                target_dir = os.path.join(base_root, safe_dataset, *parts[:-1])
            else:
                target_dir = os.path.join(base_root, *parts[:-1])
            
            os.makedirs(target_dir, exist_ok=True)
            target_path = os.path.join(target_dir, parts[-1])
            
        try:
            f.save(target_path)
            saved += 1
        except Exception as e:
            errors.append(f"{filename}: {str(e)}")
    
    print(f"[INFO] Upload concluído: {saved} arquivos salvos")
    return jsonify({'status': 'ok', 'saved': saved, 'errors': errors}), (200 if not errors else 207)


@bp.route('/datasets', methods=['GET'])
def list_uploaded_datasets():
    """Lista datasets enviados."""
    base_root = str(upload_folder_root())
    alt_root = os.path.join(base_root, 'AQUI')
    dirs_found = set()
    custom_found = set()

    def scan_root(root):
        if not os.path.isdir(root):
            return
        for dirpath, dirnames, filenames in os.walk(root):
            if filenames:
                rel = os.path.relpath(dirpath, base_root)
                if rel != '.':
                    # Normaliza para remover prefixo redundante "uploads/"
                    if rel.startswith('uploads' + os.sep):
                        rel = rel.split(os.sep, 1)[1]
                    dirs_found.add(rel)

    scan_root(base_root)
    scan_root(alt_root)

    # Também lista datasets do diretório custom/datasets_custom
    try:
        custom_root = str(datasets_custom_dir())
        if os.path.isdir(custom_root):
            for name in os.listdir(custom_root):
                dpath = os.path.join(custom_root, name)
                if not os.path.isdir(dpath):
                    continue
                # Considera como dataset válido se existir subpasta 'val' ou 'test' com quaisquer arquivos
                has_split = False
                for split in ("val", "test"):
                    sp = os.path.join(dpath, split)
                    if os.path.isdir(sp):
                        # verifica se há ao menos um arquivo dentro
                        for _, _, files in os.walk(sp):
                            if files:
                                has_split = True
                                break
                    if has_split:
                        break
                if has_split:
                    custom_found.add(name)
    except Exception as e:
        print(f"[AVISO] Falha ao listar datasets customizados: {e}")

    # Une resultados (uploads + custom)
    all_results = sorted(dirs_found.union(custom_found))
    return jsonify({'datasets': all_results})


@bp.route('/dataset-info/<path:ds>', methods=['GET'])
def dataset_info(ds):
    """Retorna contagem de imagens de um dataset enviado."""
    IMG_EXT = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.gif', '.webp'}
    base_root = str(upload_folder_uploads_dir())
    
    # Sanitiza caminho
    safe = ds.replace('..', '').lstrip('/\\')
    if safe.startswith('uploads/') or safe.startswith('uploads\\'):
        safe = safe.split('/', 1)[1] if '/' in safe else safe.split('\\', 1)[1]
    
    target = os.path.abspath(os.path.join(base_root, safe))
    
    # Valida segurança do caminho
    if not target.startswith(base_root):
        return jsonify({'detail': 'Caminho inválido'}), 400

    total = 0
    if not os.path.exists(target):
        return jsonify({'dataset': ds, 'count': 0})

    for root, dirs, files in os.walk(target):
        for f in files:
            if Path(f).suffix.lower() in IMG_EXT:
                total += 1

    return jsonify({'dataset': ds, 'count': total})
