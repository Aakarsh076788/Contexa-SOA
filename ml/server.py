"""
Flask Inference Microservice for ContexaNet.
Serves real-time context similarity predictions on port 5001.
"""

import os
import joblib
import torch
from flask import Flask, request, jsonify
try:
    from .model import ContexaNet
except ImportError:
    from model import ContexaNet

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 65536

# Global model and vectorizer references
model = None
vectorizer = None
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def load_inference_artifacts():
    global model, vectorizer
    ml_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(ml_dir, "contexanet.pth")
    vectorizer_path = os.path.join(ml_dir, "vectorizer.pkl")

    if not os.path.exists(model_path) or not os.path.exists(vectorizer_path):
        print(f"[ContexaNet Server] Warning: Model artifacts not found. Please run `python3 ml/train.py` first.")
        return False

    print(f"[ContexaNet Server] Loading weights from {model_path}...")
    vectorizer = joblib.load(vectorizer_path)

    model = ContexaNet(input_dim=512, embedding_dim=64, dropout_rate=0.0)
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model.to(device)
    model.eval()
    print("[ContexaNet Server] Model loaded and ready for inference on device:", device)
    return True


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy" if model is not None and vectorizer is not None else "unavailable",
        "model_loaded": model is not None,
        "device": str(device),
        "architecture": "Siamese Deep Neural Network (ContexaNet)"
    }), 200 if model is not None and vectorizer is not None else 503


@app.route("/predict", methods=["POST"])
def predict():
    if model is None or vectorizer is None:
        return jsonify({
            "error": "Model not loaded. Train the model first with train.py.",
            "status": "AI_UNAVAILABLE"
        }), 503

    try:
        data = request.get_json(force=True)
        if not isinstance(data, dict) or not isinstance(data.get("context"), dict) or not isinstance(data.get("activity"), dict):
            return jsonify({"error": "Supply context and activity objects."}), 400
        ctx = data.get("context", {})
        act = data.get("activity", {})

        for obj in [ctx, act]:
            if any(not isinstance(value, str) for key, value in obj.items() if key in ["name", "topic", "description", "source", "title", "detail"] and value is not None):
                return jsonify({"error": "Inference text fields must be strings."}), 400
        ctx_name = ctx.get("name", "")
        ctx_topic = ctx.get("topic", "")
        ctx_desc = ctx.get("description", "")
        context_text = f"Context: {ctx_name} | Topic: {ctx_topic} {ctx_desc}".strip()

        act_source = act.get("source", "").upper()
        act_title = act.get("title", "")
        act_detail = act.get("detail", "")
        activity_text = f"[{act_source}] {act_title} - {act_detail}".strip()

        if not context_text or not activity_text:
            return jsonify({
                "related": False,
                "confidence": 0,
                "reason": ["Empty context or activity text supplied."],
                "status": "AI_REJECTED"
            })

        # Feature vectorization
        ctx_vec = vectorizer.transform([context_text]).toarray()
        act_vec = vectorizer.transform([activity_text]).toarray()

        ctx_tensor = torch.tensor(ctx_vec, dtype=torch.float32).to(device)
        act_tensor = torch.tensor(act_vec, dtype=torch.float32).to(device)

        with torch.no_grad():
            score_tensor = model(ctx_tensor, act_tensor)
            prob = float(score_tensor.cpu().numpy()[0][0])

        confidence_pct = int(round(prob * 100))
        is_related = prob >= 0.50

        reason_text = (
            f"Strong workflow correlation ({confidence_pct}% match via ContexaNet)"
            if is_related
            else f"Low correlation ({confidence_pct}% match via ContexaNet)"
        )

        return jsonify({
            "related": is_related,
            "confidence": confidence_pct,
            "reason": [reason_text],
            "status": "AI_SUCCESS",
            "model": "ContexaNet-v1-PyTorch",
            "raw_score": round(prob, 4)
        })

    except Exception as e:
        return jsonify({
            "error": "Inference failed.",
            "status": "AI_UNAVAILABLE"
        }), 500


# Load on import too, including gunicorn ml.server:app. Artifacts must be trusted local files.
try:
    load_inference_artifacts()
except Exception:
    app.logger.exception("Inference artifacts could not be loaded")
    model = None
    vectorizer = None

if __name__ == "__main__":
    print("[ContexaNet Server] Starting microservice on http://127.0.0.1:5001")
    app.run(host=os.environ.get("ML_HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5001")), debug=False)
