'use strict';
// Cálculo de promedios ponderados (escala chilena 1.0 – 7.0)

function round1(x) {
  return Math.round(x * 10 + 1e-9) / 10;
}

// evaluations: [{id, weight}], gradeOf: (evalId) => number|undefined
function weightedAverage(evaluations, gradeOf) {
  let sum = 0;
  let w = 0;
  let plainSum = 0;
  let plainCount = 0;
  for (const ev of evaluations) {
    const g = gradeOf(ev.id);
    if (g == null) continue;
    const weight = Number(ev.weight) || 0;
    sum += g * weight;
    w += weight;
    plainSum += g;
    plainCount++;
  }
  if (w > 0) return round1(sum / w);
  if (plainCount > 0) return round1(plainSum / plainCount); // sin porcentajes: promedio simple
  return null;
}

function mean(values) {
  const v = values.filter((x) => x != null);
  if (!v.length) return null;
  return round1(v.reduce((a, b) => a + b, 0) / v.length);
}

module.exports = { round1, weightedAverage, mean };
