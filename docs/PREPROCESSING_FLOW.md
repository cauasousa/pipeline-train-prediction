# Fluxo de Pré-processamento de Imagens

Este documento explica como funciona o sistema de pré-processamento dinâmico de imagens no pipeline de treinamento e predição.

## 📋 Visão Geral

O sistema permite aplicar técnicas de pré-processamento (escala de cinza, normalização, etc.) às imagens **antes** de serem processadas pelo YOLO. As técnicas são configuráveis via interface web e aplicadas automaticamente durante treinamento e predição.

## 🔄 Fluxo Completo

### 1️⃣ Frontend - Seleção na Interface

**Arquivo:** `projeto/views/js/ui.js` (linha ~1674)

Quando a página carrega, a função `loadPreprocessingTechniques()` busca as técnicas disponíveis:

```javascript
// Busca técnicas disponíveis no backend
const techniques = await window.API.getPreprocessingTechniques();

// Cria checkboxes dinamicamente para cada técnica
techniques.forEach(tech => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = tech;  // Ex: "Escala de Cinza"
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${tech}`));
    container.appendChild(label);
});
```

**Resultado:** O usuário vê checkboxes com nomes como "Redimensionar", "Escala de Cinza", "Normalizar", etc.

---

### 2️⃣ Backend - Registro de Técnicas

**Arquivo:** `projeto/app/services/preprocessing_service.py`

As técnicas são definidas centralmente no **PREPROCESSING_REGISTRY**:

```python
PREPROCESSING_REGISTRY = {
    "Redimensionar": lambda img: cv2.resize(img, (224, 224)),
    "Escala de Cinza": lambda img: cv2.cvtColor(img, cv2.COLOR_BGR2GRAY),
    "Equalizar Histograma": lambda img: cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)),
    "Normalizar": lambda img: img / 255.0,
}
```

**✨ Importante:** Adicionar uma nova técnica aqui faz ela aparecer **automaticamente** na interface!

---

### 3️⃣ API Endpoint

**Arquivo:** `projeto/app/routes/preprocessing.py`

Endpoint que retorna as técnicas disponíveis:

```python
@bp.route("/techniques")
def get_techniques():
    """Retorna lista de técnicas de pré-processamento disponíveis."""
    return jsonify({
        "techniques": list(PREPROCESSING_REGISTRY.keys())
    })
```

**Rota:** `GET /api/preprocessing/techniques`

---

### 4️⃣ Envio da Seleção

**Arquivo:** `projeto/app/routes/prediction.py` (linha ~88)

Quando o usuário clica em "Executar Predição/Treinamento", o backend extrai as técnicas selecionadas:

```python
# Extrai do payload JSON ou FormData
preprocessing = payload.get("preprocessing", [])
# Ex: ["Escala de Cinza", "Normalizar"]
```

---

### 5️⃣ Criação do Diretório Temporário (Predição)

**Arquivo:** `projeto/app/services/prediction_service.py` (linha ~228)

Para **predição**, cria-se uma cópia temporária das imagens com pré-processamento aplicado:

```python
if preprocessing:
    # Cria diretório temporário
    temp_dir = Path(tempfile.mkdtemp(prefix="pred_preprocessed_"))
    
    # Replica estrutura de pastas
    for subfolder in subfolders:
        temp_subfolder = temp_dir / subfolder.name
        temp_subfolder.mkdir(parents=True, exist_ok=True)
        
        # Para cada imagem
        for img_path in subfolder.iterdir():
            # Aplica pré-processamento e salva
            _copy_with_preprocessing(
                img_path, 
                temp_subfolder / img_path.name, 
                preprocessing
            )
    
    # YOLO usará o temp_dir ao invés das imagens originais
    split_path = temp_dir
