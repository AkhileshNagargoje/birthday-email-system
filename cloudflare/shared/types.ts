/** Shapes crossing the API boundary. Imported by both the Worker and React. */

export interface Student {
  id: number;
  name: string;
  email: string;
  dob: string; // YYYY-MM-DD
  active: boolean;
}

export type SendStatus = "sent" | "failed" | "skipped";

export interface SendLogEntry {
  id: number;
  email: string;
  name: string;
  occasionDate: string;
  status: SendStatus;
  detail: string | null;
  source: string;
  sentAt: string;
}

export interface Overview {
  total: number;
  todayCount: number;
  today: Array<Pick<Student, "id" | "name" | "email">>;
  upcoming: Array<{ name: string; date: string; days: number }>;
  lastRun: { when: string; count: number } | null;
  testMode: boolean;
  testEmail: string;
  provider: string;
  appName: string;
}

export interface RunResult {
  date: string;
  dryRun: boolean;
  sent: number;
  skipped: number;
  failed: number;
  entries: Array<{ name: string; email: string; status: SendStatus; detail: string }>;
}

export interface ApiError {
  error: string;
}
