#!/usr/bin/env node

import fs from 'fs';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TabStopPosition, TabStopType,
} from 'docx';

const md = fs.readFileSync('/home/user/ai-procurement-backend/audit/2026-05-08-platform-audit.md', 'utf8');
const lines = md.split('\n');

const children = [];

function text(t, opts = {}) {
  return new TextRun({ text: t, font: 'Calibri', size: 22, ...opts });
}

function heading(level, t) {
  const map = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  };
  return new Paragraph({
    heading: map[level] || HeadingLevel.HEADING_3,
    spacing: { before: level === 1 ? 400 : 240, after: 120 },
    children: [text(t, { bold: true, size: level === 1 ? 36 : level === 2 ? 28 : 24 })],
  });
}

function bodyPara(runs, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: runs,
  });
}

function parseLine(line) {
  const runs = [];
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(text(part.slice(2, -2), { bold: true }));
    } else if (part.startsWith('`') && part.endsWith('`')) {
      runs.push(text(part.slice(1, -1), { font: 'Consolas', size: 20 }));
    } else {
      runs.push(text(part));
    }
  }
  return runs;
}

let i = 0;
while (i < lines.length) {
  const line = lines[i];

  if (line.startsWith('# ')) {
    children.push(heading(1, line.replace(/^# /, '')));
  } else if (line.startsWith('## ')) {
    children.push(heading(2, line.replace(/^## /, '')));
  } else if (line.startsWith('### ')) {
    children.push(heading(3, line.replace(/^### /, '')));
  } else if (line === '---') {
    children.push(new Paragraph({
      spacing: { before: 200, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
      children: [],
    }));
  } else if (line.startsWith('- ')) {
    children.push(new Paragraph({
      spacing: { after: 60 },
      bullet: { level: 0 },
      children: parseLine(line.replace(/^- /, '')),
    }));
  } else if (line.match(/^\d+\.\s/)) {
    children.push(new Paragraph({
      spacing: { after: 60 },
      numbering: { reference: 'ordered-list', level: 0 },
      children: parseLine(line.replace(/^\d+\.\s/, '')),
    }));
  } else if (line.trim() === '') {
    // skip blank lines
  } else {
    children.push(bodyPara(parseLine(line)));
  }

  i++;
}

const doc = new Document({
  numbering: {
    config: [{
      reference: 'ordered-list',
      levels: [{
        level: 0,
        format: 'decimal',
        text: '%1.',
        alignment: AlignmentType.START,
      }],
    }],
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      },
    },
    children,
  }],
});

const buffer = await Packer.toBuffer(doc);
const out = '/home/user/ai-procurement-backend/audit/2026-05-08-platform-audit.docx';
fs.writeFileSync(out, buffer);
console.log(`Written to ${out} (${(buffer.length / 1024).toFixed(0)} KB)`);