```

---

### 6️⃣ Aplicação das Técnicas

**Arquivo:** `projeto/app/services/prediction_service.py` (linha ~114)

A função `_copy_with_preprocessing()` processa cada imagem:

```python
def _copy_with_preprocessing(src_path: Path, dest_path: Path, techniques: List[str]):
    """Copia imagem aplicando técnicas de pré-processamento."""
    
    if not techniques:
        # Sem técnicas, apenas copia
        shutil.copy(src_path, dest_path)
        return
    
    # 1. Lê a imagem original
    img = cv2.imread(str(src_path))
    
    # 2. Aplica as técnicas selecionadas
    processed_img = apply_custom_preprocessing(img, techniques)
    
    # 3. Salva a imagem processada
    cv2.imwrite(str(dest_path), processed_img)
```

---

### 7️⃣ Processamento Sequencial

**Arquivo:** `projeto/app/services/preprocessing_service.py` (linha ~14)

A função `apply_custom_preprocessing()` aplica técnicas **na ordem selecionada**:

```python
def apply_custom_preprocessing(image, techniques_list):
    """Aplica técnicas de pré-processamento sequencialmente."""
    processed_img = image.copy()
    
    for name in techniques_list:
        if name in PREPROCESSING_REGISTRY:
            # Busca e executa a função lambda do registry
            processed_img = PREPROCESSING_REGISTRY[name](processed_img)
    
    return processed_img
```

**Exemplo:**
- Selecionado: `["Escala de Cinza", "Normalizar"]`
- Resultado: Imagem Original → Convertida para Cinza → Normalizada (valores 0-1)

---

### 8️⃣ Processamento pelo YOLO

Após o pré-processamento, o YOLO processa as imagens:

```python
# Para predição: usa temp_dir (imagens processadas)
model.predict(source=str(temp_dir), ...)

# Para treinamento: usa dataset com imagens processadas
model.train(data=dataset_yaml, ...)
```

---

### 9️⃣ Limpeza Automática (Predição)

**Arquivo:** `projeto/app/services/prediction_service.py` (linha ~403)

No bloco `finally`, o diretório temporário é removido:

```python
finally:
    # Limpa diretório temporário de pré-processamento
    if temp_dir and temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)
        print(f"\n>>> Diretório temporário removido: {temp_dir}")
```

**⚠️ Nota:** As imagens originais **nunca são modificadas** durante predição!

---

## 🎯 Diferenças: Treinamento vs Predição

### **Predição**
- Cria **cópia temporária** das imagens
- Aplica pré-processamento no temp
- YOLO processa temp
- **Apaga temp após concluir**
- ✅ Imagens originais preservadas

### **Treinamento**
**Arquivo:** `projeto/app/services/training_service.py` (linha ~230)

- Aplica pré-processamento **diretamente** no dataset
- Imagens processadas são **salvas permanentemente**
- Dataset resultante contém imagens preprocessadas
- ⚠️ Útil para treinar modelo com características específicas

```python
# No treinamento, salva direto no dataset
_copy_with_preprocessing(
    img, 
    folders["train"] / class_name / img.name, 
    preprocessing_techniques
)
```

---

## 📊 Diagrama de Fluxo

```
┌─────────────────────────────────────────┐
│ 1. UI carrega técnicas do backend      │
│    GET /api/preprocessing/techniques    │
│    ← ["Redimensionar", "Escala...", ...]│
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 2. Usuário marca checkboxes             │
│    ☑ Escala de Cinza                    │
│    ☑ Normalizar                         │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 3. Frontend envia para backend          │
│    POST /predict/run                    │
│    {"preprocessing": ["Escala...", ...]}│
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 4. Backend cria temp_dir (predição)     │
│    M:\...\temp_preprocessed_xyz\        │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 5. Para cada imagem:                    │
│    • cv2.imread() → lê original         │
│    • apply_custom_preprocessing()       │
│      - Técnica 1: Escala de Cinza       │
│      - Técnica 2: Normalizar            │
│    • cv2.imwrite() → salva processada   │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 6. YOLO processa temp_dir               │
│    model.predict(source=temp_dir)       │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 7. Resultados retornados ao frontend    │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 8. Cleanup: remove temp_dir             │
│    shutil.rmtree(temp_dir)              │
└─────────────────────────────────────────┘
```

---

## 🛠️ Como Adicionar Nova Técnica

### Passo 1: Editar o Registry

**Arquivo:** `projeto/app/services/preprocessing_service.py`

```python
PREPROCESSING_REGISTRY = {
    # ... técnicas existentes ...
    
    # Nova técnica
    "Desfoque Gaussiano": lambda img: cv2.GaussianBlur(img, (5, 5), 0),
    "Rotação 90°": lambda img: cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE),
    "Aumentar Contraste": lambda img: cv2.convertScaleAbs(img, alpha=1.5, beta=0),
}
```

### Passo 2: Reiniciar Backend

```bash
# A técnica aparecerá automaticamente na interface!
```

**✨ Não precisa mexer no frontend!** O sistema é 100% dinâmico.

---

## 🧪 Testando

### 1. Via Interface Web

1. Acesse página de Predição/Treinamento
2. Selecione técnicas de pré-processamento
3. Execute a operação
4. Verifique logs no console:

```
>>> Aplicando pré-processamento: ['Escala de Cinza', 'Normalizar']
[WARNING] Aplicando técnica: Escala de Cinza
[WARNING] Aplicando técnica: Normalizar
```

### 2. Via Código Python

```python
from projeto.app.services.preprocessing_service import apply_custom_preprocessing
import cv2

