import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { data: topUsers, error: usersError } = await supabase.rpc("get_top_typists");

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return NextResponse.json(
        { error: "Failed to fetch top users" },
        { status: 500 },
      );
    }

    const { data: topSongs, error: songsError } = await supabase.rpc("get_top_songs");

    if (songsError) {
      console.error("Error fetching songs:", songsError);
      return NextResponse.json(
        { error: "Failed to fetch top songs" },
        { status: 500 },
      );
    }

    // Return the response with no-cache headers
    return new NextResponse(
      JSON.stringify({
        topUsers: topUsers || [],
        topSongs: topSongs || [],
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
