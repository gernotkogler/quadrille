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

const MIN_COLUMN_WIDTH = 40

export const Quadrille = {
  mounted() {
    this.viewport = this.el.querySelector(".quadrille-viewport")
    this.rowHeight = parseInt(this.el.dataset.rowHeight, 10) || 32
    this.overscan = parseInt(this.el.dataset.overscan, 10) || 20
    this.margin = Math.max(1, Math.floor(this.overscan / 2))
    this.viewportRows = 0
    this.inFlight = false
    this.frame = null
    this.storageKey = `quadrille:widths:${this.el.id}`

    this.restoreWidths()
    this.measure()

    this.onScroll = () => this.scheduleCheck()
    this.viewport.addEventListener("scroll", this.onScroll, { passive: true })
    this.onResize = () => {
      this.measure()
      this.reconcile()
    }
    window.addEventListener("resize", this.onResize)

    this.onPointerDown = (e) => this.startResize(e)
    this.el.addEventListener("pointerdown", this.onPointerDown)
  },

  updated() {
    // The component just patched in a new buffer; allow the next request and
    // catch up in case the user kept scrolling while this one was in flight.
    this.inFlight = false
    // Re-assert any resized widths in case a patch reset the root style.
    this.applyWidths(this.widths)
    this.reconcile()
    this.maybeLoad()
  },

  destroyed() {
    if (this.viewport) this.viewport.removeEventListener("scroll", this.onScroll)
    window.removeEventListener("resize", this.onResize)
    this.el.removeEventListener("pointerdown", this.onPointerDown)
    if (this.frame) cancelAnimationFrame(this.frame)
  },

  // --- Virtualization -------------------------------------------------------

  // Tell the component how many rows the viewport can show so it can size the
  // buffer. Recomputed on resize.
  measure() {
    const rows = Math.ceil(this.viewport.clientHeight / this.rowHeight)
    if (rows > 0 && rows !== this.viewportRows) {
      this.viewportRows = rows
      this.pushEventTo(this.el, "viewport", { rows })
    }
  },

  scheduleCheck() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.maybeLoad()
    })
  },

  // Request a new buffer if the visible range is no longer comfortably inside
  // the loaded one.
  maybeLoad() {
    if (this.inFlight || this.viewportRows === 0) return

    const offset = parseInt(this.el.dataset.offset, 10) || 0
    const limit = parseInt(this.el.dataset.limit, 10) || 0
    const totalCount = parseInt(this.el.dataset.totalCount, 10) || 0

    const firstVisible = Math.floor(this.viewport.scrollTop / this.rowHeight)

    const nearTop = firstVisible < offset + this.margin && offset > 0
    const lastVisible = firstVisible + this.viewportRows
    const nearBottom =
      lastVisible > offset + limit - this.margin && offset + limit < totalCount

    if (nearTop || nearBottom) {
      this.inFlight = true
      this.pushEventTo(this.el, "load_window", { first_visible_row: firstVisible })
    }
  },

  // --- Column resizing ------------------------------------------------------

  columnKeys() {
    return Array.from(this.el.querySelectorAll(".quadrille-header-cell[data-col]")).map(
      (c) => c.dataset.col,
    )
  },

  // Resizable columns — everything except the fill column.
  fixedKeys() {
    return Array.from(
      this.el.querySelectorAll(".quadrille-header-cell[data-col]:not([data-fill])"),
    ).map((c) => c.dataset.col)
  },

  fillKey() {
    const cell = this.el.querySelector(".quadrille-header-cell[data-fill]")
    return cell ? cell.dataset.col : null
  },

  // The fill column's configured width is its floor; it never shrinks past it.
  fillFloor() {
    const key = this.fillKey()
    return key ? this.columnWidth(key) : 0
  },

  // Total width available to the fixed columns without overflowing.
  budget() {
    return this.viewport.clientWidth - this.fillFloor()
  },

  // Shrink fixed columns if their total (e.g. from stale saved widths) exceeds
  // the budget, so every column stays visible and none goes below its minimum.
  // Takes width only from columns still above the floor, iterating so that
  // columns pinned at the floor don't force an overflow. Runs on mount and on
  // window resize.
  reconcile() {
    const keys = this.fixedKeys()
    const budget = this.budget()

    if (keys.length > 0 && budget > 0) {
      const widths = keys.map((k) => this.columnWidth(k))
      let sum = widths.reduce((a, b) => a + b, 0)

      for (let iter = 0; iter < 12 && sum > budget; iter++) {
        const shrinkable = widths.reduce((s, w) => s + (w > MIN_COLUMN_WIDTH ? w : 0), 0)
        if (shrinkable === 0) break

        const excess = sum - budget
        for (let i = 0; i < widths.length; i++) {
          if (widths[i] > MIN_COLUMN_WIDTH) {
            widths[i] = Math.max(MIN_COLUMN_WIDTH, widths[i] - (excess * widths[i]) / shrinkable)
          }
        }
        sum = widths.reduce((a, b) => a + b, 0)
      }

      // Floor only reduces widths, so the fit is preserved.
      keys.forEach((k, i) => this.setColumnWidth(k, Math.floor(widths[i])))
    }

    this.recomputeTotal()
  },

  columnWidth(key) {
    const raw = this.el.style.getPropertyValue(`--q-col-${key}`)
    return parseFloat(raw) || 0
  },

  setColumnWidth(key, px) {
    this.el.style.setProperty(`--q-col-${key}`, `${px}px`)
  },

  recomputeTotal() {
    const total = this.columnKeys().reduce((sum, key) => sum + this.columnWidth(key), 0)
    this.el.style.setProperty("--q-total", `${total}px`)
  },

  startResize(e) {
    const handle = e.target.closest(".quadrille-resizer")
    if (!handle) return

    e.preventDefault()
    const key = handle.dataset.col
    const startX = e.clientX
    const startWidth = this.columnWidth(key)
    handle.setPointerCapture(e.pointerId)
    this.el.classList.add("quadrille-resizing")

    const onMove = (ev) => {
      const desired = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (ev.clientX - startX)))
      // Cap so the fixed columns never overflow the budget: this column can only
      // take the space the others aren't already using.
      const sumOthers = this.fixedKeys()
        .filter((k) => k !== key)
        .reduce((sum, k) => sum + this.columnWidth(k), 0)
      const maxWidth = Math.max(MIN_COLUMN_WIDTH, this.budget() - sumOthers)
      this.setColumnWidth(key, Math.min(desired, maxWidth))
      this.recomputeTotal()
    }

    const onUp = () => {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
      this.el.classList.remove("quadrille-resizing")
      this.persistWidths()
    }

    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  },

  // Snapshot current widths to localStorage and to `this.widths`.
  persistWidths() {
    const widths = {}
    for (const key of this.columnKeys()) widths[key] = this.columnWidth(key)
    this.widths = widths
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(widths))
    } catch (_e) {
      // localStorage unavailable (private mode, quota) — widths just won't persist.
    }
  },

  restoreWidths() {
    this.widths = {}
    try {
      const saved = localStorage.getItem(this.storageKey)
      if (saved) this.widths = JSON.parse(saved)
    } catch (_e) {
      this.widths = {}
    }
    this.applyWidths(this.widths)
    this.reconcile()
  },

  applyWidths(widths) {
    if (!widths) return
    let changed = false
    for (const [key, px] of Object.entries(widths)) {
      if (px > 0 && this.columnWidth(key) !== px) {
        this.setColumnWidth(key, px)
        changed = true
      }
    }
    if (changed) this.recomputeTotal()
  },
}

export default Quadrille
