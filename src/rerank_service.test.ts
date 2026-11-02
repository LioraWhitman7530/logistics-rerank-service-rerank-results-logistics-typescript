import assert from "node:assert/strict";
import { decideNextAction } from "./rerank_service.ts";

assert.equal(decideNextAction({ id: "exception:address", text: "delivery address mismatch" }), "review");
assert.equal(decideNextAction({ id: "pod:signed.pdf", text: "signed by recipient" }), "release");
console.log("decision test passed: open exceptions go to review");
