import { marked } from 'marked';
import { readFileSync, writeFileSync } from 'fs';

const md = readFileSync('docs/ENGINEERING.md', 'utf8');

// Pull mermaid blocks out so marked doesn't escape them.
const mermaidBlocks = [];
const mdPrepared = md.replace(/```mermaid\r?\n([\s\S]*?)```/g, (unused, code) => {
  mermaidBlocks.push(code);
  return `<div class="mermaid">${code}</div>`;
});

const body = marked.parse(mdPrepared, { mangle: false, headerIds: false });

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>TerraRun — Engineering Document</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 10.5pt; color: #1c2430; line-height: 1.55; max-width: 180mm; margin: 0 auto; }
  .cover { text-align: center; padding-top: 70mm; page-break-after: always; }
  .cover h1 { font-size: 30pt; color: #1e5631; border: none; margin-bottom: 4mm; }
  .cover .sub { font-size: 13pt; color: #5a6676; }
  .cover .meta { margin-top: 30mm; font-size: 10pt; color: #5a6676; }
  h1 { font-size: 17pt; color: #1e5631; border-bottom: 2px solid #1e5631; padding-bottom: 2mm; margin-top: 0; }
  h2 { font-size: 13.5pt; color: #1e5631; margin-top: 8mm; page-break-after: avoid; }
  h3 { font-size: 11.5pt; color: #2a4734; page-break-after: avoid; }
  h2 { page-break-before: always; }
  h2:first-of-type { page-break-before: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid #c9d2c5; padding: 1.6mm 2.5mm; text-align: left; vertical-align: top; }
  th { background: #eef4ea; color: #1e5631; }
  tr { page-break-inside: avoid; }
  code { font-family: Consolas, monospace; font-size: 9pt; background: #f0f3ee; padding: 0 2px; border-radius: 3px; }
  pre { background: #f0f3ee; border: 1px solid #d8e0d4; border-radius: 6px; padding: 3mm; font-size: 8.5pt; overflow-x: hidden; white-space: pre-wrap; page-break-inside: avoid; }
  pre code { background: none; padding: 0; }
  .mermaid { text-align: center; margin: 4mm 0; page-break-inside: avoid; }
  .mermaid svg { max-width: 100%; height: auto; }
  blockquote { border-left: 3px solid #1e5631; margin-left: 0; padding-left: 4mm; color: #5a6676; }
  hr { border: none; border-top: 1px solid #d8e0d4; margin: 6mm 0; }
  a { color: #1e5631; text-decoration: none; }
  li { margin: 1mm 0; }
</style>
</head>
<body>
<div class="cover">
  <h1>TerraRun</h1>
  <div class="sub">Engineering Document — Architecture, Logic &amp; Interfaces</div>
  <div class="sub" style="margin-top:6mm">Territory-control game for runners</div>
  <div class="meta">
    Version 0.2.0 · ${new Date().toISOString().slice(0, 10)}<br/>
    https://dimaklit.github.io/TerraRun/ · github.com/dimaklit/TerraRun<br/><br/>
    Prepared for engineering review
  </div>
</div>
${body}
<script>
  mermaid.initialize({ startOnLoad: true, theme: 'neutral', flowchart: { useMaxWidth: true } });
</script>
</body>
</html>`;

writeFileSync('docs/.engineering-print.html', html);
console.log('html written');
