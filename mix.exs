defmodule Quadrille.MixProject do
  use Mix.Project

  @version "0.1.0"
  @source_url "https://github.com/gernotkogler/quadrille"

  def project do
    [
      app: :quadrille,
      version: @version,
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      aliases: aliases(),
      description: description(),
      package: package(),
      docs: docs(),
      name: "Quadrille",
      source_url: @source_url
    ]
  end

  def application do
    [
      extra_applications: [:logger]
    ]
  end

  defp deps do
    [
      {:phoenix_live_view, "~> 1.1"},
      {:lazy_html, ">= 0.1.0", only: :test},
      {:ex_doc, "~> 0.34", only: :dev, runtime: false},
      # Dev-only: self-contained demo server (`mix dev`).
      {:bandit, "~> 1.0", only: :dev},
      {:jason, "~> 1.4", only: :dev}
    ]
  end

  defp aliases do
    [
      dev: "run --no-halt dev.exs",
      "test.js": "cmd --cd assets node --test"
    ]
  end

  defp description do
    "A LiveView-native, virtualized, editable data grid for large datasets — " <>
      "Excel-like power without a JavaScript framework."
  end

  defp package do
    [
      licenses: ["MIT"],
      links: %{"GitHub" => @source_url},
      files: ~w(lib assets/js assets/css .formatter.exs mix.exs README.md LICENSE)
    ]
  end

  defp docs do
    [
      main: "readme",
      extras: ["README.md"],
      source_ref: "v#{@version}",
      source_url: @source_url
    ]
  end
end
