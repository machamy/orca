// Why: psl@1.15.0 ships bundled types ("types": "types/index.d.ts") but its
// exports map has no "types" condition, so TS bundler resolution cannot see
// them. Mirror the shapes the codebase uses (matches psl/types/index.d.ts).
declare module 'psl' {
  export type ParsedDomain = {
    input: string
    tld: string | null
    sld: string | null
    domain: string | null
    subdomain: string | null
    listed: boolean
  }

  export type ParseError = {
    input: string
    error: {
      code: string
      message: string
    }
  }

  export function parse(domain: string): ParsedDomain | ParseError
  export function get(domain: string | null): string | null
  export function isValid(domain: string): boolean
}
