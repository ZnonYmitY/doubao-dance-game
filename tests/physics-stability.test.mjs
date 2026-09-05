import assert from "node:assert/strict";
import test from "node:test";
import {
  COLLISION_RESTITUTION,
  CONTACT_SOLVER_ITERATIONS,
  POSITION_CORRECTION,
  constrainBodyToBoard,
  getPhysicsSubsteps,
  resolveCircleContact,
} from "../lib/physics.ts";

const radius = 20;

test("keeps the launch-version collision response constants", () => {
  assert.equal(CONTACT_SOLVER_ITERATIONS, 2);
  assert.equal(POSITION_CORRECTION, 0.82);
  assert.equal(COLLISION_RESTITUTION, 0.12);
});

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

  for (let substep = 0; substep < 2; substep += 1) {
    for (let iteration = 0; iteration < CONTACT_SOLVER_ITERATIONS; iteration += 1) {
      resolveCircleContact(first, second, radius, radius);
    }
  }

  assert.ok(first.x < 60);
  assert.ok(second.x > 60);
  assert.ok(Math.hypot(second.x - first.x, second.y - first.y) > radius * 1.95);
});

test("an extreme Mira-to-Dance size pair keeps a visible collision gap", () => {
  const miraRadius = 19;
  const danceRadius = 70;
  const dance = { id: 1, level: 6, x: danceRadius, y: 90, vx: 0, vy: 0, angularVelocity: 0 };
  const mira = { id: 2, level: 0, x: danceRadius + miraRadius + danceRadius - 9, y: 90, vx: 0, vy: 0, angularVelocity: 0 };

  // Two launch-style substeps, each with two solver passes. Re-constraining the
  // large ball reproduces the hard case where it is pinned against a wall.
  for (let substep = 0; substep < 2; substep += 1) {
    for (let iteration = 0; iteration < CONTACT_SOLVER_ITERATIONS; iteration += 1) {
      resolveCircleContact(dance, mira, danceRadius, miraRadius);
      constrainBodyToBoard(dance, danceRadius, 390, 560);
      constrainBodyToBoard(mira, miraRadius, 390, 560);
    }
  }

  const distance = Math.hypot(dance.x - mira.x, dance.y - mira.y);
  assert.ok(distance >= miraRadius + danceRadius - 0.1);
});

test("fast small bodies receive extra substeps to avoid tunneling", () => {
  const bodies = [{ id: 1, level: 0, x: 0, y: 0, vx: 0, vy: 1000, angularVelocity: 0 }];
  const steps = getPhysicsSubsteps(bodies, 0.033, () => 19);
  assert.ok(steps >= 3);
});

test("a fast Mira cannot tunnel through a floor-pinned Dance", () => {
  const radii = [19, 24, 30, 38, 47, 58, 70];
  const bottom = 500;
  const mira = { id: 1, level: 0, x: 195, y: 320, vx: 0, vy: 1500, angularVelocity: 0.35 };
  const dance = { id: 2, level: 6, x: 195, y: bottom - radii[6], vx: 0, vy: 0, angularVelocity: -0.1 };
  const bodies = [mira, dance];
  const elapsed = 0.033;
  const steps = getPhysicsSubsteps(bodies, elapsed, (level) => radii[level]);

  for (let step = 0; step < steps; step += 1) {
    const delta = elapsed / steps;
    mira.vy += 980 * delta;
    mira.y += mira.vy * delta;
    for (let iteration = 0; iteration < CONTACT_SOLVER_ITERATIONS; iteration += 1) {
      resolveCircleContact(mira, dance, radii[0], radii[6]);
      constrainBodyToBoard(mira, radii[0], 390, bottom);
      constrainBodyToBoard(dance, radii[6], 390, bottom);
    }
  }

  const distance = Math.hypot(dance.x - mira.x, dance.y - mira.y);
  assert.ok(mira.y < dance.y);
  assert.ok(distance >= radii[0] + radii[6] - 0.1);
  assert.equal(mira.angularVelocity, 0.35);
});

test("single contact matches the launch-version impulse and correction", () => {
  const first = { id: 1, level: 0, x: 40, y: 60, vx: 10, vy: 0, angularVelocity: 0.25 };
  const second = { id: 2, level: 0, x: 79, y: 60, vx: -10, vy: 0, angularVelocity: -0.25 };

  resolveCircleContact(first, second, radius, radius);

  assert.ok(Math.abs(first.x - 39.59) < 1e-9);
  assert.ok(Math.abs(second.x - 79.41) < 1e-9);
  assert.ok(Math.abs(first.vx + 1.2) < 1e-9);
  assert.ok(Math.abs(second.vx - 1.2) < 1e-9);
  assert.equal(first.angularVelocity, 0.25);
  assert.equal(second.angularVelocity, -0.25);
});
