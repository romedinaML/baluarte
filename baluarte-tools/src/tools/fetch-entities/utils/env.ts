import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

export const FIGMA_API_URL = "https://api.figma.com";

export function getFigmaToken(): string {
  const token = process.env.FIGMA_API;
  if (!token) {
    throw new Error("FIGMA_API is not set. Add it to baluarte-tools/.env");
  }
  return token;
}
