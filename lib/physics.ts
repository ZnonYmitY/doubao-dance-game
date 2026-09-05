export type CircleBody = {
  id: number;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angularVelocity: number;
};

// These are the launch-version coefficients. Keep the original bounce and
// response curve; extra substeps handle fast movement without making the pile
// feel artificially rigid.
export const CONTACT_SOLVER_ITERATIONS = 2;
export const CONTACT_SLOP = 0;
export const POSITION_CORRECTION = 0.82;
export const COLLISION_RESTITUTION = 0.12;
export const OVERLAP_SOLVER_ITERATIONS = 8;
export const OVERLAP_FALLBACK_ITERATIONS = 32;
export const MAX_VISIBLE_PENETRATION = 0.75;

export function getPhysicsSubsteps(
  bodies: CircleBody[],
  elapsed: number,
  radiusForLevel: (level: number) => number,
) {
  if (bodies.length === 0) return 2;
  let maximumTravel = 0;
  let smallestRadius = Number.POSITIVE_INFINITY;
  bodies.forEach((body) => {
    maximumTravel = Math.max(maximumTravel, Math.hypot(body.vx, body.vy) * elapsed);
    smallestRadius = Math.min(smallestRadius, radiusForLevel(body.level));
  });
  const safeTravel = Math.max(10, smallestRadius * 0.8);
  return Math.min(4, Math.max(2, Math.ceil(maximumTravel / safeTravel)));
}

export function constrainBodyToBoard(
  body: CircleBody,
  radius: number,
  width: number,
  bottom: number,
) {
  if (body.x - radius < 0) {
    body.x = radius;
  } else if (body.x + radius > width) {
    body.x = width - radius;
  }

  if (body.y + radius > bottom) {
    body.y = bottom - radius;
  }
}

export function resolveCircleContact(
  first: CircleBody,
  second: CircleBody,
  radiusFirst: number,
  radiusSecond: number,
) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const minimum = radiusFirst + radiusSecond;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= minimum * minimum) return false;

  const distance = Math.sqrt(distanceSquared);
  const nx = distance > 0.001 ? dx / distance : first.id <= second.id ? 1 : -1;
  const ny = distance > 0.001 ? dy / distance : 0;
  const overlap = minimum - distance;
  const massFirst = radiusFirst * radiusFirst;
  const massSecond = radiusSecond * radiusSecond;
  const totalMass = massFirst + massSecond;
  const correction = Math.max(0, overlap - CONTACT_SLOP) * POSITION_CORRECTION;
  const firstWeight = massSecond / totalMass;
  const secondWeight = massFirst / totalMass;

  first.x -= nx * correction * firstWeight;
  first.y -= ny * correction * firstWeight;
  second.x += nx * correction * secondWeight;
  second.y += ny * correction * secondWeight;

  const relativeVelocityX = second.vx - first.vx;
  const relativeVelocityY = second.vy - first.vy;
  const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;
  if (velocityAlongNormal < 0) {
    const impulse = (-(1 + COLLISION_RESTITUTION) * velocityAlongNormal) / (1 / massFirst + 1 / massSecond);
    const impulseX = impulse * nx;
    const impulseY = impulse * ny;
    first.vx -= impulseX / massFirst;
    first.vy -= impulseY / massFirst;
    second.vx += impulseX / massSecond;
    second.vy += impulseY / massSecond;
  }

  return true;
}

function movementCapacity(
  body: CircleBody,
  radius: number,
  directionX: number,
  directionY: number,
  width: number,
  bottom: number,
) {
  let capacity = Number.POSITIVE_INFINITY;
  if (directionX > 0.000001) {
    capacity = Math.min(capacity, (width - radius - body.x) / directionX);
  } else if (directionX < -0.000001) {
    capacity = Math.min(capacity, (body.x - radius) / -directionX);
  }
  if (directionY > 0.000001) {
    capacity = Math.min(capacity, (bottom - radius - body.y) / directionY);
  }
  return Math.max(0, capacity);
}

