// Tells Convex to accept the JWTs that Convex Auth issues (signed with
// JWT_PRIVATE_KEY, verified against JWKS on this deployment).
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
}
