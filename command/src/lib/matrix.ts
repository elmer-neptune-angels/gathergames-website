// Copied from gather/portal/src/lib/matrix.ts so the command center names
// games exactly as the portal and the app do. src/data/game-matrix.json is
// the portal's copy of Sources/GatherCore/Resources/game-matrix.json; refresh
// both together when the catalog changes.
import matrix from "../data/game-matrix.json" with { type: "json" };

export interface MatrixGame {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  gameType: string;
  timing: string;
  minAge: number;
  leaderboardEligible: boolean;
  implemented: boolean;
  availability: "launch" | "held";
  asyncMode: "parallel" | "turn" | "batch" | "local-only";
  onlineRooms: boolean;
}

export const games: MatrixGame[] = matrix as MatrixGame[];

export const launchGames: MatrixGame[] = games.filter(
  (game) => game.availability === "launch",
);

export const gameName = (id: string | null): string =>
  games.find((g) => g.id === id)?.name ?? id ?? "—";
