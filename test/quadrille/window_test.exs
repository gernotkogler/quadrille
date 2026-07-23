defmodule Quadrille.WindowTest do
  use ExUnit.Case, async: true

  alias Quadrille.Window

  defp opts(overrides) do
    Enum.into(overrides, %{
      total_count: 100_000,
      row_height: 32,
      first_visible_row: 0,
      viewport_rows: 20,
      overscan: 10
    })
  end

  describe "slice/1 spacer + transform" do
    test "spacer height spans the whole dataset" do
      assert %{spacer_height: 3_200_000} = Window.slice(opts(%{}))
    end

    test "transform positions the buffer at offset * row_height" do
      # first_visible 500, overscan 10 -> offset 490; 490 * 32 = 15_680
      assert %{offset: 490, translate_y: 15_680} =
               Window.slice(opts(%{first_visible_row: 500, row_height: 32, overscan: 10}))
    end
  end

  describe "slice/1 buffer bounds in the middle" do
    test "applies overscan on both sides" do
      assert %{offset: 490, limit: 40} =
               Window.slice(opts(%{first_visible_row: 500, viewport_rows: 20, overscan: 10}))
    end
  end

  describe "slice/1 clamping at the top" do
    test "offset never goes below zero and buffer keeps trailing overscan" do
      # first_visible 5, overscan 10 -> offset clamped to 0
      # last = 5 + 20 - 1 + 10 = 34 -> limit 35
      assert %{offset: 0, limit: 35} =
               Window.slice(opts(%{first_visible_row: 5, viewport_rows: 20, overscan: 10}))
    end
  end

  describe "slice/1 clamping at the bottom" do
    test "last row never exceeds total_count - 1" do
      # total 100, first_visible 95, viewport 20, overscan 10
      # offset = 85, last = min(99, 95+20-1+10)=99, limit = 99-85+1 = 15
      assert %{offset: 85, limit: 15} =
               Window.slice(
                 opts(%{
                   total_count: 100,
                   first_visible_row: 95,
                   viewport_rows: 20,
                   overscan: 10
                 })
               )
    end
  end

  describe "slice/1 degenerate cases" do
    test "empty dataset yields an empty buffer" do
      assert %{offset: 0, limit: 0, spacer_height: 0, translate_y: 0} =
               Window.slice(opts(%{total_count: 0}))
    end

    test "viewport larger than dataset renders everything" do
      assert %{offset: 0, limit: 10} =
               Window.slice(
                 opts(%{total_count: 10, first_visible_row: 0, viewport_rows: 50, overscan: 10})
               )
    end

    test "first_visible_row past the end is clamped into range" do
      # total 100, ask for row 10_000 -> clamp first_visible to 99
      # offset = 89, last = 99, limit = 11
      assert %{offset: 89, limit: 11} =
               Window.slice(
                 opts(%{
                   total_count: 100,
                   first_visible_row: 10_000,
                   viewport_rows: 20,
                   overscan: 10
                 })
               )
    end
  end
end
