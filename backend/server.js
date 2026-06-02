import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

function parseFile(buffer, originalname) {
  const ext = originalname.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const text = buffer.toString('utf8');
    return parse(text, { columns: true, skip_empty_lines: true, trim: true });
  }
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function analyzeData(rows) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]);
  const report = {};

  columns.forEach(col => {
    const vals = rows.map(r => r[col]);
    const nullCount = vals.filter(v => v === null || v === '' || v === undefined).length;
    const numericVals = vals.filter(v => v !== null && v !== '' && v !== undefined && !isNaN(Number(v))).map(Number);
    const stringVals = vals.filter(v => typeof v === 'string' && v.trim() !== '' && isNaN(Number(v)));

    let type = 'text';
    if (numericVals.length > rows.length * 0.6) type = 'numeric';
    else if (stringVals.length > rows.length * 0.5) type = 'categorical';

    const info = { type, nullCount, nullPct: ((nullCount / rows.length) * 100).toFixed(1) };

    if (type === 'numeric' && numericVals.length > 0) {
      const sorted = [...numericVals].sort((a, b) => a - b);
      const sum = numericVals.reduce((a, b) => a + b, 0);
      const mean = sum / numericVals.length;
      const variance = numericVals.reduce((a, b) => a + (b - mean) ** 2, 0) / numericVals.length;
      const std = Math.sqrt(variance);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const outliers = numericVals.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
      const skewness = numericVals.length > 2
        ? numericVals.reduce((a, b) => a + Math.pow((b - mean) / (std || 1), 3), 0) / numericVals.length
        : 0;
      info.min = sorted[0]; info.max = sorted[sorted.length - 1];
      info.mean = +mean.toFixed(2); info.median = sorted[Math.floor(sorted.length / 2)];
      info.std = +std.toFixed(2); info.q1 = +q1.toFixed(2); info.q3 = +q3.toFixed(2);
      info.iqr = +iqr.toFixed(2); info.skewness = +skewness.toFixed(3);
      info.outliers = outliers.length; info.outlierVals = outliers.slice(0, 5);
      info.sum = +sum.toFixed(2);
    }

    if (type === 'categorical') {
      const freq = {};
      stringVals.forEach(v => freq[v] = (freq[v] || 0) + 1);
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      info.uniqueCount = sorted.length;
      info.topValues = sorted.slice(0, 8).map(([k, v]) => ({ value: k, count: v }));
      info.entropy = +(-sorted.reduce((acc, [, c]) => {
        const p = c / stringVals.length;
        return acc + (p > 0 ? p * Math.log2(p) : 0);
      }, 0)).toFixed(3);
    }

    report[col] = info;
  });

  const seen = new Set();
  let duplicates = 0;
  rows.forEach(r => {
    const key = JSON.stringify(r);
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  });

  // Correlation matrix
  const numCols = columns.filter(c => report[c].type === 'numeric');
  const correlations = {};
  if (numCols.length >= 2) {
    numCols.forEach(colA => {
      correlations[colA] = {};
      numCols.forEach(colB => {
        if (colA === colB) { correlations[colA][colB] = 1; return; }
        const vA = rows.map(r => Number(r[colA])).filter(v => !isNaN(v));
        const vB = rows.map(r => Number(r[colB])).filter(v => !isNaN(v));
        const n = Math.min(vA.length, vB.length);
        if (n < 2) { correlations[colA][colB] = 0; return; }
        const mA = vA.slice(0,n).reduce((a,b)=>a+b,0)/n;
        const mB = vB.slice(0,n).reduce((a,b)=>a+b,0)/n;
        const num = vA.slice(0,n).reduce((acc,a,i)=>acc+(a-mA)*(vB[i]-mB),0);
        const dA = Math.sqrt(vA.slice(0,n).reduce((acc,a)=>acc+(a-mA)**2,0));
        const dB = Math.sqrt(vB.slice(0,n).reduce((acc,b)=>acc+(b-mB)**2,0));
        correlations[colA][colB] = dA&&dB ? +(num/(dA*dB)).toFixed(3) : 0;
      });
    });
  }

  const issues = [];
  Object.entries(report).forEach(([col, info]) => {
    if (info.nullCount > 0) issues.push({ type: 'warning', col, message: `"${col}": ${info.nullCount} missing value(s) (${info.nullPct}%)` });
    if (info.outliers > 0) issues.push({ type: 'error', col, message: `"${col}": ${info.outliers} outlier(s) detected` });
  });
  if (duplicates > 0) issues.push({ type: 'error', col: '_all', message: `${duplicates} duplicate row(s) found` });

  const totalCells = rows.length * columns.length;
  const nullCells = Object.values(report).reduce((s, c) => s + c.nullCount, 0);
  const qualityScore = Math.max(0, Math.min(100, Math.round(((totalCells - nullCells - duplicates * columns.length) / totalCells) * 100)));

  return { columns, rowCount: rows.length, colCount: columns.length, duplicates, issues, report, qualityScore, correlations };
}

