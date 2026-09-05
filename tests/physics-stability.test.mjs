import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_SOLVER_ITERATIONS,
  constrainBodyToBoard,
  getContactPadding,
  getPhysicsSubsteps,
  resolveCircleContact,
} from "../lib/physics.ts";

const radius = 20;

test("gentle contacts preserve bounce and rotation instead of freezing", () => {
  const first = { id: 1, level: 0, x: 60, y: 80, vx: 12, vy: 8, angularVelocity: 0.6 };
  const second = { id: 2, level: 1, x: 60, y: 119, vx: -4, vy: 0, angularVelocity: -0.2 };

  assert.equal(resolveCircleContact(first, second, radius, radius), true);
  assert.notEqual(first.vy, 0);
  assert.notEqual(second.vy, 0);
  assert.equal(first.angularVelocity, 0.6);
  assert.equal(second.angularVelocity, -0.2);
});

test("position correction at the board edge does not erase motion", () => {
  const body = { id: 1, level: 0, x: 4, y: 118, vx: -32, vy: 45, angularVelocity: 0.7 };
  constrainBodyToBoard(body, radius, 120, 120);

  assert.equal(body.x, radius);
  assert.equal(body.y, 120 - radius);
  assert.equal(body.vx, -32);
  assert.equal(body.vy, 45);
  assert.equal(body.angularVelocity, 0.7);
});

test("an energetic impact still rebounds instead of being frozen", () => {
  const first = { id: 1, level: 0, x: 60, y: 80, vx: 0, vy: 180, angularVelocity: 0 };
  const second = { id: 2, level: 1, x: 60, y: 117, vx: 0, vy: 0, angularVelocity: 0 };

  assert.equal(resolveCircleContact(first, second, radius, radius), true);
  assert.ok(first.vy < 180);
  assert.ok(second.vy > 0);
});

test("perfectly overlapping bodies are separated deterministically", () => {
  const first = { id: 1, level: 0, x: 60, y: 60, vx: 0, vy: 0, angularVelocity: 0 };
  const second = { id: 2, level: 1, x: 60, y: 60, vx: 0, vy: 0, angularVelocity: 0 };

  for (let iteration = 0; iteration < CONTACT_SOLVER_ITERATIONS; iteration += 1) {
    resolveCircleContact(first, second, radius, radius);
  }

  assert.ok(first.x < 60);
  assert.ok(second.x > 60);
  assert.ok(Math.hypot(second.x - first.x, second.y - first.y) > radius * 1.95);
});

test("an extreme Mira-to-Dance size pair keeps a visible collision gap", () => {
  const miraRadius = 19;
  const danceRadius = 70;
  const padding = getContactPadding(miraRadius, danceRadius);
  const mira = { id: 1, level: 0, x: 80, y: 80, vx: 0, vy: 0, angularVelocity: 0 };
  const dance = { id: 2, level: 6, x: 80 + miraRadius + danceRadius - 7, y: 80, vx: 0, vy: 0, angularVelocity: 0 };

  assert.ok(padding >= 1.5);
  for (let iteration = 0; iteration < CONTACT_SOLVER_ITERATIONS; iteration += 1) {
    resolveCircleContact(mira, dance, miraRadius + padding / 2, danceRadius + padding / 2);
  }

  const distance = Math.hypot(dance.x - mira.x, dance.y - mira.y);
  assert.ok(distance >= miraRadius + danceRadius + padding - 0.15);
});

test("fast small bodies receive extra substeps to avoid tunneling", () => {
  const bodies = [{ id: 1, level: 0, x: 0, y: 0, vx: 0, vy: 1000, angularVelocity: 0 }];
  const steps = getPhysicsSubsteps(bodies, 0.033, () => 19);
  assert.ok(steps >= 4);
});
