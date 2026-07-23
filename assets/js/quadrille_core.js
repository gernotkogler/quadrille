/**
 * Pure geometry for the Quadrille hook — no DOM, so it is unit-testable.
 *
 * These are the risk-bearing bits: buffer edge-detection, the resize clamp, and
 * the reconcile water-fill. The hook (quadrille.js) reads/writes the DOM and
 * delegates the math here.
 */

/**
 * Should the client ask the server for a new buffer? True when the visible
 * range is no longer comfortably inside the loaded one (within `margin` of an
 * edge) and there is more data in that direction.
 */
export const shouldLoadWindow = ({ firstVisible, viewportRows, offset, limit, totalCount, margin }) => {
  const nearTop = firstVisible < offset + margin && offset > 0
  const lastVisible = firstVisible + viewportRows
  const nearBottom = lastVisible > offset + limit - margin && offset + limit < totalCount
  return nearTop || nearBottom
}

/**
 * Clamp a resize drag so a column trades width only with its right neighbor:
 * it can grow by at most the neighbor's slack (`startRight - rightMin`) and
 * shrink by at most its own slack (`startWidth - selfMin`). Returns the applied
 * delta.
 */
export const clampResizeDelta = (rawDelta, startWidth, startRight, selfMin, rightMin) => {
  const maxDelta = startRight - rightMin
  const minDelta = -(startWidth - selfMin)
  return Math.max(minDelta, Math.min(maxDelta, rawDelta))
}

/**
 * Shrink column widths so their total fits `budget`, taking width only from
 * columns still above `minWidth` and iterating so that columns pinned at the
 * floor don't force an overflow. Widths that already fit are returned unchanged
 * (floored). Never returns a width below `minWidth`.
 */
export const reconcileWidths = (widths, budget, minWidth, maxIter = 12) => {
  // One proportional shrink pass; returns the same array reference (no change)
  // once it fits or nothing can shrink further.
  const shrinkOnce = (ws) => {
    const sum = ws.reduce((a, b) => a + b, 0)
    if (budget <= 0 || sum <= budget) return ws

    const shrinkable = ws.reduce((s, w) => s + (w > minWidth ? w : 0), 0)
    if (shrinkable === 0) return ws

    const excess = sum - budget
    return ws.map((w) => (w > minWidth ? Math.max(minWidth, w - (excess * w) / shrinkable) : w))
  }

  const iterate = (ws, remaining) => {
    const next = shrinkOnce(ws)
    return next === ws || remaining <= 0 ? next : iterate(next, remaining - 1)
  }

  return iterate(widths.slice(), maxIter).map((w) => Math.floor(w))
}
