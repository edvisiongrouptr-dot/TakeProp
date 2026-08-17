import { MetadataRoute } from 'next'
import { siteUrl } from '../lib/site-url'
export default function robots():MetadataRoute.Robots{return{rules:{userAgent:'*',allow:'/',disallow:['/admin','/api','/dashboard','/terminal','/payouts','/kyc','/notifications']},sitemap:new URL('/sitemap.xml',siteUrl()).toString()}}
