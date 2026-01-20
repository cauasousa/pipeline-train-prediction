import logging
import csv
from pathlib import Path
from flask import Blueprint, jsonify
from collections import defaultdict

log = logging.getLogger(__name__)
bp = Blueprint("analysis", __name__)

# Path base dos resultados de treinamento
RESULTS_BASE_PATH = Path(r"M:\content\drive\MyDrive\pipeline\yolo_classificacao_resultados")

# Helpers para leitura robusta de colunas do CSV
def pick_float(row: dict, candidates, default: float = 0.0) -> float:
    """Tenta obter um float de 'row' usando uma lista de nomes candidatos.
    Faz correspondência case-insensitive nas chaves do CSV.
    """
    if not row:
        return default
    # Normaliza chaves para comparação case-insensitive
    lower = {str(k).strip().lower(): str(v).strip() for k, v in row.items()}
    for name in candidates:
        key = str(name).strip().lower()
        if key in lower:
            val_str = lower[key]
            if val_str and val_str not in (None, ""):
                try:
                    return float(val_str)
                except (ValueError, TypeError) as e:
                    log.warning(f"Failed to convert '{key}'='{val_str}' to float: {e}")
                    continue
    return default

@bp.route("/list-trainings", methods=["GET"])
def list_trainings():
    """
    Lista todos os treinos disponíveis.
    Retorna:
    - trainings: lista de nomes de treinos
    - groups: dicionário agrupando treinos por nome base
    """
    try:
        if not RESULTS_BASE_PATH.exists():
            return jsonify({"trainings": [], "groups": {}}), 200

        trainings = []
        groups = defaultdict(list)

        for item in RESULTS_BASE_PATH.iterdir():
            if item.is_dir():
                results_file = item / "results.csv"
                if results_file.exists():
                    training_name = item.name
                    trainings.append(training_name)

                    # Extrai nome base (remove números finais)
                    base_name = training_name.rstrip('0123456789')
                    groups[base_name].append(training_name)

        trainings.sort()
        groups = {k: sorted(v) for k, v in groups.items()}

        log.info(f"Treinos encontrados: {len(trainings)}")
        return jsonify({
            "trainings": trainings,
            "groups": groups
        }), 200

    except Exception as e:
        log.error(f"Erro ao listar treinos: {e}")
        return jsonify({"detail": str(e)}), 500


