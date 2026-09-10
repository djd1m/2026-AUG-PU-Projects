import { NextResponse } from 'next/server';
import { body, failure, gatewayAuthority, requireEnabled } from '@/lib/agent-payments/security';
import { dispatchCommand } from '@/lib/agent-payments/commands';
import { paymentEngine } from '@/lib/agent-payments/runtime';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireEnabled();
    gatewayAuthority(request);
    return NextResponse.json(await dispatchCommand(request, await body(request), paymentEngine), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}
