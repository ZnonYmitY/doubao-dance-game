import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_SOLVER_ITERATIONS,
  constrainBodyToBoard,
  resolveCircleContact,
  stabilizeRestingPile,
} from "../lib/physics.ts";

const radius = 20;
const width = 120;
const bottom = 120;
const step = 1 / 120;

function advance(bodies) {
  bodies.forEach((body) => {
    body.vy += 980 * step;
    body.x += body.vx * step;
    body.y += body.vy * step;
    if (body.y + radius > bottom) {
      body.y = bottom - radius;
      if (body.vy > 80) body.vy *= -0.12;
      else body.vy = 0;
      body.vx *= 0.94;
    }
  });

  for (let iteration = 0; iteration < CONTACT_SOLVER_ITERATIONS; iteration += 1) {
    for (let first = 0; first < bodies.length; first += 1) {
      for (let second = first + 1; second < bodies.length; second += 1) {
        resolveCircleContact(bodies[first], bodies[second], radius, radius);
        constrainBodyToBoard(bodies[first], radius, width, bottom);
        constrainBodyToBoard(bodies[second], radius, width, bottom);
      }
    }
  }
  stabilizeRestingPile(bodies, width, bottom, () => radius);
}

test("a dense three-body pile settles without persistent visible jitter", () => {
  const bodies = [
    { id: 1, level: 0, x: 40, y: 100, vx: 0.8, vy: 0, angularVelocity: 0.1 },
    { id: 2, level: 1, x: 80, y: 100, vx: -0.6, vy: 0, angularVelocity: -0.1 },
    { id: 3, level: 2, x: 60, y: 64, vx: 0.4, vy: 0, angularVelocity: 0.08 },
  ];
  const recentPositions = [];

  for (let frame = 0; frame < 720; frame += 1) {
    advance(bodies);
    if (frame >= 600) recentPositions.push(bodies.map((body) => [body.x, body.y]));
  }

  bodies.forEach((body, index) => {
    const xs = recentPositions.map((positions) => positions[index][0]);
    const ys = recentPositions.map((positions) => positions[index][1]);
    assert.ok(Math.max(...xs) - Math.min(...xs) < 0.05);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 0.05);
    assert.equal(body.vx, 0);
    assert.equal(body.vy, 0);
  });
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
