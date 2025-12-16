"""
Serviço de treinamento YOLO.
Centraliza a lógica de preparação de dataset e execução de jobs de treinamento.
"""
import shutil
import os
import random
import time
import subprocess
import sys
import platform
import signal
import shlex
from pathlib import Path
from math import ceil
from typing import Dict, List, Optional, Tuple

from projeto.app.paths import (
    datasets_custom_dir,
    storage_imagens_implates_dir,
)


IMG_EXTENSIONS = [".jpg", ".png", ".jpeg", ".bmp", ".tiff"]


def prepare_dataset(
    dataset_config: dict,
    dataset_path: str,
    upload_folder_name: str
) -> str:
    """
    Prepara o dataset customizado: divide upload em train/val/test e adiciona classes negativas.
    
    Args:
        dataset_config: Configuração com percentuais de split e classes negativas
        dataset_path: Caminho do upload original
        upload_folder_name: Nome da pasta de upload (usado como classe positiva)
    
    Returns:
        str: Caminho POSIX do dataset customizado
    
    Raises:
        ValueError: Se dataset_path estiver vazio
        FileNotFoundError: Se dataset_path não existir
    """
    if not dataset_path or dataset_path.strip() == "":
        raise ValueError("dataset_path está vazio ou null")

    dataset_path = Path(dataset_path)
    if not dataset_path.exists():
        raise FileNotFoundError(f"Pasta do dataset de upload não encontrada: {dataset_path}")

    # Define caminho de saída
    base_output = datasets_custom_dir()
    output_root = base_output / f"dataset_{upload_folder_name}_{time.strftime('%Y%m%d_%H%M%S')}"
    
    # Limpa pasta de destino
    if output_root.exists():
        try:
            shutil.rmtree(output_root)
        except Exception as e:
            print(f"[WARNING] Não foi possível limpar {output_root}: {e}")

    output_root.mkdir(parents=True, exist_ok=True)

    folders = {
        "train": output_root / "train",
        "val": output_root / "val",
        "test": output_root / "test"
    }
    
    for part in folders.values():
        part.mkdir(parents=True, exist_ok=True)

    # Processa classe positiva
    _process_positive_class(dataset_path, folders, upload_folder_name, dataset_config)
    
    # Processa classes negativas (se configurado)
    types_to_include = dataset_config.get("types_to_include", [])
    if types_to_include:
        _process_negative_classes(folders, types_to_include, dataset_config)

    return str(output_root).replace('\\', '/')


def _process_positive_class(
    dataset_path: Path,
    folders: Dict[str, Path],
    class_name: str,
    config: dict
) -> None:
    """Copia imagens da classe positiva para train/val/test."""
    train_pct = config["train_percent"]
    val_pct = config["val_percent"]
    test_pct = config["test_percent"]
    
    # Cria subpastas da classe
    for part in folders.values():
        (part / class_name).mkdir(parents=True, exist_ok=True)

    # Coleta e embaralha imagens
    images = [
        f for f in dataset_path.iterdir()
        if f.suffix.lower() in IMG_EXTENSIONS
    ]
    random.shuffle(images)

    total = len(images)
    train_n = int(ceil(total * train_pct / 100))
    val_n = int(ceil(total * val_pct / 100))

    # Distribui imagens
    for img in images[:train_n]:
        shutil.copy(img, folders["train"] / class_name / img.name)
    for img in images[train_n:train_n + val_n]:
        shutil.copy(img, folders["val"] / class_name / img.name)
    for img in images[train_n + val_n:]:
        shutil.copy(img, folders["test"] / class_name / img.name)


