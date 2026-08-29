export const mobileTabPaths = ["/", "/funnel", "/capture", "/listings", "/contacts"] as const;

export type MobileTabPath = (typeof mobileTabPaths)[number];

export function swipeDestination(
  pathname: string,
  horizontalDistance: number,
  horizontalVelocity: number,
): MobileTabPath | null {
  if (Math.abs(horizontalDistance) < 70 && Math.abs(horizontalVelocity) < 0.35) return null;
  const current = mobileTabPaths.indexOf(pathname as MobileTabPath);
  if (current < 0) return null;
  const next = Math.max(0, Math.min(mobileTabPaths.length - 1, current + (horizontalDistance < 0 ? 1 : -1)));
  return next === current ? null : mobileTabPaths[next];
}
