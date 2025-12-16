import os
import time
from pathlib import Path
from flask import Flask, send_from_directory, jsonify, abort, send_file, request
from flask_cors import CORS
import re # Necessário para a nova função get_latest_job_id

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__)
# Habilita CORS para rotas API e estáticas
CORS(app, resources={r"/api/*": {"origins": "*"}, r"/predictions/*": {"origins": "*"}, r"/*": {"origins": "*"}})

# Registrar blueprints da pasta `projeto.app.routes` (a implementação atual do projeto)
try:
    from projeto.app.routes import training as training_mod
    from projeto.app.routes import prediction as prediction_mod
    
    app.register_blueprint(training_mod.bp, url_prefix="/train")
    app.register_blueprint(prediction_mod.bp, url_prefix="/predict")
    
except Exception as e:
    # log simples para facilitar debug se a importação falhar
    print("Falha ao importar blueprints de projeto.app.routes:", e)

# Paths
project_root = BASE_DIR
predictions_dir = (project_root / "predictions").resolve()
models_storage_dir = (project_root / "custom" / "models").resolve()

predictions_dir.mkdir(parents=True, exist_ok=True)

### Busca do Último Job de Treinamento ###

def get_latest_job_id(root, job_prefix="treinamento_classificacao"):
    """
    Busca o diretório de treinamento mais recente baseado em ID numérico crescente.
    Se não houver sufixo numérico, usa o tempo de modificação (mtime).
    """
    root_path = Path(root)
    if not root_path.exists() or not root_path.is_dir():
        return None

    candidates = []
    
    try:
        for d in root_path.iterdir():
            if d.is_dir() and d.name.startswith(job_prefix):
                mtime = d.stat().st_mtime
                
                # Tenta extrair o ID numérico
                m = re.match(re.escape(job_prefix) + r"(\d+)$", d.name)
                if m:
                    # Candidato com ID numérico
                    candidates.append((int(m.group(1)), mtime, d.name))
                else:
                    # Candidato sem sufixo numérico (ex: "treinamento_classificacao")
                    # Usamos -1 como ID para que o sufixo numérico seja priorizado, 
                    # e ordenamos pelo mtime para estes casos
                    candidates.append((-1, mtime, d.name))
    except Exception:
        pass

    if not candidates:
        return None

    # Ordenar: 
    # 1. Por ID numérico (decrescente) para priorizar o XX mais alto.
    # 2. Por tempo de modificação (decrescente) como desempate para os não-numerados.
    candidates.sort(key=lambda t: (t[0], t[1]), reverse=True)
    
    return candidates[0][2] # Retorna o nome do diretório (job_id)


@app.route('/train/latest_job', methods=["GET"])
def get_latest_train_job():
    """Retorna o Job ID do treinamento de classificação mais recente para o frontend usar."""
    # Use _resolve_job_folder which searches all candidate roots and selects
    # the folder with the highest numeric suffix (or newest mtime if none).
    try:
        resolved_root, resolved_name = _resolve_job_folder('treinamento_classificacao')
    except Exception:
        resolved_root, resolved_name = (None, None)

    return jsonify({"latest_job": resolved_name})


def _resolve_job_folder(job_prefix):
    """
    Resolve the actual job folder name and its root for a given job prefix.
    Returns a tuple (root_path: Path, folder_name: str) or (None, None) if not found.
    """
    try:
        from projeto.app.paths import workspace_root
    except ImportError:
        def workspace_root():
            return BASE_DIR

    candidate_roots = [
        workspace_root(),
        Path(r"M:\content\drive\MyDrive\pipeline\yolo_classificacao_resultados"),
        Path(r"/content/drive/MyDrive/pipeline/yolo_classificacao_resultados"),
        predictions_dir,
        BASE_DIR,
    ]

    best_root = None
    best_name = None
    best_num = -2
    best_mtime = 0

    for root in candidate_roots:
        if not root:
            continue
        try:
            candidate = get_latest_job_id(root, job_prefix=job_prefix)
            if not candidate:
                continue
            # determine numeric suffix if present
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
# Fim da Busca do Último Job de Treinamento

# Endpoint: servir imagem de treinamento por job_id e nome base (sem extensão)
@app.route('/train/image/<job_id>/<name>')
def serve_train_image(job_id, name):
    exts = ['.jpg', '.png', '.jpeg']

    # Resolve actual job folder (e.g., treinamento_classificacao40) for the given prefix
    root_folder = None
    folder_name = None
    try:
        root_folder, folder_name = _resolve_job_folder(job_id)
    except Exception:
        root_folder, folder_name = (None, None)

    # If we have a resolved folder, search it first (predicao, then root)
    search_dirs = []
    if root_folder and folder_name:
        job_dir = Path(root_folder) / folder_name
        search_dirs.append(job_dir / 'predicao')
        search_dirs.append(job_dir)

    # Fallback candidate roots (if resolution didn't find anything, try the standard roots)
    try:
        from projeto.app.paths import workspace_root
    except ImportError:
        def workspace_root():
            return BASE_DIR

    candidate_roots = [
        workspace_root(),
        Path(r"M:\content\drive\MyDrive\pipeline\yolo_classificacao_resultados"),
        Path(r"/content/drive/MyDrive/pipeline/yolo_classificacao_resultados"),
        predictions_dir,
        BASE_DIR,
    ]

    # Add fallback search locations under each candidate root (shallow job folder matching)
    for root in candidate_roots:
        try:
            for d in Path(root).iterdir():
                if d.is_dir() and job_id in d.name:
                    search_dirs.append(d / 'predicao')
                    search_dirs.append(d)
        except Exception:
            continue

    # perform search
    # Debug logging: print resolution info for debugging 404s
    try:
      print(f"[serve_train_image] request job_id={job_id} name={name} resolved_folder={folder_name} root={root_folder}")
    except Exception:
      pass

    for base in search_dirs:
      try:
        for e in exts:
          p = base / f"{name}{e}"
          try:
            exists = p.exists()
          except Exception:
            exists = False
          print(f"[serve_train_image] trying: {p} exists={exists}")
          if exists and p.is_file():
            print(f"[serve_train_image] serving: {p}")
            return send_file(str(p))
      except Exception as ex:
        print(f"[serve_train_image] error checking {base}: {ex}")
        continue

    return jsonify({"error": "not_found"}), 404


