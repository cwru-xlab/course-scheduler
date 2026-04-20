import { headers } from "next/headers";
import { Button } from "@heroui/button";

import { generateCWRUSSOLoginURL } from "@/lib/auth";
import { DevLoginButton } from "./dev-login-button";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  missing_ticket: "SSO did not return a ticket. Please try again.",
  session_expired: "Your session expired. Please sign in again.",
  server_misconfigured:
    "Server is missing APP_BASE_URL or JWT_SECRET. Contact an administrator.",
  sso_error: "An error occurred during SSO. Please try again.",
  INVALID_TICKET: "Your login ticket was invalid or expired. Please try again.",
  INVALID_SERVICE:
    "Callback URL is not registered with CWRU. Contact an administrator.",
  INVALID_REQUEST: "CAS rejected the request. Please try again.",
  INTERNAL_ERROR: "CWRU CAS reported an internal error. Please try again later.",
  authentication_failed: "CWRU authentication failed. Please try again.",
  missing_network_id: "CWRU did not return an identity. Contact an administrator.",
  validation_error: "Could not reach CWRU CAS to validate ticket.",
  sso_validation_failed: "CWRU SSO validation failed. Please try again.",
};

function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const headersList = await headers();
  const host = headersList.get("host");
  const showDevLogin =
    process.env.NODE_ENV !== "production" && isLocalHost(host);

  let cwruLoginUrl: string | null = null;
  let configError: string | null = null;
  try {
    cwruLoginUrl = generateCWRUSSOLoginURL();
  } catch (e) {
    configError = e instanceof Error ? e.message : "Server misconfigured";
  }

  const errorKey = params.error;
  const errorMessage = errorKey
    ? ERROR_MESSAGES[errorKey] ?? decodeURIComponent(errorKey)
    : null;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-default-200 bg-white dark:bg-default-50 p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <img
            src="/cwru.jpeg"
            alt="CWRU logo"
            className="h-12 w-auto object-contain"
          />
          <h1 className="text-xl font-bold text-center text-slate-900 dark:text-foreground">
            Weatherhead{" "}
            <span className="text-weatherhead-primary">Scheduler</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-default-500 text-center">
            Sign in with your CWRU account to continue.
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-danger-200 bg-danger-50 dark:bg-danger-100/20 px-3 py-2 text-sm text-danger-700 dark:text-danger">
            {errorMessage}
          </div>
        ) : null}

        {configError ? (
          <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 dark:bg-warning-100/20 px-3 py-2 text-sm text-warning-700 dark:text-warning">
            {configError}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {cwruLoginUrl ? (
            <Button
              as="a"
              href={cwruLoginUrl}
              color="primary"
              size="lg"
              className="w-full font-semibold"
            >
              Sign in with CWRU SSO
            </Button>
          ) : (
            <Button color="primary" size="lg" className="w-full" isDisabled>
              Sign in with CWRU SSO
            </Button>
          )}

          {showDevLogin ? (
            <>
              <div className="flex items-center gap-3 my-1">
                <div className="h-px flex-1 bg-slate-200 dark:bg-default-200" />
                <span className="text-xs text-slate-400 dark:text-default-400 uppercase tracking-wide">
                  Local dev
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-default-200" />
              </div>
              <DevLoginButton />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
