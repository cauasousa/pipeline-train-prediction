import cv2
import numpy as np



def apply_custom_preprocessing(image, techniques_list):
    """
    Aplica técnicas em ordem.
    Aceita:
      - lista de nomes: ["Escala de Cinza", "Normalizar"]
      - lista de dicts: [{"name": "Rotation", "params": {"angle": 45}}]
    """
    processed_img = image.copy()

    for item in techniques_list:
        # Suporta strings (nome) ou dicts {name, params}
        if isinstance(item, dict):
            name = item.get("name")
            params = item.get("params", {})
            print(f"[PREPROCESSING] Aplicando técnica '{name}' com parâmetros: {params}")
        else:
            name = item
            params = {}
            print(f"[PREPROCESSING] Aplicando técnica '{name}' sem parâmetros")

        if name in PREPROCESSING_REGISTRY:
            func = PREPROCESSING_REGISTRY[name]
            # Tenta passar parâmetros se a função aceitar; caso contrário, cai no padrão
            try:
                processed_img = func(processed_img, **params)
            except TypeError:
                processed_img = func(processed_img)

    return processed_img

import cv2
import numpy as np
from skimage import exposure

# https://scikit-image.org/docs/stable/api/skimage.exposure.html

# --- FUNÇÕES AUXILIARES / REFERÊNCIA ---
# Para o match_histograms, você precisa de uma imagem alvo.
# Carregue-a uma vez para evitar lentidão no loop de predição.
REF_PATH = "./projeto/img/SIN_HI_STRONG1.jpg"
reference_img = cv2.imread(REF_PATH)

# --- FUNÇÕES DE PRÉ-PROCESSAMENTO (SKIMAGE.EXPOSURE) ---

def apply_rotation(source_img, angle=30.0):
    """Rotaciona a imagem pelo ângulo (em graus)."""
    center = (source_img.shape[1] / 2, source_img.shape[0] / 2)
    M = cv2.getRotationMatrix2D(center, float(angle), 1.0)
    rotated = cv2.warpAffine(
        source_img,
        M,
        (source_img.shape[1], source_img.shape[0]),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT
    )
    print(f"✅ Rotation aplicada com sucesso (ângulo={angle}).")
    return rotated

def apply_gamma(source_img, gamma=1.0, gain=1):
    """Corrige o Gamma: valores > 1 escurecem, < 1 clareiam a imagem."""
    result = exposure.adjust_gamma(source_img, gamma=gamma, gain=gain)
    print("✅ Gamma Correction aplicada com sucesso.")
    return result

def apply_log(source_img, gain=1, inv=False):
    """Correção Logarítmica: expande valores de baixa intensidade (útil para detalhes em sombras)."""
    result = exposure.adjust_log(source_img, gain=gain, inv=inv)
    print("✅ Log Correction aplicada com sucesso.")
    return result

def apply_sigmoid(source_img, cutoff=0.5, gain=10, inv=False):
    """Correção Sigmoide: ajuste de contraste baseado em uma curva em S."""
    result = exposure.adjust_sigmoid(source_img, cutoff=cutoff, gain=gain, inv=inv)
    print("✅ Sigmoid aplicada com sucesso.")
    return result

def apply_clahe(source_img, clip_limit=0.01):
    """CLAHE (Equalização de Histograma Adaptativa): melhora o contraste local sem ampliar ruído excessivo."""
    # O CLAHE do skimage funciona melhor com floats ou imagens normalizadas
    result = (exposure.equalize_adapthist(source_img / 255.0, clip_limit=clip_limit) * 255).astype(np.uint8)
    print("✅ CLAHE aplicada com sucesso.")
    return result

def apply_equalize_hist(source_img):
    """Equalização de Histograma Global: espalha as intensidades por todo o espectro (0-255)."""
    result = (exposure.equalize_hist(source_img) * 255).astype(np.uint8)
    print("✅ Equalização de Histograma Global aplicada com sucesso.")
    return result

