import { lookup } from 'dns/promises'
import { BlockList, isIP } from 'net'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { load } from 'cheerio'

const blocked = new BlockList()
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(address, prefix, 'ipv4')
export function publicAddress(address: string): boolean { return !address.includes(':') && !blocked.check(address, 'ipv4') }
export function sourceUrl(raw: string): URL {
  const url = new URL(raw)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
    (url.port && !['443','80'].includes(url.port))) throw new Error('仅支持公开网页')
  if (url.hostname==='localhost' || !url.hostname.includes('.') || /\.(local|localhost|internal|lan)$/i.test(url.hostname) ||
    (isIP(url.hostname) && !publicAddress(url.hostname))) throw new Error('不能读取非公网地址')
  return url
}
// TUN proxies may replace public DNS answers with 198.18/15 placeholders.
// Resolve those through authenticated DNS-over-HTTPS, then pin the public IP.
// Never allow the placeholder itself or relax private-address checks.
export async function resolvePublicHost(host: string, signal: AbortSignal): Promise<string[]> {
  let addresses = (await lookup(host,{all:true,family:4})).map(a=>a.address)
  if (addresses.length && addresses.every(a=>/^198\.(18|19)\./.test(a)) && !isIP(host)) {
    const response = await fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(host)+'&type=A', {
      headers:{Accept:'application/dns-json'}, signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]), redirect:'error'
    })
    if (!response.ok) throw new Error('代理 DNS 地址核查失败，请检查网络后重试')
    const data = await response.json() as {Answer?:{type:number;data:string}[]}
    addresses = (data.Answer || []).filter(a=>a.type===1).map(a=>a.data)
  }
  if (!addresses.length || addresses.some(a=>isIP(a)!==4 || !publicAddress(a))) throw new Error('不能读取非公网地址')
  return addresses
}
export function extractText(html: string): string {
  const $ = load(html)
  $('script,style,nav,footer,header,aside,form,noscript,svg,iframe').remove()
  const main = $('article,main,[role=main]').first()
  const node = main.length ? main : $('body')
  node.find('p,div,li,h1,h2,h3,br').prepend('\n')
  return node.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0,24000)
}
export async function readPublicPage(raw: string, signal: AbortSignal, redirects = 0): Promise<string> {
  signal = AbortSignal.any([signal,AbortSignal.timeout(20000)])
  if (redirects > 3) throw new Error('网页重定向过多')
  const url = sourceUrl(raw)
  signal.throwIfAborted()
  const addresses = await resolvePublicHost(url.hostname,signal)
  signal.throwIfAborted()
  return new Promise<string>((resolve,reject) => {
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = transport(url, {
      signal, headers: { 'User-Agent': 'FlowNote/3.0 evidence reader', Accept: 'text/html,text/plain', 'Accept-Encoding': 'identity' },
      lookup: ((_host: unknown, options: any, cb: any) => options?.all ?
        cb(null, [{ address: addresses[0], family: 4 }]) : cb(null, addresses[0], 4)) as any
    }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        readPublicPage(new URL(res.headers.location, url).href, signal, redirects + 1).then(resolve,reject)
        return
      }
      if (res.statusCode !== 200 || !/text\/(html|plain)|application\/xhtml/.test(String(res.headers['content-type']))) {
        res.resume(); reject(new Error('网页未开放可读正文（HTTP '+res.statusCode+'）')); return
      }
      const chunks: Buffer[] = []; let bytes = 0
      res.on('data', chunk => {
        bytes += chunk.length
        if (bytes > 2_000_000) { req.destroy(new Error('网页过大')); return }
        chunks.push(Buffer.from(chunk))
      })
      res.on('error', reject)
      res.on('end', () => resolve(extractText(Buffer.concat(chunks).toString('utf8'))))
    })
    req.setTimeout(15000, () => req.destroy(new Error('读取网页超时')))
    req.on('error', reject)
    req.end()
  })
}
