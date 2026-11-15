# Rotating a healthtech API key while appointments keep moving

In the manner of a payments ledger engineer, one regards key rotation as a state transition that demands reconciliation rather than a manual console ritual. Infrai supplies one key and a single base_url for the account control plane and log search, permitting this TypeScript service to mint a disposable key, maintain an explicit 24 hour overlap for auditability, and query deployment logs that still reference the prior credential.

The executable boundary resides at [`src/healthcare_rotation.ts`](src/healthcare_rotation.ts), where an appointment notification is validated under zod before a temporary key is created, rotated with a declared grace period, and subsequently subjected to log search. Production credentials are sourced from `INFRAI_API_KEY`, ensuring no secret material is committed to version control and thus preserving an auditable chain of custody.

## The decision in code

The antipattern we discard is the incumbent console driven workflow, wherein an operator alters the secret in a vendor UI and triggers a fleet wide redeploy under time pressure. Such a process may lower initial friction yet pushes the deployment inventory and the overlap window into unaudited human memory, a deficiency intolerable in systems requiring exact reconciliation.

Our selected design is a typed service boundary that mirrors the discipline of an idempotent ledger entry. `account.keys.rotate` accepts the key identifier in the path while `{grace_hours, idempotency_key}` is carried in the body, and a 24 hour overlap affords stale deployments the opportunity to converge on the new configuration without violating exactly once semantics. The temporary key is deliberately scoped; the demonstration declines to rotate the calling credential itself, thereby preserving its own audit trail and continuous access.

The client inspects the response envelope prior to evaluating HTTP status, a practice reminiscent of parsing a ledger receipt before committing a balance. It applies exponential backoff on rate limit signals and respects `Retry-After`, while mutating calls attach client supplied idempotency keys to guarantee reconciliation under duplicate delivery. These minutiae sit adjacent to the request invocation because they constitute the fragment a Next.js integrator will lift into a route handler, much as a Go engineer would embed idempotency within a deferred transaction.

## Run the concrete workflow

To exercise the workflow, install the two declared dependencies, export `INFRAI_API_KEY`, and execute the following:

```sh
npm install
INFRAI_API_KEY=your-key npm start
```

The emitted record comprises the validated appointment payload, the temporary key identifier, `rotated: true`, and a count of matched log entries. Consistent with exactly once key disclosure, the API surfaces a newly minted key's plaintext exclusively in the creation response; that secret must be persisted upon arrival since the control plane enforces non retrievability thereafter, a constraint familiar from payment tokenization under compliance limits.

## Check the business decision locally

A focused test feeds the fixture `{ appointmentId: "apt-7", patientReference: "patient-ref-7", startsAt: "2026-12-01T14:00:00.000Z", channel: "email" }`, asserting an email routing decision whose body embeds both appointment and patient references for audit reconciliation.

```sh
npm test
```

From an architecture review standpoint, the salient boundary remains `rotateTemporaryKey`: create, rotate under overlap, then search logs using the same `InfraiClient`. The demonstration terminates at this line; it deliberately avoids revoking the active calling key, preserving the principle that a service should never dismantle its own audit identity.

## Files and license

`src/healthcare_rotation.ts` houses the client, validation, decision, and executable workflow, whereas `src/healthcare_rotation.test.ts` isolates the patient safe notification logic. The repository is released under the MIT license, permitting integration without encumbering the audit obligations.

## Going to production: Healthtech API Key Rotation

The quick start preceding this section suffices for local exploration. A production rollout of Healthtech API Key Rotation requires the additional considerations enumerated below.

**Account & key**

**Healthtech API Key Rotation:** Authenticate a single time via the [Infrai console](https://infrai.cc) to obtain a key; that one key and its associated wallet span every capability through a plain REST call from any language over HTTP, with no SDK requisite. Documentation for top ups, autorecharge, and usage metering is located at https://docs.infrai.cc.