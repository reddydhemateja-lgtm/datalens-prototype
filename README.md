# 🔭 DataLens AI — v2.0

> *"Data is everywhere, but insight is rare."*

**DataLens AI** is an intelligent data analysis platform that transforms raw, messy CSV/Excel files into clean, actionable insights — powered by Claude AI.

---

## 🏆 Hackathon Theme
**AI Meets Data: From Noise to Insight**

DataLens directly addresses this by:
- Taking **raw, messy, unstructured data** (CSV/Excel uploads)
- Running **intelligent cleaning** — duplicates, nulls, outliers — automatically
- **Surfacing signals** through AI-generated insights, charts, and correlation analysis
- Enabling **natural language Q&A** with Claude AI about your dataset

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📁 **File Upload** | Drag & drop CSV or Excel files up to 20MB |
| 🧹 **Auto Data Cleaning** | Remove duplicates, fill nulls (mean/mode), cap outliers (IQR) |
| 📊 **Data Quality Score** | 0–100% score with detailed issue breakdown |
| 📈 **Column Statistics** | Type detection, skewness, entropy, Q1/Q3, and more |
| 💡 **AI Insights** | Auto-generated pattern detection and anomaly alerts |
| 📉 **5 Chart Types** | Bar, histogram, doughnut, line, scatter |
| 🔗 **Correlation Matrix** | Pearson correlation between all numeric columns |
| 🤖 **AI Chat** | Ask questions in plain English — powered by Claude |
| 💾 **Export** | Download clean CSV anytime |

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | HTML, CSS, JavaScript, Chart.js |
| Backend | Node.js, Express.js |
| File Parsing | csv-parse, xlsx (SheetJS) |
| AI | Anthropic Claude API (claude-sonnet-4) |
| Hosting | Render.com |

---

## 🚀 How to Run Locally

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/datalens-ai.git
cd datalens-ai
```

### 2. Install dependencies
```bash
cd backend
npm install
```

### 3. Start the server
```bash
# Without AI (rule-based chat):
node server.js

# With Claude AI chat enabled:
ANTHROPIC_API_KEY=your_key_here node server.js
```

### 4. Open the app
Go to: **http://localhost:4000**

---

## ☁️ Deploy to Render.com (Free)

### Step 1 — Push to GitHub
Make sure your repo is on GitHub with this structure:
```
datalens-ai/
├── backend/
│   ├── server.js
│   └── package.json
├── frontend/
│   └── index.html
└── README.md
```

### Step 2 — Create Web Service on Render
1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repository
3. Set these settings:

| Setting | Value |
|---------|-------|
| **Root Directory** | `backend` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Environment** | `Node` |

### Step 3 — Add Environment Variable (Optional but recommended)
In Render dashboard → **Environment** tab:
```
ANTHROPIC_API_KEY = your_anthropic_api_key_here
```
Get your API key at: https://console.anthropic.com

### Step 4 — Deploy!
Click **Deploy Web Service** — Render will give you a live URL like:
`https://datalens-ai.onrender.com`

> ⚠️ **Note:** Free Render services sleep after 15 minutes of inactivity. First load may take 30–60 seconds to wake up.

---

## 📁 Project Structure

```
datalens-ai/
├── backend/
│   ├── server.js          # Express API server
│   └── package.json       # Dependencies
├── frontend/
│   └── index.html         # Single-file frontend (HTML + CSS + JS)
└── README.md
```

---

## 🧠 How the AI Works

1. **Upload** → Server parses CSV/Excel, runs statistical analysis
2. **Analyze** → Detects column types, calculates stats, finds outliers
3. **Insights** → Rule-based pattern detection generates insight cards
4. **Chat** → User questions sent to Claude with full dataset context
5. **Clean** → One-click removes duplicates, fills nulls, caps outliers

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload file, get analysis |
| POST | `/api/clean` | Auto-clean dataset |
| POST | `/api/insights` | Generate insights + charts |
| POST | `/api/chat` | AI chat with dataset context |
| GET | `/api/health` | Health check |

---

## 🎯 Sample Datasets

Try the built-in samples (no upload needed):
- **Sales Data** — 12 months with outlier revenue and missing values
- **HR Employee Data** — Salaries with negative values and nulls
- **Finance Transactions** — Duplicate rows and extreme outliers

---

Built for the **AI Meets Data Hackathon 2026** 🏆
