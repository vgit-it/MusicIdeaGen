// Lite mode for phones (docs/PERFORMANCE.md): the stage is drawn 30 times a second, not 60, and the
// stage lights are made 15 times a second. band.html?lite forces it on, ?full forces it off; otherwise
// a touch screen that is small or has few cores gets it. Desktop is unchanged.

function detect(): boolean {
  if (typeof location === 'undefined') return false;
  const q = new URLSearchParams(location.search);
  if (q.has('full')) return false;
  if (q.has('lite')) return true;
  try {
    const touch = matchMedia('(pointer: coarse)').matches;
    const small = Math.min(screen.width, screen.height) <= 820;
    const weak = (navigator.hardwareConcurrency || 4) <= 4;
    return touch && (small || weak);
  } catch {
    return false;
  }
}

/** True on phones (or with ?lite). */
export const LITE = detect();
