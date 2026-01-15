"""
Serviço para gerenciamento de modelos treinados.
Responsável por copiar e organizar modelos best.pt após treinamento.
"""
import shutil
import logging
from pathlib import Path
from datetime import datetime

log = logging.getLogger(__name__)


def save_trained_model(weights_path: str, model_name: str, models_dir: Path) -> bool:
    """
    Copia o modelo best.pt de um treinamento para o diretório models_yolo.
    
    Args:
        weights_path: Caminho completo para best.pt (ex: M:\\path\\to\\weights\\best.pt)
        model_name: Nome descritivo para salvar (ex: 'yolo11n-cls_CM_treinamento1')
        models_dir: Diretório de destino (models_yolo)
    
    Returns:
        True se sucesso, False se falha
    
    Exemplo:
        >>> from projeto.app.paths import storage_models_yolo_dir
        >>> from projeto.app.services.model_manager import save_trained_model
        >>> 
        >>> weights = "M:\\content\\drive\\MyDrive\\pipeline\\yolo_classificacao_resultados\\treinamento_classificacao\\weights\\best.pt"
        >>> save_trained_model(weights, "yolo11n-cls_CM_v1", storage_models_yolo_dir())
    """
    try:
        weights_path_obj = Path(weights_path)
        
        # Valida se o arquivo existe
        if not weights_path_obj.exists() or not weights_path_obj.is_file():
            log.error(f"Arquivo de pesos não encontrado: {weights_path}")
            return False
        
        # Garante que o diretório de destino existe
        models_dir.mkdir(parents=True, exist_ok=True)
        
        # Monta nome final com timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        final_name = f"{model_name}__{timestamp}.pt"
        dest_path = models_dir / final_name
        
        # Copia o arquivo
        shutil.copy2(weights_path_obj, dest_path)
        log.info(f"Modelo salvo: {dest_path}")
        
        return True
        
    except Exception as e:
        log.error(f"Erro ao salvar modelo treinado: {e}")
        return False


def clean_old_models(models_dir: Path, keep_recent: int = 3) -> int:
    """
    Remove modelos antigos, mantendo apenas os N mais recentes.
    
    Args:
        models_dir: Diretório models_yolo
        keep_recent: Número de modelos recentes a manter por prefixo
    
    Returns:
        Número de arquivos removidos
    
    Exemplo:
        >>> from projeto.app.paths import storage_models_yolo_dir
        >>> from projeto.app.services.model_manager import clean_old_models
        >>> 
        >>> removed = clean_old_models(storage_models_yolo_dir(), keep_recent=2)
        >>> print(f"Removidos {removed} modelos antigos")
    """
    if not models_dir.exists():
        return 0
    
    removed = 0
    
    # Agrupa modelos por prefixo (antes do __)
    models_by_prefix = {}
    for pt_file in models_dir.glob('*.pt'):
        # Extrai prefixo (tudo antes de __)
        parts = pt_file.stem.split('__')
        prefix = parts[0] if parts else pt_file.stem
        
        if prefix not in models_by_prefix:
            models_by_prefix[prefix] = []
        
        models_by_prefix[prefix].append(pt_file)
    
    # Remove antigos de cada grupo, mantendo apenas os recentes
    for prefix, files in models_by_prefix.items():
        # Ordena por tempo de modificação (mais recentes primeiro)
        files_sorted = sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)
        
        # Remove tudo além dos keep_recent primeiros
        for old_file in files_sorted[keep_recent:]:
            try:
                old_file.unlink()
                log.info(f"Modelo antigo removido: {old_file.name}")
                removed += 1
            except Exception as e:
                log.warning(f"Erro ao remover {old_file}: {e}")
    
    return removed


def list_trained_models(models_dir: Path) -> dict:
    """
    Lista todos os modelos salvos no diretório.
    
    Args:
        models_dir: Diretório models_yolo
    
    Returns:
        Dicionário com estrutura: {prefix: [lista de arquivos com timestamps]}
    
    Exemplo:
        >>> from projeto.app.paths import storage_models_yolo_dir
        >>> from projeto.app.services.model_manager import list_trained_models
        >>> 
        >>> models = list_trained_models(storage_models_yolo_dir())
        >>> for prefix, files in models.items():
        ...     print(f"{prefix}: {len(files)} versão(ões)")
    """
    if not models_dir.exists():
        return {}
    
    models_by_prefix = {}
    
    for pt_file in models_dir.glob('*.pt'):
        parts = pt_file.stem.split('__')
        prefix = parts[0] if parts else pt_file.stem
        timestamp = parts[1] if len(parts) > 1 else 'unknown'
        
        if prefix not in models_by_prefix:
            models_by_prefix[prefix] = []
        
        models_by_prefix[prefix].append({
            'filename': pt_file.name,
            'path': str(pt_file),
            'timestamp': timestamp,
            'size_mb': pt_file.stat().st_size / (1024 * 1024)
        })
    
    # Ordena por timestamp (mais recentes primeiro)
    for prefix in models_by_prefix:
        models_by_prefix[prefix].sort(key=lambda x: x['timestamp'], reverse=True)
    
    return models_by_prefix