# Endpoint diagnóstico: lista imagens encontradas para job_id
@app.route('/train/images/<job_id>')
def list_train_images(job_id):
  from projeto.app.paths import workspace_root
  exts = ['.jpg', '.png', '.jpeg']
  patterns = ['train_batch', 'val_batch', 'confusion_matrix', 'results']
  project_root = BASE_DIR
  candidate_roots = [
    workspace_root(),
    Path(r"M:\content\drive\MyDrive\pipeline\yolo_classificacao_resultados"),
    Path(r"/content/drive/MyDrive/pipeline/yolo_classificacao_resultados"),
    predictions_dir,
    project_root
  ]

  # Resolve the job folder first; if resolved, only return files from that folder
  resolved_root, resolved_name = _resolve_job_folder(job_id)
  found = []
  seen = set()

  search_dirs = []
  if resolved_root and resolved_name:
    job_dir = Path(resolved_root) / resolved_name
    search_dirs.append(job_dir)
    search_dirs.append(job_dir / 'predicao')
  else:
    # fallback: search candidate roots shallowly for job_id occurrences
    try:
      from projeto.app.paths import workspace_root
    except ImportError:
      def workspace_root():
        return BASE_DIR

    fallback_roots = [
      workspace_root(),
      Path(r"M:\content\drive\MyDrive\pipeline\yolo_classificacao_resultados"),
      Path(r"/content/drive/MyDrive/pipeline/yolo_classificacao_resultados"),
      predictions_dir,
      BASE_DIR,
    ]
    for root in fallback_roots:
      try:
        for d in Path(root).iterdir():
          if d.is_dir() and job_id in d.name:
            search_dirs.append(d)
            search_dirs.append(d / 'predicao')
      except Exception:
        continue

  for base in search_dirs:
    try:
      if not base or not base.exists():
        continue
      # check files directly under base
      for f in base.iterdir():
        if not f.is_file():
          continue
        lname = f.name.lower()
        for pat in patterns:
          if pat in lname:
            full = str(f.resolve())
            if full in seen:
              continue
            seen.add(full)
            base_no_ext = f.stem
            try:
              mtime = int(f.stat().st_mtime)
            except Exception:
              mtime = int(time.time())
            # Use the original job_id (prefix) in the URL so the serve endpoint
            # can resolve the correct suffixed folder server-side. Using the
            # resolved folder name here caused inconsistent lookups and 404s.
            url = request.url_root.rstrip('/') + f"/train/image/{job_id}/{base_no_ext}?t={mtime}"
            found.append({"name": f.name, "fullpath": full, "url": url, "mtime": mtime})
    except Exception:
      continue

  resp = {"images": found, "resolved_folder": resolved_name}
  try:
    if resolved_root:
      resp["resolved_root"] = str(resolved_root)
  except Exception:
    pass
  return jsonify(resp)

# Serve arquivos dentro de predictions
@app.route("/predictions/<path:filename>")
def serve_prediction_file(filename):
  file_path = predictions_dir / filename
  if not file_path.exists():
    abort(404)
  return send_from_directory(str(predictions_dir), filename)

# last prediction dir
@app.route("/predictions/last_dir", methods=["GET"])
def last_prediction_dir():
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

# list runs
@app.route("/predictions/runs", methods=["GET"])
def list_prediction_runs():
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

# list models inside run
@app.route("/predictions/<run_name>/models", methods=["GET"])
def list_models_in_run(run_name):
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

# list models (from backend storage)
@app.route("/models", methods=["GET"])
def list_models_root():
  base = models_storage_dir
  models = []
  if base.exists():
    try:
      models = [f for f in sorted(os.listdir(base)) if os.path.isfile(os.path.join(base, f))]
    except Exception:
      models = []
  return jsonify({"models": models})

# Serve frontend (build preferred, fallback public)
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
  target = path or "index.html"
  # Prioriza as views estáticas em projeto/views
  views_dir = BASE_DIR / "projeto" / "views"
  build_dir = BASE_DIR / "frontend" / "build"
  public_dir = BASE_DIR / "frontend" / "public"

  # 1) Se arquivo existe em projeto/views, servir diretamente
  if views_dir.is_dir() and (views_dir / target).exists():
    return send_from_directory(str(views_dir), target)

  # 2) fallback: frontend/build (se existir)
  if build_dir.is_dir() and (build_dir / target).exists():
    return send_from_directory(str(build_dir), target)
  # 3) fallback: frontend/public
  if public_dir.is_dir() and (public_dir / target).exists():
    return send_from_directory(str(public_dir), target)
  if path.startswith("api") or path.startswith("predict") or path.startswith("train") or path.startswith("metrics") or path.startswith("history"):
    abort(404)
  return ("Frontend files not found. Coloque arquivos estáticos em projeto/views ou frontend/build/public.", 500)

if __name__ == "__main__":
  # Executar localmente em uma porta só (8000)
  app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=True, threaded=True)