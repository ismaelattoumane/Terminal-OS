/**
 * Génère un cookie de session next-auth v4 (JWE, comme une vraie connexion)
 * pour piloter les routes API réelles en test E2E.
 * Usage : node --env-file=.env scripts/make-session.mjs [email]
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { encode } = require("next-auth/jwt");

const email = process.argv[2] ?? "scenario-e2e@terminal-os.local";
const secret = process.env.NEXTAUTH_SECRET;
if (!secret) {
  console.error("NEXTAUTH_SECRET manquant");
  process.exit(1);
}

const token = await encode({
  secret,
  token: { sub: email, email, name: "Scénario E2E", picture: null },
  maxAge: 30 * 24 * 60 * 60,
});

console.log(token);