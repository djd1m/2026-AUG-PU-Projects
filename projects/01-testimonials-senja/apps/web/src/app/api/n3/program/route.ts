import { NextResponse } from 'next/server';
import { n3Config } from '@/lib/n3-runtime';

export const dynamic = 'force-dynamic';
export function GET(): NextResponse {
  let enabled = false;
  try { enabled = !!n3Config(); } catch { /* Invalid configuration is unavailable. */ }
  return NextResponse.json({ enabled }, { headers: { 'Cache-Control': 'no-store' } });
}
