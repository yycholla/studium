{ pkgs, ... }:
{
  # Versions come from the pinned nixpkgs input in devenv.yaml/devenv.lock.
  packages = with pkgs; [
    cargo rustc rustfmt clippy
    gcc pkg-config
    python3 git jq curl
  ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    npm.enable = true;
    npm.install.enable = true;
  };

  env.WRANGLER_SEND_METRICS = "false";

  scripts.studium-dev.exec = "npm run dev";
  scripts.studium-check.exec = "npm run check";
  scripts.studium-build.exec = "npm run build";
  scripts.studium-deploy.exec = "npm run deploy";

  enterShell = ''
    echo "Studium: studium-dev | studium-check | studium-build | studium-deploy"
  '';
  enterTest = ''
    studium-check
  '';
}
