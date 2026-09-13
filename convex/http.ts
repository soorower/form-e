import { httpRouter } from 'convex/server'
import { auth } from './auth'

const http = httpRouter()

// /api/auth/* on the .convex.site URL: OAuth start + callback, JWKS, etc.
auth.addHttpRoutes(http)

export default http
