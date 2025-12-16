# Guia de Contribuição - Pipeline Train

## Como Contribuir

### Configuração do Ambiente

1. **Clone o repositório**
   ```bash
   git clone <repo-url>
   cd pipeline_train
   ```

2. **Configure o ambiente virtual**
   ```powershell
   .\setup_dev.ps1
   .\.venv\Scripts\Activate.ps1
   ```

3. **Instale dependências de desenvolvimento**
   ```bash
   pip install -r requirements-dev.txt
   ```

4. **Execute o servidor**
   ```bash
   .\run.ps1 8000
   ```

### Estrutura de Branches

- `main`: produção estável
- `development`: desenvolvimento ativo
- `feature/*`: novas funcionalidades
- `fix/*`: correções de bugs
- `refactor/*`: melhorias de código

### Padrões de Código

#### Backend (Python)

**Style Guide**: PEP 8
- 4 espaços (não tabs)
- Linhas até 100 caracteres
- Docstrings em funções públicas

**Exemplo**:
```python
def resolve_model_paths(models: List[str]) -> Tuple[List[str], List[str]]:
    """
    Resolve a lista de modelos para caminhos de arquivo válidos.
    
    Args:
        models: Lista de nomes ou caminhos de modelos
        
    Returns:
        Tupla (model_paths, missing) com caminhos válidos e não encontrados
    """
    # implementação...
```

**Imports**:
```python
# Standard library
import os
from pathlib import Path
from typing import List, Tuple

# Third-party
from flask import Blueprint, request, jsonify

# Local
from projeto.app.services import prediction_service
```

#### Frontend (JavaScript)

**Style Guide**: 
- 4 espaços
- Sem ponto-e-vírgula (consistente)
- camelCase para funções e variáveis
- PascalCase para módulos/classes

**Exemplo**:
```javascript
function loadConfig() {
    try {
        const stored = localStorage.getItem(DEFAULT_CONFIG_KEY)
        if (!stored) return JSON.parse(JSON.stringify(defaultConfig))
        // ...
    } catch (e) {
        console.error('Failed to load config:', e)
        return defaultConfig
    }
}
```

**Módulos**:
```javascript
(function (global) {
    // Código do módulo
    
    global.ModuleName = {
        publicMethod1,
        publicMethod2
    }
})(window)
```

### Adicionando Novas Funcionalidades

#### Novo Endpoint Backend

1. **Crie a rota** em `projeto/app/routes/`:
   ```python
   @bp.route("/nova-rota", methods=["POST"])
   def nova_funcao():
       """Descrição clara do que faz."""
       # validação de entrada
       # lógica via service
       # resposta JSON
   ```

2. **Adicione lógica de serviço** em `projeto/app/services/`:
   ```python
   def nova_logica(params):
       """Lógica reutilizável."""
       # implementação
   ```

3. **Registre no Flask** (`app.py`):
   ```python
   app.register_blueprint(novo_bp, url_prefix="/novo")
   ```

#### Novo Módulo Frontend

1. **Crie arquivo** em `projeto/views/js/modules/`:
   ```javascript
   (function (global) {
       function metodo1() { /* ... */ }
       
       global.NovoModulo = { metodo1 }
   })(window)
   ```

2. **Importe no HTML**:
   ```html
   <script src="./js/modules/novo_modulo.js"></script>
   ```

3. **Use no código**:
   ```javascript
   window.NovoModulo.metodo1()
   ```

### Testes

#### Backend (pytest)

Estrutura:
```
tests/
├── test_prediction.py
├── test_training.py
└── conftest.py
```

Exemplo:
```python
def test_resolve_model_paths():
    models = ["modelo1.pt", "modelo2.pt"]
    paths, missing = resolve_model_paths(models)
    assert len(paths) >= 0
    assert isinstance(missing, list)
```

Execute:
```bash
pytest tests/ -v
```

#### Frontend (manual)

Checklist:
- [ ] Navegação entre páginas funciona
- [ ] Formulários validam corretamente
- [ ] Erros são exibidos claramente
- [ ] Responsivo em mobile/tablet/desktop
- [ ] Acessibilidade (ARIA, teclado)

### Commit Messages

Formato: `<tipo>: <descrição curta>`

Tipos:
- `feat`: nova funcionalidade
- `fix`: correção de bug
- `refactor`: melhoria de código sem mudar comportamento
- `docs`: documentação
- `style`: formatação (não afeta código)
- `test`: adição/correção de testes
- `chore`: tarefas de manutenção

Exemplos:
```
feat: adiciona endpoint para exportar métricas
fix: corrige bug na resolução de modelos
refactor: modulariza código de predição em service layer
docs: atualiza README com nova arquitetura
```

### Pull Requests

Template:
```markdown
## Descrição
[Breve descrição das mudanças]

## Tipo de Mudança
- [ ] Nova funcionalidade
- [ ] Correção de bug
- [ ] Refatoração
- [ ] Documentação

## Checklist
- [ ] Código segue os padrões do projeto
- [ ] Comentários/docstrings adicionados
- [ ] Testes passam
- [ ] Documentação atualizada
- [ ] Sem conflitos com main

## Testes Realizados
[Descreva como testou as mudanças]

## Screenshots (se aplicável)
[Adicione capturas de tela]
```

### Code Review

Critérios:
- **Funcionalidade**: código faz o que promete?
- **Clareza**: fácil de entender?
- **Manutenibilidade**: fácil de modificar/estender?
- **Performance**: não introduz lentidão?
- **Segurança**: valida inputs, trata erros?

### Documentação

Ao adicionar código:
1. **Docstrings** em funções públicas
2. **Comentários** em lógica complexa
3. **README** se novo módulo/serviço
4. **ARCHITECTURE.md** se muda estrutura

### Debugging

#### Backend
```python
import logging
logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger(__name__)
log.debug("Variável x: %s", x)
```

#### Frontend
```javascript
console.log('Estado atual:', state)
console.error('Erro ao carregar:', error)
```

### Troubleshooting Comum

**Problema**: Import não encontrado  
**Solução**: Verifica se `__init__.py` existe, caminho correto

**Problema**: CORS error no frontend  
**Solução**: Verifica `CORS(app, resources={...})` em app.py

**Problema**: Mudanças não aparecem  
**Solução**: Ctrl+Shift+R (hard refresh), limpa cache do browser

### Recursos Úteis

- [Flask Documentation](https://flask.palletsprojects.com/)
- [Ultralytics YOLO Docs](https://docs.ultralytics.com/)
- [MDN Web Docs](https://developer.mozilla.org/)
- [Python Type Hints](https://docs.python.org/3/library/typing.html)

### Dúvidas?

Abra uma issue ou discuta no canal de desenvolvimento!
