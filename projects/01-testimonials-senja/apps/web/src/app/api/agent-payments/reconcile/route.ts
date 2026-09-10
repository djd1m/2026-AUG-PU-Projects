import { failure } from '@/lib/agent-payments/http';
import { NextResponse } from 'next/server';
import { body, fields, gatewayAuthority } from '@/lib/agent-payments/security';
import { reconcileBatch } from '@/lib/agent-payments/reconcile';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    gatewayAuthority(request);
    fields(await body(request), []);
    return NextResponse.json(await reconcileBatch(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}
