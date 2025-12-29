import os
import time
import re
from pathlib import Path
from flask import Flask, send_from_directory, jsonify, abort, send_file, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}, r"/predictions/*": {"origins": "*"}, r"/*": {"origins": "*"}})

# Importa workspace_root com fallback
try:
    from projeto.app.paths import workspace_root
except ImportError:
    def workspace_root():
        return BASE_DIR

# Registrar blueprints
try:
    from projeto.app.routes import training as training_mod
    from projeto.app.routes import prediction as prediction_mod
    
    app.register_blueprint(training_mod.bp, url_prefix="/train")
    app.register_blueprint(prediction_mod.bp, url_prefix="/predict")
except Exception as e:
    print("Falha ao importar blueprints de projeto.app.routes:", e)

# Paths
project_root = BASE_DIR
predictions_dir = (workspace_root() / "predictions").resolve()
# Modelos podem estar em custom/models OU na raiz do projeto (yolo*.pt)
models_storage_dir = (project_root / "custom" / "models").resolve()

predictions_dir.mkdir(parents=True, exist_ok=True)

# Raízes de busca consolidadas (usadas por múltiplas funções)
def get_candidate_roots():
    """Retorna lista de diretórios onde jobs podem estar localizados."""
    return [
        workspace_root(),
        Path(r"M:\content\drive\MyDrive\pipeline\yolo_classificacao_resultados"),
        Path(r"/content/drive/MyDrive/pipeline/yolo_classificacao_resultados"),
        predictions_dir,
        BASE_DIR,
    ]


def get_latest_job_id(root, job_prefix="treinamento_classificacao"):
    """Busca o diretório de treinamento mais recente baseado em ID numérico crescente."""
    root_path = Path(root)
    if not root_path.exists() or not root_path.is_dir():
        return None

    candidates = []
    
    try:
        for d in root_path.iterdir():
            if d.is_dir() and d.name.startswith(job_prefix):
                mtime = d.stat().st_mtime
                m = re.match(re.escape(job_prefix) + r"(\d+)$", d.name)
                if m:
                    candidates.append((int(m.group(1)), mtime, d.name))
                else:
                    candidates.append((-1, mtime, d.name))
    except Exception:
        pass

    if not candidates:
        return None

    candidates.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return candidates[0][2]


@app.route('/train/latest_job', methods=["GET"])
def get_latest_train_job():
    """Retorna o Job ID do treinamento de classificação mais recente."""
    try:
        resolved_root, resolved_name = _resolve_job_folder('treinamento_classificacao')
    except Exception:
        resolved_root, resolved_name = (None, None)
    return jsonify({"latest_job": resolved_name})


@app.route('/train/jobs', methods=["GET"])
def list_train_jobs():
    """Lista IDs de jobs de treinamento (padrão: treinamento_classificacao*), ordenados por mtime desc."""
    prefix = request.args.get('prefix', 'treinamento_classificacao')
    jobs = []
    seen = set()

    for root in get_candidate_roots():
        try:
            root_path = Path(root)
            if not root_path.exists() or not root_path.is_dir():
                continue
            for d in root_path.iterdir():
                if not d.is_dir():
                    continue
                if not d.name.startswith(prefix):
                    continue
                if d.name in seen:
                    continue
                seen.add(d.name)
                try:
                    mtime = d.stat().st_mtime
                except Exception:
                    mtime = 0
                jobs.append({"job_id": d.name, "mtime": mtime})
        except Exception:
            continue

    jobs.sort(key=lambda j: j.get("mtime", 0), reverse=True)
    return jsonify({"jobs": [j["job_id"] for j in jobs], "prefix": prefix})


def _resolve_job_folder(job_prefix):
    """Resolve o nome e raiz do job folder para um dado prefixo."""
    best_root = None
    best_name = None
    best_num = -2
    best_mtime = 0

    for root in get_candidate_roots():
        if not root:
            continue
        try:
            candidate = get_latest_job_id(root, job_prefix=job_prefix)
            if not candidate:
                continue
            m = re.match(re.escape(job_prefix) + r"(\d+)$", candidate)
            num = int(m.group(1)) if m else -1
            p = Path(root) / candidate
            mtime = p.stat().st_mtime if p.exists() else 0
            if num > best_num or (num == best_num and mtime > best_mtime):
                best_num = num
                best_mtime = mtime
                best_root = Path(root)
                best_name = candidate
        except Exception:
            continue

    return (best_root, best_name)


