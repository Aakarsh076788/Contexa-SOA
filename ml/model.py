"""
ContexaNet: Siamese Deep Neural Network for Context-Activity Matching.
Employs twin feature towers with weight sharing, multi-perspective distance aggregation,
and a non-linear classification head for fine-grained similarity scoring.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class TwinEncoderTower(nn.Module):
    """Deep non-linear feature extractor shared between context and activity representations."""

    def __init__(self, input_dim=512, hidden_dims=[256, 128, 64], dropout_rate=0.2):
        super(TwinEncoderTower, self).__init__()

        layers = []
        in_dim = input_dim

        for out_dim in hidden_dims:
            layers.append(nn.Linear(in_dim, out_dim))
            layers.append(nn.BatchNorm1d(out_dim))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(dropout_rate))
            in_dim = out_dim

        self.network = nn.Sequential(*layers)

    def forward(self, x):
        return self.network(x)


class ContexaNet(nn.Module):
    """
    Siamese Architecture for Cross-Application Work Context Similarity.
    
    Inputs:
        context_vec: Tensor of shape (batch_size, input_dim)
        activity_vec: Tensor of shape (batch_size, input_dim)
    Output:
        similarity_prob: Tensor of shape (batch_size, 1) in range [0, 1]
    """

    def __init__(self, input_dim=512, embedding_dim=64, dropout_rate=0.2):
        super(ContexaNet, self).__init__()

        # Twin encoder with shared weights
        self.encoder = TwinEncoderTower(input_dim=input_dim, hidden_dims=[256, 128, embedding_dim], dropout_rate=dropout_rate)

        # Multi-perspective interaction features:
        # u, v, |u - v|, u * v -> 4 * embedding_dim
        combined_dim = embedding_dim * 4

        self.classifier = nn.Sequential(
            nn.Linear(combined_dim, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, context_vec, activity_vec):
        # 1. Project both into latent embedding space
        u = self.encoder(context_vec)
        v = self.encoder(activity_vec)

        # 2. Compute interaction features
        diff = torch.abs(u - v)
        prod = u * v
        combined = torch.cat([u, v, diff, prod], dim=1)

        # 3. Predict similarity probability
        probability = self.classifier(combined)
        return probability
