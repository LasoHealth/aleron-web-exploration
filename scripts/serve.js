// Local static server for reviewing the wireframe set.
// `npm start`, then open http://localhost:4173
// Not part of the deliverable; the screens are plain files you can also just
// open directly. This exists because a file:// page cannot be screenshotted
// by the review tooling.
const express = require('express');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 4173;

express()
  .use(express.static(ROOT, {
    extensions: ['html'],
    // BRIEF.md and README.md are read in the browser alongside the screens.
    // Their registered type is text/markdown, which browsers download.
    setHeaders: (res, file) => {
      if (file.endsWith('.md')) res.type('text/plain; charset=utf-8');
    },
  }))
  .listen(PORT, () => console.log('Wireframes on http://localhost:' + PORT));
