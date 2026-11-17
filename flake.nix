{
  description = "Hilvana: entorno de desarrollo reproducible (deno, node, psql, cloudflared, gitleaks)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs, nixpkgs-unstable }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system:
        f nixpkgs.legacyPackages.${system} nixpkgs-unstable.legacyPackages.${system});
    in
    {
      # Docker (motor y compose) es del sistema: Nix no administra servicios.
      # La CLI de Supabase va por `npx supabase@<versión de toolchain.env>`: nixpkgs trae otra versión mayor.
      devShells = forAll (pkgs: unstable: {
        default = pkgs.mkShell {
          packages = [
            unstable.deno
            pkgs.nodejs
            pkgs.postgresql_17
            pkgs.cloudflared
            pkgs.gitleaks
            pkgs.jq
            pkgs.curl
          ];
          shellHook = ''
            echo "Hilvana · $(deno --version | head -n 1) · 'deno task cli up' levanta todo"
          '';
        };
      });

      formatter = forAll (pkgs: _: pkgs.nixfmt-rfc-style);
    };
}
