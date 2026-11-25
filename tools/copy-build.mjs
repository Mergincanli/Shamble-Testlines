// Copies the single-file build to play/testlines.html, the file that is sent and opened by double-click.
import { copyFileSync, statSync } from 'node:fs';
copyFileSync('dist/index.html', 'play/testlines.html');
console.log(`play/testlines.html: ${(statSync('play/testlines.html').size / 1024).toFixed(0)} KB`);
