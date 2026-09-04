export type CircleBody = {
  id: number;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angularVelocity: number;
};

export const CONTACT_SOLVER_ITERATIONS = 4;
export const CONTACT_SLOP = 0.08;
export const POSITION_CORRECTION = 0.72;

export function constrainBodyToBoard(
  body: CircleBody,
  radius: number,
  width: number,
  bottom: number,
) {
  if (body.x - radius < 0) {
    body.x = radius;
    if (body.vx < 0) body.vx = 0;
  } else if (body.x + radius > width) {
    body.x = width - radius;
    if (body.vx > 0) body.vx = 0;
  }

  if (body.y + radius > bottom) {
    body.y = bottom - radius;
    if (body.vy > 0) body.vy = 0;
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

  first.x -= nx * correction * (massSecond / totalMass);
  first.y -= ny * correction * (massSecond / totalMass);
  second.x += nx * correction * (massFirst / totalMass);
  second.y += ny * correction * (massFirst / totalMass);

  const relativeVelocityX = second.vx - first.vx;
  const relativeVelocityY = second.vy - first.vy;
  const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;
  if (velocityAlongNormal < 0) {
    // Only energetic impacts bounce. Resting contacts are inelastic so gravity
    // cannot keep re-introducing visible motion into a settled pile.
    const restitution = velocityAlongNormal < -120 ? 0.1 : 0;
    const impulse = (-(1 + restitution) * velocityAlongNormal) / (1 / massFirst + 1 / massSecond);
    const impulseX = impulse * nx;
    const impulseY = impulse * ny;
    first.vx -= impulseX / massFirst;
    first.vy -= impulseY / massFirst;
    second.vx += impulseX / massSecond;
    second.vy += impulseY / massSecond;
  }

  return true;
}

export function stabilizeRestingPile(
  bodies: CircleBody[],
  width: number,
  bottom: number,
  radiusForLevel: (level: number) => number,
) {
  bodies.forEach((body) => {
    constrainBodyToBoard(body, radiusForLevel(body.level), width, bottom);
  });

  bodies.forEach((body) => {
    const radius = radiusForLevel(body.level);
    const onFloor = bottom - (body.y + radius) <= 0.9;
    const supportedByBody = bodies.some((other) => {
      if (other.id === body.id || other.y <= body.y) return false;
      const dx = other.x - body.x;
      const dy = other.y - body.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.001 || distance > radius + radiusForLevel(other.level) + 1.1) return false;
      return dy / distance > 0.42;
    });

    if (!onFloor && !supportedByBody) return;
    if (Math.abs(body.vx) <= 5 && Math.abs(body.vy) <= 14) {
      body.vx = 0;
      body.vy = 0;
      body.angularVelocity = 0;
      return;
    }

    body.vx *= 0.9;
    body.angularVelocity *= 0.82;
  });
}
