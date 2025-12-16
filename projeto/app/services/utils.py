"""
Serviço de utilidades - funções auxiliares reutilizáveis.
"""
from pathlib import Path
from typing import Optional


def safe_cleanup_directory(directory: Path, remove_root: bool = False):
    """
    Limpa conteúdo de um diretório de forma segura.
    Se remove_root=True, remove o diretório raiz também.
    """
    if not directory.exists():
        return
    
    try:
        for item in directory.iterdir():
            if item.is_file():
                item.unlink()
            elif item.is_dir():
                # Remove apenas primeiro nível de subdiretórios
                for sub in item.iterdir():
                    if sub.is_file():
                        sub.unlink()
                if remove_root:
                    try:
                        item.rmdir()
                    except OSError:
                        pass
        
        if remove_root:
            try:
                directory.rmdir()
            except OSError:
                pass
    except Exception as e:
        # Log silencioso - não queremos quebrar o fluxo por falha de limpeza
        pass


def ensure_directory(path: Path) -> Path:
    """Garante que um diretório existe, criando se necessário."""
    path.mkdir(parents=True, exist_ok=True)
    return path
