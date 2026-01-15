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
    """Retorna o diretório onde os modelos treinados são salvos"""
    return workspace_root() / 'models_yolo'


def storage_imagens_implates_dir() -> Path:
    return workspace_root() / 'storage' / 'imagens_implates'


def storage_datasets_yolo_dir() -> Path:
    """Retorna o diretório de datasets de treinamento (custom/datasets_custom)"""
    return datasets_custom_dir()

def predictions_datasets_yolo_dir() -> Path:
    return workspace_root() / 'predictions'

def predictions_images_dir() -> Path:
    """Retorna o diretório raiz para imagens de predição (./predictions_images)"""
    return workspace_root() / 'predictions_images'

def predictions_images_default_dir() -> Path:
    """Retorna o diretório padrão para imagens de predição"""
    return predictions_images_dir() / 'images_default'

def predictions_images_upload_dir() -> Path:
    """Retorna o diretório para imagens feitas upload"""
    return predictions_images_dir() / 'images_upload'

def get_dataset_split_dir(dataset_name: str, split: str = 'val') -> Path:
    """
    Retorna o caminho para um split específico (val/test) de um dataset.
    
    Args:
        dataset_name: Nome do dataset (ex: 'CM', 'implantes')
        split: 'val' ou 'test'
    
    Returns:
        Path para datasets_custom/{dataset_name}/{split}/
    """
    return datasets_custom_dir() / dataset_name / split 