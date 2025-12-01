import { useState, useMemo, useEffect } from 'react';
import logo from './logo.svg';
import './App.css';

function App() {
  const [attendance, setAttendance] = useState(90);        // percent 0-100
  const [studyHours, setStudyHours] = useState(12);        // hours per week
  const [parentEdu, setParentEdu] = useState(2);           // scale 0-4
  const [income,   setIncome]   = useState(1);             // scale 0-3
  const [extracurricular, setExtracurricular] = useState(4); // scale 0-5
  const [resources, setResources] = useState(3);           // scale 0-5
  const [internet, setInternet] = useState(true);          // boolean
  const [tutoring, setTutoring] = useState(false);         // boolean

  const [forestModel, setForestModel] = useState(null);
  const [modelError, setModelError] = useState(null);

  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL}/model/forest.json`)
      .then(res => res.json())
      .then(setForestModel)
      .catch(err => setModelError(err?.message || 'Failed to load forest model'));
  }, []);

  const evalTree = (node, features) => {
    let n = node;
    while (n) {
      if (typeof n.value === 'number') return n.value; // leaf node
      const f = features[n.featureIndex];
      n = f <= n.threshold ? n.left : n.right;
    }
    return 0;
  };

  const evalForest = (features, forest) => {
    if (!forest || !Array.isArray(forest.trees) || forest.trees.length === 0) return null;
    const preds = forest.trees.map(t => evalTree(t, features));
    const avg = preds.reduce((a, b) => a + b, 0) / preds.length;
    return avg;
  };

  const rfFeatures = useMemo(() => ([
    attendance,
    studyHours,
    parentEdu,
    income,
    extracurricular,
    resources,
    internet ? 1 : 0,
    tutoring ? 1 : 0,
  ]), [attendance, studyHours, parentEdu, income, extracurricular, resources, internet, tutoring]);

  const predictedScore = useMemo(() => {
    const rf = evalForest(rfFeatures, forestModel);
    if (rf !== null && Number.isFinite(rf)) {
      const clamped = Math.max(0, Math.min(100, rf));
      return Math.round(clamped);
    }

    const studyImpact = Math.min(studyHours, 30) / 30;          // 0..1
    const parentEduNorm = Math.min(Math.max(parentEdu, 0), 4) / 4;
    const incomeNorm = Math.min(Math.max(income, 0), 3) / 3;
    const extraNorm = Math.min(Math.max(extracurricular, 0), 5) / 5;
    const resourcesNorm = Math.min(Math.max(resources, 0), 5) / 5;

    let score =
      attendance * 0.55 +
      studyImpact * 25 +
      parentEduNorm * 5 +
      incomeNorm * 5 +
      extraNorm * 5 +
      resourcesNorm * 5 +
      (internet ? 3 : 0) +
      (tutoring ? 7 : 0);

    score = Math.max(0, Math.min(100, score));
    return Math.round(score);
  }, [rfFeatures, forestModel, attendance, studyHours, parentEdu, income, extracurricular, resources, internet, tutoring]);

  const grade = useMemo(() => {
    if (predictedScore >= 90) return 'A';
    if (predictedScore >= 80) return 'B';
    if (predictedScore >= 70) return 'C';
    if (predictedScore >= 60) return 'D';
    return 'F';
  }, [predictedScore]);

  const risk = useMemo(() => {
    if (predictedScore >= 80) return 'Low';
    if (predictedScore >= 60) return 'Medium';
    return 'High';
  }, [predictedScore]);

  const progressDeg = (predictedScore / 100) * 360;

  const [actualGrade, setActualGrade] = useState('B');
  const gradeLabels = useMemo(() => ['A', 'B', 'C', 'D', 'F'], []);
  const [evalRecords, setEvalRecords] = useState([]);

  const addEvalRecord = () => {
    setEvalRecords(prev => [...prev, { actual: actualGrade, predicted: grade }]);
  };

  const clearEvalRecords = () => setEvalRecords([]);

  const confusionMatrix = useMemo(() => {
    const n = gradeLabels.length;
    const idx = Object.fromEntries(gradeLabels.map((g, i) => [g, i]));
    const mat = Array.from({ length: n }, () => Array(n).fill(0));
    for (const r of evalRecords) {
      const ai = idx[r.actual];
      const pi = idx[r.predicted];
      if (ai !== undefined && pi !== undefined) {
        mat[ai][pi] += 1;
      }
    }
    return mat;
  }, [evalRecords, gradeLabels]);

  const metrics = useMemo(() => {
    const mat = confusionMatrix;
    const n = gradeLabels.length;
    let total = 0, correct = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        total += mat[i][j];
        if (i === j) correct += mat[i][j];
      }
    }
    const accuracy = total ? correct / total : 0;

    const precisions = [], recalls = [], f1s = [];
    for (let k = 0; k < n; k++) {
      const tp = mat[k][k];
      let fp = 0, fn = 0;
      for (let i = 0; i < n; i++) {
        if (i !== k) {
          fp += mat[i][k]; 
          fn += mat[k][i]; 
        }
      }
      const precision = (tp + fp) ? tp / (tp + fp) : 0;
      const recall = (tp + fn) ? tp / (tp + fn) : 0;
      const f1 = (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0;
      precisions.push(precision);
      recalls.push(recall);
      f1s.push(f1);
    }

    const macro = {
      precision: n ? (precisions.reduce((a, b) => a + b, 0) / n) : 0,
      recall:    n ? (recalls.reduce((a, b) => a + b, 0) / n) : 0,
      f1:        n ? (f1s.reduce((a, b) => a + b, 0) / n) : 0,
    };

    return { accuracy, precisions, recalls, f1s, macro };
  }, [confusionMatrix, gradeLabels]);

  const handleReset = () => {
    setAttendance(0);
    setStudyHours(0);
    setParentEdu(0);
    setIncome(0);
    setExtracurricular(0);
    setResources(0);
    setInternet(false);
    setTutoring(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 60%, #a78bfa 100%)', padding: 24, paddingBottom: "50px" }}>
      
      <h1 style={{
        color: "white",
        textAlign: "center",
        marginBottom: "50px"
      }}>Predicting Students' Performance using Socioeconomic and Attendance Data</h1>

      <aside style={{ background: '#ffffff', borderRadius: 16, padding: 20, marginBottom: 20, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>Enter Inputs</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(240px, 1fr))', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Attendance (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={attendance}
              onChange={e => setAttendance(Number(e.target.value))}
              style={{padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb'}}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Study hours/week</span>
            <input
              type="number"
              min={0}
              max={30}
              value={studyHours}
              onChange={e => setStudyHours(Number(e.target.value))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Parent education level</span>
            <select
              value={parentEdu}
              onChange={e => setParentEdu(Number(e.target.value))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
            >
              <option value={0}>No formal</option>
              <option value={1}>Secondary</option>
              <option value={2}>Diploma</option>
              <option value={3}>Graduate</option>
              <option value={4}>Postgraduate</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Household income</span>
            <select
              value={income}
              onChange={e => setIncome(Number(e.target.value))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
            >
              <option value={0}>Low</option>
              <option value={1}>Lower-Middle</option>
              <option value={2}>Upper-Middle</option>
              <option value={3}>High</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Extracurricular (0-5)</span>
            <input
              type="number"
              min={0}
              max={5}
              value={extracurricular}
              onChange={e => setExtracurricular(Number(e.target.value))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Resources (0-5)</span>
            <input
              type="number"
              min={0}
              max={5}
              value={resources}
              onChange={e => setResources(Number(e.target.value))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={internet}
              onChange={e => setInternet(e.target.checked)}
            />
            <span style={{ fontSize: 13, color: '#374151' }}>Internet access</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={tutoring}
              onChange={e => setTutoring(e.target.checked)}
            />
            <span style={{ fontSize: 13, color: '#374151' }}>Tutoring support</span>
          </label>
        </div>
      </aside>
      
      <aside style={{ background: '#ffffff', borderRadius: 16, padding: 20, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>Prediction</h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 160 }}>
            <div style={{
              width: 140, height: 140, borderRadius: '50%',
              background: `conic-gradient(#4f46e5 ${progressDeg}deg, #e5e7eb ${progressDeg}deg)`,
              display: 'grid', placeItems: 'center'
            }}>
              <div style={{
                width: 110, height: 110, borderRadius: '50%',
                background: '#ffffff',
                display: 'grid', placeItems: 'center',
                boxShadow: 'inset 0 0 12px rgba(0,0,0,0.06)'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#111827' }}>{predictedScore}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Score</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <span style={{
                background: '#eef2ff', color: '#4338ca',
                padding: '6px 10px', borderRadius: 999,
                fontSize: 12, fontWeight: 700
              }}>
                Grade: {grade}
              </span>

              <span style={{
                background: risk === 'Low' ? '#dcfce7' : risk === 'Medium' ? '#fef9c3' : '#fee2e2',
                color: risk === 'Low' ? '#166534' : risk === 'Medium' ? '#92400e' : '#991b1b',
                padding: '6px 10px', borderRadius: 999,
                fontSize: 12, fontWeight: 700
              }}>
                Risk: {risk}
              </span>
            </div>

            <div style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>
              Based on your inputs, performance is predicted to be <strong>{predictedScore}%</strong>
              (grade <strong>{grade}</strong>) with <strong>{risk}</strong> risk of underperformance.
            </div>

            <ul style={{ marginTop: 12, paddingLeft: 16, color: '#374151', fontSize: 13 }}>
              <li>Increase weekly study time to improve the score.</li>
              <li>Maintain high attendance; it has the largest impact.</li>
              <li>Leverage school resources and consider tutoring support.</li>
            </ul>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={handleReset}
                style={{
                  padding: '10px 14px', borderRadius: 10, border: 'none',
                  background: '#4f46e5', color: '#fff', fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 6px 14px rgba(79,70,229,0.35)'
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </aside>

      <aside style={{ background: '#ffffff', borderRadius: 16, padding: 20, boxShadow: '0 10px 25px rgba(0,0,0,0.15)', marginTop: 20 }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>Evaluation</h2>

        <div style={{ color: '#374151', fontSize: 18, lineHeight: 1.5, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ background: '#eff6ff', color: '#1e40af', padding: '6px 10px', borderRadius: 8, fontSize: 18, fontWeight: 700 }}>
              Accuracy: {(metrics.accuracy * 100).toFixed(1)}%
            </span>
            <span style={{ background: '#f0fdf4', color: '#166534', padding: '6px 10px', borderRadius: 8, fontSize: 18, fontWeight: 700 }}>
              Precision (macro): {(metrics.macro.precision * 100).toFixed(1)}%
            </span>
            <span style={{ background: '#fef3c7', color: '#92400e', padding: '6px 10px', borderRadius: 8, fontSize: 18, fontWeight: 700 }}>
              Recall (macro): {(metrics.macro.recall * 100).toFixed(1)}%
            </span>
            <span style={{ background: '#fae8ff', color: '#6b21a8', padding: '6px 10px', borderRadius: 8, fontSize: 18, fontWeight: 700 }}>
              F1-score (macro): {(metrics.macro.f1 * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default App;
