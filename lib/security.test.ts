import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "migrations", "009_audit_hardening.sql"), "utf8");
const lobbyMigration = readFileSync(join(process.cwd(), "migrations", "010_lobby_reliability.sql"), "utf8");

describe("database hardening migration", () => {
  it("removes the historical result function and direct profile creation", () => {
    expect(migration).toContain("drop function if exists public.save_game_result(text,text,text,text,text,integer,integer,numeric,integer)");
    expect(migration).toContain("revoke insert on public.users from anon, authenticated");
  });

  it("keeps private history behind an authenticated RPC", () => {
    expect(migration).toContain("revoke select, insert, update, delete on public.game_results from anon, authenticated");
    expect(migration).toContain("grant execute on function public.get_my_game_results() to authenticated");
  });

  it("does not leave sensitive lobby RPCs executable by PUBLIC", () => {
    for (const signature of ["create_lobby()", "join_lobby(text)", "start_lobby(uuid)", "mark_lobby_playing(uuid)"]) {
      expect(migration).toContain(`revoke all on function public.${signature} from public, anon`);
    }
  });
});

describe("lobby reliability migration", () => {
  it("locks the lobby before checking its exact capacity", () => {
    expect(lobbyMigration).toContain("status='waiting' for update");
    expect(lobbyMigration).toContain("if current_players >= 8");
  });
  it("validates song data inside the trusted RPC", () => {
    expect(lobbyMigration).toContain("jsonb_array_length(new_lyrics) not between 1 and 2000");
    expect(lobbyMigration).toContain("pg_column_size(new_lyrics) > 1048576");
  });
  it("supports presence, leaving and audited premium changes", () => {
    expect(lobbyMigration).toContain("function public.heartbeat_lobby");
    expect(lobbyMigration).toContain("function public.leave_lobby");
    expect(lobbyMigration).toContain("premium_audit_log");
  });
});
