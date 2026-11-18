# Optional inference service

The main app works without Python through deterministic matching. Keep this service private; its inference route has no public authentication. `CONTEXA_ML_URL` defaults to `http://127.0.0.1:5001`. Any non-loopback inference URL requires the workspace's cloud-processing opt-in because it sends activity to another processor, including a private-network host.

Use Python **3.12** in an isolated environment. Direct dependency versions were checked against the official [PyPI package index](https://pypi.org/) on 20 October 2026. They are reproducible direct pins, not a complete transitive lockfile. The existing vectorizer contains `_sklearn_version=1.9.0`, so that version is intentionally retained rather than silently upgrading a serialized estimator. [scikit-learn does not support loading estimators across versions](https://scikit-learn.org/stable/model_persistence.html).

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r ml/requirements.txt
.venv/bin/gunicorn --chdir ml --bind 127.0.0.1:5001 --workers 1 --timeout 30 server:app
```

For a private hosted service bind to `0.0.0.0` and the provider's port only behind private networking. Importing `server:app` loads the artifacts once per worker. `/health` returns **503** until both model and vectorizer load, and **200** when available. Requests are limited to 64 KB. One CPU worker is a sensible initial default; measure memory and throughput before increasing it.

Only load model/vectorizer artifacts from trusted local training: `joblib.load` can execute code. PyTorch weights use `weights_only=True`; this does not make an untrusted vectorizer safe. No runtime dependency installation or real model-inference validation was performed in this upgrade; Python source compilation passed. Before enabling inference, install in staging, check readiness, run representative `/predict` samples and compare matching decisions with the service disabled. Existing synthetic training scores are not a real-world accuracy guarantee.

For updates, create a fresh environment, review release/security notes, regenerate the vectorizer and weights together, save training/runtime versions and an artifact checksum manifest, evaluate a held-out representative dataset, and compare false merges and missed matches. Keep the prior matching environment and artifacts for rollback. Run `pip check` and produce an environment-specific transitive lock with hashes before production rollout; do not blindly upgrade the serialized estimator in place.
