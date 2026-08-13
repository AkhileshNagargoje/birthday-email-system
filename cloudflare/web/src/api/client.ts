/**
 * The only place that talks to the Worker.
 *
 * Every call goes through `request`, so authentication expiry, JSON parsing
 * and error shapes are handled once rather than in each component.
 */

import type { Overview, RunResult, SendLogEntry, Student } from "../../../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { confirmSend?: boolean } = {},
): Promise<T> {
  const { confirmSend, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set("Content-Type", "application/json");
  if (confirmSend) headers.set("X-Confirm-Send", "yes");

  const res = await fetch(`/api${path}`, {
    ...rest,
    headers,
    credentials: "same-origin",
  });

  if (res.status === 401) throw new ApiError("Your session has expired.", 401);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    if (!res.ok) throw new ApiError(text.slice(0, 300) || res.statusText, res.status);
    return text as unknown as T;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status);
  }
  return data as T;
}

const body = (payload: unknown) => JSON.stringify(payload);

export const api = {
  // ---- session ----
  me: () => request<{ signedIn: boolean; configured: boolean }>("/auth/me"),

  login: (username: string, password: string) =>
    request<{ ok: true }>("/auth/login", {
      method: "POST",
      body: body({ username, password }),
    }),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  // ---- roster ----
  overview: () => request<Overview>("/overview"),
  students: () => request<Student[]>("/students"),

  addStudent: (name: string, email: string, dob: string) =>
    request<Student>("/students", { method: "POST", body: body({ name, email, dob }) }),

  updateStudent: (id: number, name: string, email: string, dob: string) =>
    request<Student>(`/students/${id}`, {
      method: "PUT",
      body: body({ name, email, dob }),
    }),

  deleteStudent: (id: number) =>
    request<{ ok: true; name: string }>(`/students/${id}`, { method: "DELETE" }),

  importCsv: (csv: string) =>
    request<{ added: number; skipped: Array<{ row: number; reason: string }> }>(
      "/students/import",
      { method: "POST", body: body({ csv }) },
    ),

  // ---- actions ----
  history: () => request<SendLogEntry[]>("/history"),

  run: (options: { date?: string; dryRun: boolean; force?: boolean }) =>
    request<RunResult>("/run", {
      method: "POST",
      body: body(options),
      confirmSend: !options.dryRun,
    }),

  wish: (options: { emails: string; names?: string; note?: string; dryRun: boolean }) =>
    request<RunResult>("/wish", {
      method: "POST",
      body: body(options),
      confirmSend: !options.dryRun,
    }),

  checkEmail: () =>
    request<{ ok: boolean; provider?: string; message: string }>("/check-email", {
      method: "POST",
    }),

  previewUrl: "/api/preview",
};