function cleanData(rows) {
  const seen = new Set();
  let cleaned = rows.filter(r => {
    const key = JSON.stringify(r);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const columns = Object.keys(cleaned[0] || {});
  const colTypes = {};
  columns.forEach(col => {
    const nums = cleaned.map(r => r[col]).filter(v => v !== null && v !== '' && !isNaN(Number(v)));
    colTypes[col] = nums.length > cleaned.length * 0.6 ? 'numeric' : 'text';
  });
  columns.forEach(col => {
    const vals = cleaned.map(r => r[col]);
    if (colTypes[col] === 'numeric') {
      const nums = vals.filter(v => v !== null && v !== '' && !isNaN(Number(v))).map(Number);
      const mean = nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : 0;
      cleaned = cleaned.map(r => ({ ...r, [col]: (r[col]===null||r[col]===''||r[col]===undefined) ? +mean.toFixed(2) : r[col] }));
    } else {
      const freq = {};
      vals.filter(v=>v!==null&&v!=='').forEach(v=>freq[String(v)]=(freq[String(v)]||0)+1);
      const mode = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Unknown';
      cleaned = cleaned.map(r => ({ ...r, [col]: (r[col]===null||r[col]===''||r[col]===undefined) ? mode : r[col] }));
    }
  });
  columns.forEach(col => {
    if (colTypes[col]!=='numeric') return;
    const nums = cleaned.map(r=>Number(r[col])).sort((a,b)=>a-b);
    const q1=nums[Math.floor(nums.length*0.25)], q3=nums[Math.floor(nums.length*0.75)];
    const iqr=q3-q1, upper=q3+1.5*iqr, lower=q1-1.5*iqr;
    cleaned = cleaned.map(r=>({...r,[col]:+Math.min(upper,Math.max(lower,Number(r[col]))).toFixed(4)}));
  });
  return cleaned;
}

function generateInsights(rows, report) {
  const insights = [];
  const columns = Object.keys(report);
  const numCols = columns.filter(c => report[c].type === 'numeric');
  const catCols = columns.filter(c => report[c].type === 'categorical');

  numCols.forEach(col => {
    const r = report[col];
    insights.push({ type:'stat', title:`${col} — Statistics`, body:`Range: ${r.min} → ${r.max} | Mean: ${r.mean} | Median: ${r.median} | Std Dev: ${r.std}` });
    if (r.skewness && Math.abs(r.skewness) > 0.5)
      insights.push({ type:'info', title:`${col} is ${r.skewness>0?'right':'left'}-skewed`, body:`Skewness of ${r.skewness}. The ${r.skewness>0?'higher':'lower'} end has more extreme values, which can affect averages.` });
    if (r.outliers > 0)
      insights.push({ type:'warning', title:`${r.outliers} Outlier(s) in ${col}`, body:`IQR range: [${r.q1}, ${r.q3}]. Extreme values found: ${r.outlierVals.join(', ')}. Use Auto-Clean to handle these.` });
  });

  catCols.forEach(col => {
    const top = report[col].topValues?.[0];
    if (top) {
      const pct = ((top.count / rows.length) * 100).toFixed(1);
      insights.push({ type:'info', title:`Dominant: "${top.value}" in ${col}`, body:`Appears in ${pct}% of rows (${top.count}/${rows.length}). ${pct > 60 ? 'High concentration — column may not add much variance.' : ''}` });
    }
    insights.push({ type:'stat', title:`${col} Diversity`, body:`${report[col].uniqueCount} unique values. Shannon entropy: ${report[col].entropy} bits — ${report[col].entropy < 1 ? 'very uniform' : report[col].entropy < 2 ? 'moderate spread' : 'highly diverse'}.` });
  });

  const nullCols = columns.filter(c => report[c].nullCount > 0);
  if (nullCols.length)
    insights.push({ type:'warning', title:'Missing Data', body:`${nullCols.map(c=>`${c} (${report[c].nullPct}%)`).join(', ')} — total ${nullCols.reduce((s,c)=>s+report[c].nullCount,0)} missing cells.` });
  else
    insights.push({ type:'success', title:'Complete Dataset', body:'Every cell is populated — excellent data completeness!' });

  insights.push({ type:'stat', title:'Dataset Overview', body:`${rows.length.toLocaleString()} rows × ${columns.length} columns = ${(rows.length*columns.length).toLocaleString()} data points. ${rows.length<100?'Small sample size.':rows.length>10000?'Large dataset — patterns are reliable.':'Good working size.'}` });

  return insights;
}

function buildChartData(rows, report) {
  const columns = Object.keys(report);
  const numCols = columns.filter(c => report[c].type === 'numeric');
  const catCols = columns.filter(c => report[c].type === 'categorical');
  const charts = [];

  if (catCols.length && numCols.length) {
    const catCol=catCols[0], numCol=numCols[0];
    const groups={};
    rows.forEach(r=>{ const k=String(r[catCol]||'Unknown'); groups[k]=(groups[k]||0)+Number(r[numCol]||0); });
    const sorted=Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,10);
    charts.push({ type:'bar', title:`${numCol} by ${catCol}`, labels:sorted.map(e=>e[0]), data:sorted.map(e=>+e[1].toFixed(2)), xLabel:catCol, yLabel:numCol });
  }

  if (numCols.length) {
    const col=numCols[0];
    const vals=rows.map(r=>Number(r[col])).filter(v=>!isNaN(v));
    const min=Math.min(...vals), max=Math.max(...vals);
    const bins=Math.min(10,Math.ceil(Math.sqrt(vals.length)));
    const binSize=(max-min)/bins||1;
    const counts=Array(bins).fill(0);
    vals.forEach(v=>{ const i=Math.min(Math.floor((v-min)/binSize),bins-1); counts[i]++; });
    charts.push({ type:'histogram', title:`Distribution of ${col}`, labels:counts.map((_,i)=>+(min+i*binSize).toFixed(2)), data:counts, xLabel:col, yLabel:'Frequency' });
  }

  if (catCols.length) {
    const col=catCols[0];
    const top=report[col].topValues?.slice(0,6)||[];
    if(top.length) charts.push({ type:'doughnut', title:`${col} Breakdown`, labels:top.map(t=>t.value), data:top.map(t=>t.count) });
  }

  if (numCols.length >= 2) {
    const col1=numCols[0], col2=numCols[1];
    const sample=rows.slice(0,30);
    charts.push({ type:'line', title:`${col1} vs ${col2} Trend`, labels:sample.map((_,i)=>`#${i+1}`), datasets:[{label:col1,data:sample.map(r=>Number(r[col1])||0)},{label:col2,data:sample.map(r=>Number(r[col2])||0)}] });
  }

  if (numCols.length >= 2) {
    const col1=numCols[0], col2=numCols[1];
    charts.push({ type:'scatter', title:`${col1} vs ${col2} Scatter`, data:rows.slice(0,80).map(r=>({x:Number(r[col1])||0,y:Number(r[col2])||0})), xLabel:col1, yLabel:col2 });
  }

  return charts;
}

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const rows = parseFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ error: 'File is empty or unreadable' });
    const analysis = analyzeData(rows);
    res.json({ success: true, filename: req.file.originalname, rowCount: rows.length, preview: rows.slice(0, 10), analysis, rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clean', (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows?.length) return res.status(400).json({ error: 'No data to clean' });
    const cleaned = cleanData(rows);
    const analysis = analyzeData(cleaned);
    res.json({ success: true, cleaned, rowCount: cleaned.length, analysis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/insights', (req, res) => {
  try {
    const { rows, report } = req.body;
    if (!rows || !report) return res.status(400).json({ error: 'Missing data' });
    const insights = generateInsights(rows, report);
    const charts = buildChartData(rows, report);
    res.json({ success: true, insights, charts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { question, context, history } = req.body;
    if (!question) return res.status(400).json({ error: 'No question provided' });
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

    if (!ANTHROPIC_KEY) {
      const q = question.toLowerCase();
      let answer = "No API key found. Add ANTHROPIC_API_KEY as an environment variable for AI-powered answers.";
      if (context) {
        const { rowCount, colCount, qualityScore, columns, report } = context;
        const numCols = columns?.filter(c=>report?.[c]?.type==='numeric')||[];
        if (q.includes('row')||q.includes('size')) answer=`Your dataset has ${rowCount?.toLocaleString()} rows and ${colCount} columns.`;
        else if (q.includes('quality')||q.includes('score')) answer=`Quality score: ${qualityScore}%. ${qualityScore>=80?'Great quality!':qualityScore>=60?'Moderate — some cleaning needed.':'Needs significant cleaning.'}`;
        else if (q.includes('column')||q.includes('field')) answer=`${colCount} columns: ${columns?.join(', ')}.`;
        else if (q.includes('outlier')) answer=numCols.length?`Outliers: ${numCols.map(c=>`${c}: ${report[c].outliers||0}`).join(', ')}`:'No numeric columns.';
        else if (q.includes('missing')||q.includes('null')) answer=`Missing: ${columns?.filter(c=>report?.[c]?.nullCount>0).map(c=>`${c} (${report[c].nullPct}%)`).join(', ')||'None — great!'}`;
        else if (q.includes('mean')||q.includes('average')) answer=numCols.length?`Means: ${numCols.map(c=>`${c}=${report[c].mean}`).join(', ')}`:'No numeric columns.';
        else answer=`Dataset: ${rowCount?.toLocaleString()} rows × ${colCount} columns, ${qualityScore}% quality. Ask me about columns, outliers, missing values, or statistics!`;
      }
      return res.json({ answer });
    }

    const messages = [];
    if (history?.length) history.slice(-10).forEach(h=>messages.push({role:h.role,content:h.content}));
    messages.push({ role:'user', content:question });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':ANTHROPIC_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `You are DataLens AI, an expert data analyst. Analyze the user's dataset and provide concise, insightful answers (2-4 sentences). Reference specific numbers. Suggest actions when relevant.\n\nDataset context:\n${JSON.stringify(context, null, 2)}`,
        messages
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    res.json({ answer: data.content?.[0]?.text || 'Could not generate answer.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (_, res) => res.json({ status:'ok', version:'2.0.0', ai:!!process.env.ANTHROPIC_API_KEY }));
app.listen(PORT, () => console.log(`✅ DataLens AI v2 running at http://localhost:${PORT}`));
