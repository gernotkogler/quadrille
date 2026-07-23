# Self-contained demo server for developing Quadrille.
#
#   mix dev   # -> http://localhost:4000
#
# Serves a Quadrille.Grid over an in-memory data source of 200k generated rows,
# with no database or asset build step: phoenix / phoenix_live_view ESM builds
# and the Quadrille hook are served straight from disk via an import map.

require Logger
Logger.configure(level: :info)

Application.put_env(:phoenix, :json_library, Jason)

port = 4000
secret = String.duplicate("quadrille_dev_secret_key_base_0123456789", 2)

Application.put_env(:quadrille, DemoWeb.Endpoint,
  url: [host: "localhost"],
  http: [ip: {127, 0, 0, 1}, port: port],
  adapter: Bandit.PhoenixAdapter,
  server: true,
  live_view: [signing_salt: "quadrille_dev_salt"],
  secret_key_base: secret,
  pubsub_server: DemoWeb.PubSub,
  check_origin: false,
  debug_errors: true
)

# ---------------------------------------------------------------------------
# In-memory data source: 200k rows, generated on demand for the asked window.
# ---------------------------------------------------------------------------
defmodule DemoSource do
  @behaviour Quadrille.DataSource

  @total 200_000
  @cities ["Zürich", "Bern", "Basel", "Genève", "Lausanne", "Winterthur", "Luzern", "St. Gallen", "Lugano", "Biel"]

  @impl true
  def count(_source, _query), do: @total

  @impl true
  def fetch_window(_source, _offset, 0, _query), do: []

  def fetch_window(_source, offset, limit, _query) do
    last = min(offset + limit - 1, @total - 1)

    for i <- offset..last do
      %{
        id: i + 1,
        name: "Person #{i + 1}",
        email: "person#{i + 1}@example.com",
        city: Enum.at(@cities, rem(i, length(@cities))),
        score: rem(i * 7, 1000)
      }
    end
  end
end

# ---------------------------------------------------------------------------
# LiveView
# ---------------------------------------------------------------------------
defmodule DemoWeb.DemoLive do
  use Phoenix.LiveView

  @columns [
    %{key: :id, label: "ID", width: "90px"},
    %{key: :name, label: "Name", width: "200px"},
    %{key: :email, label: "Email"},
    %{key: :city, label: "City", width: "160px"},
    %{key: :score, label: "Score", width: "100px"}
  ]

  def mount(_params, _session, socket) do
    {:ok, assign(socket, columns: @columns)}
  end

  def render(assigns) do
    ~H"""
    <main style="max-width: 960px; margin: 2rem auto; font-family: system-ui, sans-serif;">
      <h1 style="font-size: 1.25rem;">Quadrille — 200,000 rows</h1>
      <p style="color:#555;">Scroll. Only a windowed buffer is ever rendered on the server.</p>
      <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
        <.live_component
          module={Quadrille.Grid}
          id="people"
          data_source={DemoSource}
          columns={@columns}
          row_height={32}
          height="600px"
        />
      </div>
    </main>
    """
  end
end

# ---------------------------------------------------------------------------
# Layout, Router, Endpoint
# ---------------------------------------------------------------------------
defmodule DemoWeb.Layouts do
  use Phoenix.Component

  def root(assigns) do
    ~H"""
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="csrf-token" content={Plug.CSRFProtection.get_csrf_token()} />
        <title>Quadrille dev</title>
        <link rel="stylesheet" href="/static/css/quadrille.css" />
        <style>
          body { margin: 0; }
          .quadrille-header { background:#f7f7f8; border-bottom:1px solid #e5e7eb; }
          .quadrille-row { border-bottom:1px solid #f0f0f1; align-items:center; }
          .quadrille-row:hover { background:#fafafa; }
          .quadrille-cell { font-size:13px; color:#222; }
          .quadrille-header-cell { color:#444; }
        </style>
        <script type="importmap">
          {
            "imports": {
              "phoenix": "/vendor/phoenix/phoenix.mjs",
              "phoenix_live_view": "/vendor/live_view/phoenix_live_view.esm.js",
              "quadrille": "/static/js/quadrille.js"
            }
          }
        </script>
        <script type="module">
          import {Socket} from "phoenix"
          import {LiveSocket} from "phoenix_live_view"
          import {Quadrille} from "quadrille"

          const csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")
          const liveSocket = new LiveSocket("/live", Socket, {
            params: {_csrf_token: csrfToken},
            hooks: {Quadrille}
          })
          liveSocket.connect()
          window.liveSocket = liveSocket
        </script>
      </head>
      <body>
        {@inner_content}
      </body>
    </html>
    """
  end
end

defmodule DemoWeb.Router do
  use Phoenix.Router
  import Phoenix.LiveView.Router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :put_root_layout, html: {DemoWeb.Layouts, :root}
    plug :protect_from_forgery
  end

  scope "/" do
    pipe_through :browser
    live "/", DemoWeb.DemoLive
  end
end

defmodule DemoWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :quadrille

  @session_options [
    store: :cookie,
    key: "_quadrille_dev_key",
    signing_salt: "quadrille_dev_cookie",
    same_site: "Lax"
  ]

  socket "/live", Phoenix.LiveView.Socket,
    websocket: [connect_info: [session: @session_options]]

  plug Plug.Static, at: "/vendor/phoenix", from: {:phoenix, "priv/static"}, gzip: false
  plug Plug.Static, at: "/vendor/live_view", from: {:phoenix_live_view, "priv/static"}, gzip: false
  plug Plug.Static, at: "/static", from: Path.join(File.cwd!(), "assets"), gzip: false

  plug Plug.Session, @session_options
  plug DemoWeb.Router
end

{:ok, _} =
  Supervisor.start_link(
    [
      {Phoenix.PubSub, name: DemoWeb.PubSub},
      DemoWeb.Endpoint
    ],
    strategy: :one_for_one
  )

Logger.info("Quadrille dev server running at http://localhost:#{port}")
Process.sleep(:infinity)
