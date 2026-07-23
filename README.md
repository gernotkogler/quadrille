# Quadrille

A **LiveView-native, virtualized, editable data grid** for Phoenix — Excel-like
power over hundreds of thousands of rows, without a JavaScript framework.

> `quadrillé` — French for grid-ruled paper. Quadrille is a grid, so cells stay
> ordinary HEEx you style with Tailwind, while a thin JS hook makes scrolling
> over huge datasets smooth.

## Why

[`react-data-grid`](https://github.com/adazzle/react-data-grid) is powerful and
fast but ties you to React, is effectively unmaintained, and is hard to extend.
Quadrille aims for the same performance and feature set as a first-class LiveView
citizen: your cells are HEEx, your data lives on the server, and the grid never
ships an entire dataset to the browser.

## How it works

Quadrille splits responsibilities along the client/server boundary:

- **Server (LiveView) owns the data.** It never renders all rows. A
  `Quadrille.DataSource` callback supplies a *window* of rows on demand; the grid
  renders only that buffer (viewport + overscan) as HEEx.
- **Client (JS hook) owns the hot path.** It virtualizes within the buffer using
  `translateY` inside a full-height spacer, so scrolling is smooth and
  round-trip-free. Nearing a buffer edge, it asks the server for the next window.

Cells are therefore normal HEEx/Tailwind — easy to style, easy to extend.

## Status

Early development. Roadmap:

1. Virtualized read-only grid + column resize ← **in progress**
2. Editable cells (local immediacy + server validation)
3. Range selection + copy/paste
4. Sorting + filtering
5. Autocomplete cell editor
6. Multi-user live sync via PubSub

## Development

```sh
mix dev        # self-contained demo server over 200k rows -> http://localhost:4000
mix test       # Elixir tests (component render, window geometry)
mix test.js    # JS tests (hook geometry: edge-detection, resize, reconcile)
```

The JS hook's pure logic lives in `assets/js/quadrille_core.js` and is unit-tested
with Node's built-in test runner (no npm dependencies). `mix test.js` runs it.

## Installation

Not yet published to Hex. During development, use a git dependency:

```elixir
def deps do
  [
    {:quadrille, github: "gernotkogler/quadrille"}
  ]
end
```

## License

MIT © Gernot Kogler
