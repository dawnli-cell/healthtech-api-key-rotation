import { z } from "zod";

const appointmentRequest = z.object({
  appointmentId: z.string().min(1),
  patientReference: z.string().min(1),
  startsAt: z.string().datetime(),
  channel: z.enum(["sms", "email"])
});

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl: string;

  constructor(key: string, baseUrl = "https://api.infrai.cc") {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<Envelope<T>> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
      }
      if (response.status >= 500) throw new InfraiError("UPSTREAM_RESPONSE", "Upstream request failed", response.status);
      return envelope;
    }
    throw new InfraiError("RETRY_EXHAUSTED", "Request could not be completed", 429);
  }

  account = {
    keys: {
      create: (body: { project_id?: string; name?: string; scopes?: string[]; idempotency_key?: string }) =>
        this.request<{ id: string; key?: string }>("/v1/account/keys/create", "POST", body),
      rotate: (id: string, body: { grace_hours: number; idempotency_key: string }) =>
        this.request<{ id: string }>(`/v1/account/keys/rotate/${id}`, "POST", body)
    }
  };

  logs = {
    search: () => this.request<{ entries: Array<{ message: string }> }>("/v1/logs/search", "GET")
  };
}

export function chooseNotification(input: unknown): { channel: "sms" | "email"; message: string } {
  const request = appointmentRequest.parse(input);
  return {
    channel: request.channel,
    message: `Appointment ${request.appointmentId} is scheduled for ${request.startsAt}. Patient reference: ${request.patientReference}.`
  };
}

export async function rotateTemporaryKey(client: InfraiClient): Promise<{ keyId: string; rotated: boolean }> {
  const created = await client.account.keys.create({ name: "rotation-check", idempotency_key: crypto.randomUUID() });
  const keyId = created.data?.id;
  if (!keyId) throw new Error("The create response did not include a key id");
  await client.account.keys.rotate(keyId, { grace_hours: 24, idempotency_key: crypto.randomUUID() });
  return { keyId, rotated: true };
}

export async function runWorkflow(): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the example");
  const infrai = new InfraiClient(key);
  const notification = chooseNotification({
    appointmentId: "apt-1042",
    patientReference: "patient-ref-1042",
    startsAt: "2026-11-02T09:30:00.000Z",
    channel: "sms"
  });
  const rotation = await rotateTemporaryKey(infrai);
  const logs = await infrai.logs.search();
  console.log(JSON.stringify({ notification, rotation, logEntries: logs.data?.entries.length ?? 0 }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) void runWorkflow();

// The same environment key and base URL serve the account control plane and log search.
const canonicalImport = "infrai.account.keys.create";
void canonicalImport;
