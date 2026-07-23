defmodule Quadrille.GridTest do
  use ExUnit.Case, async: true

  import Phoenix.LiveViewTest
  import Phoenix.ConnTest

  @endpoint Quadrille.GridTest.Endpoint

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

  defmodule EmptySource do
    @behaviour Quadrille.DataSource
    @impl true
    def count(_source, _query), do: 0
    @impl true
    def fetch_window(_source, _offset, _limit, _query), do: []
  end

  defmodule TestLive do
    use Phoenix.LiveView

    def mount(_params, _session, socket), do: {:ok, socket}

    def render(assigns) do
      ~H"""
      <.live_component
        module={Quadrille.Grid}
        id="grid"
        data_source={TestSource}
        columns={[%{key: :id, label: "ID"}, %{key: :name, label: "Name"}]}
        row_height={32}
      />
      """
    end
  end

  defmodule Endpoint do
    use Phoenix.Endpoint, otp_app: :quadrille
    socket("/live", Phoenix.LiveView.Socket)
  end

  setup_all do
    Application.put_env(:quadrille, Endpoint,
      secret_key_base: String.duplicate("a", 64),
      live_view: [signing_salt: "grid_test_salt"]
    )

    start_supervised!(Endpoint)
    :ok
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

  test "exposes grid ARIA semantics so virtualization stays announceable" do
    html =
      render_component(Quadrille.Grid,
        id: "grid",
        data_source: TestSource,
        columns: @columns,
        row_height: 32
      )

    # The DOM only holds a buffer, so screen readers rely on these counts/indexes
    # to know the true size and position rather than the ~50 rendered rows.
    assert html =~ ~s(role="grid")
    assert html =~ ~s(aria-readonly="true")
    assert html =~ ~s(aria-rowcount="1001")
    assert html =~ ~s(aria-colcount="2")
    # header row is index 1; first data row (absolute 0) is index 2
    assert html =~ ~s(aria-rowindex="1")
    assert html =~ ~s(aria-rowindex="2")
    assert html =~ ~s(aria-colindex="1")
  end

  test "an empty dataset renders the header and a zero-height spacer" do
    html =
      render_component(Quadrille.Grid,
        id: "grid",
        data_source: EmptySource,
        columns: @columns,
        row_height: 32
      )

    # header still renders; body is empty and the scrollbar collapses
    assert html =~ "ID"
    assert html =~ "Name"
    refute html =~ ~s(role="gridcell")
    assert html =~ "height: 0px"
    assert html =~ ~s(aria-rowcount="1")
    assert html =~ ~s(data-total-count="0")
  end

  test "scrolling deep into the dataset swaps the buffer" do
    {:ok, lv, html} = live_isolated(build_conn(), TestLive)

    assert html =~ "Row 1"
    refute html =~ "Row 900"

    # The hook pushes these as the viewport is measured and scrolled near an edge.
    lv |> element("#grid") |> render_hook("viewport", %{"rows" => 20})
    html = lv |> element("#grid") |> render_hook("load_window", %{"first_visible_row" => 900})

    assert html =~ "Row 900"
    # first_visible 900, overscan 20 -> offset 880; the deep row also carries its
    # absolute aria-rowindex (880 + 2).
    assert html =~ ~s(data-offset="880")
    assert html =~ ~s(aria-rowindex="882")
  end
end
