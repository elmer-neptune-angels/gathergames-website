"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function GamePicker({ games, selected }: { games: { id: string; name: string }[]; selected: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      value={selected}
      style={{ width: "auto", minWidth: 220 }}
      onChange={(event) => {
        const next = new URLSearchParams(params.toString());
        next.set("game", event.target.value);
        router.push(`${pathname}?${next.toString()}`);
      }}
      aria-label="Game"
    >
      {games.map((game) => (
        <option key={game.id} value={game.id}>
          {game.name}
        </option>
      ))}
    </select>
  );
}
