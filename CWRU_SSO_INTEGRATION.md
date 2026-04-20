# CWRU SSO Integration Guide

A complete, self-contained guide for integrating **Case Western Reserve University Single Sign-On (CWRU SSO)** into a web application. CWRU uses the **CAS 2.0 (Central Authentication Service)** protocol hosted at `https://login.case.edu/cas`.

This document is extracted from a production Next.js 16 / Prisma / Postgres app but the protocol flow and contract are framework-agnostic — it works equally well in Express, Rails, Django, Spring, Go, etc.

---

## 1. Overview

CWRU SSO is a **CAS 2.0** server. The integration is a standard 3-leg redirect flow:

1. User clicks "Sign in with CWRU SSO" → your app redirects them to `login.case.edu/cas/login?service=<callback>`.
2. User authenticates on the CWRU-hosted login page (username / password / Duo MFA — all handled by CWRU).
3. CWRU redirects the browser back to your `service` callback URL with a one-time `ticket` query parameter.
4. Your server makes a **server-to-server** `GET` request to `login.case.edu/cas/serviceValidate` with that ticket to receive an XML response containing the user's identity attributes.
5. You upsert the user in your DB, issue your own session (JWT cookie in our case), and redirect to the app.

```
┌─────────┐      1. /login        ┌──────────┐
│ Browser │ ────────────────────> │ Your App │
│         │                       └────┬─────┘
│         │   2. 302 to CAS login      │
│         │ <──────────────────────────┘
│         │
│         │   3. GET login.case.edu/cas/login?service=<cb>
│         │ ─────────────────────────────────────────────> ┌──────────┐
│         │                                                │ CWRU CAS │
│         │   4. Login UI + Duo MFA                        │  Server  │
│         │ <───────────────────────────────────────────── └────┬─────┘
│         │                                                     │
│         │   5. 302 back to <cb>?ticket=ST-xxx                 │
│         │ <───────────────────────────────────────────────────┘
│         │
│         │   6. GET /api/auth/cwru-sso-callback?ticket=ST-xxx  ┌──────────┐
│         │ ─────────────────────────────────────────────────>  │ Your App │
│         │                                                     └────┬─────┘
│         │                                 7. serviceValidate ──────┤
│         │                                    (server → CAS)        │
│         │                                 8. XML with attrs ←──────┤
│         │                                                          │
│         │   9. Set-Cookie: auth-token=<jwt>; 302 /                 │
│         │ <────────────────────────────────────────────────────────┘
└─────────┘
```

## 2. CWRU CAS Endpoints

| Purpose | URL | Method |
|---|---|---|
| Login (redirect user here) | `https://login.case.edu/cas/login` | Browser GET |
| Ticket validation (CAS 2.0) | `https://login.case.edu/cas/serviceValidate` | Server-side GET |
| Logout | `https://login.case.edu/cas/logout` | Browser GET |

Both login and serviceValidate require a `service` parameter that is the **URL-encoded callback URL on your application**. The `service` value used at login must match **exactly, character for character** the `service` value used at serviceValidate — same scheme, same host, same path, and in particular no trailing `/` drift. If they don't match, CAS returns `INVALID_SERVICE`.

### 2.1 Requesting release of user attributes

By default CWRU's CAS only returns the case network ID (e.g. `abc123`) inside `<cas:user>`. To receive email, first name, and last name attributes, your application's CAS service URL **must be pre-registered by CWRU's UTech team** with attribute release enabled. Until that is set up, your `serviceValidate` response will only contain `<cas:user>` and no attribute block.

