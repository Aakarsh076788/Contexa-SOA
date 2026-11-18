"""
Dataset Generation and PyTorch Dataset Loader for ContexaNet.
Generates synthetic paired training data representing cross-application developer workflows:
- Positive pairs (label=1): Activity belongs to the existing context.
- Negative pairs (label=0): Activity is unrelated or represents task-switching / multitasking.
"""

import random
import numpy as np
import torch
from torch.utils.data import Dataset
from sklearn.feature_extraction.text import TfidfVectorizer

WORKFLOW_DOMAINS = {
    "auth": {
        "context_names": [
            "JWT Authentication & Session Management",
            "OAuth2 Google Login Flow",
            "User Password Reset & Email Verification",
            "NextAuth App Router Session Sync",
            "RBAC Role Permissions Middleware"
        ],
        "context_topics": [
            "jwt auth login token",
            "oauth google login authentication",
            "password reset bcrypt hashing",
            "nextauth session cookies middleware",
            "user roles rbac permission guard"
        ],
        "positive_activities": [
            ("chrome", "Next.js Docs: Authentication and Session Tokens", "nextjs.org/docs/auth"),
            ("chrome", "StackOverflow: How to fix JWT signature verification failed", "stackoverflow.com/questions/jwt"),
            ("vscode", "Saved src/middleware/auth.ts", "auth token verification logic"),
            ("vscode", "Modified backend/routes/auth.js", "login and signup handlers"),
            ("discord", "#backend-dev: Token expiry refresh token rotation question", "channel discussion"),
            ("github", "PR #42: Add OAuth2 Google and GitHub providers", "pull request review"),
            ("chrome", "Google Identity Services Documentation", "developers.google.com/identity"),
            ("vscode", "Edited src/utils/jwt.js: Sign token with 30d expiry", "token utils")
        ]
    },
    "database": {
        "context_names": [
            "PostgreSQL Migration & Schema Indexing",
            "Prisma Client PgVector Embeddings Storage",
            "Redis Cache Layer for Context Lookups",
            "MongoDB Aggregation Pipeline Optimization",
            "Supabase Realtime Row Level Security"
        ],
        "context_topics": [
            "postgres prisma migration schema",
            "pgvector embeddings similarity search",
            "redis cache latency optimization",
            "mongodb indexing aggregation queries",
            "supabase rls policies database"
        ],
        "positive_activities": [
            ("vscode", "Modified prisma/schema.prisma: Added Context embedding column", "database schema"),
            ("chrome", "Prisma Docs: Working with PostgreSQL float arrays", "prisma.io/docs"),
            ("vscode", "Terminal: npx prisma migrate dev --name add_embeddings", "database migration"),
            ("chrome", "PostgreSQL Tutorial: Cosine similarity search in pgvector", "postgresqltutorial.com"),
            ("discord", "#db-admins: Connection pool exhaustion under load", "database discussion"),
            ("github", "Issue #18: Fix foreign key constraint on session delete", "github issue")
        ]
    },
    "ml_ai": {
        "context_names": [
            "PyTorch Siamese Neural Network Context Matching",
            "Gemini Flash Reranker OpenRouter Integration",
            "Text Embeddings Cosine Similarity Pipeline",
            "HuggingFace Transformer Fine-Tuning for NER",
            "FastAPI Python Inference Microservice"
        ],
        "context_topics": [
            "pytorch siamese neural network similarity",
            "openrouter gemini flash api llm",
            "embeddings vector similarity pipeline",
            "huggingface token classification entity extraction",
            "fastapi python ml model inference"
        ],
        "positive_activities": [
            ("vscode", "Created ml/model.py: ContexaNet Siamese Twin Network", "pytorch neural net"),
            ("vscode", "Created ml/train.py: Training loop with BCELoss", "ml training script"),
            ("chrome", "PyTorch Documentation: torch.nn.CosineSimilarity and BCELoss", "pytorch.org/docs"),
            ("chrome", "Scikit-Learn: TfidfVectorizer max_features and sublinear_tf", "scikit-learn.org"),
            ("discord", "#ai-research: Validation F1 score reaches 0.92 on context pairs", "ml discussion"),
            ("vscode", "Terminal: python3 ml/train.py --epochs 25 --lr 0.001", "running model training")
        ]
    },
    "frontend_ui": {
        "context_names": [
            "Obsidian Glass Dark Theme & Animations",
            "Sidebar Navigation & Responsive Shell Layout",
            "D3 Force-Directed Context Graph Visualization",
            "Timeline Activity Stream Scrubber Component",
            "Vite React 19 Bundle Optimization"
        ],
        "context_topics": [
            "css animations transitions obsidian glass",
            "react sidebar navigation layout responsive",
            "d3 force graph simulation svg nodes",
            "react timeline stream slider component",
            "vite build bundling performance"
        ],
        "positive_activities": [
            ("vscode", "Modified src/styles.css: Added --ease-out-expo curves and keyframes", "css styling"),
            ("vscode", "Edited src/main.jsx: Replaced floating nav with Sidebar component", "react navigation"),
            ("chrome", "D3.js Docs: forceSimulation, forceLink, and collision physics", "d3js.org"),
            ("chrome", "CSS-Tricks: Building Linear-style smooth card hover glows", "css-tricks.com"),
            ("github", "Commit 8e0c785: Refactor App shell to horizontal flex layout", "github commit"),
            ("vscode", "Terminal: npm run dev ready at http://127.0.0.1:5173", "vite dev server")
        ]
    },
    "devops_deploy": {
        "context_names": [
            "Docker Compose Multi-Container Production Setup",
            "GitHub Actions CI/CD Automated Test Pipeline",
            "Nginx Reverse Proxy & SSL Certificate Config",
            "AWS ECS Fargate Cluster Deployment",
            "Sentry Error Monitoring & Alerting Setup"
        ],
        "context_topics": [
            "docker compose container deployment",
            "github actions cicd automated tests",
            "nginx ssl reverse proxy certbot",
            "aws ecs fargate cloud cluster",
            "sentry logging exception monitoring"
        ],
        "positive_activities": [
            ("vscode", "Created docker-compose.yml: Postgres + Node + Python ML service", "docker compose"),
            ("chrome", "Docker Hub: Official postgres:16-alpine image documentation", "hub.docker.com"),
            ("github", "Workflow: .github/workflows/test-and-build.yml passed", "github actions"),
            ("chrome", "AWS Management Console: ECS Task Definition created", "aws.amazon.com"),
            ("vscode", "Edited Dockerfile: Multi-stage node build with non-root user", "dockerfile")
        ]
    }
}


