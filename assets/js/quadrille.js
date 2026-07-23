/**
 * Quadrille — client-side virtualization + column-resize hook.
 *
 * The server renders only a buffer of rows and positions it inside a
 * full-height spacer with a `translateY` it computes itself. This hook owns
 * the client-only concerns:
 *
 *   - measure how many rows fit the viewport and tell the component,
 *   - watch `scrollTop`, and ask the component for a new offset near a buffer edge,
 *   - resize columns by dragging the `--q-col-<key>` CSS variables, persisting
 *     widths to localStorage.
 *
 * It never touches the buffer's transform or contents — those ride the normal
 * LiveView render diff — so there is no client/server position to reconcile.
 * Column widths live in CSS variables the server only renders once (at their
 * initial values), so LiveView's diff never clobbers a user's resized columns.
 *
 * Style: LiveView drives hooks by calling `mounted`/`updated`/`destroyed` as
 * methods on the hook object (with `this` = the hook context), so that thin
 * shell is unavoidable. Everything else is written functionally: `createGrid`
 * closes over the context and DOM, keeps state in local variables, and exposes
 * plain functions — no `this`, no shared mutable object.
 *
 * Register it with your LiveSocket:
 *
 *     import { Quadrille } from "quadrille"
 *     const liveSocket = new LiveSocket("/live", Socket, {
 *       hooks: { Quadrille },
 *       // ...
 *     })
 *
 * @type {import("phoenix_live_view").HooksOptions}
 */

import { shouldLoadWindow, clampResizeDelta, reconcileWidths } from "./quadrille_core.js"

const MIN_COLUMN_WIDTH = 40

/**
 * Wire up a grid for one hook context. Returns `{ updated, destroyed }` for the
 * hook shell to delegate to; all state lives in this closure.
 *
 * @param {object} hook - the LiveView hook context (provides el, pushEventTo).
 */
