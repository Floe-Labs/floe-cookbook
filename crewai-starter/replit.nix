# Replit Nix environment. Python 3.11 plus pip; floe-guard[crewai], crewai and
# python-dotenv install from requirements.txt on first run.
{ pkgs }: {
  deps = [
    pkgs.python311
    pkgs.python311Packages.pip
  ];
}
