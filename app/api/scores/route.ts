import { NextResponse } from 'next/server';

// Retirado: aceptaba un userId enviado por el cliente y permitía alterar puntajes.
export async function POST() {
  return NextResponse.json({ error: 'Endpoint retirado.' }, { status: 410 });
}
