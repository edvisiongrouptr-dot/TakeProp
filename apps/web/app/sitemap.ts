import { MetadataRoute } from 'next'
import { siteUrl } from '../lib/site-url'
const paths=['','/auth','/support','/terms','/privacy','/risk-disclosure','/refund-policy','/aml-kyc']
export default function sitemap():MetadataRoute.Sitemap{const lastModified=new Date(),base=siteUrl();return paths.map(path=>({url:new URL(path||'/',base).toString(),lastModified}))}
