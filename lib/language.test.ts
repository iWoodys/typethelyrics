import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoots = ["app", "components", "lib"];
const regionalForms =
  /(?<!\p{L})(?:aceptás|sos|tenés|podés|querés|poseés|quedás|aprendé|buscá|competí|completá|conectá|continuá|corregí|dejá|desactivá|descargá|deshacé|dividí|ejecutá|elegí|eliminá|escribí|esperá|guardá|importá|ingresá|iniciá|invitá|marcá|pegá|prepará|presioná|probá|pulsá|recargá|reiniciá|reintentá|reproducí|revisá|seguí|sentí|solicitá|terminá|tocá|uní|usá|verificá|volvé|registrate|abrilo|buscala|acá|retomá)(?!\p{L})/iu;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(?:ts|tsx)$/.test(entry) || entry.endsWith(".test.ts")) return [];
    return [path];
  });
}

describe("español internacional", () => {
  it("no incluye formas de voseo en los textos de la aplicación", () => {
    const offenders = sourceRoots
      .flatMap(sourceFiles)
      .filter((path) => regionalForms.test(readFileSync(path, "utf8")));

    expect(offenders).toEqual([]);
  });

  it("no conserva una configuración regional argentina", () => {
    const source = sourceRoots
      .flatMap(sourceFiles)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/es[_-]AR|market=AR/);
  });
});
