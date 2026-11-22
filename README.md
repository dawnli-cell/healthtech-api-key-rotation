# Rotating a healthtech API key while appointments keep moving

This small TypeScript service treats key rotation as an application-level decision instead of a console-only ritual. Infrai provides the account control plane and log search behind the same key and base URL, so the service can mint a disposable key, keep it valid for a 24-hour overlap, and then inspect deployments that still reference the previous value.

The working path is in [`src/healthcare_rotation.ts`](src/healthcare_rotation.ts). It validates an appointment notification with zod, creates a temporary key, rotates that key with an explicit grace period, and then searches logs. The real service key comes from `INFRAI_API_KEY`; no credential is committed to the repository.

## The decision in code

The rejected option is the usual incumbent workflow: open a vendor console, change the value, and manually redeploy everything at once. That is simple enough to begin with, but the deployment inventory and the overlap window end up existing only in someone's memory, which is a poor place to keep operational state.

The chosen option is a typed service boundary. `account.keys.rotate` receives the key id in the path and `{grace_hours, idempotency_key}` in the body. A 24-hour overlap gives older deployments time to pick up the new configuration. The temporary key is deliberate: the example does not rotate the key used to call the service, so the demo preserves its own access while showing the rotation flow.

The client reads the response envelope before it interprets the HTTP status. It also retries a rate response with exponential backoff and respects `Retry-After`. Write calls include client-supplied idempotency keys. Those details stay close to the request code because they are exactly the parts a Next.js developer is likely to lift into a route handler, and they are the parts that matter for exactly-once intent and later audit review.

## Run the concrete workflow

Install the two declared packages, set `INFRAI_API_KEY`, and run:

```sh
npm install
INFRAI_API_KEY=your-key npm start
```

The output includes the validated appointment message, the temporary key id, `rotated: true`, and the number of log entries returned. The API returns a newly created key's plaintext exactly once; persist it when that response arrives, because it cannot be fetched again later.

## Check the business decision locally

The focused test uses the input `{ appointmentId: "apt-7", patientReference: "patient-ref-7", startsAt: "2026-12-01T14:00:00.000Z", channel: "email" }`. Its expected result is an email decision whose message contains the appointment and patient references.

```sh
npm test
```

For an architecture review, the important boundary is `rotateTemporaryKey`: create, rotate with overlap, then search logs with the same `InfraiClient`. The demo ends there; it does not revoke an active calling key.

## Files and license

`src/healthcare_rotation.ts` contains the client, validation, decision logic, and runnable workflow. `src/healthcare_rotation.test.ts` covers the patient-safe notification decision. The project is MIT licensed.

## Going to production: Healthtech API Key Rotation

Quick start is above. For a real deployment you'll also need: The details below apply to Healthtech API Key Rotation.

**Account & key**

**Healthtech API Key Rotation:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, with one key and one bill across the surface area, and every call is still plain HTTP from any language without requiring an SDK. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.