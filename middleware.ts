import { NextRequest, NextResponse } from "next/server";
import { shouldRedirectToMobileSite } from "@/lib/mobile-redirect";

const MOBILE_ORIGIN = "https://m.typethelyrics.sbs";

export function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostname = forwardedHost || request.headers.get("host") || request.nextUrl.hostname;
  const userAgent = request.headers.get("user-agent") || "";
  const mobileClientHint = request.headers.get("sec-ch-ua-mobile") || "";

  if (shouldRedirectToMobileSite(hostname, userAgent, mobileClientHint)) {
    const destination = new URL(request.nextUrl.pathname + request.nextUrl.search, MOBILE_ORIGIN);
    const response = NextResponse.redirect(destination, 307);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "User-Agent, Sec-CH-UA-Mobile");
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("Accept-CH", "Sec-CH-UA-Mobile");
  response.headers.set("Vary", "User-Agent, Sec-CH-UA-Mobile");
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|robots.txt|sitemap.xml).*)",
  ],
};