Contact: CWRU [UTech Help Desk](https://case.edu/utech) / `help@case.edu`. Provide:
- Your application name and purpose
- The exact callback URL(s) you'll register as the `service` (include dev, staging, and prod)
- The attributes you need released. The app we extracted this from uses: `mail`, `givenName`, `sn` (surname).


## 3. The CAS Protocol — Request and Response Details

### 3.1 Redirecting the user to login

Build the URL as:

```
https://login.case.edu/cas/login?service=<URL-ENCODED CALLBACK>
```

The `service` value **must be URL-encoded** (use `encodeURIComponent` / `urllib.parse.quote`). Example callback: `https://app.example.edu/api/auth/cwru-sso-callback`.

After successful login, CWRU redirects the browser to:

```
https://app.example.edu/api/auth/cwru-sso-callback?ticket=ST-123-abcDEF...
```

The `ticket` is a one-time-use, short-lived, server-bound opaque token (~5 minutes TTL). It is useless without a server-side validation call back to CAS.

### 3.2 Validating the ticket (server-side)

Issue a plain `GET` from your server:

```
GET https://login.case.edu/cas/serviceValidate?ticket=<ticket>&service=<URL-ENCODED CALLBACK>
```

Both `ticket` and `service` are required. `service` **must be identical** to what you sent to `/cas/login` (no query string, no fragment, no trailing slash changes).

### 3.3 Success response (XML)

```xml
<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationSuccess>
    <cas:user>abc123</cas:user>
    <cas:attributes>
      <cas:mail>abc123@case.edu</cas:mail>
      <cas:givenName>Alex</cas:givenName>
      <cas:sn>Smith</cas:sn>
      <!-- other attributes as released by CWRU for your service -->
    </cas:attributes>
  </cas:authenticationSuccess>
</cas:serviceResponse>
```

- `<cas:user>` — the CWRU Network ID (also called "case ID" or "student ID" in various places). This is the stable primary identifier — **store it and key off it**. Email can change; the network ID generally does not.
- `<cas:mail>` — primary email (usually `<networkid>@case.edu`).
- `<cas:givenName>` / `<cas:sn>` — first / last name.

### 3.4 Failure response (XML)

```xml
<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationFailure code="INVALID_TICKET">
    Ticket ST-xxx not recognized
  </cas:authenticationFailure>
</cas:serviceResponse>
```

Common failure codes:

| Code | Meaning |
|---|---|
| `INVALID_REQUEST` | `ticket` or `service` missing |
| `INVALID_TICKET` | Ticket expired, already used, or never existed |
| `INVALID_SERVICE` | `service` doesn't match what was sent at `/cas/login`, or isn't registered |
| `INTERNAL_ERROR` | CAS server-side error |

### 3.5 Parsing the response

A real XML parser is preferred (e.g. `fast-xml-parser`, `xml2js`). In the reference implementation we use regex because the CAS response format is tightly specified and the project avoided adding an XML dep. Regex is acceptable but brittle — if CWRU ever changes whitespace, namespaces, or adds CDATA sections, switch to a real parser.


## 4. Reference Implementation (Next.js / TypeScript)

The following is the complete working implementation. Any framework can mirror this shape — two HTTP handlers (`login redirect` + `callback`), one ticket-validation function, one user-upsert function, one session cookie.

### 4.1 Environment variables

```env
# Required
JWT_SECRET=<long random string, 32+ bytes>
DATABASE_URL=postgres://...

# Optional — only if using Vercel Edge Config for admin allowlist
EDGE_CONFIG=https://edge-config.vercel.com/...
```

The callback URL is **not** an env variable here — it's derived at request time from `request.url`. This keeps dev/staging/prod working from one build, but you must pre-register every domain with CWRU. Alternatively, pin it via `APP_BASE_URL` env var.

### 4.2 Auth library (`lib/auth.ts`) — CAS functions

```ts
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";
import { Role, AuthProvider } from "@prisma/client";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export interface CWRUUserInfo {
  mail: string;         // abc123@case.edu
  givenName: string;    // Alex
  sn: string;           // Smith (surname)
  studentId: string;    // "abc123"  <-- CWRU Network ID (from <cas:user>)
}

/** Build the URL we send the browser to when they click "Sign in with CWRU SSO". */
export function generateCWRUSSOLoginURL(baseUrl: string): string {
  const callbackUrl = `${baseUrl}/api/auth/cwru-sso-callback`;
  return `https://login.case.edu/cas/login?service=${encodeURIComponent(callbackUrl)}`;
}

