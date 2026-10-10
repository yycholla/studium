#!/usr/bin/env bash
# Serve the Topcoat static export privately using Tailscale's HTTPS file server.
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
site_dir="$project_dir/dist"
serve_port=${TAILNET_PORT:-8443}

for command in tailscale jq; do
    command -v "$command" >/dev/null || { echo "Required command missing: $command" >&2; exit 1; }
done
if [[ ! "$serve_port" =~ ^[1-9][0-9]{0,4}$ ]] || (( serve_port > 65535 )); then
    echo 'TAILNET_PORT must be an integer from 1 to 65535.' >&2
    exit 1
fi
for file in index.html chatpendium/index.html assets/app.css assets/app.js; do
    if [[ ! -r "$site_dir/$file" ]]; then
        echo 'Build the static site first: cargo run --locked --example export' >&2
        exit 1
    fi
done

status=$(tailscale status --json)
if [[ $(jq -r '.BackendState' <<<"$status") != Running ]]; then
    echo 'Tailscale must be connected before serving the site.' >&2
    exit 1
fi
dns_name=$(jq -er '.Self.DNSName | select(type == "string" and length > 0) | rtrimstr(".")' <<<"$status")
config=$(tailscale serve status --json)
if [[ -z ${TAILNET_PORT:-} ]]; then
    # Reuse this site's private HTTPS endpoint, or choose an unconfigured port.
    serve_port=$(jq -r --arg dns "$dns_name" --arg path "$site_dir" '
        . as $config |
        [range(8443; 8500) | tostring] as $ports |
        ([$ports[] | . as $port | ($dns + ":" + $port) as $endpoint |
            select($config.TCP[$port].HTTPS == true and
                $config.Web[$endpoint].Handlers["/"].Path == $path and
                $config.AllowFunnel[$endpoint] != true)] | first) //
        ([$ports[] | . as $port |
            select($config.TCP[$port] == null and
                all(($config.Web // {} | keys[]); endswith(":" + $port) | not) and
                all(($config.AllowFunnel // {} | to_entries[]);
                    (.value == true and (.key | endswith(":" + $port))) | not))] | first) // empty
    ' <<<"$config")
    if [[ -z "$serve_port" ]]; then
        echo 'No free Tailscale HTTPS port in 8443–8499. Set TAILNET_PORT to another unused port.' >&2
        exit 1
    fi
fi
endpoint="$dns_name:$serve_port"
if jq -e --arg endpoint "$endpoint" '.AllowFunnel[$endpoint] == true' <<<"$config" >/dev/null; then
    echo "Port $serve_port has Funnel enabled. Choose another TAILNET_PORT for private access." >&2
    exit 1
fi
if jq -e --arg port "$serve_port" '
    .TCP[$port] != null or
    any((.Web // {} | keys[]); endswith(":" + $port)) or
    any((.AllowFunnel // {} | to_entries[]); .value == true and (.key | endswith(":" + $port)))
' <<<"$config" >/dev/null; then
    if jq -e --arg endpoint "$endpoint" --arg port "$serve_port" --arg path "$site_dir" '.TCP[$port].HTTPS == true and .Web[$endpoint].Handlers["/"].Path == $path' <<<"$config" >/dev/null; then
        printf 'Already serving: https://%s/\n' "$endpoint"
        exit 0
    fi
    echo "Tailscale already uses port $serve_port. Choose another TAILNET_PORT; existing routes were left untouched." >&2
    exit 1
fi

tailscale serve --bg --https="$serve_port" "$site_dir"
printf '\nThe Studium tailnet URL: https://%s/\n' "$endpoint"
printf 'Stop sharing with: tailscale serve --https=%s off\n' "$serve_port"
