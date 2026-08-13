export type PlayerAccessState = "checking" | "signed-out" | "allowed";

export function playerAccessState(
  authResolved: boolean,
  userId?: string | null,
): PlayerAccessState {
  if (!authResolved) return "checking";
  return userId ? "allowed" : "signed-out";
}
