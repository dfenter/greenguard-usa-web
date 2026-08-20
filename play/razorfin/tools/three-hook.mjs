// Node resolve hook mirroring the browser importmap: "three" -> vendored module.
// Path-relative so it works from any git worktree.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const THREE = pathToFileURL(path.resolve(here, '../../_shared/three/three.module.min.js')).href;
export function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: THREE, shortCircuit: true };
  return next(spec, ctx);
}
