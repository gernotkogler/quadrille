defmodule Quadrille.Grid do
  @moduledoc """
  A virtualized, server-windowed data grid as a stateful LiveComponent.

  The component holds the windowing state (total count, current buffer offset and
  the rows for it) and renders only that buffer as HEEx. A full-height spacer
  gives the scrollbar its true size; the buffer is positioned inside it with a
  server-rendered `translateY` keyed to the exact offset just rendered, so the
  DOM and its position always agree — the client hook never has to reconcile
  them.

  The companion JS hook (`assets/js/quadrille.js`, registered as `"Quadrille"`)
  sizes the spacer, watches the viewport's `scrollTop`, and asks the component
  for a new offset as scrolling nears a buffer edge.

  ## Usage

      <.live_component
        module={Quadrille.Grid}
        id="people"
        data_source={MyApp.PeopleSource}
        source={@tenant_id}
        columns={[
          %{key: :id, label: "ID", width: "80px"},
          %{key: :name, label: "Name"},
          %{key: :email, label: "Email"}
        ]}
      />

  ## Options

    * `:id` (required) — DOM id, also the LiveComponent id.
    * `:data_source` (required) — module implementing `Quadrille.DataSource`.
    * `:source` — opaque host state passed to the data source (default `nil`).
    * `:columns` (required) — list of `%{key:, label:, width: (optional)}`.
    * `:row_height` — fixed row height in px (default `32`).
    * `:overscan` — extra rows rendered above and below the viewport (default `20`).
    * `:height` — CSS height of the scroll viewport (default `"600px"`).
    * `:row_id` — `fn row -> id end` for stable row DOM ids (default uses `row[:id]`).
  """
  use Phoenix.LiveComponent

  alias Quadrille.Window

  @default_viewport_rows 30

  @impl true
  def mount(socket) do
    {:ok,
     assign(socket,
       row_height: 32,
       overscan: 20,
       height: "600px",
       viewport_rows: @default_viewport_rows,
       first_visible_row: 0,
       source: nil,
       columns: [],
       row_id: nil,
       loaded?: false,
       rows: [],
       total_count: 0,
       offset: 0,
       limit: 0,
       translate_y: 0,
       spacer_height: 0
     )}
  end

  @impl true
  def update(assigns, socket) do
    socket = assign(socket, assigns)

    socket =
      if socket.assigns.loaded? do
        socket
      else
        total = socket.assigns.data_source.count(socket.assigns.source, %{})

        socket
        |> assign(total_count: total, loaded?: true)
        |> load(0)
      end

    {:ok, socket}
  end

  @impl true
  def handle_event("viewport", %{"rows" => rows}, socket) when is_integer(rows) and rows > 0 do
    {:noreply,
     socket
     |> assign(viewport_rows: rows)
     |> load(socket.assigns.first_visible_row)}
  end

  def handle_event("load_window", %{"first_visible_row" => row}, socket) when is_integer(row) do
    {:noreply, load(socket, row)}
  end

  # Fetch and assign the buffer whose viewport top is `first_visible_row`.
  defp load(socket, first_visible_row) do
    %{
      data_source: data_source,
      source: source,
      total_count: total_count,
      row_height: row_height,
      viewport_rows: viewport_rows,
      overscan: overscan
    } = socket.assigns

    slice =
      Window.slice(%{
        total_count: total_count,
        row_height: row_height,
        first_visible_row: first_visible_row,
        viewport_rows: viewport_rows,
        overscan: overscan
      })

    rows = data_source.fetch_window(source, slice.offset, slice.limit, %{})

    assign(socket,
      first_visible_row: first_visible_row,
      offset: slice.offset,
      limit: slice.limit,
      translate_y: slice.translate_y,
      spacer_height: slice.spacer_height,
      rows: rows
    )
  end

  defp row_dom_id(assigns, row, index) do
    id =
      cond do
        assigns.row_id -> assigns.row_id.(row)
        is_map(row) and is_map_key(row, :id) -> row.id
        true -> assigns.offset + index
      end

    "#{assigns.id}-row-#{id}"
  end

  defp cell_style(%{width: width}) when is_binary(width),
    do: "flex: 0 0 #{width}; width: #{width};"

  defp cell_style(_col), do: "flex: 1 1 0;"

  defp cell_value(row, key) when is_map(row), do: Map.get(row, key)
  defp cell_value(row, key), do: row[key]

  @impl true
  def render(assigns) do
    ~H"""
    <div
      id={@id}
      phx-hook="Quadrille"
      data-row-height={@row_height}
      data-overscan={@overscan}
      data-total-count={@total_count}
      data-offset={@offset}
      data-limit={@limit}
      class="quadrille"
    >
      <div class="quadrille-header" role="row">
        <div
          :for={col <- @columns}
          class="quadrille-cell quadrille-header-cell"
          style={cell_style(col)}
          role="columnheader"
        >
          {col.label}
        </div>
      </div>

      <div
        id={"#{@id}-viewport"}
        class="quadrille-viewport"
        style={"height: #{@height}; overflow: auto;"}
      >
        <div class="quadrille-spacer" style={"height: #{@spacer_height}px; position: relative;"}>
          <div class="quadrille-window" style={"transform: translateY(#{@translate_y}px);"}>
            <div
              :for={{row, index} <- Enum.with_index(@rows)}
              id={row_dom_id(assigns, row, index)}
              class="quadrille-row"
              style={"height: #{@row_height}px;"}
              role="row"
            >
              <div
                :for={col <- @columns}
                class="quadrille-cell"
                style={cell_style(col)}
                role="gridcell"
              >
                {cell_value(row, col.key)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end
end