# Lê imagem
img = cv2.imread("exemplo.jpg")

# Aplica técnicas
processed = apply_custom_preprocessing(img, ["Escala de Cinza", "Normalizar"])

# Salva resultado
cv2.imwrite("resultado.jpg", processed)
```

---

## 📝 Arquivos Envolvidos

| Arquivo | Responsabilidade |
|---------|------------------|
| `projeto/app/services/preprocessing_service.py` | Registry de técnicas + função aplicadora |
| `projeto/app/routes/preprocessing.py` | Endpoint API `/techniques` |
| `projeto/app/services/prediction_service.py` | Lógica de predição com pré-processamento |
| `projeto/app/services/training_service.py` | Lógica de treinamento com pré-processamento |
| `projeto/views/js/ui.js` | Interface web - carregamento dinâmico |
| `projeto/views/js/api.js` | Função `getPreprocessingTechniques()` |
| `projeto/app/routes/prediction.py` | Extração do payload + chamada de serviço |

---

## 🐛 Troubleshooting

### Técnicas não aparecem na interface

1. Verifique se o backend está rodando
2. Abra console do navegador (F12) → verifique erros
3. Teste endpoint manualmente: `GET http://localhost:8000/api/preprocessing/techniques`

### Imagens não são processadas

1. Verifique logs do backend
2. Confirme que `preprocessing` está no payload JSON
3. Verifique se as técnicas selecionadas existem no `PREPROCESSING_REGISTRY`

### Erro "Image is None" no cv2.imread

- Verifique se os caminhos das imagens estão corretos
- Confirme extensões de arquivo suportadas: `.png`, `.jpg`, `.jpeg`, `.bmp`, `.gif`

---

## 🚀 Melhorias Futuras

- [ ] Adicionar preview de imagens preprocessadas na interface
- [ ] Permitir configurar parâmetros das técnicas (ex: tamanho de redimensionamento)
- [ ] Salvar técnicas usadas em metadados do modelo
- [ ] Adicionar técnicas de augmentation (flip, rotation, etc.)
- [ ] Criar pipeline visual de técnicas (drag-and-drop)

---

## 📚 Referências

- [OpenCV Documentation](https://docs.opencv.org/)
- [YOLO Ultralytics Docs](https://docs.ultralytics.com/)
- [Flask Blueprints](https://flask.palletsprojects.com/en/latest/blueprints/)