function separateCircleOverlap(
  first: CircleBody,
  second: CircleBody,
  radiusFirst: number,
  radiusSecond: number,
  width: number,
  bottom: number,
  equalWeights: boolean,
) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const minimum = radiusFirst + radiusSecond;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= minimum * minimum) return 0;

  const distance = Math.sqrt(distanceSquared);
  const nx = distance > 0.001 ? dx / distance : first.id <= second.id ? 1 : -1;
  const ny = distance > 0.001 ? dy / distance : 0;
  const penetration = minimum - distance;
  if (equalWeights) {
    const half = penetration * 0.5;
    first.x -= nx * half;
    first.y -= ny * half;
    second.x += nx * half;
    second.y += ny * half;
    constrainBodyToBoard(first, radiusFirst, width, bottom);
    constrainBodyToBoard(second, radiusSecond, width, bottom);
    return penetration;
  }

  const massFirst = radiusFirst * radiusFirst;
  const massSecond = radiusSecond * radiusSecond;
  const totalMass = massFirst + massSecond;
  const preferredFirst = penetration * (massSecond / totalMass);
  const preferredSecond = penetration - preferredFirst;
  const firstCapacity = movementCapacity(first, radiusFirst, -nx, -ny, width, bottom);
  const secondCapacity = movementCapacity(second, radiusSecond, nx, ny, width, bottom);

  let firstMove = preferredFirst;
  let secondMove = preferredSecond;
  if (firstMove > firstCapacity) {
    secondMove += firstMove - firstCapacity;
    firstMove = firstCapacity;
  }
  if (secondMove > secondCapacity) {
    firstMove += secondMove - secondCapacity;
    secondMove = secondCapacity;
  }
  firstMove = Math.min(firstMove, firstCapacity);
  secondMove = Math.min(secondMove, secondCapacity);

  first.x -= nx * firstMove;
  first.y -= ny * firstMove;
  second.x += nx * secondMove;
  second.y += ny * secondMove;
  return penetration;
}

export function getMaximumPenetration(
  bodies: CircleBody[],
  radiusForLevel: (level: number) => number,
) {
  let maximum = 0;
  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const first = bodies[firstIndex];
      const second = bodies[secondIndex];
      const minimum = radiusForLevel(first.level) + radiusForLevel(second.level);
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      maximum = Math.max(maximum, minimum - distance);
    }
  }
  return Math.max(0, maximum);
}

function solveOverlapPass(
  bodies: CircleBody[],
  width: number,
  bottom: number,
  radiusForLevel: (level: number) => number,
  reverse: boolean,
  equalWeights: boolean,
) {
  if (!reverse) {
    for (let firstIndex = 0; firstIndex < bodies.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
        const first = bodies[firstIndex];
        const second = bodies[secondIndex];
        separateCircleOverlap(
          first,
          second,
          radiusForLevel(first.level),
          radiusForLevel(second.level),
          width,
          bottom,
          equalWeights,
        );
      }
    }
  } else {
    for (let firstIndex = bodies.length - 1; firstIndex > 0; firstIndex -= 1) {
      for (let secondIndex = firstIndex - 1; secondIndex >= 0; secondIndex -= 1) {
        const first = bodies[firstIndex];
        const second = bodies[secondIndex];
        separateCircleOverlap(
          first,
          second,
          radiusForLevel(first.level),
          radiusForLevel(second.level),
          width,
          bottom,
          equalWeights,
        );
      }
    }
  }
  bodies.forEach((body) => constrainBodyToBoard(body, radiusForLevel(body.level), width, bottom));
}

// The launch response above remains untouched. This second pass changes only
// positions and transfers correction away from a wall- or floor-pinned body,
// so dense piles cannot keep a large hidden overlap after clamping.
export function solveBoardOverlaps(
  bodies: CircleBody[],
  width: number,
  bottom: number,
  radiusForLevel: (level: number) => number,
) {
  bodies.forEach((body) => constrainBodyToBoard(body, radiusForLevel(body.level), width, bottom));
  let remaining = getMaximumPenetration(bodies, radiusForLevel);
  if (remaining <= MAX_VISIBLE_PENETRATION) return remaining;

  for (let iteration = 0; iteration < OVERLAP_SOLVER_ITERATIONS; iteration += 1) {
    solveOverlapPass(bodies, width, bottom, radiusForLevel, iteration % 2 === 1, false);
    if (iteration === 1 || iteration === 3 || iteration === OVERLAP_SOLVER_ITERATIONS - 1) {
      remaining = getMaximumPenetration(bodies, radiusForLevel);
      if (remaining <= MAX_VISIBLE_PENETRATION) return remaining;
    }
  }

  // A severe multi-contact cycle can keep feeding mass-weighted corrections
  // back into the same trapped body. Equal position shares break that cycle,
  // but run only as a fallback so normal contacts retain the launch feel.
  for (let iteration = 0; iteration < OVERLAP_FALLBACK_ITERATIONS; iteration += 1) {
    solveOverlapPass(bodies, width, bottom, radiusForLevel, iteration % 2 === 1, true);
    if ((iteration + 1) % 4 === 0) {
      remaining = getMaximumPenetration(bodies, radiusForLevel);
      if (remaining <= MAX_VISIBLE_PENETRATION) return remaining;
    }
  }

  return getMaximumPenetration(bodies, radiusForLevel);
}
