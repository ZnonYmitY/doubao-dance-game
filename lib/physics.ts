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
