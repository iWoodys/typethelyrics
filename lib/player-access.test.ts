import { describe, expect, it } from "vitest";
import { playerAccessState } from "./player-access";

describe("acceso a las partidas", () => {
  it("espera a que Supabase resuelva la sesión", () => {
    expect(playerAccessState(false, null)).toBe("checking");
  });

  it("bloquea a visitantes sin una cuenta iniciada", () => {
    expect(playerAccessState(true, null)).toBe("signed-out");
  });

  it("permite jugar a usuarios autenticados", () => {
    expect(playerAccessState(true, "user-id")).toBe("allowed");
  });
});