def _process_negative_classes(
    folders: Dict[str, Path],
    types_to_include: dict,
    config: dict
) -> None:
    """Adiciona imagens negativas de implantes (CM/HE/HI)."""
    print("[INFO] Adicionando imagens negativas:", types_to_include)
    
    class_name_negative = "negativo"
    for part in folders.values():
        (part / class_name_negative).mkdir(parents=True, exist_ok=True)

    IMPLANTES_BASE = storage_imagens_implates_dir()
    TYPE_BASE_PATHS = {
        "Cone": IMPLANTES_BASE / 'CM',
        "Hex Externo": IMPLANTES_BASE / 'HE',
        "Hex Interno": IMPLANTES_BASE / 'HI'
    }

    # Normaliza types_to_include
    random_count = config.get("random_count", 0)
    if isinstance(types_to_include, dict):
        types_map = types_to_include
    else:
        types_map = {t: {"default_line": random_count} for t in types_to_include}

    used_sources = set()
    
    for tipo, line_spec in types_map.items():
        tipo_path = TYPE_BASE_PATHS.get(tipo)
        if not tipo_path or not tipo_path.exists():
            print(f"[WARNING] Tipo '{tipo}' não encontrado: {tipo_path}")
            continue

        # Descobre linhas disponíveis
        available_lines = {}
        for sub in tipo_path.iterdir():
            if sub.is_dir():
                imgs = [f for f in sub.iterdir() if f.suffix.lower() in IMG_EXTENSIONS]
                if imgs:
                    available_lines[sub.name] = imgs
        
        # Imagens soltas na raiz
        root_imgs = [f for f in tipo_path.iterdir() if f.is_file() and f.suffix.lower() in IMG_EXTENSIONS]
        if root_imgs:
            available_lines['root'] = root_imgs

        if not available_lines:
            continue

        # Determina linhas explícitas vs default
        explicit_lines = []
        default_for_type = None
        if isinstance(line_spec, dict):
            explicit_lines = [k for k in line_spec.keys() if k != 'default_line']
            if 'default_line' in line_spec and isinstance(line_spec['default_line'], int):
                default_for_type = line_spec['default_line']

        avail_map = {k.upper(): (k, v) for k, v in available_lines.items()}

        if explicit_lines:
            lines_to_process = []
            for req in explicit_lines:
                req_upper = req.upper()
                if req_upper in avail_map:
                    original_name, _ = avail_map[req_upper]
                    lines_to_process.append(original_name)
            if not lines_to_process:
                print(f"[WARNING] Nenhuma linha explícita encontrada para '{tipo}'")
                continue
        else:
            lines_to_process = list(available_lines.keys())

        # Processa cada linha
        for line_name in lines_to_process:
            imgs_list = available_lines.get(line_name, [])
            
            # Filtra duplicatas
            filtered_imgs = [img for img in imgs_list if str(img) not in used_sources]
            imgs_list = filtered_imgs

            # Determina quantidade
            if isinstance(line_spec, dict) and line_name in line_spec:
                requested = line_spec[line_name]
            elif default_for_type is not None:
                requested = default_for_type
            else:
                requested = len(imgs_list)

            if requested == 0 or not imgs_list:
                continue

            # Amostra imagens
            to_copy = random.sample(imgs_list, min(requested, len(imgs_list)))
            
            # Distribui entre train/val/test
            random_split = config.get("random_split", {"train": 70, "val": 20, "test": 10})
            train_pct = random_split.get("train", 70)
            val_pct = random_split.get("val", 20)
            
            total = len(to_copy)
            train_n = int(ceil(total * train_pct / 100))
            val_n = int(ceil(total * val_pct / 100))

            for img in to_copy[:train_n]:
                shutil.copy(img, folders["train"] / class_name_negative / img.name)
                used_sources.add(str(img))
            for img in to_copy[train_n:train_n + val_n]:
                shutil.copy(img, folders["val"] / class_name_negative / img.name)
                used_sources.add(str(img))
            for img in to_copy[train_n + val_n:]:
                shutil.copy(img, folders["test"] / class_name_negative / img.name)
                used_sources.add(str(img))


def execute_training_subprocess(
    job_id: str,
    config: dict,
    log_file_path: Path,
    state_callback: callable
) -> None:
    """
    Executa treinamento YOLO em subprocesso separado.
    
    Args:
        job_id: ID do job
        config: Configuração YOLO completa
        log_file_path: Caminho do arquivo de log
        state_callback: Função para atualizar estado (recebe status, process)
    """
    # Constrói comando YOLO CLI
    yolo_args = [
        f"{k}={str(v)}"
        for k, v in config.items()
        if k not in ['mode', 'task']
    ]

    command = ["yolo", config.get('task', 'classify'), config.get('mode', 'train')] + yolo_args
    command_str = " ".join(command)

    log_file_handle = None

    try:
        log_file_handle = open(log_file_path, 'w', encoding='utf-8')
        log_file_handle.write(f"--- COMANDO INICIADO ---\n{command_str}\n------------------------\n")
        log_file_handle.flush()
        
        # Inicia o processo de forma que possamos cancelá-lo de maneira confiável
        creationflags = 0
        start_new_session = False
        if os.name == 'nt':
            creationflags = getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
        else:
            start_new_session = True

        process = subprocess.Popen(
            command,
            shell=False,
            stdout=log_file_handle,
            stderr=subprocess.STDOUT,
            cwd=Path.cwd(),
            creationflags=creationflags,
            start_new_session=start_new_session
        )
        
        state_callback(status="running", process=process)
        return_code = process.wait()

        if return_code == 0:
            log_file_handle.write("\n--- TREINAMENTO CONCLUÍDO COM SUCESSO ---\n")
            state_callback(status="completed", process=None)
        else:
            log_file_handle.write(f"\n--- ERRO: Processo encerrado com código {return_code} ---\n")
            state_callback(status="error", process=None)
        
        log_file_handle.flush()
        
    except Exception as e:
        if log_file_handle:
            log_file_handle.write(f"\n[ERRO FATAL] Exceção: {str(e)}\n")
        state_callback(status="error", process=None)
        
    finally:
        if log_file_handle:
            log_file_handle.close()


def get_negative_lines_info() -> Dict[str, Dict[str, int]]:
    """
    Lista linhas de implantes negativos disponíveis.
    
    Returns:
        Dict mapeando tipo -> {linha: contagem}
        Exemplo: {"Cone": {"CM-A": 123, "CM-B": 45}, ...}
    """
    BASE = storage_imagens_implates_dir()
    IMG_EXT = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff'}
    result = {}

    TYPE_MAP = {
        'CM': 'Cone',
        'HE': 'Hex Externo',
        'HI': 'Hex Interno'
    }

    if not BASE.exists() or not BASE.is_dir():
        return result

    try:
        for type_dir in BASE.iterdir():
            if not type_dir.is_dir():
                continue
            
            folder_name = type_dir.name
            readable_name = TYPE_MAP.get(folder_name, folder_name)
            lines_info = {}

            for line_dir in type_dir.iterdir():
                if line_dir.is_dir():
                    count = sum(1 for f in line_dir.iterdir() if f.suffix.lower() in IMG_EXT)
                    if count > 0:
                        lines_info[line_dir.name] = count

            # Imagens na raiz
            root_count = sum(1 for f in type_dir.iterdir() if f.is_file() and f.suffix.lower() in IMG_EXT)
            if root_count > 0:
                lines_info['root'] = root_count

            if lines_info:
                result[readable_name] = lines_info

    except Exception as e:
        print(f'[ERROR] get_negative_lines_info failed: {e}')

    return result
