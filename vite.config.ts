import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = dirname(fileURLToPath(import.meta.url));
/** Everything but the built page itself (and Vite's output folder). */
const SOURCES = ". ':(exclude)play/testlines.html' ':(exclude)dist'";

/**
 * The commit the page is built from, for the Export: the last commit that changed anything other than the built page
 * (so committing the page alone, or building again after that, names the same commit), with "-dirty" when files
 * other than the page differ from it (then the page is not exactly that commit's), or "unknown" outside git.
 */
function buildCommit(): string {
  const git = (args: string) => execSync(`git ${args}`, { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const id = git(`log -1 --format=%H -- ${SOURCES}`);
    if (!id) return 'unknown';
    return git(`status --porcelain --untracked-files=normal -- ${SOURCES}`) ? `${id}-dirty` : id;
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
