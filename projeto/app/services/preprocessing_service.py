import cv2
import numpy as np

# Dicionário central de técnicas (O seu "Registry")
# Basta adicionar uma nova linha aqui para criar uma técnica nova
PREPROCESSING_REGISTRY = {
    "Redimensionar": lambda img: cv2.resize(img, (224, 224)),
    "Escala de Cinza": lambda img: cv2.cvtColor(img, cv2.COLOR_BGR2GRAY),
    "Equalizar Histograma": lambda img: cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)),
    "Normalizar": lambda img: img / 255.0,
    
}

def apply_custom_preprocessing(image, techniques_list):
    """
    Recebe a imagem e uma lista de nomes (ex: ["Escala de Cinza", "Normalizar"])
    e aplica as funções na ordem recebida.
    """
    processed_img = image.copy()
    
    for name in techniques_list:
        if name in PREPROCESSING_REGISTRY:
            # Chama a função associada ao nome dinamicamente
            processed_img = PREPROCESSING_REGISTRY[name](processed_img)
            
    return processed_img