import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'CodaGraph-lite Frontend',
    timestamp: new Date().toISOString(),
  });
}