/** Validate a CAS ticket server-side and extract user info. */
export async function validateCWRUTicket(
  ticket: string,
  serviceUrl: string,
): Promise<{ success: boolean; userInfo?: CWRUUserInfo; error?: string }> {
  try {
    const validateUrl = "https://login.case.edu/cas/serviceValidate";
    const params = new URLSearchParams({ ticket, service: serviceUrl });

    const response = await fetch(`${validateUrl}?${params.toString()}`);
    const xmlText = await response.text();

    if (xmlText.includes("<cas:authenticationFailure")) {
      const m = xmlText.match(
        /<cas:authenticationFailure[^>]*>(.*?)<\/cas:authenticationFailure>/s,
      );
      return { success: false, error: m ? m[1].trim() : "Authentication failed" };
    }

    if (!xmlText.includes("<cas:authenticationSuccess")) {
      return { success: false, error: "Authentication failed" };
    }

    const userMatch = xmlText.match(/<cas:user>(.*?)<\/cas:user>/);
    const studentId = userMatch ? userMatch[1] : "";
    if (!studentId) return { success: false, error: "Student ID not found" };

    const mailMatch = xmlText.match(/<cas:mail>(.*?)<\/cas:mail>/);
    const givenNameMatch = xmlText.match(/<cas:givenName>(.*?)<\/cas:givenName>/);
    const snMatch = xmlText.match(/<cas:sn>(.*?)<\/cas:sn>/);

    const userInfo: CWRUUserInfo = {
      studentId,
      mail: mailMatch?.[1] ?? "",
      givenName: givenNameMatch?.[1] ?? "",
      sn: snMatch?.[1] ?? "",
    };

    if (!userInfo.mail || !userInfo.givenName || !userInfo.sn) {
      return { success: false, error: "Incomplete user information" };
    }

    return { success: true, userInfo };
  } catch (e) {
    console.error("Error validating CWRU ticket:", e);
    return { success: false, error: "Failed to validate ticket" };
  }
}
```


### 4.3 Upserting the user and issuing a session

```ts
/** Create or update a user after successful SSO validation. */
export async function createOrUpdateCWRUUser(
  userInfo: CWRUUserInfo,
  role: string = "student",
): Promise<User> {
  const prismaRole = (Role[role.toUpperCase() as keyof typeof Role] ?? Role.STUDENT);

  // Preserve existing role for PROFESSOR/KIOSK/STUDENT users while allowing
  // admin promote/demote based on external allowlist (see 5.2).
  const existing = await prisma.user.findUnique({ where: { email: userInfo.mail } });
  let updateRole: Role | undefined;
  if (existing) {
    if (prismaRole === Role.ADMIN) updateRole = Role.ADMIN;
    else if (existing.role === Role.ADMIN) updateRole = Role.STUDENT;
  }

  const dbUser = await prisma.user.upsert({
    where: { email: userInfo.mail },
    update: {
      name: `${userInfo.givenName} ${userInfo.sn}`,
      studentNumber: userInfo.studentId,
      ...(updateRole ? { role: updateRole } : {}),
      lastLoginAt: new Date(),
    },
    create: {
      email: userInfo.mail,
      name: `${userInfo.givenName} ${userInfo.sn}`,
      role: prismaRole,
      studentNumber: userInfo.studentId,
      authProvider: AuthProvider.CWRU_SSO,
      emailVerified: true, // SSO users are inherently verified
      lastLoginAt: new Date(),
    },
  });

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? "",
    role: dbUser.role.toLowerCase(),
    studentId: dbUser.studentNumber ?? undefined,
    authProvider: "cwru_sso",
  };
}

