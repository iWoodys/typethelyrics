import { describe, expect, it } from "vitest";
import { isMobileSiteHostname, isMobileSiteLocation } from "./mobile-site";

describe("mobile site detection", () => {
  it("detecta el subdominio móvil de producción", () => {
    expect(isMobileSiteHostname("m.typethelyrics.sbs")).toBe(true);
    expect(isMobileSiteHostname("M.TYPETHELYRICS.SBS.")).toBe(true);
  });

  it("no confunde el dominio principal ni dominios parecidos", () => {
    expect(isMobileSiteHostname("typethelyrics.sbs")).toBe(false);
    expect(isMobileSiteHostname("m.typethelyrics.sbs.example.com")).toBe(false);
  });

  it("permite probar la interfaz móvil localmente", () => {
    expect(isMobileSiteLocation("localhost", "?mobile=1")).toBe(true);
    expect(isMobileSiteLocation("localhost", "?mobile=0")).toBe(false);
    expect(isMobileSiteHostname("m.localhost:3000")).toBe(true);
  });

  it("activa la interfaz móvil en ventanas angostas", () => {
    expect(isMobileSiteLocation("typethelyrics.sbs", "", 390)).toBe(true);
    expect(isMobileSiteLocation("typethelyrics.sbs", "", 1024)).toBe(false);
  });
});
