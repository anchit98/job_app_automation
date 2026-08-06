import bcrypt from "bcryptjs";

// bcryptjs is pure JS: cost 12 takes ~0.5-1.5s per hash/compare on a
// serverless vCPU, which made every login visibly slow. Cost 10 is still
// within OWASP guidance and ~4x faster; old cost-12 hashes are transparently
// rehashed on the next successful login (see signIn).
const ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/** True when a stored hash uses a higher cost than the current ROUNDS. */
export function passwordHashNeedsRehash(passwordHash: string): boolean {
  // bcrypt format: $2a$12$... — cost is the second segment.
  const cost = Number.parseInt(passwordHash.split("$")[2] ?? "", 10);
  return Number.isFinite(cost) && cost > ROUNDS;
}
