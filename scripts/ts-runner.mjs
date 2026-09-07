/**
 * Chargeur Node pour exécuter les scripts TypeScript du projet (test de
 * scénario) avec l'alias `@/` résolu et le stripping de types natif de Node.
 *
 * Usage :
 *   node --env-file=.env --import ./scripts/ts-runner.mjs scripts/scenario-google.ts
 */
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

const ROOT = pathToFileURL(`${process.cwd()}/`).href;

function rewrite(specifier, context) {
  if (specifier.startsWith("@/")) {
    let target = new URL(specifier.slice(2), ROOT).href;
    const filePath = target.replace("file://", "");
    if (!path.extname(filePath)) target = `${target}.ts`;
    return target;
  }
  if (specifier.startsWith(".") && !path.extname(specifier) && !/\.(m?js|ts|json)$/.test(specifier)) {
    // N'ajoute .ts que si aucun .js réel n'existe (évite de casser les modules CJS).
    const parentPath = contextDirOf(context);
    const tsCandidate = path.resolve(parentPath, `${specifier}.ts`);
    if (existsSync(tsCandidate)) return `${specifier}.ts`;
  }
  return specifier;
}

let currentContextDir = process.cwd();
function contextDirOf(context) {
  const parent = String(context?.parentURL ?? "");
  if (parent.startsWith("file://")) return path.dirname(parent.replace("file://", ""));
  return currentContextDir;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Le shim CJS d'entrée ne doit pas être réintercepté (sinon cycle).
    if (specifier === "@prisma/client" && !String(context.parentURL ?? "").includes("prisma-shim.mjs")) {
      return { url: pathToFileURL(path.join(process.cwd(), "scripts/prisma-shim.mjs")).href, format: "module", shortCircuit: true };
    }
    const rewritten = rewrite(specifier, context);
    if (rewritten !== specifier && !specifier.includes("://")) return nextResolve(rewritten, context);
    return nextResolve(specifier, context);
  },
});

export {};