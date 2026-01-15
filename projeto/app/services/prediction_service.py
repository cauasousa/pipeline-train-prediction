"""
Serviço de predição - encapsula lógica de resolução de modelos e execução de avaliações.
"""
import logging
import os
import shutil
from pathlib import Path
from typing import List, Tuple, Dict, Any

from projeto.app.paths import custom_models_dir, storage_models_yolo_dir, storage_datasets_yolo_dir, workspace_root
from projeto.app.routes.train_models import function_test_yolo

log = logging.getLogger(__name__)
log.setLevel(logging.INFO)


def resolve_model_paths(models: List[str]) -> Tuple[List[str], List[str]]:
    """
    Resolve a lista de modelos para caminhos de arquivo válidos.
    Retorna (model_paths, missing).
    Procura em: raiz do projeto, custom_models_dir(), storage_models_yolo_dir().
    """
    # Ordem de busca: raiz do projeto -> custom -> storage
    search_dirs = [
        Path.cwd(),  # Raiz do projeto (onde os modelos yolo*.pt estão)
        # custom_models_dir(),
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


def _get_image_extensions() -> set:
    """Retorna extensões de imagem suportadas."""
    return {".png", ".jpg", ".jpeg", ".bmp", ".gif"}

def _has_images_directly(folder: Path) -> bool:
    """Verifica se a pasta tem imagens diretas (não em subpastas)."""
    for item in folder.iterdir():
        if item.is_file() and item.suffix.lower() in _get_image_extensions():
            return True
    return False

def _get_subfolders_with_images(folder: Path) -> List[Path]:
    """Retorna lista de subpastas que contêm imagens."""
    subfolders = []
    try:
        for item in folder.iterdir():
            if item.is_dir() and _has_images_directly(item):
                subfolders.append(item)
    except Exception:
        pass
    return sorted(subfolders)

def run_prediction(
    models: List[str],
    dataset_path: str = None,
    split: str = "test",
    project_name: str = "predicao",
    output_dir: Path = None
) -> Tuple[Dict[str, Any], List[str], List[str]]:
    """
    Executa predição dos modelos sobre o split especificado.
    
    Se o split contém subpastas com imagens (estrutura: test/LINHA/imagens),
    processa cada subpasta separadamente e mantém a hierarquia na saída.
    
    Retorna (results, evaluated, missing).
    """
    model_paths, missing = resolve_model_paths(models)
    
    if not model_paths:
        return None, [], missing
    
    if not dataset_path:
        dataset_path = get_default_dataset_path()
    
    dataset_root = Path(dataset_path)
    
    # Verifica se dataset_path já é o split (termina com 'test', 'val', etc)
    # ou se precisa concatenar o split
    if dataset_root.name == split:
        # dataset_path já é o split
        split_path = dataset_root
    else:
        # dataset_path é a raiz, concatena o split
        split_path = dataset_root / split
    
    # Verifica se existe split_path
    if not split_path.exists():
        raise FileNotFoundError(f"Split '{split}' não encontrado em {dataset_path}")
    
    results: Dict[str, Any] = {}
    evaluated = [os.path.basename(p) for p in model_paths]
    
    print(f"\n========== [PREDICT DEBUG] ==========")
    print(f"dataset_path: {dataset_path}")
    print(f"split_path: {split_path}")
    print(f"split_path.exists(): {split_path.exists()}")
    
    # Verifica se tem subpastas com imagens
    subfolders = _get_subfolders_with_images(split_path)
    print(f"Subpastas encontradas: {len(subfolders)}")
    for sf in subfolders:
        print(f"  - {sf.name}")
    
    if subfolders:
        # Estrutura com subpastas: processa cada uma separadamente
        try:
            from ultralytics import YOLO
        except ModuleNotFoundError:
            # Mock quando Ultralytics não está disponível
            for model_name in evaluated:
                results[model_name] = {
                    "mock": True,
                    "notes": "Instale 'ultralytics' para resultados reais.",
                    "subfolders": {}
                }
            return results, evaluated, missing
        
        for model_path in model_paths:
            model_name = os.path.basename(model_path).replace('.pt', '')
            model_output = {}
            
            print(f"\n>>> Processando modelo: {model_name}")
            
            # Processa cada subpasta
            for subfolder in subfolders:
                subfolder_name = subfolder.name
                
                try:
                    print(f"\n  >>> Processando subpasta: {subfolder_name}")
                    print(f"      Source: {subfolder}")
                    
                    model = YOLO(model_path)
                    
                    # Calcula os paths
                    project_path = output_dir / model_name if output_dir else Path(project_name)
                    print(f"      Project: {project_path}")
                    print(f"      Name: {subfolder_name}")
                    
                    predict_result = model.predict(
                        source=str(subfolder),
                        project=str(project_path),
                        name=subfolder_name,
                        save=True
                    )
                    
                    print(f"      YOLO concluído!")
                    
                    # Coleta imagens preditas
                    images = []
                    if output_dir:
                        print(f"\n      ===== ESTRUTURA COMPLETA DE output_dir =====")
                        if output_dir.exists():
                            all_files = list(output_dir.rglob('*'))
                            print(f"      Total de itens encontrados: {len(all_files)}")
                            for item in all_files[:50]:  # Limita a 50 primeiros
                                print(f"        {item}")
                        print(f"      ===== FIM ESTRUTURA =====\n")
                        
                        # YOLO salva em output_dir/model_name/subfolder_name/
                        yolo_output = output_dir / model_name / subfolder_name
                        print(f"      Procurando em: {yolo_output}")
                        print(f"      Existe? {yolo_output.exists()}")
                        
                        if yolo_output.exists():
                            print(f"      Listando recursivamente...")
                            for item in yolo_output.rglob('*'):
                                if item.is_file():
                                    print(f"        ARQUIVO: {item} (ext: {item.suffix.lower()})")
                                    if item.suffix.lower() in {'.jpg', '.png', '.jpeg'}:
                                        images.append(str(item))
                                        print(f"          ✓ ADICIONADO!")
                        else:
                            print(f"      ⚠ Diretório não existe, buscando em qualquer lugar...")
                            for ext in ['*.jpg', '*.png', '*.jpeg']:
                                found = list(output_dir.rglob(ext))
                                print(f"        {ext}: {len(found)} arquivos")
                                images.extend([str(f) for f in found])
                    
                    print(f"      ✓ Total de imagens coletadas: {len(images)}")
                    model_output[subfolder_name] = {
                        "predict_result": str(predict_result),
                        "images": images
                    }
                except Exception as e:
                    print(f"      ✗ ERRO: {e}")
                    import traceback
                    traceback.print_exc()
                    model_output[subfolder_name] = {
                        "error": str(e),
                        "images": []
                    }
            
            results[model_name] = {"subfolders": model_output}
            print(f"\n✓ Modelo {model_name}: {len(model_output)} subpastas processadas")
    else:
        # Estrutura flat: processa normalmente com function_test_yolo
        results = function_test_yolo(
            model_paths=model_paths,
            dataset_path=str(split_path.parent),
            split=split_path.name,
            project_name=project_name,
            output_dir=str(output_dir) if output_dir else None
        )
    
    return results, evaluated, missing


def run_prediction_from_folder(
    models: List[str],
    folder_path: str,
    project_name: str = "predicao",
    output_dir: Path = None
) -> Tuple[Dict[str, Any], List[str], List[str]]:
    """
    Executa predição direta a partir de uma pasta de imagens (sem estrutura YOLO train/val/test).
    Usa YOLO.predict para cada modelo e salva saídas em `output_dir/<model_basename>/`.
    Retorna (results, evaluated, missing).
    """
    model_paths, missing = resolve_model_paths(models)
    if not model_paths:
        return None, [], missing

    if not folder_path or not os.path.exists(folder_path):
        raise FileNotFoundError(f"Pasta de imagens não encontrada: {folder_path}")

    results: Dict[str, Any] = {}
    evaluated = [os.path.basename(p) for p in model_paths]

    try:
        from ultralytics import YOLO
        ultralytics_available = True
    except ModuleNotFoundError:
        ultralytics_available = False

    # Pré-filtra arquivos de imagem legíveis para evitar erros do OpenCV
    def _list_valid_images(root: str) -> Tuple[List[str], int]:
        valid_ext = {".png", ".jpg", ".jpeg", ".bmp"}
        valid: List[str] = []
        skipped = 0
        # Tenta usar PIL para validação de imagem; se não disponível, aceita por tamanho
        try:
            from PIL import Image  # type: ignore
            use_pil = True
        except Exception:
            use_pil = False
        try:
            for f in Path(root).iterdir():
                if not f.is_file():
                    continue
                if f.suffix.lower() not in valid_ext:
                    continue
                try:
                    size = f.stat().st_size
                except Exception:
                    size = 0
                if not size or size <= 0:
                    skipped += 1
                    continue
                if use_pil:
                    try:
                        with Image.open(str(f)) as im:
                            im.verify()
                        valid.append(str(f))
                    except Exception:
                        skipped += 1
                        continue
                else:
                    # Sem PIL, aceita pelo tamanho > 0
                    valid.append(str(f))
        except Exception:
            pass
        return valid, skipped

    for mp in model_paths:
        model_name = os.path.basename(mp)
        if ultralytics_available:
            m = YOLO(mp)
            # Lista e valida imagens para evitar cv2.imdecode falhar com arquivos vazios/corrompidos
            valid_images, skipped = _list_valid_images(folder_path)
            if not valid_images:
                raise FileNotFoundError(f"Nenhuma imagem legível encontrada em: {folder_path}")
            # Direciona saída para uma pasta por modelo dentro do run
            # YOLO criará:  diretamente <model_name>/ dependendo da versão
            r = m.predict(source=valid_images, project=str(output_dir) if output_dir else project_name, name=model_name, save=True)
            # Coleta imagens salvas (png/jpg) sob a pasta do modelo
            images = []
            try:
                base_dir = (output_dir / model_name) if output_dir else (workspace_root() / "predictions" / model_name)
                if base_dir.exists() and base_dir.is_dir():
                    for f in base_dir.iterdir():
                        if f.is_file() and f.suffix.lower() in {".png", ".jpg", ".jpeg"}:
                            images.append(str(f))
                # alternativa: estrutura padrão runs/classify
                alt_dir = (output_dir / "runs" / "classify" / model_name) if output_dir else None
                if alt_dir and alt_dir.exists() and alt_dir.is_dir():
                    for f in alt_dir.iterdir():
                        if f.is_file() and f.suffix.lower() in {".png", ".jpg", ".jpeg"}:
                            images.append(str(f))
            except Exception:
                pass
            results[model_name] = {"predict_result": str(r), "images": images, "skipped": skipped}
        else:
            # MOCK quando Ultralytics não está disponível
            results[model_name] = {
                "mock": True,
                "notes": "Instale 'ultralytics' para resultados reais.",
                "images": []
            }

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