def generate_synthetic_data(num_samples=3000, seed=42):
    """
    Generates balanced positive and negative context-activity pairs.
    Returns:
        contexts (list of str)
        activities (list of str)
        labels (list of int: 1 or 0)
    """
    random.seed(seed)
    np.random.seed(seed)

    contexts = []
    activities = []
    labels = []

    domain_keys = list(WORKFLOW_DOMAINS.keys())

    for _ in range(num_samples):
        # Pick domain A
        dom_a = random.choice(domain_keys)
        ctx_name = random.choice(WORKFLOW_DOMAINS[dom_a]["context_names"])
        ctx_topic = random.choice(WORKFLOW_DOMAINS[dom_a]["context_topics"])
        context_text = f"Context: {ctx_name} | Topic: {ctx_topic}"

        # Decide whether to generate positive (1) or negative (0) pair
        is_positive = random.random() < 0.5

        if is_positive:
            act_source, act_title, act_detail = random.choice(WORKFLOW_DOMAINS[dom_a]["positive_activities"])
            activity_text = f"[{act_source.upper()}] {act_title} - {act_detail}"
            label = 1
        else:
            # Pick a DIFFERENT domain B
            dom_b = random.choice([d for d in domain_keys if d != dom_a])
            act_source, act_title, act_detail = random.choice(WORKFLOW_DOMAINS[dom_b]["positive_activities"])
            activity_text = f"[{act_source.upper()}] {act_title} - {act_detail}"
            label = 0

        contexts.append(context_text)
        activities.append(activity_text)
        labels.append(label)

    return contexts, activities, np.array(labels, dtype=np.float32)


class ContexaDataset(Dataset):
    """PyTorch Dataset returning TF-IDF vectorized tensor pairs."""

    def __init__(self, ctx_features, act_features, labels):
        self.ctx_features = torch.tensor(ctx_features, dtype=torch.float32)
        self.act_features = torch.tensor(act_features, dtype=torch.float32)
        self.labels = torch.tensor(labels, dtype=torch.float32).unsqueeze(1)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return self.ctx_features[idx], self.act_features[idx], self.labels[idx]
