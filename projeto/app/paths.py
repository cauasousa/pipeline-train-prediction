import os
from pathlib import Path


def workspace_root() -> Path:
    """Retorna a raiz do workspace onde as pastas `custom`, `storage`, `predictions` residem.

    Usa a variável de ambiente `PIPELINE_ROOT` quando presente, caso contrário
    usa um fallback para o caminho do drive mapeado usado pelo usuário.
    """
    env = os.environ.get('PIPELINE_ROOT')
    if env:
        return Path(env).expanduser().resolve()
    # Fallback padrão (ajuste conforme o seu ambiente)
    return Path(r"M:\content\drive\Mydrive\pipeline").resolve()


def custom_models_dir() -> Path:
    return workspace_root() / 'custom' / 'models'


def datasets_custom_dir() -> Path:
    return workspace_root() / 'custom' / 'datasets_custom'


def upload_folder_uploads_dir() -> Path:
    return workspace_root() / 'custom' / 'upload_folder_image' / 'uploads'


def upload_folder_root() -> Path:
    return workspace_root() / 'custom' / 'upload_folder_image'


def storage_models_yolo_dir() -> Path:
    return workspace_root() / 'storage' / 'models_yolo'


def storage_imagens_implates_dir() -> Path:
    return workspace_root() / 'storage' / 'imagens_implates'


def storage_datasets_yolo_dir() -> Path:
    return workspace_root() / 'storage' / 'datasets_yolo'
