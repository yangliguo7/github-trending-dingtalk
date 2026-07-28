import { ProxyAgent, fetch as undiciFetch } from "undici";

let proxyAgent;

function getProxyAgent() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (!proxyUrl) {
    return undefined;
  }

  proxyAgent ??= new ProxyAgent(proxyUrl);
  return proxyAgent;
}

export function request(url, options = {}) {
  const dispatcher = options.dispatcher ?? getProxyAgent();
  return undiciFetch(url, dispatcher ? { ...options, dispatcher } : options);
}
