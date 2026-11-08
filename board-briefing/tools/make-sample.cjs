// Writes the made-up sample questions file used by the "Try the sample" button and the README.
// Run:  node tools/make-sample.cjs
const fs = require('node:fs');
const path = require('node:path');
const D = require('../js/engine/data.js');

const now = new Date(2026, 9, 31, 23, 59); // data runs through 31 October 2026
const sample = D.generateOpsSample(now, 20261031, 215);
const csv = D.toCSV(sample.rows, D.EXPORT_COLUMNS);
const out = path.join(__dirname, '..', 'sample', 'sample-questions.csv');
fs.writeFileSync(out, csv);
console.log('Wrote', out, '(' + sample.rows.length + ' made-up questions)');