def apply_rescale_intensity(source_img):
    """Rescale Intensity: estica o contraste (Stretching) baseando-se nos percentis da imagem."""

    p2, p98 = np.percentile(source_img, (2, 98))
    result = exposure.rescale_intensity(source_img, in_range=(p2, p98))
    print(f"✅ Rescale Intensity aplicado com p2={p2}, p98={p98}.")
    return result

def apply_histogram_matching(source_img, reference_path=None):
    """Histogram Matching: ajusta histograma usando imagem de referência.
    Se `reference_path` for informado, carrega a referência desse caminho; caso contrário, usa `reference_img` global.
    Normaliza o número de canais entre imagem e referência.
    """
    ref = None
    if reference_path:
        try:
            ref = cv2.imread(reference_path)
            if ref is None:
                print(f"⚠️ Aviso: Não foi possível carregar referência em '{reference_path}'.")
            print("✅ Imagem de referência carregada com sucesso para Histogram Matching.", reference_path)
        except Exception as e:
            print(f"⚠️ Erro ao carregar referência '{reference_path}': {e}")

    if ref is None:
        ref = reference_img

    if ref is None:
        print("⚠️ Aviso: Imagem de referência para Histogram Matching não encontrada.")
        return source_img

    # Normaliza número de canais: converte para BGR se necessário
    source_channels = len(source_img.shape)
    ref_channels = len(ref.shape)
    
    # Se source é grayscale (2D) e ref é colorida (3D), converte source para BGR
    if source_channels == 2 and ref_channels == 3:
        source_img = cv2.cvtColor(source_img, cv2.COLOR_GRAY2BGR)
    # Se source é colorida (3D) e ref é grayscale (2D), converte source para grayscale
    elif source_channels == 3 and ref_channels == 2:
        source_img = cv2.cvtColor(source_img, cv2.COLOR_BGR2GRAY)
    # Se ref é colorida (3D) e source é grayscale, converte ref também
    elif source_channels == 2 and ref_channels == 3:
        ref = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
    
    try:
        matched = exposure.match_histograms(source_img, ref, channel_axis=-1)
        print("✅ Histogram Matching aplicado com sucesso.")
        return matched.astype(np.uint8)
    except Exception as e:
        print(f"⚠️ Erro ao aplicar Histogram Matching: {e}. Retornando imagem original.")
        return source_img

def check_low_contrast(source_img, fraction_threshold=0.05):
    """is_low_contrast: Verifica se a imagem está muito 'lavada' ou escura. 
    Aqui, apenas logamos a info para não quebrar o pipeline de imagem."""
    is_low = exposure.is_low_contrast(source_img, fraction_threshold=fraction_threshold)
    if is_low:
        print("⚠️ Aviso: Imagem de baixo contraste detectada.")
    print("✅ Verificação de contraste concluída.")
    return source_img # Retorna a imagem original para continuar o fluxo


# Dicionário central de técnicas (O seu "Registry")
# Basta adicionar uma nova linha aqui para criar uma técnica nova
PREPROCESSING_REGISTRY = {
    "Redimensionar": lambda img: cv2.resize(img, (224, 224)),
    "Escala de Cinza": lambda img: cv2.cvtColor(img, cv2.COLOR_BGR2GRAY),
    "Equalizar Histograma": lambda img: cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)),
    "Normalizar": lambda img: img / 255.0,
    # Rotação parametrizável
    "Rotation": apply_rotation,
    "Gamma Correction": apply_gamma,
    "Log Correction": apply_log,
    "Sigmoid Correction": apply_sigmoid,
    "CLAHE (Adaptive)": apply_clahe,
    "Global Equalization": apply_equalize_hist,
    "Intensity Rescale": apply_rescale_intensity,
    "Histogram Matching": apply_histogram_matching,
    "Check Contrast": check_low_contrast
}