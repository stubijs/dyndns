/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

/*
 * SECRET_DYN_DNS_01:
 *
 * TOKEN $ TYPE $ URL $ TTL $ PROXIED $ ZONEID $ IDENTIFIER
 *
 */

export interface CloudflareAPIResult {
  success: boolean
  errors: any[]
  messages: any[]
  result: any[]
}

interface CloudflareRecordData {
  URL: string
  Proxied: boolean
  TTL: boolean
  ZoneIdentifier: string
  Identifier: string
}

type EnvData = Record<string, CloudflareRecordData>

type RequestParams = Record<string, string | boolean>

interface env {
  CF_EMAIL: string
  CF_API_TOKEN: string
  SECRET_AUTH_TOKEN: string
  SECRET_DYN_DNS_01: string
}

export default {
  async fetch(request: Request, env: env /* , ctx: ExecutionContext */): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/update/')) {
      // Test Auth Header
      const headers = request.headers
      let token = headers.get('Authorization')

      if (token == null)
        return new Response('No Auth Token', { status: 404 })

      token = token.replace(/^Bearer\s+/, '')
      if (token !== env.SECRET_AUTH_TOKEN)
        return new Response('Unknown Auth', { status: 404 })

      // Get URL GET Params
      const params: RequestParams = {}
      const queryString = url.search.slice(1).split('&')

      queryString.forEach((item) => {
        const kv = item.split('=')
        if (kv[0])
          params[kv[0]] = kv[1]
      })

      // No Token
      if (!Object.prototype.hasOwnProperty.call(params, 'reqToken'))
        return new Response('Unknown Token', { status: 404 })

      // No ipv4 or ipv6 Param
      if (!Object.prototype.hasOwnProperty.call(params, 'ipv4') && !Object.prototype.hasOwnProperty.call(params, 'ipv6'))
        return new Response('No IP was transferred', { status: 404 })

      const reqToken = params.reqToken as string
      const clientIPv4 = params.ipv4 as string | ''
      const clientIPv6 = params.ipv6 as string | ''

      const data = transformEnvData(env)
      const dataKeys = Object.keys(data)
      if (dataKeys.includes(reqToken)) {
        // IPv4 update
        if (clientIPv4 && clientIPv4.length > 0) {
          const cfResponse = await updateCloudflareRecord(env, clientIPv4, data[reqToken])
          if (!cfResponse.success)
            return new Response(JSON.stringify(cfResponse), { status: 404 })
        }
        // IPv6 update
        if (clientIPv6 && clientIPv6.length > 0) {
          const TTLipv6 = 'AAAA'
          const cfResponse = await updateCloudflareRecord(env, clientIPv6, data[reqToken], TTLipv6)
          if (!cfResponse.success)
            return new Response(JSON.stringify(cfResponse), { status: 404 })
        }

        return new Response('DynDNS Worker updated!', { status: 200 })
      }
      return new Response('Everything OK?! No :-(', { status: 404 })
    }
    else {
      return new Response('Hello, is it me you\'re looking for? :-)', { status: 200 })
    }
  },
}

function transformEnvData(env: env): EnvData {
  const finData: EnvData = {}

  const envKeys = Object.keys(env)

  envKeys.forEach((item) => {
    if (item.includes('SECRET_DYN_DNS_')) {
      const envKeyAry = env[item].split('#')
      finData[envKeyAry[0]] = {
        URL: envKeyAry[1],
        TTL: envKeyAry[2],
        Proxied: Boolean(envKeyAry[3]),
        ZoneIdentifier: envKeyAry[4],
        Identifier: envKeyAry[5],
      }
    }
  })

  return finData
}

async function updateCloudflareRecord(env: env, ip: string, fetchData: CloudflareRecordData, ttlVal = 'A') {
  const baseUrl = 'https://api.cloudflare.com/client/v4/'

  const zoneIdentifier = fetchData.ZoneIdentifier
  const identifier = fetchData.Identifier

  const fetchUrl = `${baseUrl}zones/${zoneIdentifier}/dns_records/${identifier}`

  const data = {
    type: String(ttlVal),
    name: String(fetchData.URL),
    content: String(ip),
    ttl: Number(fetchData.TTL),
    proxied: Boolean(fetchData.Proxied),
  }

  const requestOptions = {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Email': env.CF_EMAIL,
      'Authorization': `Bearer ${env.CF_API_TOKEN}`,
    },
    body: JSON.stringify(data),
  }

  const response = await fetch(fetchUrl, requestOptions)
  const returnData: CloudflareAPIResult = await response.json()
  return returnData
}
