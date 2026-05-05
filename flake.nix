{
  description = "PO Translator";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
  };
  outputs = { self, nixpkgs, ... } @ inputs: let
  pkgs = import nixpkgs {
    system = "x86_64-linux";
    config = {
      allowUnfree = true;
    };
  };
  in {
    devShell.x86_64-linux = pkgs.mkShell {
      buildInputs = [
				pkgs.vtsls
        pkgs.nodejs_24
        pkgs.pnpm
      ];
    };
  };
}
