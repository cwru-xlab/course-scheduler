import { SignJWT, jwtVerify } from "jose";

export interface AuthUser {
  email: string;
  name: string;
  networkId: string;
  authProvider: "cwru_sso" | "dev";
  /** Present after allowlisted SSO; optional for older tokens until re-login. */
  accessTier?: "active" | "developer" | null;
}

export interface CWRUUserInfo {
  mail: string;
  givenName: string;
  sn: string;
  studentId: string;
}

const JWT_ALG = "HS256";
const JWT_EXPIRES_IN = "45d";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is not set. Add it to .env.local (dev) or your Vercel project settings (prod).",
    );
  }
  return new TextEncoder().encode(secret);
}

export function getAppBaseUrl(): string {
  const raw = process.env.APP_BASE_URL;
  if (!raw) {
    throw new Error(
      "APP_BASE_URL environment variable is not set. Add e.g. APP_BASE_URL=http://localhost:3000 to .env.local.",
    );
  }
  return raw.replace(/\/+$/, "");
}

export function getCallbackUrl(): string {
  return `${getAppBaseUrl()}/api/auth/cwru-sso-callback`;
}

export function generateCWRUSSOLoginURL(): string {
  const callback = getCallbackUrl();
  return `https://login.case.edu/cas/login?service=${encodeURIComponent(callback)}`;
}

export async function signToken(user: AuthUser): Promise<string> {
  return await new SignJWT({
    email: user.email,
    name: user.name,
    networkId: user.networkId,
    authProvider: user.authProvider,
    ...(user.accessTier ? { accessTier: user.accessTier } : {}),
  })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: [JWT_ALG],
    });
    const email = typeof payload.email === "string" ? payload.email : null;
    const name = typeof payload.name === "string" ? payload.name : null;
    const networkId =
      typeof payload.networkId === "string" ? payload.networkId : null;
    const authProvider =
      payload.authProvider === "cwru_sso" || payload.authProvider === "dev"
        ? payload.authProvider
        : null;
    if (!email || !name || !networkId || !authProvider) return null;
    const accessTier =
      payload.accessTier === "active" || payload.accessTier === "developer"
        ? payload.accessTier
        : null;
    return { email, name, networkId, authProvider, accessTier };
  } catch {
    return null;
  }
}

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
      const codeMatch = xmlText.match(
        /<cas:authenticationFailure[^>]*code="([^"]+)"/,
      );
      return {
        success: false,
        error: codeMatch ? codeMatch[1] : "authentication_failed",
      };
    }

    if (!xmlText.includes("<cas:authenticationSuccess")) {
      return { success: false, error: "authentication_failed" };
    }

    const userMatch = xmlText.match(/<cas:user>(.*?)<\/cas:user>/);
    const studentId = userMatch ? userMatch[1].trim() : "";
    if (!studentId) {
      return { success: false, error: "missing_network_id" };
    }

    const mailMatch = xmlText.match(/<cas:mail>(.*?)<\/cas:mail>/);
    const givenNameMatch = xmlText.match(
      /<cas:givenName>(.*?)<\/cas:givenName>/,
    );
    const snMatch = xmlText.match(/<cas:sn>(.*?)<\/cas:sn>/);

    return {
      success: true,
      userInfo: {
        studentId,
        mail: mailMatch?.[1]?.trim() || `${studentId}@case.edu`,
        givenName: givenNameMatch?.[1]?.trim() || studentId,
        sn: snMatch?.[1]?.trim() || "",
      },
    };
  } catch (e) {
    console.error("Error validating CWRU ticket:", e);
    return { success: false, error: "validation_error" };
  }
}

export function buildAuthUserFromCAS(info: CWRUUserInfo): AuthUser {
  const fullName = [info.givenName, info.sn].filter(Boolean).join(" ").trim();
  return {
    email: info.mail,
    name: fullName || info.studentId,
    networkId: info.studentId,
    authProvider: "cwru_sso",
  };
}
