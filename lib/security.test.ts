import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "migrations", "009_audit_hardening.sql"), "utf8");
const lobbyMigration = readFileSync(join(process.cwd(), "migrations", "010_lobby_reliability.sql"), "utf8");
const chatMigration = readFileSync(join(process.cwd(), "migrations", "011_lobby_chat.sql"), "utf8");
const packageConfig = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  overrides: Record<string, string>;
};
const homePage = readFileSync(join(process.cwd(), "app", "page.tsx"), "utf8");

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

describe("lobby chat migration", () => {
  it("keeps message writes behind an authenticated RPC", () => {
    expect(chatMigration).toContain("revoke all on public.lobby_messages from anon, authenticated");
    expect(chatMigration).toContain("grant execute on function public.send_lobby_message(uuid,text) to authenticated");
  });

  it("only lets members chat while the lobby is waiting", () => {
    expect(chatMigration).toContain("where lobby_id = target_lobby and user_id = auth.uid()");
    expect(chatMigration).toContain("where id = target_lobby and status = 'waiting'");
    expect(chatMigration).toContain("created_at > now() - interval '1 second'");
  });

  it("protects reads with RLS and publishes realtime updates", () => {
    expect(chatMigration).toContain("alter table public.lobby_messages enable row level security");
    expect(chatMigration).toContain("using (public.is_lobby_member(lobby_id))");
    expect(chatMigration).toContain("alter publication supabase_realtime add table public.lobby_messages");
  });
});

describe("application hardening", () => {
  it("pins patched React and vulnerable transitive build dependencies", () => {
    expect(packageConfig.dependencies.react).toBe("19.0.8");
    expect(packageConfig.dependencies["react-dom"]).toBe("19.0.8");
    expect(packageConfig.overrides["brace-expansion"]).toBe("1.1.18");
    expect(packageConfig.overrides.sharp).toBe("0.35.3");
  });

  it("does not erase the Supabase session when clearing game data", () => {
    expect(homePage).not.toContain("localStorage.clear()");
    expect(homePage).toContain("Object.values(LS).forEach");
  });
});
