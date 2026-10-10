import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Auth route placeholder' });
}

export async function POST() {
  return NextResponse.json({ ok: true, message: 'Auth route placeholder' });
}
