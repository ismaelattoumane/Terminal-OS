/**
 * Shim ESM pour `@prisma/client` (CommonJS sans exports nommés détectables).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const prismaClient = require("@prisma/client");
export const PrismaClient = prismaClient.PrismaClient;
export default prismaClient;