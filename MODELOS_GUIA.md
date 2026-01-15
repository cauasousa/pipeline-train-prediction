# Guia: Salvando Modelos Após Treinamento

## Problema

Após o treinamento, o modelo `best.pt` fica salvo em uma pasta específica do treinamento:
```
M:\content\drive\MyDrive\pipeline\yolo_classificacao_resultados\treinamento_classificacao\weights\best.pt
M:\content\drive\MyDrive\pipeline\yolo_classificacao_resultados\treinamento_classificacao3\weights\best.pt
```

Para que o sistema de predição encontre facilmente os modelos, eles precisam ser copiados para:
```
M:\content\drive\MyDrive\pipeline\models_yolo\
```

## Solução

### 1. No seu código de treinamento

Após concluir o treinamento, adicione:

```python
from projeto.app.paths import storage_models_yolo_dir
from projeto.app.services.model_manager import save_trained_model

# ... seu código de treinamento ...

# Após o treinamento ser concluído:
results_dir = "M:\\content\\drive\\MyDrive\\pipeline\\yolo_classificacao_resultados\\treinamento_classificacao"
weights_path = f"{results_dir}\\weights\\best.pt"

# Salva o modelo com um nome descritivo
model_name = "yolo11n-cls_CM_treinamento1"  # Customize conforme necessário
save_trained_model(weights_path, model_name, storage_models_yolo_dir())
```

### 2. Alternativa: Script automático

Se seus treinamentos criam a pasta de resultados automaticamente, você pode criar um watcher:

```python
from pathlib import Path
from projeto.app.services.model_manager import save_trained_model
from projeto.app.paths import storage_models_yolo_dir

# Após o treinamento
training_dir = Path("M:\\content\\drive\\MyDrive\\pipeline\\yolo_classificacao_resultados\\treinamento_classificacao")
best_pt = training_dir / "weights" / "best.pt"

if best_pt.exists():
    # Extrai nome do dataset da pasta de treinamento
    dataset_name = training_dir.parent.name  # ou qualquer lógica que você desejar
    model_name = f"yolo11n-cls_{dataset_name}"
    
    save_trained_model(str(best_pt), model_name, storage_models_yolo_dir())
```

## Estrutura Final Esperada

```
models_yolo/
├── yolo11n-cls_CM_treinamento1__20260110_104230.pt
├── yolo11n-cls_CM_treinamento2__20260110_110145.pt
├── yolo11n-cls_implantes__20260109_153020.pt
└── yolo11x-cls_CM__20260108_142805.pt
```

## Gerenciar Modelos Antigos

Para evitar acumular muitos modelos, você pode remover versões antigas:

```python
from projeto.app.services.model_manager import clean_old_models
from projeto.app.paths import storage_models_yolo_dir

# Remove modelos antigos, mantendo apenas 3 versões recentes de cada
removed_count = clean_old_models(storage_models_yolo_dir(), keep_recent=3)
print(f"Removidos {removed_count} modelos antigos")
```

## Listar Modelos Disponíveis

```python
from projeto.app.services.model_manager import list_trained_models
from projeto.app.paths import storage_models_yolo_dir

models = list_trained_models(storage_models_yolo_dir())
for prefix, versions in models.items():
    print(f"\n{prefix}:")
    for v in versions:
        print(f"  - {v['filename']} ({v['size_mb']:.1f} MB) - {v['timestamp']}")
```

## Dados do Dataset para Treinamento

Os datasets criados durante treinamento ficam em:
```
M:\content\drive\MyDrive\pipeline\custom\datasets_custom\CM\
├── val/
│   └── [imagens de validação]
├── test/
│   └── [imagens de teste]
└── train/
    └── [imagens de treino]
```

Quando você seleciona "Validação" ou "Teste" na interface de predição, o sistema busca automaticamente dessas pastas!
