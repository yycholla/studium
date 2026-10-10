{ pkgs ? import <nixpkgs> {} }:
assert pkgs.lib.versionAtLeast pkgs.rustc.version "1.95";
pkgs.mkShell {
  packages = with pkgs; [ cargo rustc rustfmt clippy ];
}
