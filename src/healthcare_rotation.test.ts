import assert from "node:assert/strict";
import { chooseNotification } from "./healthcare_rotation.ts";

const result = chooseNotification({
  appointmentId: "apt-7",
  patientReference: "patient-ref-7",
  startsAt: "2026-12-01T14:00:00.000Z",
  channel: "email"
});

assert.equal(result.channel, "email");
assert.match(result.message, /apt-7/);
assert.match(result.message, /patient-ref-7/);
console.log("notification decision passed");
