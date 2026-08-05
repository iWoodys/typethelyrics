import { describe, expect, it } from "vitest";
import { shouldRedirectToMobileSite } from "./mobile-redirect";

describe("mobile site redirect", () => {
  it("envia telefonos desde www y el dominio raiz al sitio movil", () => {
    expect(
      shouldRedirectToMobileSite(
        "www.typethelyrics.sbs",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148",
      ),
    ).toBe(true);
    expect(
      shouldRedirectToMobileSite(
        "typethelyrics.sbs",
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36",
      ),
    ).toBe(true);
  });

  it("respeta el client hint movil aunque el navegador use un agente generico", () => {
    expect(
      shouldRedirectToMobileSite(
        "www.typethelyrics.sbs:443",
        "Mozilla/5.0 AppleWebKit/537.36 Safari/537.36",
        "?1",
      ),
    ).toBe(true);
  });

  it("no redirige computadoras, bots ni el propio subdominio movil", () => {
    expect(
      shouldRedirectToMobileSite(
        "www.typethelyrics.sbs",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      ),
    ).toBe(false);
    expect(
      shouldRedirectToMobileSite(
        "www.typethelyrics.sbs",
        "Mozilla/5.0 (Linux; Android 15) Googlebot/2.1 Mobile",
      ),
    ).toBe(false);
    expect(
      shouldRedirectToMobileSite(
        "m.typethelyrics.sbs",
        "Mozilla/5.0 (iPhone) Mobile/15E148",
      ),
    ).toBe(false);
  });
});
