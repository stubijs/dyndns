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
  Typ: string
  URL: string
  TTL: number
  Proxied: boolean
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
      const queryString = url.search.slice(1).split('#')

      queryString.forEach((item) => {
        const kv = item.split('=')
        if (kv[0])
          params[kv[0]] = kv[1]
      })

      // No Token
      if (!Object.prototype.hasOwnProperty.call(params, 'reqToken'))
        return new Response('Unknown Token', { status: 404 })

      const reqToken = params.reqToken as string
      const clientIP = request.headers.get('CF-Connecting-IP') as string | '1.1.1.1'

      const data = transformEnvData(env)
      const dataKeys = Object.keys(data)
      if (dataKeys.includes(reqToken)) {
        const cfResponse = await updateCloudflareRecord(env, clientIP, data[reqToken])
        if (!cfResponse.success)
          return new Response(JSON.stringify(cfResponse), { status: 404 })
        else
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
        Typ: envKeyAry[1],
        URL: envKeyAry[2],
        TTL: Number(envKeyAry[3]),
        Proxied: Boolean(envKeyAry[4]),
        ZoneIdentifier: envKeyAry[5],
        Identifier: envKeyAry[6],
      }
    }
  })

  return finData
}

async function updateCloudflareRecord(env: env, ip: string, fetchData: CloudflareRecordData) {
  const baseUrl = 'https://api.cloudflare.com/client/v4/'

  const zoneIdentifier = fetchData.ZoneIdentifier
  const identifier = fetchData.Identifier

  const fetchUrl = `${baseUrl}zones/${zoneIdentifier}/dns_records/${identifier}`

  const data = {
    type: fetchData.Typ,
    name: fetchData.URL,
    content: ip,
    ttl: fetchData.TTL,
    proxied: fetchData.Proxied,
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
