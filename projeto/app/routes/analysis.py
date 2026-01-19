import logging
import csv
from pathlib import Path
from flask import Blueprint, jsonify
from collections import defaultdict

log = logging.getLogger(__name__)
bp = Blueprint("analysis", __name__)

# Path base dos resultados de treinamento
RESULTS_BASE_PATH = Path(r"M:\content\drive\MyDrive\pipeline\yolo_classificacao_resultados")

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
            for row in reader:
                # Remove espaços das chaves
                row = {k.strip(): v.strip() for k, v in row.items()}

                data["epochs"].append(int(row.get("epoch", 0)))
                data["train_loss"].append(float(row.get("train/loss", 0)))
                data["val_loss"].append(float(row.get("val/loss", 0)))
                data["acc_top1"].append(float(row.get("metrics/accuracy_top1", 0)))
                data["acc_top5"].append(float(row.get("metrics/accuracy_top5", 0)))
                data["lr_pg0"].append(float(row.get("lr/pg0", 0)))
                data["lr_pg1"].append(float(row.get("lr/pg1", 0)))
                data["lr_pg2"].append(float(row.get("lr/pg2", 0)))
                data["time"].append(float(row.get("time", 0)))

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
                for row in reader:
                    row = {k.strip(): v.strip() for k, v in row.items()}

                    data["epochs"].append(int(row.get("epoch", 0)))
                    data["train_loss"].append(float(row.get("train/loss", 0)))
                    data["val_loss"].append(float(row.get("val/loss", 0)))
                    data["acc_top1"].append(float(row.get("metrics/accuracy_top1", 0)))
                    data["acc_top5"].append(float(row.get("metrics/accuracy_top5", 0)))
                    data["lr_pg0"].append(float(row.get("lr/pg0", 0)))
                    data["lr_pg1"].append(float(row.get("lr/pg1", 0)))
                    data["lr_pg2"].append(float(row.get("lr/pg2", 0)))
                    data["time"].append(float(row.get("time", 0)))

            group_data.append(data)

        log.info(f"Dados carregados para grupo {group_name}: {len(group_data)} treinos")
        return jsonify({"trainings": group_data}), 200

    except Exception as e:
        log.error(f"Erro ao carregar dados do grupo {group_name}: {e}")
        return jsonify({"detail": str(e)}), 500
