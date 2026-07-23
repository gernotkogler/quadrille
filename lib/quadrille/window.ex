defmodule Quadrille.Window do
  @moduledoc """
  Pure geometry for the virtualized buffer.

  Given the total row count, the row height, and where the viewport currently
  sits, `slice/1` computes which rows the server should render (a buffer of the
  visible rows plus overscan on each side) and where that buffer must be placed
  inside a full-height spacer.

  The result is deliberately plain data so it is trivial to unit-test without a
  browser — buffer-edge off-by-ones are the class of bug that turns into blank
  rows and jank on the client, so they are pinned down here.

    * `:offset` — index of the first row in the buffer (0-based)
    * `:limit` — number of rows in the buffer
    * `:translate_y` — px offset for the buffer inside the spacer (`offset * row_height`)
    * `:spacer_height` — px height of the full spacer (`total_count * row_height`)
  """

  @type opts :: %{
          required(:total_count) => non_neg_integer(),
          required(:row_height) => pos_integer(),
          required(:first_visible_row) => integer(),
          required(:viewport_rows) => non_neg_integer(),
          required(:overscan) => non_neg_integer()
        }

  @type t :: %{
          offset: non_neg_integer(),
          limit: non_neg_integer(),
          translate_y: non_neg_integer(),
          spacer_height: non_neg_integer()
        }

  @spec slice(opts()) :: t()
  def slice(%{
        total_count: total_count,
        row_height: row_height,
        first_visible_row: first_visible_row,
        viewport_rows: viewport_rows,
        overscan: overscan
      })
      when total_count >= 0 and row_height > 0 and viewport_rows >= 0 and overscan >= 0 do
    spacer_height = total_count * row_height

    if total_count == 0 do
      %{offset: 0, limit: 0, translate_y: 0, spacer_height: 0}
    else
      last_index = total_count - 1

      # Clamp the requested viewport top into range, then pad with overscan.
      first_visible = first_visible_row |> max(0) |> min(last_index)

      offset = max(0, first_visible - overscan)
      last = min(last_index, first_visible + viewport_rows - 1 + overscan)
      limit = max(0, last - offset + 1)

      %{
        offset: offset,
        limit: limit,
        translate_y: offset * row_height,
        spacer_height: spacer_height
      }
    end
  end
end