@bp.route("/get-training-data/<training_name>", methods=["GET"])
def get_training_data(training_name):
    """
    Retorna os dados do results.csv para um treino específico.
    """
    try:
        training_path = RESULTS_BASE_PATH / training_name / "results.csv"

        if not training_path.exists():
            return jsonify({"detail": f"Arquivo results.csv não encontrado para {training_name}"}), 404

        # Lê CSV
        data = {
            "training_name": training_name,
            "epochs": [],
            "train_loss": [],
            "val_loss": [],
            "acc_top1": [],
            "acc_top5": [],
            "lr_pg0": [],
            "lr_pg1": [],
            "lr_pg2": [],
            "time": []
        }

        with open(training_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            row_count = 0
            for row in reader:
                row_count += 1
                # Remove espaços das chaves
                row = {k.strip(): v.strip() for k, v in row.items()}

                # Debug: log first row
                if row_count == 1:
                    log.info(f"[{training_name}] CSV Headers: {list(row.keys())}")
                    log.info(f"[{training_name}] Raw values: train/loss={row.get('train/loss')}, val/loss={row.get('val/loss')}")

                data["epochs"].append(int(row.get("epoch", 0)))
                # Loss com chaves alternativas
                train_loss_val = pick_float(row, [
                    "train/loss", "train_loss", "train/cls_loss", "train/class_loss", "train/loss_total"
                ], 0.0)
                val_loss_val = pick_float(row, [
                    "val/loss", "val_loss", "val/cls_loss", "val/class_loss", "val/loss_total"
                ], 0.0)
                if row_count == 1:
                    log.info(f"[{training_name}] Parsed train_loss={train_loss_val}, val_loss={val_loss_val}")
                data["train_loss"].append(train_loss_val)
                data["val_loss"].append(val_loss_val)
                # Demais métricas (mantém principal e tenta alternativas básicas)
                data["acc_top1"].append(pick_float(row, [
                    "metrics/accuracy_top1", "accuracy_top1", "val/acc", "val/accuracy"
                ], 0.0))
                data["acc_top5"].append(pick_float(row, [
                    "metrics/accuracy_top5", "accuracy_top5"
                ], 0.0))
                data["lr_pg0"].append(pick_float(row, ["lr/pg0", "lr_pg0"], 0.0))
                data["lr_pg1"].append(pick_float(row, ["lr/pg1", "lr_pg1"], 0.0))
                data["lr_pg2"].append(pick_float(row, ["lr/pg2", "lr_pg2"], 0.0))
                data["time"].append(pick_float(row, ["time"], 0.0))

            log.info(f"[{training_name}] Processed {row_count} rows. train_loss[:3]={data['train_loss'][:3]}, val_loss[:3]={data['val_loss'][:3]}")

        log.info(f"Dados carregados para {training_name}: {len(data['epochs'])} epochs")
        return jsonify(data), 200

    except Exception as e:
        log.error(f"Erro ao carregar dados de {training_name}: {e}")
        return jsonify({"detail": str(e)}), 500


@bp.route("/get-group-data/<group_name>", methods=["GET"])
def get_group_data(group_name):
    """
    Retorna os dados de todos os treinos de um grupo (mesmo nome base).
    """
    try:
        if not RESULTS_BASE_PATH.exists():
            return jsonify({"detail": "Diretório de resultados não encontrado"}), 404

        trainings = []
        for item in RESULTS_BASE_PATH.iterdir():
            if item.is_dir() and item.name.startswith(group_name):
                results_file = item / "results.csv"
                if results_file.exists():
                    trainings.append(item.name)

        if not trainings:
            return jsonify({"detail": f"Nenhum treino encontrado para o grupo {group_name}"}), 404

        trainings.sort()
        group_data = []

        for training_name in trainings:
            training_path = RESULTS_BASE_PATH / training_name / "results.csv"

            data = {
                "training_name": training_name,
                "epochs": [],
                "train_loss": [],
                "val_loss": [],
                "acc_top1": [],
                "acc_top5": [],
                "lr_pg0": [],
                "lr_pg1": [],
                "lr_pg2": [],
                "time": []
            }

            with open(training_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                row_count = 0
                for row in reader:
                    row_count += 1
                    row = {k.strip(): v.strip() for k, v in row.items()}

                    if row_count == 1:
                        log.info(f"[{training_name}] CSV Headers: {list(row.keys())}")

                    data["epochs"].append(int(row.get("epoch", 0)))
                    data["train_loss"].append(pick_float(row, [
                        "train/loss", "train_loss", "train/cls_loss", "train/class_loss", "train/loss_total"
                    ], 0.0))
                    data["val_loss"].append(pick_float(row, [
                        "val/loss", "val_loss", "val/cls_loss", "val/class_loss", "val/loss_total"
                    ], 0.0))
                    data["acc_top1"].append(pick_float(row, [
                        "metrics/accuracy_top1", "accuracy_top1", "val/acc", "val/accuracy"
                    ], 0.0))
                    data["acc_top5"].append(pick_float(row, [
                        "metrics/accuracy_top5", "accuracy_top5"
                    ], 0.0))
                    data["lr_pg0"].append(pick_float(row, ["lr/pg0", "lr_pg0"], 0.0))
                    data["lr_pg1"].append(pick_float(row, ["lr/pg1", "lr_pg1"], 0.0))
                    data["lr_pg2"].append(pick_float(row, ["lr/pg2", "lr_pg2"], 0.0))
                    data["time"].append(pick_float(row, ["time"], 0.0))

            group_data.append(data)

        log.info(f"Dados carregados para grupo {group_name}: {len(group_data)} treinos")
        return jsonify({"trainings": group_data}), 200

    except Exception as e:
        log.error(f"Erro ao carregar dados do grupo {group_name}: {e}")
        return jsonify({"detail": str(e)}), 500
