import assert from "node:assert/strict";
import test from "node:test";
import { LEVEL_RADII } from "../lib/game-config.ts";
import {
  COLLISION_RESTITUTION,
  CONTACT_SOLVER_ITERATIONS,
  MAX_VISIBLE_PENETRATION,
  OVERLAP_FALLBACK_ITERATIONS,
  OVERLAP_SOLVER_ITERATIONS,
  POSITION_CORRECTION,
  constrainBodyToBoard,
  getMaximumPenetration,
  getPhysicsSubsteps,
  resolveCircleContact,
  solveBoardOverlaps,
} from "../lib/physics.ts";

const radius = 20;

test("keeps the launch-version collision response constants", () => {
  assert.equal(CONTACT_SOLVER_ITERATIONS, 2);
  assert.equal(POSITION_CORRECTION, 0.82);
  assert.equal(COLLISION_RESTITUTION, 0.12);
  assert.equal(OVERLAP_SOLVER_ITERATIONS, 8);
  assert.equal(OVERLAP_FALLBACK_ITERATIONS, 32);
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
  const miraRadius = LEVEL_RADII[0];
  const danceRadius = LEVEL_RADII[6];
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
  const bodies = [{ id: 1, level: 0, x: 0, y: 0, vx: 0, vy: 1200, angularVelocity: 0 }];
  const steps = getPhysicsSubsteps(bodies, 0.033, () => LEVEL_RADII[0]);
  assert.ok(steps >= 3);
});

test("a fast Mira cannot tunnel through a floor-pinned Dance", () => {
  const radii = LEVEL_RADII;
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

test("boundary-aware cleanup transfers a trapped corner correction to the free body", () => {
  const bottom = 560;
  const velocities = [7, 9, 0.4, -3, 2, -0.2];
  const mira = {
    id: 1,
    level: 0,
    x: LEVEL_RADII[0],
    y: bottom - LEVEL_RADII[0],
    vx: velocities[0],
    vy: velocities[1],
    angularVelocity: velocities[2],
  };
  const doubao = {
    id: 2,
    level: 5,
    x: 67.2,
    y: 495,
    vx: velocities[3],
    vy: velocities[4],
    angularVelocity: velocities[5],
  };
  const bodies = [mira, doubao];

  assert.ok(getMaximumPenetration(bodies, (level) => LEVEL_RADII[level]) > 20);
  const remaining = solveBoardOverlaps(bodies, 390, bottom, (level) => LEVEL_RADII[level]);

  assert.ok(remaining <= MAX_VISIBLE_PENETRATION);
  assert.equal(mira.x, LEVEL_RADII[0]);
  assert.equal(mira.y, bottom - LEVEL_RADII[0]);
  assert.deepEqual(
    [mira.vx, mira.vy, mira.angularVelocity, doubao.vx, doubao.vy, doubao.angularVelocity],
    velocities,
  );
});

test("a newly merged large body is separated from both neighbours before drawing", () => {
  const bottom = 560;
  const bodies = [
    { id: 1, level: 4, x: 100, y: bottom - LEVEL_RADII[4], vx: 4, vy: 0, angularVelocity: 0.1 },
    { id: 2, level: 4, x: 290, y: bottom - LEVEL_RADII[4], vx: -4, vy: 0, angularVelocity: -0.1 },
    { id: 3, level: 6, x: 195, y: bottom - LEVEL_RADII[6], vx: 0, vy: -85, angularVelocity: 0.3 },
  ];

  assert.ok(getMaximumPenetration(bodies, (level) => LEVEL_RADII[level]) > 30);
  const remaining = solveBoardOverlaps(bodies, 390, bottom, (level) => LEVEL_RADII[level]);

  assert.ok(remaining <= MAX_VISIBLE_PENETRATION);
  assert.deepEqual(
    bodies.map(({ vx, vy, angularVelocity }) => [vx, vy, angularVelocity]),
    [[4, 0, 0.1], [-4, 0, -0.1], [0, -85, 0.3]],
  );
});

test("a fixed-seed dense mixed-size pile stays within the board without visible tunneling", () => {
  const width = 390;
  const bottom = 545;
  const elapsed = 1 / 60;
  const gravity = 980;
  const levelSequence = [6, 0, 5, 1, 4, 2, 7, 3];
  const bodies = [];
  let seed = 1337;
  let nextId = 1;
  let maximumAfterCleanup = 0;
  let maximumBoundaryViolation = 0;
  const random = () => (
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
  );
  const radiusForLevel = (level) => LEVEL_RADII[level];

  // Disable merging on purpose: retaining all sixteen mixed-size bodies makes
  // this a deterministic stress test for the contact solver itself.
  for (let frame = 0; frame < 1800; frame += 1) {
    if (frame % 90 === 0 && bodies.length < 16) {
      const level = levelSequence[bodies.length % levelSequence.length];
      const bodyRadius = radiusForLevel(level);
      bodies.push({
        id: nextId++,
        level,
        x: bodyRadius + (width - bodyRadius * 2) * random(),
        y: 50 + bodyRadius,
        vx: (random() - 0.5) * 120,
        vy: 0,
        angularVelocity: (random() - 0.5) * 2,
      });
    }

    const substeps = getPhysicsSubsteps(bodies, elapsed, radiusForLevel);
    for (let substep = 0; substep < substeps; substep += 1) {
      const delta = elapsed / substeps;
      bodies.forEach((body) => {
        const bodyRadius = radiusForLevel(body.level);
        body.vy += gravity * delta;
        body.vx *= Math.pow(0.995, delta * 60);
        body.x += body.vx * delta;
        body.y += body.vy * delta;

        if (body.x - bodyRadius < 0) {
          body.x = bodyRadius;
          body.vx = Math.abs(body.vx) * 0.28;
        } else if (body.x + bodyRadius > width) {
          body.x = width - bodyRadius;
          body.vx = -Math.abs(body.vx) * 0.28;
        }
        if (body.y + bodyRadius > bottom) {
          body.y = bottom - bodyRadius;
          if (body.vy > 25) body.vy *= -0.16;
          else body.vy = 0;
          body.vx *= 0.965;
          body.angularVelocity = body.vx / Math.max(20, bodyRadius);
        }
      });

      for (let iteration = 0; iteration < CONTACT_SOLVER_ITERATIONS; iteration += 1) {
        for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
            const first = bodies[firstIndex];
            const second = bodies[secondIndex];
            const radiusFirst = radiusForLevel(first.level);
            const radiusSecond = radiusForLevel(second.level);
            resolveCircleContact(first, second, radiusFirst, radiusSecond);
            constrainBodyToBoard(first, radiusFirst, width, bottom);
            constrainBodyToBoard(second, radiusSecond, width, bottom);
          }
        }
      }

      solveBoardOverlaps(bodies, width, bottom, radiusForLevel);
      maximumAfterCleanup = Math.max(
        maximumAfterCleanup,
        getMaximumPenetration(bodies, radiusForLevel),
      );
      bodies.forEach((body) => {
        const bodyRadius = radiusForLevel(body.level);
        maximumBoundaryViolation = Math.max(
          maximumBoundaryViolation,
          bodyRadius - body.x,
          body.x + bodyRadius - width,
          body.y + bodyRadius - bottom,
        );
      });
    }
  }

  assert.equal(bodies.length, 16);
  assert.ok(getMaximumPenetration(bodies, radiusForLevel) <= MAX_VISIBLE_PENETRATION);
  assert.ok(maximumAfterCleanup <= 2.25);
  assert.ok(maximumBoundaryViolation <= 1e-9);
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
