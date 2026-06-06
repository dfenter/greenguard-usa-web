import { NextResponse } from 'next/server'
import { getIndexYears } from '../../../lib/drive'

export async function GET() {
  const years = getIndexYears()
  return NextResponse.json({ years })
}
