import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * The commit the page is built from, for the Export: the full id, with "-dirty" when files other than the built
 * page itself differ from that commit (then the page is not exactly that commit's), or "unknown" outside git.
 */
function buildCommit(): string {
  try {
    const id = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const changes = execSync("git status --porcelain --untracked-files=normal -- . ':(exclude)play/testlines.html' ':(exclude)dist'", {
      encoding: 'utf8',
    }).trim();
    return changes ? `${id}-dirty` : id;
  } catch {
    return 'unknown';
  }
}

// One self-contained HTML file: it opens by double-click, with no server and no network.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  define: { __BUILD_COMMIT__: JSON.stringify(buildCommit()) },
  build: { target: 'es2020', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000 },
});
