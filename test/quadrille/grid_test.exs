defmodule Quadrille.GridTest do
  use ExUnit.Case, async: true

  import Phoenix.LiveViewTest

  defmodule TestSource do
    @behaviour Quadrille.DataSource

    @impl true
    def count(_source, _query), do: 1_000

    @impl true
    def fetch_window(_source, _offset, 0, _query), do: []

    def fetch_window(_source, offset, limit, _query) do
      last = min(offset + limit - 1, 999)
      for i <- offset..last, do: %{id: i + 1, name: "Row #{i + 1}"}
    end
  end

  @columns [%{key: :id, label: "ID"}, %{key: :name, label: "Name"}]

  test "renders the initial buffer at offset 0 with a full-height spacer" do
    html =
      render_component(Quadrille.Grid,
        id: "grid",
        data_source: TestSource,
        columns: @columns,
        row_height: 32
      )

    # header labels
    assert html =~ "ID"
    assert html =~ "Name"

    # first rows of the initial window are present
    assert html =~ "Row 1"
    assert html =~ "Row 2"

    # spacer spans the whole dataset (1000 * 32) and the buffer sits at the top
    assert html =~ "height: 32000px"
    assert html =~ "translateY(0px)"

    # data attributes the hook reads
    assert html =~ ~s(data-total-count="1000")
    assert html =~ ~s(data-offset="0")
  end
end
