"""
Serviço de predição - encapsula lógica de resolução de modelos e execução de avaliações.
"""
import os
from pathlib import Path
from typing import List, Tuple, Dict, Any

from projeto.app.paths import custom_models_dir, storage_models_yolo_dir, storage_datasets_yolo_dir, workspace_root
from projeto.app.routes.train_models import function_test_yolo


def resolve_model_paths(models: List[str]) -> Tuple[List[str], List[str]]:
    """
    Resolve a lista de modelos para caminhos de arquivo válidos.
    Retorna (model_paths, missing).
    Procura em: raiz do projeto, custom_models_dir(), storage_models_yolo_dir().
    """
    # Ordem de busca: raiz do projeto -> custom -> storage
    search_dirs = [
        Path.cwd(),  # Raiz do projeto (onde os modelos yolo*.pt estão)
        custom_models_dir(),
        storage_models_yolo_dir()
    ]
    
    model_paths: List[str] = []
    missing: List[str] = []

    for m in models or []:
        if not isinstance(m, str) or not m.strip():
            missing.append(str(m))
            continue
        
        m_str = m.strip()
        p = Path(m_str)
        
        # Caminho absoluto
        if p.is_absolute() and p.is_file():
            model_paths.append(str(p))
            continue
        
        # Procura em cada diretório de busca
        found = None
        for base_dir in search_dirs:
            if not base_dir.exists() or not base_dir.is_dir():
                continue
                
            # Caminho relativo direto
            candidate = base_dir / m_str
            if candidate.is_file():
                found = candidate
                break
            
            # Busca fuzzy por prefixo
            try:
                for f in os.listdir(base_dir):
                    fp = base_dir / f
                    if fp.is_file() and f.lower().startswith(m_str.lower()):
                        found = fp
                        break
            except Exception:
                pass
            
            if found:
                break
        
        if found:
            model_paths.append(str(found))
        else:
            missing.append(m_str)
    
    return model_paths, missing


def get_default_dataset_path() -> str:
    """Retorna caminho default de dataset para avaliação/predição."""
    return str((storage_datasets_yolo_dir() / "CM" / "01").resolve())


def prepare_output_directory(timestamp: str) -> Path:
    """Cria e limpa o diretório de saída para predição no workspace_root()."""
    predictions_base = workspace_root() / "predictions"
    predictions_base.mkdir(parents=True, exist_ok=True)
    output_path = predictions_base / f"predicao_{timestamp}"
    
    if output_path.exists():
        # Limpa conteúdo imediato se já existir
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
    
    return output_path


def run_prediction(
    models: List[str],
    dataset_path: str = None,
    split: str = "test",
    project_name: str = "predicao",
    output_dir: Path = None
) -> Tuple[Dict[str, Any], List[str], List[str]]:
    """
    Executa avaliação dos modelos.
    Retorna (results, evaluated, missing).
    """
    model_paths, missing = resolve_model_paths(models)
    
    if not model_paths:
        return None, [], missing
    
    if not dataset_path:
        dataset_path = get_default_dataset_path()
    
    results = function_test_yolo(
        model_paths=model_paths,
        dataset_path=dataset_path,
        split=split,
        project_name=project_name,
        output_dir=str(output_dir) if output_dir else None
    )
    
    evaluated = [os.path.basename(p) for p in model_paths]
    
    return results, evaluated, missing


def serialize_results(results: Dict[str, Any]) -> Dict[str, Any]:
    """Serializa resultados para JSON seguro."""
    serialized = {}
    for k, v in (results or {}).items():
        if isinstance(v, dict):
            serialized[k] = v
        else:
            serialized[k] = str(v)
    return serialized
