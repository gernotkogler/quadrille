defmodule Quadrille do
  @moduledoc """
  A LiveView-native, virtualized, editable data grid for large datasets.

  Quadrille renders only a windowed buffer of rows as HEEx on the server while a
  thin JS hook virtualizes scrolling on the client, so grids stay smooth over
  hundreds of thousands of rows without shipping the whole dataset to the
  browser.

  See `README.md` for the architecture and roadmap.
  """
end