@app.route('/train/image/<job_id>/<name>')
def serve_train_image(job_id, name):
    """Serve imagem de treinamento por job_id e nome base (sem extensão)."""
    exts = ['.jpg', '.png', '.jpeg']
    search_dirs = []

    # Busca EXATA pelo nome do job primeiro (não usar _resolve_job_folder que busca prefixo)
    for root in get_candidate_roots():
        try:
            root_path = Path(root)
            if not root_path.exists():
                continue
            # Procura diretório com nome EXATO
            job_dir = root_path / job_id
            if job_dir.exists() and job_dir.is_dir():
                search_dirs.append(job_dir / 'predicao')
                search_dirs.append(job_dir)
                break  # Encontrou, não precisa continuar
        except Exception:
            continue

    # Busca arquivo nos diretórios encontrados
    for base in search_dirs:
        try:
            for e in exts:
                p = base / f"{name}{e}"
                if p.exists() and p.is_file():
                    return send_file(str(p))
        except Exception:
            continue

    return jsonify({"error": "not_found", "job_id": job_id, "name": name}), 404



import re
from pathlib import Path

@app.route('/train/images/<job_id>')
def list_train_images(job_id):
    """Lista imagens encontradas para o job_id mais recente (maior incremento)."""
    exts = ['.jpg', '.png', '.jpeg']
    patterns = ['train_batch', 'val_batch', 'confusion_matrix', 'results']
    
    found = []
    seen = set()
    search_dirs = []
    resolved_root = None
    resolved_name = None

    print("=-=-=-=- Iniciando busca pelo job mais recente =-=-=-=-")

    for root in get_candidate_roots():
        root_path = Path(root)
        if not root_path.exists():
            continue

        # 1. Buscar todas as pastas que começam com o job_id
        # Ex: treinamento_classificacao, treinamento_classificacao2, treinamento_classificacao17
        candidate_folders = []
        for p in root_path.iterdir():
            if p.is_dir() and p.name.startswith(job_id):
                # Usamos regex para garantir que capturamos o sufixo numérico corretamente
                # Isso evita pegar "treinamento_classificacao_backup" por engano
                if p.name == job_id or re.match(rf"^{job_id}\d+$", p.name):
                    candidate_folders.append(p)

        if not candidate_folders:
            continue

        # 2. Encontrar a pasta com o maior sufixo numérico
        def get_suffix_num(path_obj):
            name = path_obj.name
            if name == job_id:
                return 0
            # Extrai apenas os números após o nome base
            suffix = name[len(job_id):]
            return int(suffix) if suffix.isdigit() else 0

        # Ordena pelas pastas com maior número no final
        latest_job_dir = max(candidate_folders, key=get_suffix_num)
        
        resolved_root = root_path
        resolved_name = latest_job_dir.name  # Aqui será 'treinamento_classificacao17'
        search_dirs.append(latest_job_dir)
        search_dirs.append(latest_job_dir / 'predicao')
        
        print(f"Diretório mais recente encontrado: {latest_job_dir}")
        break 

    if not search_dirs:
        return jsonify({"images": [], "resolved_folder": None, "error": "job_not_found"})

    # O restante do seu loop de busca de imagens permanece quase igual, 
    # mas recomendo usar resolved_name na URL para garantir o path correto da imagem
    for base in search_dirs:
        try:
            if not base or not base.exists():
                continue
            for f in base.iterdir():
                if(f.name == 'results.csv'):
                    continue
                if not f.is_file():
                    continue
                lname = f.name.lower()
                if any(pat in lname for pat in patterns):
                    full = str(f.resolve())
                    if full in seen:
                        continue
                    seen.add(full)
                    base_no_ext = f.stem
                    mtime = int(f.stat().st_mtime) if hasattr(f.stat(), 'st_mtime') else int(time.time())
                    
                    # DICA: Use o resolved_name (o nome da pasta real) para a URL
                    url = f"{request.url_root.rstrip('/')}/train/image/{resolved_name}/{base_no_ext}?t={mtime}"
                    found.append({"name": f.name, "fullpath": full, "url": url, "mtime": mtime})
        except Exception as e:
            print(f"Erro ao processar pasta {base}: {e}")
            continue
    print("=-=-=-=- Busca concluída =-=-=-=-")
    print(f"Imagens encontradas: {resolved_root} / {resolved_name} -> {found} imagens")
    return jsonify({"images": found, "resolved_folder": resolved_name, "resolved_root": str(resolved_root)})


