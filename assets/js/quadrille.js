/**
 * Quadrille — client-side virtualization hook.
 *
 * The server renders only a buffer of rows and positions it inside a
 * full-height spacer with a `translateY` it computes itself. This hook owns
 * only the hot path:
 *
 *   - measure how many rows fit the viewport and tell the component,
 *   - watch `scrollTop`, and
 *   - ask the component for a new offset as scrolling nears a buffer edge.
 *
 * It never touches the buffer's transform or contents — those ride the normal
 * LiveView render diff — so there is no client/server position to reconcile.
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
export const Quadrille = {
  mounted() {
    this.viewport = this.el.querySelector(".quadrille-viewport")
    this.rowHeight = parseInt(this.el.dataset.rowHeight, 10) || 32
    this.overscan = parseInt(this.el.dataset.overscan, 10) || 20
    this.margin = Math.max(1, Math.floor(this.overscan / 2))
    this.viewportRows = 0
    this.inFlight = false
    this.frame = null

    this.measure()

    this.onScroll = () => this.scheduleCheck()
    this.viewport.addEventListener("scroll", this.onScroll, { passive: true })
    this.onResize = () => this.measure()
    window.addEventListener("resize", this.onResize)
  },

  updated() {
    // The component just patched in a new buffer; allow the next request and
    // catch up in case the user kept scrolling while this one was in flight.
    this.inFlight = false
    this.maybeLoad()
  },

  destroyed() {
    if (this.viewport) this.viewport.removeEventListener("scroll", this.onScroll)
    window.removeEventListener("resize", this.onResize)
    if (this.frame) cancelAnimationFrame(this.frame)
  },

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
}

export default Quadrille