/** Sign a JWT session cookie. */
export async function createToken(user: User): Promise<string> {
  return await new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? "user",
    studentId: user.studentId ?? "",
    authProvider: user.authProvider ?? "email",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("45d")
    .sign(JWT_SECRET);
}
```

### 4.4 The two HTTP handlers

**Frontend button (`lib/auth-context.tsx`)** — just a redirect:

```ts
const loginWithCWRU = () => {
  const baseUrl = window.location.origin;
  const callbackUrl = `${baseUrl}/api/auth/cwru-sso-callback`;
  const loginUrl = `https://login.case.edu/cas/login?service=${encodeURIComponent(callbackUrl)}`;
  window.location.href = loginUrl;
};
```

**Server callback (`app/api/auth/cwru-sso-callback/route.ts`)**:

```ts
import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/edge-config";
import {
  validateCWRUTicket,
  createOrUpdateCWRUUser,
  createToken,
} from "@/lib/auth";
import { siteConfig } from "@/config/site";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticket = searchParams.get("ticket");

    // CRITICAL: strip the query string so `service` matches exactly what we
    // sent to /cas/login. If you used a trailing slash there, use one here.
    const serviceUrl = request.url.split("?")[0];

    if (!ticket) {
      return NextResponse.redirect(new URL("/login?error=missing_ticket", request.url));
    }

    const result = await validateCWRUTicket(ticket, serviceUrl);
    if (!result.success || !result.userInfo) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(result.error ?? "SSO validation failed")}`, request.url),
      );
    }

    // Role assignment from external admin allowlist (see 5.2). Default "user".
    const adminUsersString = await get("adminUsersCaseIds");
    let isAdmin = false;
    if (typeof adminUsersString === "string") {
      const adminIds = adminUsersString.split(",").map((id) => id.trim());
      isAdmin = adminIds.includes(result.userInfo.studentId);
    }
    const role = isAdmin ? "admin" : "user";

    const user = await createOrUpdateCWRUUser(result.userInfo, role);
    const token = await createToken(user);

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(siteConfig.auth.cookie.name, token, {
      ...siteConfig.auth.cookie,
      maxAge: siteConfig.auth.cookieMaxAge,
    });
    return response;
  } catch (e) {
    console.error("CWRU SSO callback error:", e);
    return NextResponse.redirect(new URL("/login?error=sso_error", request.url));
  }
}
```


## 5. Session, Cookies, and Role Model

### 5.1 Session strategy

We issue our **own** JWT after SSO — CAS is only used to establish initial identity. The JWT is stored in an HTTP-only cookie and verified by middleware on every protected request. CAS tickets are not reused or persisted.

Cookie config (from `config/site.ts`):

```ts
auth: {
  jwtExpiresIn: "45d",
  cookieMaxAge: 60 * 60 * 24 * 45, // 45 days
  cookie: {
    name: "auth-token",
    httpOnly: true,                               // blocks JS access (XSS)
    secure: process.env.NODE_ENV === "production",// HTTPS only in prod
    sameSite: "lax",                              // safe default, allows SSO redirect
    path: "/",
  },
}
```

JWT payload shape:

```ts
{
  userId: string;      // our DB user id
  email: string;       // @case.edu
  name: string;        // "Alex Smith"
  role: "admin" | "professor" | "student" | "kiosk" | "user";
  studentId: string;   // CWRU Network ID
  authProvider: "cwru_sso" | "email";
  iat: number;
  exp: number;
}
```

### 5.2 Admin allowlist via Vercel Edge Config

On every login the callback checks a centrally-managed allowlist (`adminUsersCaseIds`, comma-separated network IDs) stored in Vercel Edge Config. This makes promoting/demoting admins a config change, not a code change, and it takes effect at the user's next login. If you don't use Vercel, substitute any fast KV (Redis, a DB table, a static env var, etc.) — the important property is that the allowlist is read at login time.

Role matrix once logged in:

| Role | Source of truth |
|---|---|
| `admin` | CWRU network ID is on `adminUsersCaseIds` allowlist |
| `professor` | Set manually in DB (out-of-band) |
| `kiosk` | Set by separate kiosk-auto-login flow |
| `student` | Default for any new CWRU SSO user |

### 5.3 Route protection (Next.js middleware)

Every request passes through `middleware.ts`, which:

1. Lets public routes through (`/login`, `/api/auth/*`, static files).
2. Reads the `auth-token` cookie; redirects to `/login` if missing.
3. Verifies the JWT signature with the same `JWT_SECRET`.
4. Checks the `role` claim against route-level policy (admin-only, kiosk-only, student-only).
5. Clears the cookie and redirects to `/login` on any verification failure.

Other frameworks: mirror this pattern in your router's global middleware/filter/pipeline. Always verify the JWT signature — never trust the payload without verification.

## 6. Database Schema

Minimal Prisma model for a CWRU-SSO-capable user (adapt to your ORM):

