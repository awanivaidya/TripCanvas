// A `route.ts` file is an API endpoint instead of a page.
// The folder name [...nextauth] is a "catch-all": it matches every URL under /api/auth/,
// e.g. /api/auth/signin, /api/auth/callback/google, /api/auth/session.
// Auth.js handles all of them; we just hand over its handlers.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