@app.route("/predictions/<path:filename>")
def serve_prediction_file(filename):
    """Serve arquivos dentro de predictions."""
    file_path = predictions_dir / filename
    if not file_path.exists():
        abort(404)
    return send_from_directory(str(predictions_dir), filename)


@app.route("/predictions/last_dir", methods=["GET"])
def last_prediction_dir():
    """Retorna último diretório de predição."""
    base = predictions_dir
    if not base.exists() or not base.is_dir():
        return jsonify({"last_dir": None, "subdirs": [], "full_paths": {}})
    dirs = sorted(
        [d for d in base.iterdir() if d.is_dir() and d.name.startswith("predicao_")],
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )
    if not dirs:
        return jsonify({"last_dir": None, "subdirs": [], "full_paths": {}})
    last_dir = dirs[0]
    subdirs = [d.name for d in last_dir.iterdir() if d.is_dir()]
    full_paths = {d.name: str(d) for d in last_dir.iterdir() if d.is_dir()}
    return jsonify({"last_dir": last_dir.name, "subdirs": subdirs, "full_paths": full_paths})


@app.route("/predictions/runs", methods=["GET"])
def list_prediction_runs():
    """Lista runs de predição."""
    preds = predictions_dir
    if not preds.exists() or not preds.is_dir():
        return jsonify({"runs": []})
    runs = []
    try:
        for d in preds.iterdir():
            if d.is_dir() and d.name.startswith("predicao_"):
                runs.append((d.name, d.stat().st_mtime))
    except Exception:
        return jsonify({"runs": []})
    runs_sorted = [name for (name, _) in sorted(runs, key=lambda t: t[1], reverse=True)]
    return jsonify({"runs": runs_sorted})


@app.route("/predictions/<run_name>/models", methods=["GET"])
def list_models_in_run(run_name):
    """Lista modelos dentro de um run."""
    run_dir = (predictions_dir / run_name).resolve()
    if not run_dir.exists() or not run_dir.is_dir():
        return jsonify({"models": []})
    models = []
    try:
        for p in run_dir.iterdir():
            if p.is_dir():
                models.append(p.name)
    except Exception:
        return jsonify({"models": []})
    return jsonify({"models": sorted(models)})


@app.route("/models", methods=["GET"])
def list_models_root():
    """Lista modelos do storage backend (custom/models) e da raiz (yolo*.pt)."""
    models = []
    seen = set()
    
    # 1. Procura em custom/models/
    if models_storage_dir.exists():
        try:
            for f in sorted(os.listdir(models_storage_dir)):
                fpath = os.path.join(models_storage_dir, f)
                if os.path.isfile(fpath) and f not in seen:
                    models.append(f)
                    seen.add(f)
        except Exception:
            pass
    
    # 2. Procura na raiz do projeto (yolo*.pt, yolo*.pth, etc)
    try:
        for f in sorted(os.listdir(project_root)):
            if (f.startswith('yolo') or f.endswith('.pt') or f.endswith('.pth')) and f not in seen:
                fpath = os.path.join(project_root, f)
                if os.path.isfile(fpath):
                    models.append(f)
                    seen.add(f)
    except Exception:
        pass
    
    return jsonify({"models": sorted(list(seen))})


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    """Serve frontend estático."""
    target = path or "index.html"
    views_dir = BASE_DIR / "projeto" / "views"
    build_dir = BASE_DIR / "frontend" / "build"
    public_dir = BASE_DIR / "frontend" / "public"

    if views_dir.is_dir() and (views_dir / target).exists():
        return send_from_directory(str(views_dir), target)
    if build_dir.is_dir() and (build_dir / target).exists():
        return send_from_directory(str(build_dir), target)
    if public_dir.is_dir() and (public_dir / target).exists():
        return send_from_directory(str(public_dir), target)
    if path.startswith("api") or path.startswith("predict") or path.startswith("train") or path.startswith("metrics") or path.startswith("history"):
        abort(404)
    return ("Frontend files not found. Coloque arquivos estáticos em projeto/views ou frontend/build/public.", 500)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=True, threaded=True)