```prisma
enum Role {
  ADMIN
  PROFESSOR
  STUDENT
  KIOSK
}

enum AuthProvider {
  EMAIL
  CWRU_SSO
}

model User {
  id            String       @id @default(uuid())
  email         String       @unique        // from <cas:mail>
  passwordHash  String?                     // null for SSO users
  name          String?                     // "<givenName> <sn>"
  role          Role         @default(STUDENT)
  studentNumber String?                     // CWRU Network ID (<cas:user>)
  authProvider  AuthProvider @default(EMAIL)
  isActive      Boolean      @default(true)
  emailVerified Boolean      @default(false)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  lastLoginAt   DateTime?

  @@index([email])
  @@index([role])
}
```

Key points:
- `email` is unique and used as the upsert key.
- `studentNumber` holds the **CWRU Network ID** (`<cas:user>`) — treat this as the immutable identity across systems.
- `passwordHash` is nullable so pure-SSO accounts have no password.
- `authProvider` distinguishes SSO from local accounts for audit and UI.


## 7. Frontend Integration

### 7.1 Login page

Render a "Sign in with CWRU SSO" button and, on click, redirect to the CAS URL. Nothing else is required on the frontend — the entire handshake is redirect-based.

```tsx
const handleCWRULogin = () => {
  const baseUrl = window.location.origin;
  const callbackUrl = `${baseUrl}/api/auth/cwru-sso-callback`;
  window.location.href =
    `https://login.case.edu/cas/login?service=${encodeURIComponent(callbackUrl)}`;
};
```

### 7.2 Surfacing callback errors

The callback redirects failures to `/login?error=<urlencoded message>`. On the login page, read `?error=` from the URL and display it:

```tsx
useEffect(() => {
  const err = new URLSearchParams(window.location.search).get("error");
  if (err) setError(decodeURIComponent(err));
}, []);
```

### 7.3 Reading the current user

After the cookie is set, any page can call `GET /api/auth/me` to get the decoded user. Example endpoint:

```ts
export async function GET(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getCurrentUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ user });
}
```

### 7.4 Logout

CAS-side logout (`https://login.case.edu/cas/logout`) terminates the CWRU session across all CAS-integrated services. Most apps only need **local** logout — deleting the `auth-token` cookie — so the user stays logged into CWRU for other services. Offer "Sign out of CWRU everywhere" as a separate link to CAS logout if needed.

```ts
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(siteConfig.auth.cookie.name);
  return response;
}
```

## 8. Dev / Staging / Production

- **Callback URL must be registered with CWRU** for every environment (dev, staging, prod). Local dev against a real CWRU ticket requires the dev URL to be registered and reachable — typically this means running dev over HTTPS behind a tunnel (ngrok, Cloudflare Tunnel) on a pre-registered hostname. Unregistered services get `INVALID_SERVICE`.
- **Development fallback:** the reference app disables email/password login in production and only allows CWRU SSO. In dev it allows seeded email/password accounts so you can work without hitting real CAS. See the `NODE_ENV === "production"` check in `app/api/auth/login/route.ts`. Do the same in your app.
- **HTTPS is required** for real CWRU SSO. CAS will refuse `http://` services in most environments. Use `secure: true` cookies in prod.

## 9. Security Considerations

1. **Always verify the ticket server-side.** Never accept the `ticket` query param as proof of identity without calling `serviceValidate`.
2. **`service` parameter must match.** Strip query strings before calling `serviceValidate`. A `/` mismatch will fail validation.
3. **Tickets are single-use and short-lived.** A retried callback will fail — this is expected and correct. Do not try to cache tickets.
4. **Bind session to the user's DB id, not the network ID from the cookie.** The JWT `userId` is our internal UUID; use that for all authorization. `studentId` is informational.
5. **JWT secret rotation.** Changing `JWT_SECRET` invalidates all sessions (all users must re-SSO). Do this when compromised.
6. **HTTP-only cookie** prevents JavaScript XSS from stealing the session. `sameSite=lax` is correct for SSO redirect flows (`strict` will drop the cookie on the redirect back from CAS).
7. **CSRF.** SSO callback is a GET and idempotent (ticket is one-time), so standard CSRF tokens aren't required for it. Other state-changing endpoints still need CSRF protection or the `sameSite=lax` guarantee plus non-GET requirement.
8. **Admin allowlist checked on every login.** A user removed from the list is demoted at their next SSO login, not instantly. If you need instant revocation, add a "force re-auth" / session revocation mechanism.
9. **Audit log.** Record `LOGIN`/`LOGOUT` events with `userId`, IP, and user-agent.
10. **Do not log tickets or JWTs.** Treat them as bearer credentials.

