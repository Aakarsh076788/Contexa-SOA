"""
Training and Evaluation Pipeline for ContexaNet.
Trains Siamese Neural Network on context-activity pairs, logs loss and validation metrics,
and exports trained weights + vectorizer for production inference.
"""

import os
import json
import joblib
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

from dataset import generate_synthetic_data, ContexaDataset
from model import ContexaNet

def train_model(epochs=20, batch_size=32, lr=0.001, num_samples=5000, seed=42):
    print("=" * 60)
    print("  CONTEXANET: SIAMESE DEEP NEURAL NETWORK TRAINING PIPELINE")
    print("=" * 60)

    # 1. Generate Dataset
    print(f"\n[1/5] Generating {num_samples} synthetic workflow context pairs...")
    contexts, activities, labels = generate_synthetic_data(num_samples=num_samples, seed=seed)

    # 2. Fit TF-IDF Vectorizer
    print("[2/5] Fitting TF-IDF feature encoder (512 features, unigrams + bigrams)...")
    all_texts = contexts + activities
    vectorizer = TfidfVectorizer(max_features=512, ngram_range=(1, 2), sublinear_tf=True)
    # Fit only on training documents to prevent vocabulary leakage into evaluation.
    train_count = int(len(labels) * 0.8)
    vectorizer.fit(contexts[:train_count] + activities[:train_count])

    ctx_features = vectorizer.transform(contexts).toarray()
    act_features = vectorizer.transform(activities).toarray()

    # 3. Train/Val/Test Split (80/10/10)
    n = len(labels)
    n_train = int(n * 0.8)
    n_val = int(n * 0.1)

    train_ds = ContexaDataset(ctx_features[:n_train], act_features[:n_train], labels[:n_train])
    val_ds = ContexaDataset(ctx_features[n_train:n_train + n_val], act_features[n_train:n_train + n_val], labels[n_train:n_train + n_val])
    test_ds = ContexaDataset(ctx_features[n_train + n_val:], act_features[n_train + n_val:], labels[n_train + n_val:])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False)

    print(f"      Training set:   {len(train_ds)} samples")
    print(f"      Validation set: {len(val_ds)} samples")
    print(f"      Test set:       {len(test_ds)} samples")

    # 4. Instantiate Model & Optimizer
    print("\n[3/5] Initializing ContexaNet Siamese Architecture...")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ContexaNet(input_dim=512, embedding_dim=64, dropout_rate=0.2).to(device)

    criterion = nn.BCELoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=2)

    history = {
        "train_loss": [],
        "val_loss": [],
        "val_accuracy": [],
        "val_f1": []
    }

    # 5. Training Loop
    print("\n[4/5] Starting Model Training...")
    best_val_loss = float("inf")

    for epoch in range(1, epochs + 1):
        model.train()
        total_train_loss = 0.0

        for ctx_b, act_b, y_b in train_loader:
            ctx_b, act_b, y_b = ctx_b.to(device), act_b.to(device), y_b.to(device)

            optimizer.zero_grad()
            preds = model(ctx_b, act_b)
            loss = criterion(preds, y_b)
            loss.backward()
            optimizer.step()

            total_train_loss += loss.item() * len(y_b)

        avg_train_loss = total_train_loss / len(train_ds)

        # Validation Step
        model.eval()
        total_val_loss = 0.0
        val_preds_list = []
        val_targets_list = []

        with torch.no_grad():
            for ctx_b, act_b, y_b in val_loader:
                ctx_b, act_b, y_b = ctx_b.to(device), act_b.to(device), y_b.to(device)
                preds = model(ctx_b, act_b)
                loss = criterion(preds, y_b)
                total_val_loss += loss.item() * len(y_b)

                val_preds_list.extend((preds.cpu().numpy() >= 0.5).astype(int).flatten())
                val_targets_list.extend(y_b.cpu().numpy().flatten())

        avg_val_loss = total_val_loss / len(val_ds)
        val_acc = accuracy_score(val_targets_list, val_preds_list)
        val_f1 = f1_score(val_targets_list, val_preds_list)

        scheduler.step(avg_val_loss)

        history["train_loss"].append(round(avg_train_loss, 4))
        history["val_loss"].append(round(avg_val_loss, 4))
        history["val_accuracy"].append(round(val_acc, 4))
        history["val_f1"].append(round(val_f1, 4))

        print(f"  Epoch [{epoch:02d}/{epochs:02d}] - Train Loss: {avg_train_loss:.4f} | Val Loss: {avg_val_loss:.4f} | Val Acc: {val_acc * 100:.2f}% | Val F1: {val_f1:.4f}")

    # 6. Evaluation on Test Set
    print("\n[5/5] Evaluating on Unseen Test Dataset...")
    model.eval()
    test_preds_list = []
    test_targets_list = []

    with torch.no_grad():
        for ctx_b, act_b, y_b in test_loader:
            ctx_b, act_b, y_b = ctx_b.to(device), act_b.to(device), y_b.to(device)
            preds = model(ctx_b, act_b)
            test_preds_list.extend((preds.cpu().numpy() >= 0.5).astype(int).flatten())
            test_targets_list.extend(y_b.cpu().numpy().flatten())

    test_acc = accuracy_score(test_targets_list, test_preds_list)
    test_prec = precision_score(test_targets_list, test_preds_list)
    test_rec = recall_score(test_targets_list, test_preds_list)
    test_f1 = f1_score(test_targets_list, test_preds_list)
    cm = confusion_matrix(test_targets_list, test_preds_list).tolist()

    print("\n" + "=" * 60)
    print("                    FINAL MODEL EVALUATION METRICS")
    print("=" * 60)
    print(f"  Accuracy:         {test_acc * 100:.2f}%")
    print(f"  Precision:        {test_prec * 100:.2f}%")
    print(f"  Recall:           {test_rec * 100:.2f}%")
    print(f"  F1-Score:         {test_f1:.4f}")
    print(f"  Confusion Matrix: {cm}")
    print("=" * 60)

    # 7. Save Model Weights & Vectorizer
    ml_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(ml_dir, "contexanet.pth")
    vectorizer_path = os.path.join(ml_dir, "vectorizer.pkl")
    report_path = os.path.join(ml_dir, "training_report.json")

    torch.save(model.state_dict(), model_path)
    joblib.dump(vectorizer, vectorizer_path)

    report = {
        "architecture": "Siamese Twin Deep Neural Network",
        "parameters": sum(p.numel() for p in model.parameters() if p.requires_grad),
        "epochs": epochs,
        "samples": num_samples,
        "metrics": {
            "accuracy": test_acc,
            "precision": test_prec,
            "recall": test_rec,
            "f1_score": test_f1,
            "confusion_matrix": cm
        },
        "history": history
    }

    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n Model weights saved to:     {model_path}")
    print(f" Feature vectorizer saved to: {vectorizer_path}")
    print(f" Training report saved to:    {report_path}")
    print("\nTraining completed successfully.")

if __name__ == "__main__":
    train_model(epochs=15, batch_size=32, lr=0.001, num_samples=4000)
