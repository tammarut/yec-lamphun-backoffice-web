import { NodeCache } from "@cacheable/node-cache"

// TTL 1 day as per example Max-Age=86400 (seconds)
export const sessionCache = new NodeCache({ stdTTL: 86400 })