## 10. Common Errors and Debugging

| Symptom | Likely cause | Fix |
|---|---|---|
| `INVALID_SERVICE` | `service` param at `serviceValidate` differs from what was sent to `/cas/login`, or the URL isn't registered with CWRU | Strip the query string; ensure exact string match; confirm UTech has registered the callback URL |
| `INVALID_TICKET` | Ticket expired (>~5 min), already used, or generated for a different `service` | Don't retry with the same ticket; restart the login flow |
| Only `<cas:user>` returned, no attributes | Attribute release not enabled for your service | File a ticket with CWRU UTech requesting release of `mail`, `givenName`, `sn` |
| Redirect loop between `/login` and CAS | Session cookie isn't being set or read (domain mismatch, `secure` cookie on HTTP, third-party cookie blocking) | Verify cookie attributes; test in private browsing; check domain |
| `Incomplete user information` error | Attribute release partially enabled or CWRU returns different attribute names | Log the raw XML on failure; confirm attribute names with UTech |
| CAS login works but our JWT fails | `JWT_SECRET` differs between signer and verifier, or token expired | Verify env var, check expiration, clear cookie |

Tip for debugging: temporarily `console.log(xmlText)` in `validateCWRUTicket` to see exactly what CAS returned. Never leave this on in production.

## 11. Migration / Integration Checklist

Use this when adding CWRU SSO to a new project:

- [ ] Open a ticket with CWRU UTech to register your callback URL(s) and request release of `mail`, `givenName`, `sn`.
- [ ] Add environment variables: `JWT_SECRET`, `DATABASE_URL` (+ allowlist KV if used).
- [ ] Add `User` table (or equivalent) with `email unique`, `studentNumber`, `authProvider`, `role`.
- [ ] Implement `generateCWRUSSOLoginURL()` helper.
- [ ] Implement `validateCWRUTicket(ticket, service)` with XML parsing and failure handling.
- [ ] Implement `createOrUpdateCWRUUser(userInfo, role)` upsert.
- [ ] Implement `/api/auth/cwru-sso-callback` GET handler that strips the query string for `serviceUrl`.
- [ ] Implement session cookie issuance (JWT + HTTP-only + secure in prod).
- [ ] Implement middleware to verify JWT and enforce role-based routes.
- [ ] Implement `/api/auth/me` and `/api/auth/logout`.
- [ ] Add "Sign in with CWRU SSO" button on login page.
- [ ] Surface `?error=` on the login page.
- [ ] Disable email/password login in production (`NODE_ENV === "production"` guard).
- [ ] Test each failure path (missing ticket, invalid ticket, failed attribute release).
- [ ] Add audit logging for `LOGIN`/`LOGOUT`.
- [ ] Document role-assignment source (admin allowlist, professor table, etc.) in your repo's README.

## 12. Appendix — File Layout in the Reference Project

```
app/
  api/
    auth/
      cwru-sso-callback/route.ts   # SSO callback — validates ticket, sets cookie
      login/route.ts               # Dev-only email/password login
      logout/route.ts              # Clears auth cookie
      me/route.ts                  # Returns current user from JWT
  login/page.tsx                   # Login UI with "Sign in with CWRU SSO" button
lib/
  auth.ts                          # createToken, verifyToken, validateCWRUTicket,
                                   # generateCWRUSSOLoginURL, createOrUpdateCWRUUser
  auth-context.tsx                 # React context: useAuth(), loginWithCWRU()
config/
  site.ts                          # Cookie and JWT config (name, maxAge, etc.)
middleware.ts                      # Route protection: verifies JWT, enforces roles
prisma/
  schema.prisma                    # User, Role, AuthProvider models
```

---

**Protocol:** CAS 2.0
**CAS server:** `https://login.case.edu/cas`
**Released attributes (default in reference app):** `mail`, `givenName`, `sn` + `<cas:user>` network ID
**CWRU contact:** `help@case.edu` / UTech Help Desk for service registration and attribute release.
