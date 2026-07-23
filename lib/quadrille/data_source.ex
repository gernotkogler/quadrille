defmodule Quadrille.DataSource do
  @moduledoc """
  The contract a host provides so a `Quadrille.Grid` can fetch rows on demand.

  Quadrille owns rendering and virtualization; the host owns the data. The grid
  only ever asks for a *window* of rows (plus the total count so it can size the
  scrollbar), which lets the underlying store — an Ecto query, a list, an
  external API — do the windowing itself. This is what keeps the grid smooth
  over hundreds of thousands of rows: the full dataset is never materialized on
  the server or shipped to the client.

  `source` is opaque host state, passed through from the `:source` assign of the
  grid (e.g. an Ecto queryable, a tenant id, a plain list). `query` carries
  cross-cutting request options; for now it is always `%{}`, and later stages
  add `:sort` and `:filters`.

  ## Example

      defmodule MyApp.PeopleSource do
        @behaviour Quadrille.DataSource

        @impl true
        def count(_source, _query), do: MyApp.Repo.aggregate(Person, :count)

        @impl true
        def fetch_window(_source, offset, limit, _query) do
          Person
          |> order_by(:id)
          |> offset(^offset)
          |> limit(^limit)
          |> MyApp.Repo.all()
        end
      end
  """

  @type source :: term()
  @type query :: map()
  @type row :: term()

  @doc "Returns the total number of rows for the given source and query."
  @callback count(source(), query()) :: non_neg_integer()

  @doc """
  Returns the rows for the half-open window `offset..(offset + limit)`.

  Rows should be returned in display order. Returning fewer than `limit` rows is
  fine (e.g. at the end of the dataset).
  """
  @callback fetch_window(
              source(),
              offset :: non_neg_integer(),
              limit :: non_neg_integer(),
              query()
            ) ::
              [row()]
end
