const scriptPolicy=process.env.NODE_ENV==='production'?"script-src 'self' 'unsafe-inline'":"script-src 'self' 'unsafe-inline' 'unsafe-eval'"
/** @type {import('next').NextConfig} */
const nextConfig={
 poweredByHeader:false,
 async headers(){return[{source:'/:path*',headers:[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'X-DNS-Prefetch-Control',value:'off'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'X-Permitted-Cross-Domain-Policies',value:'none'},
  {key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains; preload'},
  {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
  {key:'Cross-Origin-Resource-Policy',value:'same-origin'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  {key:'Content-Security-Policy',value:`default-src 'self'; ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests`}
 ]}]}
}
module.exports=nextConfig