function createGrid(hook) {
  const el = hook.el
  const viewport = el.querySelector(".quadrille-viewport")
  const headerViewport = el.querySelector(".quadrille-header-viewport")
  const rowHeight = parseInt(el.dataset.rowHeight, 10) || 32
  const overscan = parseInt(el.dataset.overscan, 10) || 20
  const margin = Math.max(1, Math.floor(overscan / 2))
  const storageKey = `quadrille:widths:${el.id}`

  let viewportRows = 0
  let inFlight = false
  let frame = null
  let widths = {}

  // --- CSS-variable helpers -------------------------------------------------

  const columnWidth = (key) => parseFloat(el.style.getPropertyValue(`--q-col-${key}`)) || 0
  const setColumnWidth = (key, px) => el.style.setProperty(`--q-col-${key}`, `${px}px`)

  const columnKeys = () =>
    Array.from(el.querySelectorAll(".quadrille-header-cell[data-col]")).map((c) => c.dataset.col)

  // Resizable columns — everything except the fill column.
  const fixedKeys = () =>
    Array.from(el.querySelectorAll(".quadrille-header-cell[data-col]:not([data-fill])")).map(
      (c) => c.dataset.col,
    )

  const fillKey = () => {
    const cell = el.querySelector(".quadrille-header-cell[data-fill]")
    return cell ? cell.dataset.col : null
  }

  // The fill column's configured width is its floor; it never shrinks past it.
  const fillFloor = () => {
    const key = fillKey()
    return key ? columnWidth(key) : 0
  }

  // Total width available to the fixed columns without overflowing.
  const budget = () => viewport.clientWidth - fillFloor()

  const recomputeTotal = () => {
    const total = columnKeys().reduce((sum, key) => sum + columnWidth(key), 0)
    el.style.setProperty("--q-total", `${total}px`)
  }

  // --- Virtualization -------------------------------------------------------

  // Reserve the body's vertical-scrollbar width on the header so columns line
  // up (0 for overlay scrollbars, ~15px for classic ones).
  const measureScrollbar = () => {
    const width = viewport.offsetWidth - viewport.clientWidth
    el.style.setProperty("--q-scrollbar", `${Math.max(0, width)}px`)
  }

  // Keep the (clipped) header aligned with the body's horizontal scroll.
  const syncHeaderScroll = () => {
    if (headerViewport) headerViewport.scrollLeft = viewport.scrollLeft
  }

  // Tell the component how many rows the viewport can show so it can size the
  // buffer. Recomputed on resize.
  const measure = () => {
    measureScrollbar()
    const rows = Math.ceil(viewport.clientHeight / rowHeight)
    if (rows > 0 && rows !== viewportRows) {
      viewportRows = rows
      hook.pushEventTo(el, "viewport", { rows })
    }
  }

  // Request a new buffer if the visible range is no longer comfortably inside
  // the loaded one.
  const maybeLoad = () => {
    if (inFlight || viewportRows === 0) return

    const offset = parseInt(el.dataset.offset, 10) || 0
    const limit = parseInt(el.dataset.limit, 10) || 0
    const totalCount = parseInt(el.dataset.totalCount, 10) || 0
    const firstVisible = Math.floor(viewport.scrollTop / rowHeight)

    const load = shouldLoadWindow({ firstVisible, viewportRows, offset, limit, totalCount, margin })

    if (load) {
      inFlight = true
      hook.pushEventTo(el, "load_window", { first_visible_row: firstVisible })
    }
  }

  const scheduleCheck = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = null
      maybeLoad()
    })
  }

  // --- Column widths --------------------------------------------------------

  // Shrink fixed columns if their total (e.g. from stale saved widths) exceeds
  // the budget, so every column stays visible and none goes below its minimum.
  const reconcile = () => {
    const keys = fixedKeys()
    const available = budget()
    if (keys.length > 0 && available > 0) {
      const fitted = reconcileWidths(
        keys.map(columnWidth),
        available,
        MIN_COLUMN_WIDTH,
      )
      keys.forEach((key, i) => setColumnWidth(key, fitted[i]))
    }
    recomputeTotal()
  }

  const applyWidths = (saved) => {
    if (!saved) return
    let changed = false
    for (const [key, px] of Object.entries(saved)) {
      if (px > 0 && columnWidth(key) !== px) {
        setColumnWidth(key, px)
        changed = true
      }
    }
    if (changed) recomputeTotal()
  }

  const persistWidths = () => {
    widths = Object.fromEntries(columnKeys().map((key) => [key, columnWidth(key)]))
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths))
    } catch (_e) {
      // localStorage unavailable (private mode, quota) — widths just won't persist.
    }
  }

  const restoreWidths = () => {
    try {
      const saved = localStorage.getItem(storageKey)
      widths = saved ? JSON.parse(saved) : {}
    } catch (_e) {
      widths = {}
    }
    applyWidths(widths)
    reconcile()
  }

  // A handle trades width only with the column immediately to its right, so
  // dragging the email|city boundary shrinks city and widens email. The
  // neighbor may be another fixed column or the fill column; either way the
  // total stays constant, so nothing ever overflows.
  const startResize = (e) => {
    const handle = e.target.closest(".quadrille-resizer")
    if (!handle) return

    const headerCell = handle.closest(".quadrille-header-cell")
    const rightCell = headerCell && headerCell.nextElementSibling
    if (!rightCell) return

    e.preventDefault()
    const key = handle.dataset.col
    const rightKey = rightCell.dataset.col
    const rightIsFill = rightCell.hasAttribute("data-fill")
    const startX = e.clientX
    const startWidth = columnWidth(key)
    // The neighbor's *rendered* width — the fill column has no fixed var.
    const startRight = Math.round(rightCell.getBoundingClientRect().width)
    const rightMin = rightIsFill ? fillFloor() : MIN_COLUMN_WIDTH

    handle.setPointerCapture(e.pointerId)
    el.classList.add("quadrille-resizing")

    const onMove = (ev) => {
      const delta = clampResizeDelta(
        Math.round(ev.clientX - startX),
        startWidth,
        startRight,
        MIN_COLUMN_WIDTH,
        rightMin,
      )
      setColumnWidth(key, startWidth + delta)
      // The fill neighbor shrinks on its own as this column's var grows.
      if (!rightIsFill) setColumnWidth(rightKey, startRight - delta)
      recomputeTotal()
    }

    const onUp = () => {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
      el.classList.remove("quadrille-resizing")
      persistWidths()
    }

    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  }

  // --- Listeners + lifecycle ------------------------------------------------

  const onScroll = () => {
    syncHeaderScroll()
    scheduleCheck()
  }
  const onResize = () => {
    measure()
    reconcile()
  }
  const onPointerDown = (e) => startResize(e)

  restoreWidths()
  measure()
  viewport.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("resize", onResize)
  el.addEventListener("pointerdown", onPointerDown)

  return {
    updated() {
      // The component just patched in a new buffer; allow the next request and
      // catch up in case the user kept scrolling while this one was in flight.
      inFlight = false
      // Re-assert any resized widths in case a patch reset the root style.
      applyWidths(widths)
      reconcile()
      measureScrollbar()
      syncHeaderScroll()
      maybeLoad()
    },

    destroyed() {
      viewport.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      el.removeEventListener("pointerdown", onPointerDown)
      if (frame) cancelAnimationFrame(frame)
    },
  }
}

// Thin lifecycle shell: LiveView calls these with `this` = hook context. Each
// just delegates to the functional grid created on mount.
export const Quadrille = {
  mounted() {
    this.grid = createGrid(this)
  },
  updated() {
    this.grid.updated()
  },
  destroyed() {
    this.grid.destroyed()
  },
}

export default Quadrille
